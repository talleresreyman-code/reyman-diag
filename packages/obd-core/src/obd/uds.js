// Reyman Diag · Diagnosis UDS (ISO 14229) por CAN: todas las centralitas, no solo las de OBD.
// Funciona sobre el «ELM» (ATSH = dirección de petición, ATCRA = dirección de respuesta):
// - con la V200 (transporte J2534) hay escaneo completo del bus («STSCAN»),
// - con un ELM327 normal solo se prueban las direcciones OBD estándar (7E0–7E7).
// Servicios: 3E (presente), 22 F197/F187/F190 (nombre, referencia, bastidor), 19 02 (averías), 14 (borrar), 10 (sesión).

import { datosDeServicio, ObdError } from './parser.js';
import { describirDtc, decodificarDtc } from './dtc.js';

const ascii = (b) => String.fromCharCode(...b.filter((x) => x >= 0x20 && x < 0x7f)).trim();
const bits = (tx) => (String(tx).length > 3 ? 29 : 11);

async function pedir(elm, cmd, servicio, timeout = 6000) {
  const raw = await elm.enviar(cmd, timeout);
  const r = datosDeServicio(raw, servicio, cmd);
  return r.respuestas[0].datos;
}

async function fijar(elm, c) {
  await elm.enviar(`ATSH${bits(c.tx) === 29 ? c.tx.slice(2) : c.tx}`);
  await elm.enviar(`ATCRA${c.rx}`);
}

/** Vuelve a la petición general OBD (7DF o 18DB33F1). */
export async function restaurar(elm, b = 11) {
  await elm.enviar('ATAR');
  await elm.enviar(b === 29 ? 'ATSHDB33F1' : 'ATSH7DF');
}

/** Estado de una avería UDS (byte de estado DTC, ISO 14229). */
export function estadoDtc(s) {
  return {
    activa: !!(s & 0x01), // fallo presente en la última comprobación
    pendiente: !!(s & 0x04),
    confirmada: !!(s & 0x08),
    testigo: !!(s & 0x80),
    valor: s,
  };
}

export function decodificarDtcUds(b1, b2, b3, estado) {
  const codigo = decodificarDtc(b1, b2);
  const d = describirDtc(codigo);
  const sub = b3.toString(16).toUpperCase().padStart(2, '0');
  return { ...d, codigo, subtipo: sub, completo: `${codigo}-${sub}`, estado: estadoDtc(estado) };
}

/** Averías de la respuesta 59 02: [subfunción, máscara, (3 bytes código + estado)...]. Solo las relevantes. */
export function extraerDtcsUds(datos) {
  const out = [];
  for (let i = 2; i + 3 < datos.length; i += 4) {
    const [b1, b2, b3, s] = datos.slice(i, i + 4);
    if (!b1 && !b2 && !b3) continue;
    if (!(s & 0x0d)) continue; // sin fallo activo, pendiente ni confirmado: es historial antiguo
    out.push(decodificarDtcUds(b1, b2, b3, s));
  }
  return out;
}

/** Lista de centralitas { tx, rx } que contestan a diagnosis. */
export async function escanearCentralitas(elm, { progreso = () => {} } = {}) {
  progreso('Buscando centralitas en el bus (puede tardar unos 20 segundos)…');
  const raw = await elm.enviar('STSCAN', 180000);
  const lineas = String(raw).replace(/>/g, '').split(/[\r\n]+/).map((l) => l.trim().toUpperCase());
  const pares = [];
  for (const l of lineas) {
    const m = l.match(/^([0-9A-F]{3}|[0-9A-F]{8})\s+([0-9A-F]{3}|[0-9A-F]{8})$/);
    if (m && !pares.some((p) => p.rx === m[2])) pares.push({ tx: m[1], rx: m[2] });
  }
  if (pares.length || lineas.some((l) => l === 'NO DATA')) return pares;
  // Sin escaneo (ELM327 normal): direcciones OBD estándar
  for (let i = 0; i < 8; i++) {
    const c = { tx: (0x7e0 + i).toString(16).toUpperCase(), rx: (0x7e8 + i).toString(16).toUpperCase() };
    progreso(`Probando la centralita ${c.tx}…`);
    try { await fijar(elm, c); await pedir(elm, '3E00', 0x3e, 1500); pares.push(c); } catch { /* no está */ }
  }
  await restaurar(elm);
  return pares;
}

/** Nombre, referencia, bastidor y averías de una centralita. */
export async function leerCentralita(elm, c, { volver = true } = {}) {
  const r = { tx: c.tx, rx: c.rx, nombre: null, referencia: null, vin: null, averias: [], error: null };
  try {
    await fijar(elm, c);
    try { r.nombre = ascii((await pedir(elm, '22F197', 0x22)).slice(2)) || null; } catch { /* opcional */ }
    try { r.referencia = ascii((await pedir(elm, '22F187', 0x22)).slice(2)) || null; } catch { /* opcional */ }
    try { const v = ascii((await pedir(elm, '22F190', 0x22)).slice(2)); if (/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) r.vin = v; } catch { /* opcional */ }
    try {
      r.averias = extraerDtcsUds(await pedir(elm, '1902FF', 0x19, 10000));
    } catch (e) {
      if (e.code !== 'NO DATA') r.error = e.message;
      else throw e;
    }
  } catch (e) {
    r.error = r.error || e.message;
  } finally {
    if (volver) await restaurar(elm, bits(c.tx)).catch(() => {});
  }
  if (!r.nombre) r.nombre = `Centralita ${c.tx}`;
  return r;
}

// Nombres de centralita por dirección de diagnóstico (11 bits) cuando la centralita no da 22 F197.
// Ford (manual de taller, configuración de módulos; coinciden con el Kuga 2023 híbrido probado).
const NOMBRES_FORD = {
  '7E0': 'PCM (motor)', '7E2': 'SOBDM (sistema híbrido)', '7E4': 'BECM (batería alta tensión)', '7E6': 'SOBDMC (control híbrido / cambio)',
  '726': 'BCM (carrocería)', '6F0': 'BCMC / BJB (caja de fusibles batería)', '746': 'DCDC (convertidor 12 V)', '750': 'PACM (aviso a peatones)',
  '7C7': 'ACCM (compresor A/A eléctrico)', '7D0': 'APIM (SYNC / multimedia)', '7D1': 'OBCC (cargador)', '716': 'GWM (pasarela)',
  '760': 'ABS', '737': 'RCM (airbag)', '720': 'IPC (cuadro)', '730': 'PSCM (dirección)', '733': 'HVAC (climatizador)',
  '724': 'SCCM (mandos volante)', '727': 'ACM (audio)', '706': 'IPMA (cámara delantera)', '754': 'TCU (módem)',
  '764': 'CCM (control de crucero)', '740': 'DDM (puerta conductor)', '741': 'PDM (puerta acompañante)', '775': 'RGTM (portón)',
  '731': 'RFA (llave)', '732': 'GSM (palanca de cambios)', '734': 'HCM (faros)', '765': 'OCS (ocupante)',
};
const WMI_FORD = /^(WF0|1FA|1FM|1FT|1FD|2FM|3FM|3FA|MAJ|PR8|NM0|6FP|LVS|MNA|MNB)/;

/** Pone nombre a las centralitas sin nombre según la marca (por el bastidor) y su dirección. */
export function nombrarPorMarca(centralitas, vin) {
  const ford = vin ? WMI_FORD.test(vin) : false;
  for (const c of centralitas) {
    if (!/^Centralita /.test(c.nombre || '')) continue;
    if (ford && NOMBRES_FORD[c.tx]) c.nombre = NOMBRES_FORD[c.tx];
  }
  return centralitas;
}

export async function leerTodasLasCentralitas(elm, pares, { progreso = () => {}, vin = null } = {}) {
  const out = [];
  for (const [i, c] of pares.entries()) {
    progreso(`Leyendo centralita ${i + 1} de ${pares.length} (${c.tx})…`);
    out.push(await leerCentralita(elm, c, { volver: false }));
  }
  if (pares.length) await restaurar(elm, bits(pares[0].tx)).catch(() => {});
  return nombrarPorMarca(out, vin || out.find((c) => c.vin)?.vin);
}

/**
 * Borra las averías de una centralita (14 FFFFFF). Si la centralita lo rechaza por la sesión
 * (NRC 22 condiciones / 7F no soportado en esta sesión / 7E), entra en sesión extendida (10 03) y lo repite.
 */
export async function borrarCentralita(elm, c) {
  const r = { tx: c.tx, rx: c.rx, ok: false, sesionExtendida: false, error: null };
  try {
    await fijar(elm, c);
    try {
      await pedir(elm, '14FFFFFF', 0x14, 10000);
      r.ok = true;
    } catch (e) {
      if (!(e instanceof ObdError) || ![0x22, 0x7f, 0x7e].includes(e.nrc)) throw e;
      await pedir(elm, '1003', 0x10);
      r.sesionExtendida = true;
      await pedir(elm, '14FFFFFF', 0x14, 10000);
      r.ok = true;
      await pedir(elm, '1001', 0x10).catch(() => {});
    }
  } catch (e) {
    r.error = e.message;
  } finally {
    await restaurar(elm, bits(c.tx)).catch(() => {});
  }
  return r;
}
