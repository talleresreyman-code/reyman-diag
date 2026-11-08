// Reyman Diag · Ford: batería de alta tensión de los híbridos (BECM, 7E4 → 7EC)
// Identificadores sacados de lo que lee la Autel MS919 en un Kuga 2023 híbrido (grabación del 08/11/2026,
// ver docs/FORD_KUGA_HIBRIDO.md). Solo están los que se han comprobado porque cuadran entre sí en ese coche:
//  - 4801 carga = 55,8 % y la Autel lee la misma carga por F45B = 55,7 %
//  - 480D tensión = 223,5 V y 4840/4841 = 3,727/3,731 V por celda (× 60 celdas ≈ 223,6 V)
//  - DD01 km = 47.252 y el OBD (PID A6) da 47.248,7
// El resto de identificadores que lee la Autel (4800, 4802, 483E…) están sin confirmar y no se muestran.

import { datosDeServicio } from '../obd/parser.js';
import { restaurar } from '../obd/uds.js';

export const BECM_FORD = { tx: '7E4', rx: '7EC' };
const WMI_FORD = /^(WF0|WF1|VS6|NM0|1FA|1FM|1FT|2FM|3FM|3FA|MAJ|LVS)/;

const DIDS = [
  { did: '4801', clave: 'carga', nombre: 'Carga de la batería de alta tensión', unidad: '%', f: (b) => r((b[0] * 256 + b[1]) * 0.002, 1) },
  { did: '480D', clave: 'tension', nombre: 'Tensión de la batería de alta tensión', unidad: 'V', f: (b) => r((b[0] * 256 + b[1]) * 0.01, 1) },
  { did: '4840', clave: 'celdaA', nombre: 'Tensión de celda (A)', unidad: 'V', f: (b) => r((b[0] * 256 + b[1]) / 1000, 3) },
  { did: '4841', clave: 'celdaB', nombre: 'Tensión de celda (B)', unidad: 'V', f: (b) => r((b[0] * 256 + b[1]) / 1000, 3) },
  { did: 'DD01', clave: 'km', nombre: 'Kilómetros (BECM)', unidad: 'km', f: (b) => b[0] * 65536 + b[1] * 256 + b[2] },
];
const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** ¿Es un Ford (por el bastidor)? Si no es híbrido, el BECM simplemente no contesta. */
export function esFord(lectura) {
  const vin = lectura?.vehiculo?.valido ? lectura.vehiculo.vin : lectura?.uds?.vin;
  return vin ? WMI_FORD.test(vin) : false;
}

/**
 * Lee la batería de alta tensión. Devuelve { fecha, carga, tension, celdaA, celdaB, difCeldasMv, km, valores:[...], avisos:[...] }.
 * Vuelve a la petición OBD general al terminar.
 */
export async function leerBateriaHibridaFord(elm) {
  const out = { fecha: new Date().toISOString(), valores: [], avisos: [] };
  try {
    await elm.enviar(`ATSH${BECM_FORD.tx}`);
    await elm.enviar(`ATCRA${BECM_FORD.rx}`);
    for (const d of DIDS) {
      try {
        const raw = await elm.enviar(`22${d.did}`, 3000);
        const datos = datosDeServicio(raw, 0x22, `22${d.did}`).respuestas[0].datos.slice(2);
        const valor = d.f(datos);
        out[d.clave] = valor;
        out.valores.push({ did: d.did, nombre: d.nombre, unidad: d.unidad, valor });
      } catch { /* este dato no está en este modelo */ }
    }
  } finally {
    await restaurar(elm).catch(() => {});
  }
  if (out.celdaA !== undefined && out.celdaB !== undefined) {
    out.difCeldasMv = Math.round(Math.abs(out.celdaA - out.celdaB) * 1000);
    // Diferencia entre celdas: < 30 mV normal; 30–80 mV vigilar; > 80 mV desequilibrio (orientativo)
    if (out.difCeldasMv > 80) out.avisos.push(`Diferencia entre celdas de ${out.difCeldasMv} mV: posible desequilibrio o celda débil.`);
    else if (out.difCeldasMv > 30) out.avisos.push(`Diferencia entre celdas de ${out.difCeldasMv} mV: vigilar.`);
  }
  if (!out.valores.length) out.error = 'La centralita de la batería (BECM) no ha contestado.';
  return out;
}
