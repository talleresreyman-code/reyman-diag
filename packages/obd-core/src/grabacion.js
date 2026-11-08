// Reyman Diag · Grabación de datos (pruebas de carretera y grabador de fallos intermitentes)
// Un solo formato para todo lo que se graba:
// - pruebas de carretera desde Reyman Diag (móvil o tablet conectados),
// - el grabador que se deja en el coche del cliente (WiCAN Pro), importado desde su tarjeta SD.
//
// Formato "reyman-grabacion" v1 (JSON):
// { formato, version, origen, inicio (ISO), vehiculo {vin, matricula}, pids [números],
//   muestras [{ t (ms desde inicio), v {pid: valor}, tension? }],
//   eventos [{ t, tipo: 'dtc'|'boton'|'tension'|'nota', detalle }], ventana? {antesS, despuesS} }

import { PIDS } from './obd/pids.js';

export const FORMATO = 'reyman-grabacion';
export const VERSION = 1;

export function nuevaGrabacion({ origen = 'app', inicio = new Date(), vehiculo = {}, pids = [], ventana = null } = {}) {
  return { formato: FORMATO, version: VERSION, origen, inicio: new Date(inicio).toISOString(), vehiculo, pids: [...pids], muestras: [], eventos: [], ventana };
}

/** Convierte una sesión de la app de taller ({inicio: ms, pids, muestras}) al formato común. */
export function desdeSesion(s, extra = {}) {
  const g = nuevaGrabacion({ origen: 'app', inicio: s.inicio, pids: s.pids, ...extra });
  g.muestras = s.muestras.map((m) => ({ t: m.t, v: { ...m.v } }));
  return g;
}

export function validar(g) {
  const errores = [];
  if (!g || g.formato !== FORMATO) errores.push('No es una grabación de Reyman.');
  else {
    if (g.version > VERSION) errores.push(`Versión ${g.version} más nueva que la app (${VERSION}).`);
    if (!Array.isArray(g.muestras)) errores.push('Faltan las muestras.');
    if (!Array.isArray(g.pids)) errores.push('Faltan los PIDs.');
    for (let i = 1; i < (g.muestras?.length || 0); i++) if (g.muestras[i].t < g.muestras[i - 1].t) { errores.push('Las muestras no están en orden de tiempo.'); break; }
  }
  return { ok: !errores.length, errores };
}

/** Duración en segundos. */
export const duracionS = (g) => (g.muestras.length ? (g.muestras[g.muestras.length - 1].t - g.muestras[0].t) / 1000 : 0);

/** Serie de un PID (o 'tension') lista para dibujar: [{t, valor}] sin huecos. */
export function serie(g, clave) {
  const out = [];
  for (const m of g.muestras) {
    const valor = clave === 'tension' ? m.tension : m.v?.[clave];
    if (valor !== null && valor !== undefined && Number.isFinite(valor)) out.push({ t: m.t, valor });
  }
  return out;
}

/** Mínimo, máximo y media de cada PID. */
export function resumen(g) {
  const claves = [...g.pids, ...(g.muestras.some((m) => m.tension !== undefined) ? ['tension'] : [])];
  return claves.map((k) => {
    const s = serie(g, k).map((x) => x.valor);
    const def = k === 'tension' ? { nombre: 'Tensión batería', unidad: 'V' } : PIDS[k] || { nombre: `PID ${k}`, unidad: '' };
    if (!s.length) return { clave: k, nombre: def.nombre, unidad: def.unidad, n: 0 };
    return { clave: k, nombre: def.nombre, unidad: def.unidad, n: s.length, min: Math.min(...s), max: Math.max(...s), media: s.reduce((a, b) => a + b, 0) / s.length };
  }).filter(Boolean);
}

/** Recorta la grabación a una ventana alrededor de un instante (para enseñar solo el fallo). */
export function recortar(g, desdeT, hastaT) {
  const r = { ...g, muestras: g.muestras.filter((m) => m.t >= desdeT && m.t <= hastaT), eventos: g.eventos.filter((e) => e.t >= desdeT && e.t <= hastaT) };
  return r;
}

// ---------------------------------------------------------------------------
// CSV: lo que se descarga para Excel y lo que escribirá el firmware del grabador en la SD.
// Cabecera: t_ms;0C;0D;...;tension_v;evento   (separador ';' y coma decimal, como lo abre Excel en España)

export function aCsv(g, { separador = ';', decimal = ',' } = {}) {
  const tieneTension = g.muestras.some((m) => m.tension !== undefined);
  const cab = ['t_ms', ...g.pids.map((p) => p.toString(16).toUpperCase().padStart(2, '0')), ...(tieneTension ? ['tension_v'] : []), 'evento'];
  const num = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(Math.round(n * 1000) / 1000).replace('.', decimal));
  const eventosPorT = new Map();
  for (const e of g.eventos) {
    // El evento se apunta en la muestra más cercana
    let mejor = null;
    for (const m of g.muestras) if (!mejor || Math.abs(m.t - e.t) < Math.abs(mejor.t - e.t)) mejor = m;
    if (mejor) eventosPorT.set(mejor.t, [...(eventosPorT.get(mejor.t) || []), `${e.tipo}:${e.detalle || ''}`]);
  }
  const lineas = [`# ${FORMATO} v${VERSION} · origen=${g.origen} · inicio=${g.inicio} · vin=${g.vehiculo?.vin || ''} · matricula=${g.vehiculo?.matricula || ''}`, cab.join(separador)];
  for (const m of g.muestras) {
    lineas.push([m.t, ...g.pids.map((p) => num(m.v?.[p])), ...(tieneTension ? [num(m.tension)] : []), (eventosPorT.get(m.t) || []).join('|')].join(separador));
  }
  return lineas.join('\n') + '\n';
}

export function desdeCsv(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const meta = {};
  let i = 0;
  while (lineas[i]?.startsWith('#')) {
    for (const par of lineas[i].slice(1).split('·')) {
      const [k, ...v] = par.trim().split('=');
      if (v.length) meta[k.trim()] = v.join('=').trim();
    }
    i++;
  }
  const cabLinea = lineas[i++];
  if (!cabLinea) throw new Error('El archivo está vacío.');
  const sep = cabLinea.includes(';') ? ';' : ',';
  const cab = cabLinea.split(sep).map((c) => c.trim());
  const iT = cab.findIndex((c) => /^t(_ms)?$/i.test(c));
  if (iT < 0) throw new Error('Falta la columna de tiempo (t_ms).');
  const iTension = cab.findIndex((c) => /^tension(_v)?$/i.test(c));
  const iEvento = cab.findIndex((c) => /^evento$/i.test(c));
  const colPid = cab.map((c, k) => (k !== iT && k !== iTension && k !== iEvento && /^(0x)?[0-9a-f]{2}$/i.test(c) ? [k, parseInt(c.replace(/^0x/i, ''), 16)] : null)).filter(Boolean);
  const g = nuevaGrabacion({ origen: meta.origen || 'csv', inicio: meta.inicio || new Date(), vehiculo: { vin: meta.vin || null, matricula: meta.matricula || null }, pids: colPid.map(([, p]) => p) });
  const num = (s) => {
    if (s === undefined || s === '') return null;
    const n = Number(sep === ';' ? s.replace(',', '.') : s);
    return Number.isFinite(n) ? n : null;
  };
  for (; i < lineas.length; i++) {
    const c = lineas[i].split(sep);
    const t = num(c[iT]);
    if (t === null) continue;
    const m = { t, v: {} };
    for (const [k, pid] of colPid) m.v[pid] = num(c[k]);
    if (iTension >= 0) m.tension = num(c[iTension]);
    g.muestras.push(m);
    if (iEvento >= 0 && c[iEvento]) {
      for (const ev of c[iEvento].split('|')) {
        const [tipo, ...d] = ev.split(':');
        g.eventos.push({ t, tipo: tipo.trim(), detalle: d.join(':').trim() || null });
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Memoria circular: guarda solo los últimos N segundos de muestras.

export class MemoriaCircular {
  constructor(segundos = 30) { this.ms = segundos * 1000; this.muestras = []; }
  agregar(m) {
    this.muestras.push(m);
    const limite = m.t - this.ms;
    let k = 0;
    while (k < this.muestras.length && this.muestras[k].t < limite) k++;
    if (k) this.muestras.splice(0, k);
  }
  desde(t) { return this.muestras.filter((m) => m.t >= t); }
}

// ---------------------------------------------------------------------------
// Grabador de fallos intermitentes.
// Lee PIDs sin parar, guarda los últimos `antesS` segundos en memoria y, cuando "salta" algo
// (avería nueva, botón del cliente o caída de tensión), conserva esa ventana y sigue grabando
// `despuesS` segundos más. Cada disparo produce una grabación independiente.
// Es la misma lógica que llevará el firmware del WiCAN Pro; aquí sirve para el móvil y los tests.

export class Grabador {
  /**
   * @param {object} obd instancia de Obd (o cualquier objeto con leerPids y averias)
   * @param {object} op { pids, intervaloMs, antesS, despuesS, averiasCadaS, tensionCadaN, caidaTensionV,
   *                      elm (para la tensión), vehiculo, ahora, alGrabacion(g), alMuestra(m), alEvento(e) }
   */
  constructor(obd, op = {}) {
    this.obd = obd;
    this.elm = op.elm || obd.elm || null;
    this.pids = op.pids || [0x0c, 0x0d, 0x05, 0x04, 0x0b, 0x0e];
    this.intervaloMs = op.intervaloMs ?? 200;
    this.antesS = op.antesS ?? 20;
    this.despuesS = op.despuesS ?? 10;
    this.averiasCadaS = op.averiasCadaS ?? 10;
    this.tensionCadaN = op.tensionCadaN ?? 5;
    this.caidaTensionV = op.caidaTensionV ?? 1.5;
    this.vehiculo = op.vehiculo || {};
    this.ahora = op.ahora || (() => Date.now());
    this.alGrabacion = op.alGrabacion || (() => {});
    this.alMuestra = op.alMuestra || (() => {});
    this.alEvento = op.alEvento || (() => {});
    this.memoria = new MemoriaCircular(this.antesS + 2);
    this.activo = false;
    this.captura = null; // { grabacion, hasta }
    this.grabaciones = [];
    this.conocidas = new Set();
    this.vueltas = 0;
    this.ultimaTension = null;
  }

  async _codigosActuales() {
    const { averias } = await this.obd.averias();
    return new Set(averias.filter((a) => a.tipo !== 'permanente').map((a) => a.codigo));
  }

  /** Arranca el bucle. Devuelve una promesa que termina al llamar a parar(). */
  async iniciar() {
    if (this.activo) return;
    this.activo = true;
    this.t0 = this.ahora();
    this.inicioIso = new Date().toISOString();
    try { this.conocidas = await this._codigosActuales(); } catch { this.conocidas = new Set(); }
    let proxAverias = this.averiasCadaS * 1000;
    while (this.activo) {
      const inicioVuelta = this.ahora();
      const t = inicioVuelta - this.t0;
      const m = { t, v: {} };
      try {
        const valores = await this.obd.leerPids(this.pids);
        for (const x of valores) m.v[x.pid] = x.valor;
      } catch { /* sigue: se apunta la muestra vacía */ }
      if (this.elm && this.vueltas % this.tensionCadaN === 0) {
        try {
          const v = await this.elm.tension();
          if (v !== null) {
            m.tension = v;
            // Referencia: la tensión más alta de los últimos 2 s (la caída del arranque dura décimas)
            const ref = Math.max(...this.memoria.desde(t - 2000).map((x) => x.tension).filter((x) => x !== undefined && x !== null), -Infinity);
            if (Number.isFinite(ref) && ref - v >= this.caidaTensionV && !this.captura) this._disparar(t, 'tension', `${ref.toFixed(1)} → ${v.toFixed(1)} V`);
            this.ultimaTension = v;
          }
        } catch { /* */ }
      }
      this.vueltas++;
      this._agregar(m);
      if (t >= proxAverias) {
        proxAverias = t + this.averiasCadaS * 1000;
        try {
          const actuales = await this._codigosActuales();
          for (const c of actuales) if (!this.conocidas.has(c)) this._disparar(this.ahora() - this.t0, 'dtc', c);
          this.conocidas = actuales;
        } catch { /* */ }
      }
      const espera = this.intervaloMs - (this.ahora() - inicioVuelta);
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    }
    this._cerrarCaptura(true);
  }

  parar() { this.activo = false; }

  /** El cliente pulsa el botón al notar el fallo. */
  marcar(detalle = 'Marcado por el conductor') {
    this._disparar(this.ahora() - (this.t0 ?? this.ahora()), 'boton', detalle);
  }

  _agregar(m) {
    this.memoria.agregar(m);
    this.alMuestra(m);
    if (this.captura) {
      this.captura.grabacion.muestras.push(m);
      if (m.t >= this.captura.hasta) this._cerrarCaptura();
    }
  }

  _disparar(t, tipo, detalle) {
    const ev = { t, tipo, detalle };
    this.alEvento(ev);
    if (this.captura) {
      // Otro disparo durante la captura: se apunta y se alarga la ventana
      this.captura.grabacion.eventos.push(ev);
      this.captura.hasta = Math.max(this.captura.hasta, t + this.despuesS * 1000);
      return;
    }
    const g = nuevaGrabacion({ origen: 'grabador', inicio: this.inicioIso, vehiculo: this.vehiculo, pids: this.pids, ventana: { antesS: this.antesS, despuesS: this.despuesS } });
    g.muestras = this.memoria.desde(t - this.antesS * 1000).slice();
    g.eventos.push(ev);
    this.captura = { grabacion: g, hasta: t + this.despuesS * 1000 };
  }

  _cerrarCaptura(final = false) {
    if (!this.captura) return;
    const g = this.captura.grabacion;
    if (final) g.incompleta = true;
    this.captura = null;
    this.grabaciones.push(g);
    this.alGrabacion(g);
  }
}
