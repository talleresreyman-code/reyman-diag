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

/** Datos de Mi taller: { ok, cliente, vehiculos[], documentos[], presupuestos[], actualizado } */
export async function pedirDatos(token, { demo = false } = {}) {
  if (demo) { await new Promise((r) => setTimeout(r, 500)); return DATOS_DEMO; }
  if (!RE_TOKEN.test(String(token || ''))) throw new Error('Ese enlace no es válido.');
  await plugins();
  const url = `${N8N}/reyman-mitaller-datos?t=${encodeURIComponent(token)}`;
  let j;
  try {
    // En la app, petición nativa (la web de n8n solo admite talleresreyman.com como origen del navegador)
    if (http) { const r = await http.get({ url, headers: { Accept: 'application/json' }, connectTimeout: 20000, readTimeout: 30000 }); j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
    else j = await (await fetch(url, { headers: { Accept: 'application/json' } })).json();
  } catch {
    throw new Error('No se ha podido contactar con el taller. Revisa la conexión a internet.');
  }
  if (!j?.ok) throw new Error(j?.error || 'No se han podido cargar tus datos.');
  return j;
}

export const urlDocumento = (token, id) => `${N8N}/reyman-mitaller-doc?t=${encodeURIComponent(token)}&d=${encodeURIComponent(id)}`;
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
  ok: true, cliente: 'José (demostración)', prueba: true, actualizado: new Date().toISOString(),
  vehiculos: [
    { matricula: '1234KLM', marca: 'Seat', modelo: 'León 1.5 Tsi', km: '84320', ultima_visita: '12/02/2026', visitas: 6, ultimo_trabajo: 'Revisión anual', estado: { texto: 'Terminado: puedes pasar a recogerlo', extra: '', terminado: true, en_taller: true, motivo: 'Revisión anual · Cambio de escobillas', entrada: '13 de noviembre' }, en_taller: true, proxima_itv: '15/12/2026', itv_cliente: '' },
    { matricula: '5678BCD', marca: 'Volkswagen', modelo: 'Golf 2.0 Tdi', km: '152300', ultima_visita: '03/10/2025', visitas: 9, ultimo_trabajo: 'Pastillas de freno delanteras', estado: null, en_taller: false, proxima_itv: '', itv_cliente: '' },
  ],
  documentos: [
    { id: 'demo1', nombre: 'FACT 26 1842', tipo: 'Factura', fecha: '2026-02-12', matriculas: ['1234KLM'] },
    { id: 'demo2', nombre: 'OR 261402', tipo: 'Orden de reparación', fecha: '2026-02-12', matriculas: ['1234KLM'] },
    { id: 'demo3', nombre: 'FACT 25 1203', tipo: 'Factura', fecha: '2025-10-03', matriculas: ['5678BCD'] },
  ],
  presupuestos: [{ token: 'demo', num: '26/0915', matricula: '5678BCD', vehiculo: 'Volkswagen Golf', estado: 'enviado' }],
};
