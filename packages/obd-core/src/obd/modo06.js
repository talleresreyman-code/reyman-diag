// Reyman Diag · Modo 06 (SAE J1979 / ISO 15031-5): resultados de las pruebas internas de los monitores.
// Solo CAN (ISO 15765-4). Cada respuesta trae, por prueba: MID (monitor), TID (prueba), UASID (unidad y escala),
// valor medido, mínimo y máximo. La prueba está bien si mínimo ≤ valor ≤ máximo.
// Sirve para ver lo «cerca del límite» que está algo (catalizador, sondas, EVAP, fallos de encendido por cilindro)
// antes de que encienda el testigo.

// ---- Monitores (MID) ----
const SONDAS = ['B1S1', 'B1S2', 'B1S3', 'B1S4', 'B2S1', 'B2S2', 'B2S3', 'B2S4', 'B3S1', 'B3S2', 'B3S3', 'B3S4', 'B4S1', 'B4S2', 'B4S3', 'B4S4'];
const MIDS = {};
SONDAS.forEach((s, i) => { MIDS[0x01 + i] = `Sonda lambda ${s}`; MIDS[0x41 + i] = `Calefacción sonda lambda ${s}`; });
for (let b = 1; b <= 4; b++) {
  MIDS[0x20 + b] = `Catalizador banco ${b}`;
  MIDS[0x30 + b] = `EGR / distribución variable banco ${b}`;
  MIDS[0x34 + b] = `Distribución variable (VVT) banco ${b}`;
  MIDS[0x60 + b] = `Catalizador calefactado banco ${b}`;
  MIDS[0x70 + b] = `Aire secundario ${b}`;
  MIDS[0x80 + b] = `Sistema de combustible banco ${b}`;
}
Object.assign(MIDS, {
  0x39: 'EVAP fuga 0,150"', 0x3a: 'EVAP fuga 0,090"', 0x3b: 'EVAP fuga 0,040"', 0x3c: 'EVAP fuga 0,020"', 0x3d: 'EVAP caudal de purga',
  0x85: 'Presión de sobrealimentación banco 1', 0x86: 'Presión de sobrealimentación banco 2',
  0x90: 'Trampa de NOx banco 1', 0x91: 'Trampa de NOx banco 2', 0x98: 'Catalizador NOx / SCR banco 1', 0x99: 'Catalizador NOx / SCR banco 2',
  0xa1: 'Fallos de encendido (general)', 0xb0: 'Filtro de partículas banco 1', 0xb1: 'Filtro de partículas banco 2',
});
for (let c = 1; c <= 12; c++) MIDS[0xa1 + c] = `Fallos de encendido cilindro ${c}`;

/** Nombre del monitor. */
export function nombreMid(mid) {
  return MIDS[mid] || `Monitor ${hx(mid)}`;
}

// ---- Pruebas (TID) estándar ----
const TIDS = {
  0x01: 'Umbral rico → pobre', 0x02: 'Umbral pobre → rico', 0x03: 'Tensión baja para tiempo de cambio', 0x04: 'Tensión alta para tiempo de cambio',
  0x05: 'Tiempo de cambio rico → pobre', 0x06: 'Tiempo de cambio pobre → rico', 0x07: 'Tensión mínima de la sonda', 0x08: 'Tensión máxima de la sonda',
  0x09: 'Tiempo entre cambios', 0x0a: 'Periodo de la sonda',
  0x0b: 'Fallos de encendido: media de los últimos 10 ciclos', 0x0c: 'Fallos de encendido: ciclo actual o último',
};

export function nombreTid(mid, tid) {
  if (tid >= 0x80) return `Prueba del fabricante ${hx(tid)}`;
  // 0B y 0C solo tienen ese significado en los monitores de fallos de encendido
  if ((tid === 0x0b || tid === 0x0c) && !(mid >= 0xa1 && mid <= 0xad)) return `Prueba ${hx(tid)}`;
  return TIDS[tid] || `Prueba ${hx(tid)}`;
}

// ---- Unidades y escalas (UASID, J1979 anexo E) ----
// [unidad, escala, desplazamiento]. 0x01–0x7F sin signo; 0x81–0xFE con signo (complemento a dos).
const UAS = {
  0x01: ['', 1], 0x02: ['', 0.1], 0x03: ['', 0.01], 0x04: ['', 0.001], 0x05: ['', 0.0000305], 0x06: ['', 0.000305],
  0x07: ['rpm', 0.25], 0x08: ['km/h', 0.01], 0x09: ['km/h', 1], 0x0a: ['mV', 0.122], 0x0b: ['V', 0.001], 0x0c: ['V', 0.01],
  0x0d: ['mA', 0.00390625], 0x0e: ['A', 0.001], 0x0f: ['A', 0.01], 0x10: ['ms', 1], 0x11: ['ms', 100], 0x12: ['s', 1],
  0x13: ['mΩ', 1], 0x14: ['Ω', 1], 0x15: ['kΩ', 1], 0x16: ['°C', 0.1, -40], 0x17: ['kPa', 0.01], 0x18: ['kPa', 0.0117],
  0x19: ['kPa', 0.079], 0x1a: ['kPa', 1], 0x1b: ['kPa', 10], 0x1c: ['°', 0.01], 0x1d: ['°', 0.5], 0x1e: ['λ', 0.0000305],
  0x1f: ['A/F', 0.05], 0x20: ['', 0.0039062], 0x21: ['mHz', 1], 0x22: ['Hz', 1], 0x23: ['kHz', 1], 0x24: ['', 1],
  0x25: ['km', 1], 0x26: ['mV/ms', 0.1], 0x27: ['g/s', 0.01], 0x28: ['g/s', 1], 0x29: ['Pa/s', 0.25], 0x2a: ['kg/h', 0.001],
  0x2b: ['', 1], 0x2c: ['g/cil', 0.01], 0x2d: ['mg/emb', 0.01], 0x2e: ['', 1], 0x2f: ['%', 0.01], 0x30: ['%', 0.001526],
  0x31: ['L', 0.001], 0x32: ['in', 0.0000305], 0x33: ['', 0.00024414], 0x34: ['min', 1], 0x35: ['ms', 10],
  0x36: ['g', 0.01], 0x37: ['g', 0.1], 0x38: ['g', 1], 0x39: ['%', 0.01, -327.68], 0x3a: ['g', 0.001], 0x3b: ['g', 0.0001],
  0x3c: ['µs', 0.1], 0x3d: ['mA', 0.01], 0x3e: ['mm²', 0.00006103516], 0x3f: ['L', 0.01], 0x40: ['ppm', 1], 0x41: ['µA', 0.01],
  0x81: ['', 1], 0x82: ['', 0.1], 0x83: ['', 0.01], 0x84: ['', 0.001], 0x85: ['', 0.0000305], 0x86: ['', 0.000305],
  0x87: ['ppm', 1], 0x8a: ['mV', 0.122], 0x8b: ['V', 0.001], 0x8c: ['V', 0.01], 0x8d: ['mA', 0.00390625], 0x8e: ['A', 0.001],
  0x90: ['ms', 1], 0x96: ['°C', 0.1], 0x99: ['kPa', 0.1], 0x9c: ['°', 0.01], 0x9d: ['°', 0.5], 0xa8: ['g/s', 1],
  0xa9: ['Pa/s', 0.25], 0xad: ['mg/emb', 0.01], 0xae: ['mg/emb', 0.1], 0xaf: ['%', 0.01], 0xb0: ['%', 0.003052],
  0xb1: ['mV/s', 2], 0xfc: ['kPa', 0.01], 0xfd: ['kPa', 0.001], 0xfe: ['Pa', 0.25],
};

export function escalar(uas, crudo) {
  const def = UAS[uas];
  const conSigno = uas >= 0x81;
  const v = conSigno && crudo >= 0x8000 ? crudo - 0x10000 : crudo;
  if (!def) return { valor: v, unidad: '', escalaConocida: false };
  const [unidad, k, off = 0] = def;
  return { valor: redondear(v * k + off), unidad, escalaConocida: true };
}

const redondear = (x) => Math.round(x * 10000) / 10000;
const hx = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** Entradas de una respuesta 46 (sin el byte 46): [MID, TID, UAS, Vh, Vl, MINh, MINl, MAXh, MAXl]×n */
export function extraerPruebas(datos) {
  const out = [];
  for (let i = 0; i + 8 < datos.length; i += 9) {
    const [mid, tid, uas, v1, v2, n1, n2, x1, x2] = datos.slice(i, i + 9);
    const v = escalar(uas, (v1 << 8) | v2);
    const min = escalar(uas, (n1 << 8) | n2).valor;
    const max = escalar(uas, (x1 << 8) | x2).valor;
    const ok = v.valor >= min && v.valor <= max;
    // Margen: lo cerca que está del límite que importa, en % del rango.
    // Si el mínimo es 0 (o menos) el límite real es el máximo (fallos, tiempos, contadores: 0 es lo mejor);
    // si el máximo está saturado (FFFF), el límite real es el mínimo; si no, el más próximo de los dos.
    const rango = max - min;
    const saturado = ((x1 << 8) | x2) === 0xffff;
    let margen = null;
    if (rango > 0) {
      const hastaMax = (max - v.valor) / rango;
      const hastaMin = (v.valor - min) / rango;
      margen = Math.round((min <= 0 && !saturado ? hastaMax : saturado ? (min <= 0 ? 1 : hastaMin) : Math.min(hastaMax, hastaMin)) * 100);
    }
    out.push({
      mid, tid, uas, monitor: nombreMid(mid), prueba: nombreTid(mid, tid),
      valor: v.valor, min, max, unidad: v.unidad, escalaConocida: v.escalaConocida, ok, margen,
    });
  }
  return out;
}

/** Monitores soportados a partir de las respuestas a 06 00, 06 20, 06 40... */
export function decodificarMidsSoportados(base, b) {
  const out = [];
  for (let i = 0; i < 32; i++) if (b[i >> 3] & (0x80 >> (i & 7))) out.push(base + i + 1);
  return out;
}
