// Reyman Connect · datos guardados en el móvil
//
// Dos sitios:
//  · Privado (ficha del cliente: enlace personal, sus coches y documentos, nombre y móvil, solicitudes): en el llavero
//    cifrado del sistema (iOS Keychain «solo este dispositivo y desbloqueado», Android Keystore), sin copia en iCloud
//    ni en las copias de seguridad (plugin @aparajita/capacitor-secure-storage).
//  · Resto (lecturas del adaptador, ajustes, consentimiento): Capacitor Preferences.
// En el navegador (demostración y pruebas) todo va en localStorage.
// Si el llavero falla, lo privado se queda solo en memoria (nunca se guarda en claro).

const CLAVE = 'reyman-connect-v1';
const CLAVE_PRIVADA = 'privado';
export const PRIVADAS = ['cliente', 'clienteDatos', 'contacto', 'solicitudes'];

export const DATOS_INICIALES = {
  vehiculo: null, // { vin, marca, anio, matricula, alias }
  lecturas: [], // últimas comprobaciones { fecha, km, averias: [{codigo, tipo, descripcion}], tension, situacion }
  kmLecturas: [], // { fecha, km, origen: 'obd'|'manual' }
  bateria: [], // historial { fecha, tension, situacion, estado, minimo? }
  arranques: [], // { fecha, minimo, estado, muestras: [{t, v}] } (últimos 5)
  mantenimiento: { ultimaRevision: null, intervaloKm: 15000, intervaloMeses: 12, itv: null },
  ajustes: { tipoBateria: 'normal' },
  taller: null, // (versiones 0.1–0.3) vínculo por código de taller
  adaptador: null, // { deviceId, nombre } para reconectar sin buscar
  conexion: { tipo: 'ble' }, // 'ble' (Bluetooth) o 'wifi' con { host, puerto } (WiCAN Pro: 192.168.0.10:35000)
  consentimiento: null, // { version, fecha } condiciones, privacidad e IA aceptadas la primera vez
  bienvenidaVista: false, // ya ha pasado por la pantalla de bienvenida
  // Privado (llavero):
  cliente: null, // ficha en el taller: { token (enlace personal de Mi taller), nombre, desde, ultimoUso }
  clienteDatos: null, // última copia de Mi taller (vehículos, estado, documentos, presupuestos)
  contacto: null, // { nombre, telefono }
  solicitudes: [], // últimas peticiones enviadas al taller { fecha, tipo, resumen, ref }
};

let memoria = null;
let memoriaPrivada = null;
const esNativa = () => !!globalThis.Capacitor?.isNativePlatform?.();

// OJO: los plugins de Capacitor son objetos «proxy» que responden a cualquier método, también a «then».
// Si una función async devuelve el plugin tal cual, el await se queda esperando para siempre (la app no arrancaba
// en el iPad). Por eso se guardan en variables del módulo.
let prefs, llavero;
async function plugins() {
  if (prefs !== undefined) return;
  prefs = llavero = null;
  if (!esNativa()) return;
  try { prefs = (await import('@capacitor/preferences')).Preferences; } catch { prefs = null; }
  try {
    const m = await import('@aparajita/capacitor-secure-storage');
    llavero = m.SecureStorage;
    await llavero.setKeyPrefix('reymanconnect_');
    await llavero.setSynchronize(false); // nunca al llavero de iCloud
    await llavero.setDefaultKeychainAccess(m.KeychainAccess.whenUnlockedThisDeviceOnly);
  } catch { llavero = null; }
}

async function leerPublico() {
  try {
    if (prefs) return (await prefs.get({ key: CLAVE })).value ?? memoria;
    return globalThis.localStorage?.getItem(CLAVE) ?? memoria;
  } catch { return memoria; }
}

async function escribirPublico(txt) {
  memoria = txt;
  try {
    if (prefs) await prefs.set({ key: CLAVE, value: txt });
    else globalThis.localStorage?.setItem(CLAVE, txt);
  } catch { /* se queda en memoria */ }
}

async function leerPrivado() {
  if (!esNativa()) return null; // en el navegador va dentro del bloque público
  try {
    const v = llavero ? await llavero.get(CLAVE_PRIVADA) : null;
    if (v && typeof v === 'object') return v;
    if (typeof v === 'string') return JSON.parse(v);
  } catch { /* llavero dañado: se trata como vacío */ }
  return memoriaPrivada;
}

async function escribirPrivado(obj) {
  memoriaPrivada = obj;
  if (!llavero) return;
  try {
    if (Object.values(obj).every((x) => x == null || (Array.isArray(x) && !x.length))) await llavero.remove(CLAVE_PRIVADA);
    else await llavero.set(CLAVE_PRIVADA, JSON.stringify(obj));
  } catch { /* se queda en memoria */ }
}

/** Separa lo privado del resto. */
export function separar(datos) {
  const publico = { ...datos };
  const privado = {};
  for (const k of PRIVADAS) { privado[k] = datos[k] ?? DATOS_INICIALES[k]; delete publico[k]; }
  return { publico, privado };
}

export function completar(d) {
  return {
    ...structuredClone(DATOS_INICIALES), ...d,
    mantenimiento: { ...DATOS_INICIALES.mantenimiento, ...(d.mantenimiento || {}) },
    ajustes: { ...DATOS_INICIALES.ajustes, ...(d.ajustes || {}) },
  };
}

export async function cargar() {
  await plugins();
  let d = {};
  try { const txt = await leerPublico(); d = txt ? JSON.parse(txt) : {}; } catch { d = {}; }
  if (esNativa()) {
    // Versiones anteriores guardaban la ficha en Preferences (sin cifrar): se pasa al llavero y se borra de ahí
    const viejo = PRIVADAS.some((k) => d[k] != null && !(Array.isArray(d[k]) && !d[k].length));
    const priv = await leerPrivado();
    if (viejo) {
      const { publico, privado } = separar(d);
      await escribirPrivado({ ...privado, ...(priv || {}) });
      await escribirPublico(JSON.stringify(publico));
      d = { ...publico, ...privado, ...(priv || {}) };
    } else if (priv) d = { ...d, ...priv };
  }
  return completar(d);
}

export async function guardar(datos) {
  await plugins();
  if (!esNativa()) return escribirPublico(JSON.stringify(datos));
  const { publico, privado } = separar(datos);
  await escribirPublico(JSON.stringify(publico));
  await escribirPrivado(privado);
}

/** Borra la ficha del cliente del móvil (enlace, datos, contacto y solicitudes). */
export async function borrarFicha(datos) {
  for (const k of PRIVADAS) datos[k] = structuredClone(DATOS_INICIALES[k]);
  memoriaPrivada = null;
  await plugins();
  try { await llavero?.remove(CLAVE_PRIVADA); } catch { /* */ }
  await guardar(datos);
}

export async function borrarTodo() {
  memoria = null; memoriaPrivada = null;
  await plugins();
  try {
    if (prefs) await prefs.remove({ key: CLAVE });
    else globalThis.localStorage?.removeItem(CLAVE);
  } catch { /* */ }
  try { await llavero?.remove(CLAVE_PRIVADA); } catch { /* */ }
}
