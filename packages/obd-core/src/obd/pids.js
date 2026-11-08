// Reyman Diag · PIDs estándar del modo 01 (SAE J1979 / ISO 15031-5)
// Cada PID: nombre en español, unidad, número de bytes y fórmula sobre los bytes A, B, C, D...
// Las fórmulas son las públicas del estándar.

const u8 = (b) => b[0];
const pct = (x) => (x * 100) / 255;
const temp = (x) => x - 40;
const trim = (x) => ((x - 128) * 100) / 128;
const w = (b, i = 0) => (b[i] << 8) | b[i + 1];

export const PIDS = {
  0x04: { nombre: 'Carga calculada del motor', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x05: { nombre: 'Temperatura refrigerante', unidad: '°C', bytes: 1, f: (b) => temp(u8(b)), min: -40, max: 130 },
  0x06: { nombre: 'Corrección combustible corto plazo B1', unidad: '%', bytes: 1, f: (b) => trim(u8(b)), min: -25, max: 25 },
  0x07: { nombre: 'Corrección combustible largo plazo B1', unidad: '%', bytes: 1, f: (b) => trim(u8(b)), min: -25, max: 25 },
  0x08: { nombre: 'Corrección combustible corto plazo B2', unidad: '%', bytes: 1, f: (b) => trim(u8(b)), min: -25, max: 25 },
  0x09: { nombre: 'Corrección combustible largo plazo B2', unidad: '%', bytes: 1, f: (b) => trim(u8(b)), min: -25, max: 25 },
  0x0a: { nombre: 'Presión de combustible (relativa)', unidad: 'kPa', bytes: 1, f: (b) => u8(b) * 3, min: 0, max: 765 },
  0x0b: { nombre: 'Presión absoluta colector (MAP)', unidad: 'kPa', bytes: 1, f: (b) => u8(b), min: 0, max: 255 },
  0x0c: { nombre: 'Régimen motor', unidad: 'rpm', bytes: 2, f: (b) => w(b) / 4, min: 0, max: 7000 },
  0x0d: { nombre: 'Velocidad vehículo', unidad: 'km/h', bytes: 1, f: (b) => u8(b), min: 0, max: 250 },
  0x0e: { nombre: 'Avance de encendido', unidad: '°', bytes: 1, f: (b) => u8(b) / 2 - 64, min: -20, max: 60 },
  0x0f: { nombre: 'Temperatura aire de admisión', unidad: '°C', bytes: 1, f: (b) => temp(u8(b)), min: -40, max: 100 },
  0x10: { nombre: 'Caudal de aire (MAF)', unidad: 'g/s', bytes: 2, f: (b) => w(b) / 100, min: 0, max: 300 },
  0x11: { nombre: 'Posición mariposa', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x1f: { nombre: 'Tiempo desde arranque', unidad: 's', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x21: { nombre: 'Distancia con testigo MIL encendido', unidad: 'km', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x22: { nombre: 'Presión rampa (relativa a colector)', unidad: 'kPa', bytes: 2, f: (b) => w(b) * 0.079, min: 0, max: 5177 },
  0x23: { nombre: 'Presión rampa de combustible', unidad: 'bar', bytes: 2, f: (b) => (w(b) * 10) / 100, min: 0, max: 2500 },
  0x2c: { nombre: 'EGR comandada', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x2d: { nombre: 'Error EGR', unidad: '%', bytes: 1, f: (b) => trim(u8(b)), min: -100, max: 100 },
  0x2e: { nombre: 'Purga canister comandada', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x2f: { nombre: 'Nivel de combustible', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x30: { nombre: 'Calentamientos desde borrado de averías', unidad: '', bytes: 1, f: (b) => u8(b), min: 0, max: 255 },
  0x31: { nombre: 'Distancia desde borrado de averías', unidad: 'km', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x33: { nombre: 'Presión barométrica', unidad: 'kPa', bytes: 1, f: (b) => u8(b), min: 0, max: 255 },
  0x3c: { nombre: 'Temperatura catalizador B1S1', unidad: '°C', bytes: 2, f: (b) => w(b) / 10 - 40, min: -40, max: 1000 },
  0x3d: { nombre: 'Temperatura catalizador B2S1', unidad: '°C', bytes: 2, f: (b) => w(b) / 10 - 40, min: -40, max: 1000 },
  0x3e: { nombre: 'Temperatura catalizador B1S2', unidad: '°C', bytes: 2, f: (b) => w(b) / 10 - 40, min: -40, max: 1000 },
  0x3f: { nombre: 'Temperatura catalizador B2S2', unidad: '°C', bytes: 2, f: (b) => w(b) / 10 - 40, min: -40, max: 1000 },
  0x42: { nombre: 'Tensión del módulo de control', unidad: 'V', bytes: 2, f: (b) => w(b) / 1000, min: 0, max: 18 },
  0x43: { nombre: 'Carga absoluta', unidad: '%', bytes: 2, f: (b) => (w(b) * 100) / 255, min: 0, max: 400 },
  0x44: { nombre: 'Lambda comandada', unidad: 'λ', bytes: 2, f: (b) => (2 / 65536) * w(b), min: 0, max: 2 },
  0x45: { nombre: 'Posición relativa mariposa', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x46: { nombre: 'Temperatura ambiente', unidad: '°C', bytes: 1, f: (b) => temp(u8(b)), min: -40, max: 60 },
  0x47: { nombre: 'Posición absoluta mariposa B', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x49: { nombre: 'Posición pedal acelerador D', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x4a: { nombre: 'Posición pedal acelerador E', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x4c: { nombre: 'Actuador mariposa comandado', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x4d: { nombre: 'Tiempo con testigo MIL encendido', unidad: 'min', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x4e: { nombre: 'Tiempo desde borrado de averías', unidad: 'min', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x51: { nombre: 'Tipo de combustible', unidad: '', bytes: 1, f: (b) => u8(b), texto: (v) => COMBUSTIBLE[v] || `Código ${v}` },
  0x52: { nombre: 'Porcentaje de etanol', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x59: { nombre: 'Presión rampa (absoluta)', unidad: 'bar', bytes: 2, f: (b) => (w(b) * 10) / 100, min: 0, max: 2500 },
  0x5a: { nombre: 'Posición relativa pedal acelerador', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x5b: { nombre: 'Vida restante batería híbrida', unidad: '%', bytes: 1, f: (b) => pct(u8(b)), min: 0, max: 100 },
  0x5c: { nombre: 'Temperatura aceite motor', unidad: '°C', bytes: 1, f: (b) => temp(u8(b)), min: -40, max: 160 },
  0x5d: { nombre: 'Avance de inyección', unidad: '°', bytes: 2, f: (b) => w(b) / 128 - 210, min: -210, max: 302 },
  0x5e: { nombre: 'Consumo de combustible', unidad: 'L/h', bytes: 2, f: (b) => w(b) / 20, min: 0, max: 100 },
  0x61: { nombre: 'Par demandado por el conductor', unidad: '%', bytes: 1, f: (b) => u8(b) - 125, min: -125, max: 130 },
  0x62: { nombre: 'Par real del motor', unidad: '%', bytes: 1, f: (b) => u8(b) - 125, min: -125, max: 130 },
  0x63: { nombre: 'Par de referencia del motor', unidad: 'Nm', bytes: 2, f: (b) => w(b), min: 0, max: 65535 },
  0x70: { nombre: 'Presión de sobrealimentación (comandada A)', unidad: 'kPa', bytes: 10, f: (b) => w(b, 1) / 32, min: 0, max: 400 },
  0x7c: { nombre: 'Temperatura filtro de partículas (DPF)', unidad: '°C', bytes: 2, f: (b) => w(b) / 10 - 40, min: -40, max: 1000 },
  0xa6: { nombre: 'Cuentakilómetros', unidad: 'km', bytes: 4, f: (b) => ((b[0] * 2 ** 24) + (b[1] << 16) + (b[2] << 8) + b[3]) / 10, min: 0, max: 2000000 },
};

export const COMBUSTIBLE = {
  0: 'No disponible', 1: 'Gasolina', 2: 'Metanol', 3: 'Etanol', 4: 'Diésel', 5: 'GLP', 6: 'GNC', 7: 'Propano',
  8: 'Eléctrico', 9: 'Bifuel gasolina', 10: 'Bifuel metanol', 11: 'Bifuel etanol', 12: 'Bifuel GLP', 13: 'Bifuel GNC',
  14: 'Bifuel propano', 15: 'Bifuel eléctrico', 16: 'Bifuel eléctrico y combustión', 17: 'Híbrido gasolina',
  18: 'Híbrido etanol', 19: 'Híbrido diésel', 20: 'Híbrido eléctrico', 21: 'Híbrido eléctrico y combustión',
  22: 'Híbrido regenerativo', 23: 'Bifuel diésel',
};

/** Grupos de PIDs para la pantalla de datos en vivo. */
export const GRUPOS_EN_VIVO = [
  { id: 'basico', nombre: 'Básico', pids: [0x0c, 0x0d, 0x05, 0x04, 0x42, 0x0f] },
  { id: 'mezcla', nombre: 'Mezcla y aire', pids: [0x06, 0x07, 0x10, 0x0b, 0x11, 0x44] },
  { id: 'diesel', nombre: 'Diésel', pids: [0x23, 0x59, 0x0b, 0x2c, 0x7c, 0x5e] },
  { id: 'temperaturas', nombre: 'Temperaturas', pids: [0x05, 0x0f, 0x5c, 0x46, 0x3c, 0x7c] },
];

/** Decodifica un PID del modo 01 a partir de sus bytes de datos. */
export function decodificarPid(pid, bytes) {
  const def = PIDS[pid];
  if (!def) return { pid, nombre: `PID 0x${hex(pid)}`, valor: null, bruto: bytes.map(hex).join(' ') };
  const valor = def.f(bytes);
  return {
    pid,
    nombre: def.nombre,
    unidad: def.unidad,
    valor: Math.round(valor * 100) / 100,
    texto: def.texto ? def.texto(valor) : null,
  };
}

/** Decodifica los mapas de PIDs soportados (PIDs 00, 20, 40...). Devuelve la lista de PIDs. */
export function decodificarSoportados(base, bytes) {
  const out = [];
  for (let i = 0; i < 32; i++) {
    const byte = bytes[Math.floor(i / 8)];
    if (byte & (0x80 >> (i % 8))) out.push(base + i + 1);
  }
  return out;
}

export const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
