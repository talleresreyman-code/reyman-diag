// Reyman Diag · Servicio 09 (SAE J1979): identificación del vehículo y de las centralitas.
// 02 VIN · 04 calibraciones (CALID, 16 caracteres cada una) · 06 CVN (4 bytes por calibración)
// 08 contadores de uso de los monitores (gasolina) · 0A nombre de la centralita · 0B contadores (diésel) · 0D número de serie
// En CAN la respuesta es: 49 <infotipo> <nº de elementos> <datos>.

const TXT = (b) => String.fromCharCode(...b.filter((x) => x >= 0x20 && x < 0x7f)).trim();
const w = (b, i) => (b[i] << 8) | b[i + 1];

/** Calibraciones (09 04): lista de textos de 16 caracteres. */
export function decodificarCalid(datos) {
  const out = [];
  for (let i = 0; i + 16 <= datos.length; i += 16) {
    const t = TXT(datos.slice(i, i + 16));
    if (t) out.push(t);
  }
  return out;
}

/** CVN (09 06): sumas de verificación de 4 bytes en hexadecimal. */
export function decodificarCvn(datos) {
  const out = [];
  for (let i = 0; i + 4 <= datos.length; i += 4) out.push(datos.slice(i, i + 4).map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(''));
  return out;
}

// Contadores de uso (IUMPR): pares «veces completado» / «veces con condiciones»
const IPT_GASOLINA = [
  ['cat1', 'Catalizador banco 1'], ['cat2', 'Catalizador banco 2'], ['o2s1', 'Sondas lambda banco 1'], ['o2s2', 'Sondas lambda banco 2'],
  ['egr', 'EGR / VVT'], ['air', 'Aire secundario'], ['evap', 'EVAP'], ['so2s1', 'Sondas lambda posteriores banco 1'], ['so2s2', 'Sondas lambda posteriores banco 2'],
  ['afri1', 'Desequilibrio de mezcla banco 1'], ['afri2', 'Desequilibrio de mezcla banco 2'], ['pf1', 'Filtro de partículas banco 1'], ['pf2', 'Filtro de partículas banco 2'],
];
const IPT_DIESEL = [
  ['hccat', 'Catalizador NMHC'], ['ncat', 'Catalizador NOx / SCR'], ['nads', 'Trampa de NOx'], ['pm', 'Filtro de partículas'],
  ['egs', 'Sensor de gases de escape'], ['egr', 'EGR / VVT'], ['bp', 'Presión de turbo'], ['fuel', 'Sistema de combustible'],
];

/**
 * Contadores de uso de los monitores (09 08 gasolina, 09 0B diésel).
 * Devuelve { tipo, ciclosObd, arranques, monitores: [{ id, nombre, completado, condiciones, ratio }] }.
 * La normativa pide un ratio mínimo (orientativo 0,336 en EOBD; 0,100 en algunos monitores): por debajo, el monitor casi nunca termina.
 */
export function decodificarIpt(infotipo, datos) {
  const nombres = infotipo === 0x0b ? IPT_DIESEL : IPT_GASOLINA;
  const n = datos.length >> 1;
  if (n < 2) return null;
  const monitores = [];
  for (let i = 0; i < nombres.length && 2 + i * 2 + 1 < n; i++) {
    const completado = w(datos, (2 + i * 2) * 2);
    const condiciones = w(datos, (3 + i * 2) * 2);
    monitores.push({
      id: nombres[i][0], nombre: nombres[i][1], completado, condiciones,
      ratio: condiciones ? Math.round((completado / condiciones) * 1000) / 1000 : null,
    });
  }
  return { tipo: infotipo === 0x0b ? 'diesel' : 'gasolina', ciclosObd: w(datos, 0), arranques: w(datos, 2), monitores };
}

/** Infotipos soportados (09 00, 09 20…). */
export function decodificarInfotiposSoportados(base, b) {
  const out = [];
  for (let i = 0; i < 32; i++) if (b[i >> 3] & (0x80 >> (i & 7))) out.push(base + i + 1);
  return out;
}

export { TXT as textoDeBytes };
