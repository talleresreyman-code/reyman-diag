// Reyman Diag · Decodificador genérico de PID del servicio 01/02 a partir de las definiciones bit a bit (sae-pids.js).
// Cada señal: bix (primer bit; 0 = bit 7 del byte A), len (bits), valor = crudo × mul ÷ div + add,
// sign = complemento a dos, nullmax/nullmin = fuera de ahí el dato «no disponible», map = lista de textos.

import { SAE_PIDS } from './sae-pids.js';

/** Bytes de datos que ocupa un PID (según el último bit que usa). */
export function bytesDePid(pid) {
  const def = SAE_PIDS[pid];
  if (!def) return 4;
  let fin = 0;
  for (const s of def.s) fin = Math.max(fin, s.bix + s.len);
  return Math.ceil(fin / 8);
}

/** Extrae `len` bits desde `bix` (contando desde el bit más alto del primer byte). */
export function extraerBits(bytes, bix, len) {
  if (bix + len > bytes.length * 8) return null;
  let v = 0;
  for (let i = 0; i < len; i++) {
    const b = bix + i;
    v = v * 2 + ((bytes[b >> 3] >> (7 - (b & 7))) & 1);
  }
  return v;
}

const redondear = (x) => Math.round(x * 1000) / 1000;

/** Valor de una señal. Devuelve { valor, texto } (valor null si no está disponible). */
export function valorSenal(s, bytes) {
  if (s.sup !== undefined && extraerBits(bytes, s.sup, 1) === 0) return { valor: null, texto: null, soportada: false };
  if (s.na !== undefined && extraerBits(bytes, s.na, 1) === 1) return { valor: null, texto: 'No disponible' };
  let crudo = extraerBits(bytes, s.bix, s.len);
  if (crudo === null) return { valor: null, texto: null };
  if (s.map) return { valor: crudo, texto: s.map[crudo] ?? `Código ${crudo}` };
  if (s.si) return { valor: crudo, texto: crudo ? 'Sí' : 'No' };
  if (s.sign && crudo >= 2 ** (s.len - 1)) crudo -= 2 ** s.len;
  const v = redondear((crudo * (s.mul ?? 1)) / (s.div ?? 1) + (s.add ?? 0));
  if ((s.nullmax !== undefined && v > s.nullmax) || (s.nullmin !== undefined && v < s.nullmin)) return { valor: null, texto: 'No disponible' };
  return { valor: v, texto: null };
}

/**
 * Todas las señales de un PID (sin las que el propio PID marca como no soportadas).
 * @returns {{id,nombre,valor,unidad,texto,grupo,oculta,min,max}[]}
 */
export function decodificarSenales(pid, bytes, { ocultas = false } = {}) {
  const def = SAE_PIDS[pid];
  if (!def) return [];
  const out = [];
  for (const s of def.s) {
    if (s.oculta && !ocultas) continue;
    const { valor, texto, soportada } = valorSenal(s, bytes);
    if (soportada === false) continue; // el coche dice que este dato no lo tiene
    out.push({
      id: s.id, nombre: s.n, valor, texto, unidad: s.u || '', grupo: s.g || null,
      oculta: !!s.oculta, min: s.min, max: s.max, lista: !!(s.map || s.si),
    });
  }
  return out;
}

/** Señales numéricas que se pueden ver en vivo (no listas sí/no ni «disponible»). */
export function senalesNumericas(pid) {
  const def = SAE_PIDS[pid];
  if (!def) return [];
  return def.s.filter((s) => !s.oculta && !s.map && !s.si);
}

export { SAE_PIDS };

/**
 * Lo contrario: bytes de un PID a partir de valores { id: valor } (para el simulador y los tests).
 * Marca como soportadas las señales que se dan y deja a 0 el resto.
 */
export function codificarSenales(pid, valores) {
  const def = SAE_PIDS[pid];
  const bytes = new Array(bytesDePid(pid)).fill(0);
  const poner = (bix, len, v) => {
    for (let i = len - 1; i >= 0; i--, v = Math.floor(v / 2)) {
      const b = bix + i;
      if (v % 2) bytes[b >> 3] |= 0x80 >> (b & 7);
    }
  };
  for (const s of def.s) {
    if (!(s.id in valores)) continue;
    let crudo = Math.round(((valores[s.id] - (s.add ?? 0)) * (s.div ?? 1)) / (s.mul ?? 1));
    if (crudo < 0) crudo += 2 ** s.len;
    poner(s.bix, s.len, crudo);
    if (s.sup !== undefined) poner(s.sup, 1, 1);
  }
  return bytes;
}
