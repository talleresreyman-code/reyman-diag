// Reyman Connect · conexión con el adaptador y comprobación rápida del coche
// Separado de las pantallas para poder probarlo con el simulador.

import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { gravedad } from '@reyman/obd-core/obd/gravedad.js';
import { evaluarTension, detectarSituacion } from '@reyman/obd-core/bateria.js';
import { crearTransporteBle, bleDisponible } from '@reyman/obd-core/transport/ble.js';
import { crearTransporteBleNativo } from '@reyman/obd-core/transport/ble-nativo.js';
import { crearTransporteWifiNativo, WIFI_NATIVO_POR_DEFECTO } from '@reyman/obd-core/transport/wifi-nativo.js';

export { WIFI_NATIVO_POR_DEFECTO };
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';

export const esNativa = () => !!globalThis.Capacitor?.isNativePlatform?.();

/** Qué formas de conectar hay en este dispositivo. */
export function formasDeConectar() {
  return { nativa: esNativa(), webBle: !esNativa() && bleDisponible() };
}

/**
 * Crea el transporte adecuado: Wi-Fi o Bluetooth nativos en la app, Bluetooth web en Chrome, o el simulador.
 * @param {object} op { simulador: 'diesel'|..., conexion: {tipo:'ble'|'wifi', host, puerto}, adaptador: {deviceId, nombre}, alElegir }
 */
export async function crearTransporte(op = {}) {
  if (op.simulador) return crearSimulador({ coche: op.simulador, motor: op.motor || 'parado', bateria: op.bateria });
  if (op.conexion?.tipo === 'wifi') {
    if (!esNativa()) throw Object.assign(new Error('La conexión Wi-Fi con el adaptador solo funciona en la app Reyman Connect instalada.'), { code: 'SIN_WIFI' });
    const { TcpSocket } = await import('capacitor-tcp-socket');
    return crearTransporteWifiNativo({ TcpSocket, host: op.conexion.host, puerto: op.conexion.puerto });
  }
  if (esNativa()) {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    return crearTransporteBleNativo({ BleClient, deviceId: op.adaptador?.deviceId, nombre: op.adaptador?.nombre, alElegir: op.alElegir });
  }
  if (bleDisponible()) return crearTransporteBle();
  throw Object.assign(new Error('Este dispositivo no permite Bluetooth desde el navegador. Instala la app Reyman Connect.'), { code: 'SIN_BLUETOOTH' });
}

/** Conecta y deja listo el ELM327. Devuelve { transporte, elm, obd, info }. */
export async function conectar(transporte, { log } = {}) {
  await transporte.conectar();
  const elm = new Elm327(transporte, { log });
  const info = await elm.iniciar();
  return { transporte, elm, obd: new Obd(elm), info };
}

/**
 * Comprobación rápida para el conductor: coche, averías, batería y km.
 * Mucho más corta que la lectura completa del taller (sin freeze frame ni monitores).
 */
export async function comprobarCoche({ elm, obd }, progreso = () => {}) {
  const r = { fecha: new Date().toISOString() };
  progreso('Identificando el coche…');
  try { r.vehiculo = await obd.vin(); } catch { r.vehiculo = null; }
  progreso('Buscando averías…');
  const av = await obd.averias();
  r.averias = av.averias.filter((a) => a.tipo !== 'permanente' || !av.averias.some((b) => b.codigo === a.codigo && b.tipo !== 'permanente'))
    .map((a) => ({ codigo: a.codigo, tipo: a.tipo, descripcion: a.descripcion, modulo: a.modulo, gravedad: gravedad(a.codigo) }));
  progreso('Midiendo la batería…');
  try { r.rpm = (await obd.leerPid(0x0c)).valor; } catch { r.rpm = null; }
  try { r.tension = await elm.tension(); } catch { r.tension = null; }
  r.situacion = r.tension !== null ? detectarSituacion(r.tension, r.rpm) : null;
  r.bateria = r.tension !== null ? evaluarTension(r.tension, { rpm: r.rpm }) : null;
  progreso('Leyendo kilómetros…');
  try {
    const sop = await obd.pidsSoportados();
    if (sop.includes(0xa6)) {
      const km = (await obd.leerPid(0xa6)).valor;
      if (Number.isFinite(km) && km > 0) r.km = Math.round(km);
    }
  } catch { /* no todos los coches lo dan */ }
  return r;
}
