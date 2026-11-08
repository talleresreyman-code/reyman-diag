// Reyman Diag · Visor de datos grabados: modelo común para todo lo que se puede abrir.
// Fuentes: sesiones grabadas en la app (servidor), grabaciones «reyman-grabacion» (JSON o CSV del grabador)
// y CSV de otros equipos (columna de tiempo + columnas numéricas «Nombre (unidad)»).
//
// Modelo (por columnas, para que el dibujo sea rápido con muchas muestras):
// { titulo, inicio (ISO|null), origen, vehiculo {matricula, vin, ot},
//   canales: [{ clave, nombre, unidad }],
//   t: [ms desde el inicio, ordenado], valores: { clave: [número|null por muestra] },
//   eventos: [{ t, tipo, detalle }] }

import { infoPid, hex } from './obd/pids.js';
import { SAE_PIDS } from './obd/sae-pids.js';
import { FORMATO, desdeCsv as grabacionDesdeCsv } from './grabacion.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Nombre y unidad de una clave de canal: «0C.RPM», «12» (PID en decimal, formato antiguo), «tension». */
export function infoCanal(clave) {
  if (clave === 'tension') return { nombre: 'Tensión batería', unidad: 'V' };
  const m = /^([0-9A-F]{2})\.(.+)$/i.exec(String(clave));
  if (m) {
    const s = SAE_PIDS[parseInt(m[1], 16)]?.s.find((x) => x.id === m[2]);
    if (s) return { nombre: s.n, unidad: s.u || '' };
  }
  if (/^\d+$/.test(String(clave))) return infoPid(Number(clave));
  return { nombre: String(clave), unidad: '' };
}

function vacio(extra = {}) {
  return { titulo: '', inicio: null, origen: '', vehiculo: {}, canales: [], t: [], valores: {}, eventos: [], ...extra };
}

/** Ordena por tiempo y empieza en 0. */
function normalizarTiempo(m) {
  const n = m.t.length;
  let ordenado = true;
  for (let i = 1; i < n; i++) if (m.t[i] < m.t[i - 1]) { ordenado = false; break; }
  if (!ordenado) {
    const idx = [...m.t.keys()].sort((a, b) => m.t[a] - m.t[b]);
    m.t = idx.map((i) => m.t[i]);
    for (const k of Object.keys(m.valores)) m.valores[k] = idx.map((i) => m.valores[k][i]);
  }
  const t0 = m.t[0] || 0;
  if (t0) {
    m.t = m.t.map((x) => x - t0);
    m.eventos = m.eventos.map((e) => ({ ...e, t: e.t - t0 }));
  }
  // Quita los canales que no tienen ni un valor
  m.canales = m.canales.filter((c) => m.valores[c.clave]?.some((v) => v !== null));
  return m;
}

/** Sesión guardada desde «En vivo» (servidor o memoria): { pids:[{pid, nombre, unidad}], muestras:[{t, v}] }. */
export function desdeSesion(s) {
  const m = vacio({
    titulo: [s.ot ? `OT ${s.ot}` : '', s.matricula || ''].filter(Boolean).join(' · ') || 'Prueba de carretera',
    inicio: s.inicio ? new Date(s.inicio).toISOString() : null,
    origen: 'En vivo',
    vehiculo: { matricula: s.matricula || null, vin: s.vin || null, ot: s.ot || null },
    id: s.id || null,
  });
  const pids = (s.pids || []).map((p) => (typeof p === 'object' ? p : { pid: p, ...infoPid(Number(p)) }));
  m.canales = pids.map((p) => ({ clave: String(p.pid), nombre: p.nombre || infoCanal(p.pid).nombre, unidad: p.unidad ?? infoCanal(p.pid).unidad }));
  for (const c of m.canales) m.valores[c.clave] = [];
  for (const x of s.muestras || []) {
    m.t.push(x.t);
    for (const c of m.canales) m.valores[c.clave].push(num(x.v?.[c.clave]));
  }
  m.eventos = (s.eventos || []).map((e) => ({ t: e.t, tipo: e.tipo || 'marca', detalle: e.detalle || null }));
  return normalizarTiempo(m);
}

/** Grabación en formato común «reyman-grabacion» (app o grabador del coche). */
export function desdeGrabacion(g) {
  const m = vacio({
    titulo: g.vehiculo?.matricula || g.vehiculo?.vin || 'Grabación',
    inicio: g.inicio || null,
    origen: g.origen === 'app' ? 'En vivo' : g.origen || 'Grabador',
    vehiculo: { matricula: g.vehiculo?.matricula || null, vin: g.vehiculo?.vin || null },
  });
  const claves = g.pids.map(String);
  const tension = g.muestras.some((x) => x.tension !== undefined);
  m.canales = [...claves.map((k) => ({ clave: k, ...infoCanal(k) })), ...(tension ? [{ clave: 'tension', ...infoCanal('tension') }] : [])];
  for (const c of m.canales) m.valores[c.clave] = [];
  for (const x of g.muestras) {
    m.t.push(x.t);
    for (const k of claves) m.valores[k].push(num(x.v?.[k] ?? x.v?.[Number(k)]));
    if (tension) m.valores.tension.push(num(x.tension));
  }
  m.eventos = (g.eventos || []).map((e) => ({ t: e.t, tipo: e.tipo, detalle: e.detalle || null }));
  return normalizarTiempo(m);
}

// ---------------------------------------------------------------------------
// CSV de cualquier origen

const RE_TIEMPO = /^(t|t_?ms|t_?s|time|tiempo|timestamp|time ?\((m?s)\)|tiempo ?\((m?s)\)|seconds|segundos|ms)$/i;

function partir(linea, sep) {
  // Separador simple con soporte de comillas dobles
  const out = [];
  let cur = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { if (comillas && linea[i + 1] === '"') { cur += '"'; i++; } else comillas = !comillas; } else if (c === sep && !comillas) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** «Régimen (rpm)», «Régimen [rpm]» → { nombre, unidad }. */
function nombreYUnidad(c) {
  const m = /^(.*?)\s*[([]\s*([^)\]]*)\s*[)\]]\s*$/.exec(c);
  return m ? { nombre: m[1].trim() || c, unidad: m[2].trim() } : { nombre: c, unidad: '' };
}

/** «12:03:04.250» o «03:04,5» → ms. */
function horaAMs(s) {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/.exec(s);
  if (!m) return null;
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3].replace(',', '.'))) * 1000;
}

export function desdeCsvGenerico(texto, nombreArchivo = '') {
  const lineas = texto.replace(/^﻿/, '').replace(/\r/g, '').split('\n');
  // Grabador propio: con su línea de cabecera «# reyman-grabacion»
  if (lineas[0]?.startsWith(`# ${FORMATO}`)) {
    const m = desdeGrabacion(grabacionDesdeCsv(texto));
    m.titulo = m.titulo || nombreArchivo;
    return m;
  }
  const utiles = lineas.filter((l) => l.trim() && !l.startsWith('#'));
  if (utiles.length < 2) throw new Error('El archivo no tiene datos.');
  // Separador: el que más aparece en la cabecera
  const cabTexto = utiles[0];
  const sep = [';', '\t', ','].map((s) => [s, cabTexto.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cab = partir(cabTexto, sep);
  const filas = utiles.slice(1).map((l) => partir(l, sep));
  // Coma decimal si el separador no es la coma y aparecen números con coma
  const decimalComa = sep !== ',' && filas.slice(0, 50).some((f) => f.some((x) => /^-?\d+,\d+$/.test(x)));
  const aNum = (s) => {
    if (s === undefined || s === '') return null;
    const n = Number(decimalComa ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : null;
  };
  // Columna de tiempo: por nombre o, si no, la primera
  let iT = cab.findIndex((c) => RE_TIEMPO.test(c.trim()));
  if (iT < 0) iT = 0;
  const nombreT = cab[iT].toLowerCase();
  const enMs = /ms/.test(nombreT) && !/^time$|^tiempo$/.test(nombreT);
  const conHora = filas.slice(0, 5).some((f) => horaAMs(f[iT] || '') !== null);
  const tiempo = (s) => {
    if (conHora) return horaAMs(s);
    const n = aNum(s);
    return n === null ? null : enMs ? n : n * 1000;
  };
  const iEvento = cab.findIndex((c) => /^(evento|event|eventos|marca|nota)$/i.test(c));
  const m = vacio({ titulo: nombreArchivo.replace(/\.[^.]+$/, '') || 'Archivo CSV', origen: 'Archivo CSV' });
  const cols = [];
  cab.forEach((c, k) => {
    if (k === iT || k === iEvento || !c) return;
    // Solo columnas con números
    if (!filas.slice(0, 200).some((f) => aNum(f[k]) !== null)) return;
    let { nombre, unidad } = nombreYUnidad(c);
    // Cabeceras de PID en hex (grabador antiguo): «0C» → nombre del PID
    if (/^(0x)?[0-9a-f]{2}$/i.test(nombre) && !unidad) ({ nombre, unidad } = infoPid(parseInt(nombre.replace(/^0x/i, ''), 16)));
    let clave = nombre;
    for (let n = 2; m.valores[clave]; n++) clave = `${nombre} (${n})`;
    m.valores[clave] = [];
    m.canales.push({ clave, nombre, unidad });
    cols.push([k, clave]);
  });
  if (!cols.length) throw new Error('No hay columnas con números en el archivo.');
  for (const f of filas) {
    const t = tiempo(f[iT]);
    if (t === null) continue;
    m.t.push(t);
    for (const [k, clave] of cols) m.valores[clave].push(aNum(f[k]));
    if (iEvento >= 0 && f[iEvento]) m.eventos.push({ t, tipo: 'marca', detalle: f[iEvento] });
  }
  if (!m.t.length) throw new Error('No se ha podido leer la columna de tiempo.');
  return normalizarTiempo(m);
}

/** Abre el contenido de un archivo (JSON o CSV) y devuelve el modelo del visor. */
export function abrirTexto(texto, nombreArchivo = '') {
  const limpio = texto.replace(/^﻿/, '').trim();
  if (limpio.startsWith('{') || limpio.startsWith('[')) {
    let j;
    try { j = JSON.parse(limpio); } catch { throw new Error('El archivo JSON está dañado.'); }
    if (j.formato === FORMATO) return desdeGrabacion(j);
    if (j.formato === 'reyman-visor') return desdeVisorJson(j);
    if (Array.isArray(j.muestras) && Array.isArray(j.pids)) return desdeSesion(j);
    throw new Error('Este JSON no es una grabación de Reyman Diag.');
  }
  return desdeCsvGenerico(texto, nombreArchivo);
}

// ---------------------------------------------------------------------------
// Consultas para el dibujo y las tablas

/** Índice de la muestra más cercana a t (búsqueda binaria). */
export function indiceEn(m, t) {
  const a = m.t;
  if (!a.length) return -1;
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < t) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(a[lo - 1] - t) <= Math.abs(a[lo] - t)) lo--;
  return lo;
}

/** Primer índice con t >= x. */
function desde(a, x) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Valor de un canal en el instante t (el último válido a menos de `tolerancia` ms). */
export function valorEn(m, clave, t, tolerancia = 2000) {
  const v = m.valores[clave];
  let i = indiceEn(m, t);
  if (i < 0) return null;
  for (let j = i; j >= 0 && t - m.t[j] <= tolerancia; j--) if (v[j] !== null) return v[j];
  for (let j = i + 1; j < v.length && m.t[j] - t <= tolerancia; j++) if (v[j] !== null) return v[j];
  return null;
}

/** Mínimo, máximo y media de un canal entre t0 y t1 (ms). */
export function estadisticas(m, clave, t0 = -Infinity, t1 = Infinity) {
  const v = m.valores[clave];
  let n = 0; let suma = 0; let min = Infinity; let max = -Infinity; let tMin = null; let tMax = null;
  for (let i = desde(m.t, t0); i < m.t.length && m.t[i] <= t1; i++) {
    const x = v[i];
    if (x === null) continue;
    n++; suma += x;
    if (x < min) { min = x; tMin = m.t[i]; }
    if (x > max) { max = x; tMax = m.t[i]; }
  }
  return n ? { n, min, max, media: suma / n, tMin, tMax } : { n: 0, min: null, max: null, media: null, tMin: null, tMax: null };
}

/**
 * Puntos para dibujar un canal entre t0 y t1 con `px` columnas: si hay más muestras que píxeles,
 * se agrupan por columna guardando mínimo y máximo (no se pierden picos). Devuelve [[t, min, max], …]
 * y un `null` donde hay un hueco sin datos.
 */
export function reducir(m, clave, t0, t1, px) {
  const v = m.valores[clave];
  const a = m.t;
  const i0 = Math.max(0, desde(a, t0) - 1);
  const i1 = Math.min(a.length - 1, desde(a, t1));
  const out = [];
  if (i1 < i0) return out;
  const total = i1 - i0 + 1;
  if (total <= px * 2) {
    for (let i = i0; i <= i1; i++) out.push(v[i] === null ? null : [a[i], v[i], v[i]]);
    return out;
  }
  const paso = (t1 - t0) / px;
  let col = -1; let lo = Infinity; let hi = -Infinity; let tc = 0; let hay = false;
  for (let i = i0; i <= i1; i++) {
    const c = Math.floor((a[i] - t0) / paso);
    if (c !== col) {
      if (col >= 0) out.push(hay ? [tc, lo, hi] : null);
      col = c; lo = Infinity; hi = -Infinity; tc = a[i]; hay = false;
    }
    const x = v[i];
    if (x !== null) { hay = true; if (x < lo) lo = x; if (x > hi) hi = x; }
  }
  if (col >= 0) out.push(hay ? [tc, lo, hi] : null);
  return out;
}

/** Duración en ms. */
export const duracion = (m) => (m.t.length ? m.t[m.t.length - 1] : 0);

/** Muestras por segundo (aproximado). */
export const frecuencia = (m) => (m.t.length > 1 ? Math.round(((m.t.length - 1) / (duracion(m) / 1000)) * 10) / 10 : 0);

// ---------------------------------------------------------------------------
// Exportar

/** CSV (separador «;» y coma decimal, como lo abre Excel en España), opcionalmente solo un tramo. */
export function aCsv(m, { t0 = -Infinity, t1 = Infinity, claves } = {}) {
  const cs = claves ? m.canales.filter((c) => claves.includes(c.clave)) : m.canales;
  const n = (x, dec = 3) => (x === null || x === undefined ? '' : String(Math.round(x * 10 ** dec) / 10 ** dec).replace('.', ','));
  const ev = new Map();
  for (const e of m.eventos) {
    if (e.t < t0 || e.t > t1) continue;
    const i = indiceEn(m, e.t);
    ev.set(i, [...(ev.get(i) || []), e.detalle || e.tipo]);
  }
  const lineas = [['t_s', ...cs.map((c) => (c.unidad ? `${c.nombre} (${c.unidad})` : c.nombre)), 'evento'].join(';')];
  for (let i = desde(m.t, t0); i < m.t.length && m.t[i] <= t1; i++) {
    lineas.push([n(m.t[i] / 1000), ...cs.map((c) => n(m.valores[c.clave][i])), (ev.get(i) || []).join(' | ').replace(/;/g, ',')].join(';'));
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}

/** JSON del visor (para volver a abrirlo tal cual, con las marcas). */
export function aJson(m, { t0 = -Infinity, t1 = Infinity } = {}) {
  const i0 = desde(m.t, t0);
  let i1 = i0;
  while (i1 < m.t.length && m.t[i1] <= t1) i1++;
  const valores = {};
  for (const c of m.canales) valores[c.clave] = m.valores[c.clave].slice(i0, i1);
  return JSON.stringify({
    formato: 'reyman-visor', version: 1, titulo: m.titulo, inicio: m.inicio, origen: m.origen, vehiculo: m.vehiculo,
    canales: m.canales, t: m.t.slice(i0, i1), valores, eventos: m.eventos.filter((e) => e.t >= t0 && e.t <= t1),
  });
}

export function desdeVisorJson(j) {
  const m = vacio({ titulo: j.titulo || 'Grabación', inicio: j.inicio || null, origen: j.origen || '', vehiculo: j.vehiculo || {} });
  m.canales = j.canales || [];
  m.t = j.t || [];
  for (const c of m.canales) m.valores[c.clave] = (j.valores?.[c.clave] || []).map((x) => num(x));
  m.eventos = j.eventos || [];
  return normalizarTiempo(m);
}

/** Texto del tiempo: «12,4 s», «2:05», «1:02:05». */
export function textoTiempo(ms, { decimas = true } = {}) {
  const s = ms / 1000;
  if (s < 60) return `${(Math.round(s * (decimas ? 10 : 1)) / (decimas ? 10 : 1)).toLocaleString('es-ES')} s`;
  const h = Math.floor(s / 3600);
  const mi = Math.floor((s % 3600) / 60);
  const se = Math.floor(s % 60);
  const dos = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${dos(mi)}:${dos(se)}` : `${mi}:${dos(se)}`;
}

export { hex };
