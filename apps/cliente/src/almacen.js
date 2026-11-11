// Reyman Connect · datos guardados en el móvil
// Todo se queda en el teléfono (sin cuenta). En la app nativa usa Capacitor Preferences;
// en el navegador, localStorage (y si no está disponible, memoria).

const CLAVE = 'reyman-connect-v1';

export const DATOS_INICIALES = {
  vehiculo: null, // { vin, marca, anio, matricula, alias }
  lecturas: [], // últimas comprobaciones { fecha, km, averias: [{codigo, tipo, descripcion}], tension, situacion }
  kmLecturas: [], // { fecha, km, origen: 'obd'|'manual' }
  bateria: [], // historial { fecha, tension, situacion, estado, minimo? }
  arranques: [], // { fecha, minimo, estado, muestras: [{t, v}] } (últimos 5)
  mantenimiento: { ultimaRevision: null, intervaloKm: 15000, intervaloMeses: 12, itv: null },
  ajustes: { tipoBateria: 'normal' },
  taller: null, // { codigo, ficha, consentimiento: { version, fecha } }
  adaptador: null, // { deviceId, nombre } para reconectar sin buscar
  conexion: { tipo: 'ble' }, // 'ble' (Bluetooth) o 'wifi' con { host, puerto } (WiCAN Pro: 192.168.0.10:35000)
};

let memoria = null;

async function preferencias() {
  try {
    if (globalThis.Capacitor?.isNativePlatform?.()) {
      const { Preferences } = await import('@capacitor/preferences');
      return Preferences;
    }
  } catch { /* sin plugin */ }
  return null;
}

export async function cargar() {
  let txt = null;
  const p = await preferencias();
  try {
    if (p) txt = (await p.get({ key: CLAVE })).value;
    else txt = globalThis.localStorage?.getItem(CLAVE) ?? null;
  } catch { txt = memoria; }
  if (!txt) txt = memoria;
  try {
    const d = txt ? JSON.parse(txt) : {};
    return { ...structuredClone(DATOS_INICIALES), ...d, mantenimiento: { ...DATOS_INICIALES.mantenimiento, ...(d.mantenimiento || {}) }, ajustes: { ...DATOS_INICIALES.ajustes, ...(d.ajustes || {}) } };
  } catch {
    return structuredClone(DATOS_INICIALES);
  }
}

export async function guardar(datos) {
  const txt = JSON.stringify(datos);
  memoria = txt;
  const p = await preferencias();
  try {
    if (p) await p.set({ key: CLAVE, value: txt });
    else globalThis.localStorage?.setItem(CLAVE, txt);
  } catch { /* se queda en memoria */ }
}

export async function borrarTodo() {
  memoria = null;
  const p = await preferencias();
  try {
    if (p) await p.remove({ key: CLAVE });
    else globalThis.localStorage?.removeItem(CLAVE);
  } catch { /* */ }
}
