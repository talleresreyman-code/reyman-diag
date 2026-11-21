// Reyman Connect · ficha del cliente en su taller («Mi taller» de talleresreyman.com dentro de la app)
// El cliente ya recibe por WhatsApp su enlace personal (talleresreyman.com/mi-taller/?t=…). La app usa ese mismo
// enlace: no hay usuario ni contraseña ni base de datos nueva. Los datos salen del flujo de n8n «Área clientes · Mi taller»
// (vehículos con su estado, próxima ITV, documentos y presupuestos pendientes), el mismo que usa la web.
//
// Formas de vincular (un toque):
//  1. Abrir el enlace reymanconnect://mitaller?t=… (desde la página de n8n «Reyman Connect · abrir la app»).
//  2. Pegar el enlace de WhatsApp (botón «Pegar mi enlace»: lee el portapapeles).
//  3. Pedir el enlace por WhatsApp al taller.

export const N8N = 'https://n8n.talleresreyman.es/webhook';
export const WEB = 'https://talleresreyman.com';

const RE_TOKEN = /^[A-Za-z0-9]{24,64}$/;

/** Saca el código personal de un enlace de Mi taller, de reymanconnect://… o del propio código suelto. */
export function tokenDeTexto(texto) {
  const s = String(texto || '').trim();
  if (RE_TOKEN.test(s)) return s;
  const m = s.match(/[?&]t=([A-Za-z0-9]{24,64})(?![A-Za-z0-9])/);
  return m ? m[1] : null;
}

const esNativa = () => !!globalThis.Capacitor?.isNativePlatform?.();

// OJO (igual que en almacen.js): los plugins de Capacitor son «proxies» que también responden a «then»;
// nunca se devuelven desde una función async, se guardan en variables del módulo.
let http, app, portapapeles, navegador;
async function plugins() {
  if (http !== undefined) return;
  http = app = portapapeles = navegador = null;
  if (!esNativa()) return;
  try { http = (await import('@capacitor/core')).CapacitorHttp; } catch { /* */ }
  try { app = (await import('@capacitor/app')).App; } catch { /* */ }
  try { portapapeles = (await import('@capacitor/clipboard')).Clipboard; } catch { /* */ }
  try { navegador = (await import('@capacitor/browser')).Browser; } catch { /* */ }
}

/**
 * Credencial del cliente: { clave } (clave propia de este móvil, la normal) o { token } (enlace de WhatsApp, solo para
 * previsualizar la ficha antes de vincular y para instalaciones antiguas).
 */
const RE_CLAVE = /^[A-Za-z0-9]{40,64}$/;
export const credDe = (cliente) => (cliente?.clave ? { clave: cliente.clave } : cliente?.token ? { token: cliente.token } : null);

async function pedir(url, { metodo = 'GET', cabeceras = {}, cuerpo = null } = {}) {
  await plugins();
  try {
    // En la app, petición nativa (la web de n8n solo admite talleresreyman.com como origen del navegador)
    if (http) {
      const r = metodo === 'GET'
        ? await http.get({ url, headers: { Accept: 'application/json', ...cabeceras }, connectTimeout: 20000, readTimeout: 30000 })
        : await http.post({ url, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...cabeceras }, data: cuerpo, connectTimeout: 20000, readTimeout: 30000 });
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
    const r = await fetch(url, metodo === 'GET' ? { headers: { Accept: 'application/json', ...cabeceras } } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo) });
    return await r.json();
  } catch {
    throw new Error('No se ha podido contactar con el taller. Revisa la conexión a internet.');
  }
}

function errorServidor(j, porDefecto) {
  const e = new Error(j?.error || porDefecto);
  // El acceso ya no vale (desactivado por el taller, caducado o inexistente): hay que borrar la ficha del móvil
  e.revocado = /no es v[aá]lido|desactivado|caducado/i.test(j?.error || '');
  return e;
}

/** Datos de Mi taller: { ok, cliente, telefono, vehiculos[], documentos[], presupuestos[], actualizado } */
export async function pedirDatos(cred, { demo = false } = {}) {
  if (demo) { await new Promise((r) => setTimeout(r, 500)); return DATOS_DEMO; }
  if (typeof cred === 'string') cred = { token: cred };
  let j;
  if (cred?.clave && RE_CLAVE.test(cred.clave)) j = await pedir(`${N8N}/reyman-mitaller-datos`, { cabeceras: { 'x-reyman-clave': cred.clave } });
  else if (cred?.token && RE_TOKEN.test(cred.token)) j = await pedir(`${N8N}/reyman-mitaller-datos?t=${encodeURIComponent(cred.token)}`);
  else throw Object.assign(new Error('Ese enlace no es válido.'), { revocado: true });
  if (!j?.ok) throw errorServidor(j, 'No se han podido cargar tus datos.');
  return j;
}

/** Nombre corto del móvil para que el cliente lo reconozca en el aviso («iPhone», «Android»…). */
export function nombreDispositivo(ua = globalThis.navigator?.userAgent || '') {
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  return 'navegador';
}

/** Cambia el enlace de WhatsApp por una clave propia de este móvil (el servidor avisa al cliente por WhatsApp). */
export async function vincularMovil(token, { demo = false } = {}) {
  if (demo) { await new Promise((r) => setTimeout(r, 400)); return 'DemoClaveDeMovil0123456789abcdefghijklmnopqrstuv'; }
  const j = await pedir(`${N8N}/reyman-connect-vincular`, { metodo: 'POST', cuerpo: { t: token, dispositivo: `Reyman Connect · ${nombreDispositivo()}` } });
  if (!j?.ok || !RE_CLAVE.test(j.clave || '')) throw errorServidor(j, 'No se ha podido añadir tu ficha a este móvil.');
  return j.clave;
}

export const urlDocumento = (cred, id) => {
  if (typeof cred === 'string') cred = { token: cred };
  const q = cred?.clave ? `k=${encodeURIComponent(cred.clave)}` : `t=${encodeURIComponent(cred?.token || '')}`;
  return `${N8N}/reyman-mitaller-doc?${q}&d=${encodeURIComponent(id)}`;
};
export const urlPresupuesto = (t) => `${WEB}/mi-presupuesto/?t=${encodeURIComponent(t)}`;
export const urlMiTallerWeb = (token) => `${WEB}/mi-taller/?t=${encodeURIComponent(token)}`;

/** Abre una página o un PDF: dentro de la app (navegador del sistema) o en otra pestaña. */
export async function abrir(url) {
  await plugins();
  if (navegador) return void navegador.open({ url, presentationStyle: 'popover' });
  window.open(url, '_blank', 'noopener');
}

/** Lee el portapapeles (el sistema puede preguntar si se permite pegar). */
export async function leerPortapapeles() {
  await plugins();
  try {
    if (portapapeles) return (await portapapeles.read())?.value || '';
    return (await navigator.clipboard?.readText?.()) || '';
  } catch { return ''; }
}

/** Avisa cuando la app se abre con un enlace reymanconnect://mitaller?t=… (también al arrancar con él). */
export async function alAbrirEnlace(cb) {
  await plugins();
  if (!app) return;
  try {
    const ini = await app.getLaunchUrl();
    if (ini?.url) cb(ini.url);
  } catch { /* */ }
  app.addListener('appUrlOpen', (e) => cb(e?.url || ''));
}

/** Estado de un vehículo en texto corto y color para las fichas. */
export function estadoCorto(v) {
  if (!v?.estado) return null;
  const e = v.estado;
  const color = e.terminado ? 'verde' : /pendiente de tu respuesta/i.test(e.texto) ? 'ambar' : 'azul';
  return { color, texto: e.texto, extra: e.extra || '', motivo: e.motivo || '' };
}

const DATOS_DEMO = {
  ok: true, cliente: 'José (demostración)', prueba: true, telefono: '600123456', actualizado: new Date().toISOString(),
  vehiculos: [
    { matricula: '1234KLM', marca: 'Seat', modelo: 'León 1.5 Tsi', motor: 'DADA', bastidor: 'VSSZZZKLZLR012345', km_anuales: 14200, km: '84320', ultima_visita: '12/02/2026', visitas: 6, ultimo_trabajo: 'Revisión anual', estado: { texto: 'Terminado: puedes pasar a recogerlo', extra: '', terminado: true, en_taller: true, motivo: 'Revisión anual · Cambio de escobillas', entrada: '13 de noviembre' }, en_taller: true, proxima_itv: '15/12/2026', itv_cliente: '' },
    { matricula: '5678BCD', marca: 'Volkswagen', modelo: 'Golf 2.0 Tdi', km: '152300', ultima_visita: '03/10/2025', visitas: 9, ultimo_trabajo: 'Pastillas de freno delanteras', estado: { texto: 'Presupuesto enviado, pendiente de tu respuesta', en_taller: false }, en_taller: false, proxima_itv: '', itv_cliente: '' },
  ],
  documentos: [
    { id: 'demo1', nombre: 'FACT 26 1842', tipo: 'Factura', fecha: '2026-02-12', matriculas: ['1234KLM'] },
    { id: 'demo2', nombre: 'OR 261402', tipo: 'Orden de reparación', fecha: '2026-02-12', matriculas: ['1234KLM'] },
    { id: 'demo3', nombre: 'FACT 25 1203', tipo: 'Factura', fecha: '2025-10-03', matriculas: ['5678BCD'] },
  ],
  presupuestos: [{ token: 'demo', num: '26/0915', matricula: '5678BCD', vehiculo: 'Volkswagen Golf', estado: 'enviado' }],
};

/** Botón «atrás» de Android: vuelve a la pantalla anterior; si no hay, deja que el sistema salga de la app. */
export async function alBotonAtras(volver) {
  await plugins();
  if (!app) return;
  try { app.addListener('backButton', () => { if (!volver()) app.exitApp(); }); } catch { /* */ }
}

/** Prediagnóstico de Reyman Online (el mismo servicio que la web «¿Qué le pasa a mi coche?»). Tarda unos 20 s. */
export async function prediagnostico(cuerpo, { demo = false } = {}) {
  if (demo) {
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true, gravedad: 'amarillo', aviso: null, titulo: 'Posible problema en la sobrealimentación', explicacion: 'Por lo que cuentas, el coche pierde fuerza al acelerar y el testigo de motor está encendido. Suele apuntar al turbo o a algo que le afecta.', causas: ['Fuga en un manguito del turbo', 'Fallo de la válvula de control del turbo', 'Filtro de partículas obstruido'], consejo: 'Evita acelerones fuertes hasta traerlo.', precio: null, diagnosis: 'Para confirmar la avería hace falta una diagnosis: aproximadamente 1 hora, en torno a 60 € con IVA.', legal: 'Prediagnóstico orientativo y no vinculante, hecho con inteligencia artificial. El presupuesto en firme se hace en el taller tras revisar el vehículo.' };
  }
  await plugins();
  const url = `${N8N}/reyman-online`;
  let j;
  try {
    if (http) { const r = await http.post({ url, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: cuerpo, connectTimeout: 20000, readTimeout: 90000 }); j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
    else j = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
  } catch {
    throw new Error('No se ha podido hacer el prediagnóstico. Revisa la conexión a internet o escríbenos por WhatsApp.');
  }
  if (!j?.ok) throw new Error(j?.error || 'No se ha podido hacer el prediagnóstico. Escríbenos por WhatsApp.');
  return j;
}

// --- Diagnóstico remoto con el taller (servidor de Reyman Diag) ---
export const DIAG = globalThis.REYMAN_CONNECT_API || 'https://diag.talleresreyman.es';

/** Pide un código de 6 cifras para que el taller se conecte: { codigo, clave, caduca, taller }. */
export async function abrirRemoto(cuerpo) {
  await plugins();
  const url = `${DIAG}/api/connect/remoto/abrir`;
  let j;
  try {
    if (http) { const r = await http.post({ url, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: cuerpo, connectTimeout: 15000, readTimeout: 20000 }); j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
    else j = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
  } catch {
    throw new Error('No se ha podido contactar con el taller. Revisa que el móvil tenga Internet (datos móviles).');
  }
  if (!j?.codigo) throw new Error(j?.error || 'No se ha podido preparar la conexión con el taller.');
  return j;
}

export const urlRemotoWs = (codigo, clave) => `${DIAG.replace(/^http/, 'ws')}/api/connect/remoto/ws?codigo=${encodeURIComponent(codigo)}&clave=${encodeURIComponent(clave)}`;

// Pantalla encendida mientras dura la sesión remota (si se bloquea, el móvil corta la conexión)
let despierto;
export async function mantenerPantalla(si) {
  if (!esNativa()) return;
  try {
    if (despierto === undefined) despierto = (await import('@capacitor-community/keep-awake')).KeepAwake || null;
    if (despierto) await (si ? despierto.keepAwake() : despierto.allowSleep());
  } catch { /* opcional */ }
}

/** Foto (archivo del móvil) reducida a JPEG en base64 para enviarla (el servicio admite hasta 2 MB). */
export function fotoReducida(archivo, lado = 1280) {
  return new Promise((ok, mal) => {
    const img = new Image();
    const u = URL.createObjectURL(archivo);
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(u); mal(new Error('No se ha podido leer la foto.')); };
    img.src = u;
  });
}
