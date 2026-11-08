// Reyman Diag · datos extendidos por marca (fase 3)
// Lectura de identificadores de marca por UDS (servicio 22, ReadDataByIdentifier) en una centralita concreta.
// La base empieza vacía a propósito: solo se añaden entradas comprobadas en un coche real del taller
// (ver docs/MARCAS.md). Una entrada sin verificar puede dar valores falsos con apariencia correcta.

/**
 * Esquema de una entrada:
 * {
 *   marca: 'Volkswagen',            // tal como sale de decodificarVin().marca (se compara por inclusión)
 *   wmi: ['WVW', 'WV1'],            // opcional, más preciso que la marca
 *   modulo: 'Motor',
 *   peticion: '7E0', respuesta: '7E8', // cabeceras CAN (ATSH / filtro)
 *   did: 'F190',                    // identificador de 2 bytes en hex
 *   nombre: 'Nivel de hollín DPF', unidad: 'g',
 *   formula: 'A*256+B',             // sobre los bytes de datos (A, B, C, D…)
 *   verificado: { fecha: '2026-11-15', coche: 'Golf VII 2.0 TDI CRLB', por: 'José' },
 * }
 */
export const BASE_MARCAS = [];

export function entradasPara(vehiculo) {
  if (!vehiculo?.valido) return [];
  return BASE_MARCAS.filter((e) => (e.wmi ? e.wmi.includes(vehiculo.wmi) : vehiculo.marca?.includes(e.marca)) && e.verificado);
}

function evaluar(formula, bytes) {
  const letras = Object.fromEntries(bytes.map((b, i) => [String.fromCharCode(65 + i), b]));
  if (!/^[A-H0-9+\-*/(). ]+$/.test(formula)) throw new Error('Fórmula no válida');
  // Solo letras A-H, números y operadores: sin acceso a nada más
  return Function(...Object.keys(letras), `return (${formula});`)(...Object.values(letras));
}

/** Lee una entrada de marca. Restaura la cabecera por defecto al terminar. */
export async function leerDatoMarca(elm, e) {
  await elm.enviar(`ATSH${e.peticion}`);
  if (e.respuesta) await elm.enviar(`ATCRA${e.respuesta}`);
  try {
    const raw = await elm.enviar(`22${e.did}`);
    const bytes = raw.replace(/[^0-9A-F ]/gi, ' ').trim().split(/\s+/).filter((t) => t.length === 2).map((h) => parseInt(h, 16));
    const i = bytes.findIndex((b, k) => b === 0x62 && bytes[k + 1] === parseInt(e.did.slice(0, 2), 16) && bytes[k + 2] === parseInt(e.did.slice(2), 16));
    if (i < 0) throw new Error('Sin respuesta positiva');
    const datos = bytes.slice(i + 3);
    return { nombre: e.nombre, unidad: e.unidad, valor: evaluar(e.formula, datos) };
  } finally {
    await elm.enviar('ATCRA');
    await elm.enviar('ATSH7DF');
  }
}
