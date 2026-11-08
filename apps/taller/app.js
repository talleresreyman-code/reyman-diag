// Reyman Diag · aplicación
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { GRUPOS_EN_VIVO, PIDS } from '@reyman/obd-core/obd/pids.js';
import { crearTransporteBle, bleDisponible } from '@reyman/obd-core/transport/ble.js';
import { crearTransporteSerie, serieDisponible } from '@reyman/obd-core/transport/serie.js';
import { crearSimulador, COCHES_SIM } from '@reyman/obd-core/transport/simulador.js';
import { crearTransporteWifi, WIFI_POR_DEFECTO } from '@reyman/obd-core/transport/wifi.js';
import { crearTransporteJ2534 } from '@reyman/obd-core/transport/j2534.js';
import { escanearCentralitas, leerTodasLasCentralitas, leerCentralita, borrarCentralita } from '@reyman/obd-core/obd/uds.js';
import { decodificarVin } from '@reyman/obd-core/obd/vin.js';
import { esFord, leerBateriaHibridaFord } from '@reyman/obd-core/marcas/ford.js';
import { evaluarTension, medirArranque, detectarSituacion, evaluarAlternador, muestrearTension, resumenMuestras } from '@reyman/obd-core/bateria.js';
import { crearApi } from './lib/api.js';
import { dibujarLinea, formatear } from './lib/grafica.js';
import { htmlInforme } from './lib/informe.js';

// PRUEBAS: paquete para el portátil (programa de enlace Wi-Fi). Adaptador real, sin servidor: nada se guarda en la OT
// y todo queda en el registro descargable para revisarlo.
const PRUEBAS = window.REYMAN_DIAG_PRUEBAS === true;
const DEMO = PRUEBAS || window.REYMAN_DIAG_DEMO === true || new URLSearchParams(location.search).has('demo');
const VERSION = '0.4.6';
const api = crearApi({ demo: DEMO });
const $ = (s, el = document) => el.querySelector(s);
const raiz = () => document.getElementById('app') || document.body;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const I = {
  bt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg>',
  usb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="10" rx="2"/><path d="M8 9V5h8v4M10 13h4"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0"/><path d="M12 20h.01"/></svg>',
  sim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4a1 1 0 0 1-1 1h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z"/><path d="M3 13h18"/></svg>',
  carpeta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  coche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z"/></svg>',
  averia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 0 1 14 0v3H5z"/><path d="M3 18h18M12 8v3"/></svg>',
  itv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  vivo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
  informe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
};

const estado = {
  yo: null,
  transporte: null,
  elm: null,
  obd: null,
  conectado: false,
  lectura: null, // última lectura completa
  lecturaId: null,
  ot: null, // { ot, matricula, cliente, vehiculo }
  vista: 'conectar',
  soloConsulta: false,
  vivo: { grupo: GRUPOS_EN_VIVO[0].id, hist: {}, sel: null, activo: false, grabando: null },
  registro: [],
  registroCompleto: [], // todo lo enviado y recibido (para descargar)
  lecturasSesion: [], // lecturas y pruebas de esta sesión (para descargar)
  bateriaAuto: [], // registro automático de tensión mientras hay adaptador: { fecha, tension, rpm, situacion, estado }
  bateriaOcupada: false, // durante una prueba de batería/alternador no se hace el registro automático
};
const BATERIA_AUTO_MS = 30000;
let temporizadorBateria = null;
const puede = (p) => !!estado.yo?.permisos?.some((x) => x === p || x === '*' || x === 'diag.*');

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
async function arrancar() {
  try {
    estado.yo = await api.yo();
  } catch (e) {
    if (e.status === 401) {
      raiz().innerHTML = `<main><div class="panel"><h1>Inicia sesión</h1><p>Reyman Diag usa el mismo acceso que la App Reyman.</p><div class="fila-btn"><a class="btn" href="${esc(window.REYMAN_APP_URL || 'https://app.talleresreyman.es')}/?volver=${encodeURIComponent(location.href)}">Entrar con App Reyman</a></div></div></main>`;
      return;
    }
    toast(`No se pudo contactar con el servidor: ${e.message}`);
    estado.yo = { usuario: { nombre: 'Sin conexión' }, permisos: ['diag.ver', 'diag.leer'] };
  }
  pintarMarco();
  ir('conectar');
  buscarPuente();
  // Si se abre el programa de enlace después, se detecta solo
  setInterval(() => { if (!estado.puente && !estado.conectado) buscarPuente(); }, 10000);
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function pintarMarco() {
  raiz().innerHTML = `
    ${PRUEBAS ? `<div class="demo-cinta">Modo pruebas v${VERSION}: adaptador real, sin servidor. Al terminar, descarga el registro desde «Conectar».</div>` : DEMO ? '<div class="demo-cinta">Modo demostración: los datos no se guardan y el envío al cliente y la IA están simulados.</div>' : ''}
    <header class="barra">
      <div class="marca">Reyman <small>Diag</small></div>
      <button type="button" class="estado" id="ir-conectar" title="Conexión, prueba de batería y registro"><span class="punto" id="punto"></span><span id="estado-txt">Sin conectar</span></button>
      <div class="usuario">${esc(estado.yo?.usuario?.nombre || '')}</div>
    </header>
    <main id="main">
      <section class="vista" id="v-conectar"></section>
      <section class="vista" id="v-vehiculo" hidden></section>
      <section class="vista" id="v-averias" hidden></section>
      <section class="vista" id="v-itv" hidden></section>
      <section class="vista" id="v-vivo" hidden></section>
      <section class="vista" id="v-informe" hidden></section>
    </main>
    <nav class="pestanas" aria-label="Secciones">
      ${[['vehiculo', 'Vehículo', I.coche], ['averias', 'Averías', I.averia], ['itv', 'Pre-ITV', I.itv], ['vivo', 'En vivo', I.vivo], ['informe', 'Informe', I.informe]]
        .map(([id, txt, ic]) => `<button data-ir="${id}" disabled>${ic}<span>${txt}</span><span class="insignia" id="ins-${id}" hidden></span></button>`).join('')}
    </nav>`;
  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
  $('#ir-conectar').addEventListener('click', () => ir('conectar'));
}

function ir(vista) {
  estado.vista = vista;
  document.querySelectorAll('.vista').forEach((s) => { s.hidden = s.id !== `v-${vista}`; });
  document.querySelectorAll('[data-ir]').forEach((b) => {
    b.disabled = !estado.lectura;
    if (b.dataset.ir === vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    if (b.dataset.ir === 'vivo' && !estado.conectado) b.disabled = true;
  });
  estado.vivo.activo = vista === 'vivo';
  ({ conectar: vConectar, vehiculo: vVehiculo, averias: vAverias, itv: vItv, vivo: vVivo, informe: vInforme })[vista]();
  window.scrollTo({ top: 0 });
  if (estado.vivo.activo) bucleVivo();
}

function estadoBarra(txt, clase = '') {
  $('#estado-txt').textContent = txt;
  $('#punto').className = `punto ${clase}`;
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------
function vConectar() {
  const el = $('#v-conectar');
  const bt = bleDisponible();
  const serie = serieDisponible();
  el.innerHTML = `
    <h1>Conectar con el coche</h1>
    <p class="conexion-intro suave">Enchufa el vLinker en la toma OBD, pon el contacto y elige cómo conectar.</p>
    <div id="con-progreso" class="panel" hidden></div>
    <div class="opciones-conexion">
      <button class="opcion" data-con="ble" ${bt ? '' : 'disabled'}>${I.bt}<strong>Bluetooth</strong><span>${bt ? 'Móvil, tablet o portátil. Elige «vLinker» en la lista.' : !window.isSecureContext ? 'Necesita abrir la app por https://.' : 'Este navegador no permite Bluetooth. Usa Chrome.'}</span></button>
      <button class="opcion" data-con="serie" ${serie ? '' : 'disabled'}>${I.usb}<strong>Puerto COM o USB</strong><span>${serie ? 'Portátil con Windows: vLinker emparejado (código 1234) o cable USB.' : 'Solo en Chrome o Edge de ordenador.'}</span></button>
      <button class="opcion" data-con="wifi" ${conPuente() ? '' : 'disabled'}>${I.wifi}<strong>Wi-Fi</strong><span>${conPuente() ? `Adaptador Wi-Fi o WiCAN Pro desde el portátil, con el programa de enlace abierto. ${esc(cfgWifi().host)}:${esc(cfgWifi().puerto)}` : 'Abre «Iniciar Reyman Diag» en este ordenador (portátil con Windows) y espera unos segundos.'}</span></button>
      <button class="opcion" data-con="j2534" ${conPuente() ? '' : 'disabled'}>${I.usb}<strong>Autel V200 (J2534)</strong><span>${conPuente() ? 'MaxiVCI V200 por USB desde el portátil, con el programa de enlace abierto. Lee todas las centralitas.' : 'Abre «Iniciar Reyman Diag» en este ordenador (portátil con Windows) y espera unos segundos.'}</span></button>
      <button class="opcion" data-con="vcmi" ${conPuente() ? '' : 'disabled'}>${I.usb}<strong>Otra interfaz Autel (VCMI…)</strong><span>${conPuente() ? `VCMI u otra interfaz J2534 instalada en el portátil.${otraJ2534() ? ` Última: ${esc(otraJ2534())}.` : ''}` : 'Abre «Iniciar Reyman Diag» en este ordenador (portátil con Windows) y espera unos segundos.'}</span></button>
      <button class="opcion" data-con="sim">${I.sim}<strong>Simulador</strong><span>Coche de prueba para aprender a usar la app sin adaptador.</span></button>
      <button class="opcion" data-con="consulta">${I.carpeta}<strong>Consultar lecturas guardadas</strong><span>Sin conectar al coche, por matrícula. Para la oficina.</span></button>
    </div>
    <details class="peq" style="margin-top:16px" ${PRUEBAS ? 'open' : ''}><summary>Registro de comunicación</summary><div class="registro" id="registro">${esc(estado.registro.slice(-60).join('\n'))}</div>
      <div class="fila-btn"><button class="btn fantasma" id="reg-descargar">Descargar registro</button>${PRUEBAS ? `<span class="peq suave">${estado.lecturasSesion.length} lecturas y pruebas en esta sesión</span>` : ''}</div></details>
    ${DEMO ? '' : '<div id="version-diag" class="peq suave" style="margin-top:16px"></div>'}`;
  $('#reg-descargar', el).onclick = descargarRegistro;
  pintarVersion();
  el.querySelectorAll('[data-con]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.con === 'consulta') return dialogoConsulta();
    if (b.dataset.con === 'sim') return dialogoSimulador();
    if (b.dataset.con === 'wifi') return dialogoWifi();
    if (b.dataset.con === 'j2534') return conectar('j2534', 'V200');
    if (b.dataset.con === 'vcmi') return dialogoOtraJ2534();
    conectar(b.dataset.con);
  }));
  if (estado.conectado) {
    $('#con-progreso').hidden = false;
    $('#con-progreso').innerHTML = `<p><strong>Conectado</strong> por ${esc(estado.transporte.nombre)}.</p><div class="fila-btn"><button class="btn sec" id="desconectar">Desconectar</button><button class="btn" id="releer">Leer de nuevo</button><button class="btn sec" id="bat-prueba">Batería y alternador</button></div>`;
    $('#bat-prueba').onclick = dialogoBateria;
    $('#desconectar').onclick = desconectar;
    $('#releer').onclick = leerTodo;
  }
}

// ---------------------------------------------------------------------------
// Versión instalada y botón «Actualizar» (como en la App Reyman): el servidor se actualiza desde GitHub
// ---------------------------------------------------------------------------
const fechaCorta = (f) => { try { return new Date(f).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return f || ''; } };
async function pintarVersion() {
  const x = $('#version-diag');
  if (!x || DEMO) return;
  let v;
  try { v = await (await fetch('/api/version', { credentials: 'include' })).json(); } catch { return; }
  if (!$('#version-diag')) return;
  const inst = v.instalada || {};
  let html = `Reyman Diag ${esc(VERSION)}${inst.commit ? ` · servidor ${esc(inst.commit)} (${esc(fechaCorta(inst.fecha))})` : ''}`;
  const r = v.resultado || {};
  if (v.pedido || r.estado === 'actualizando') html += ' · <strong>Actualizando el servidor…</strong>';
  else if (r.estado === 'error' && r.fin) html += ' · <span class="peligro-txt">La última actualización falló</span>';
  if (v.puede) {
    if (v.hayNueva && !v.pedido && r.estado !== 'actualizando') {
      html += `<div class="aviso peq" style="margin-top:8px"><strong>Hay una versión nueva</strong> (${esc(v.disponible.commit)}): ${esc(v.disponible.mensaje || '')}
        ${(v.cambios || []).length > 1 ? `<ul>${v.cambios.slice(0, 8).map((c) => `<li>${esc(c.mensaje)}</li>`).join('')}</ul>` : ''}
        <div class="fila-btn"><button class="btn" id="ver-actualizar">Actualizar el servidor</button></div></div>`;
    } else html += ' · <button class="btn fantasma" id="ver-comprobar" style="padding:2px 8px">Buscar actualizaciones</button>';
  }
  x.innerHTML = html;
  const b = $('#ver-actualizar');
  if (b) b.onclick = async () => {
    b.disabled = true;
    try {
      const r2 = await fetch('/api/version/actualizar', { method: 'POST', credentials: 'include' });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || `Error ${r2.status}`);
      toast('Actualizando el servidor. Tarda unos minutos; la página se recargará sola.');
      esperarActualizacion(inst.commit);
    } catch (e) { toast(e.message); b.disabled = false; }
    pintarVersion();
  };
  const c = $('#ver-comprobar');
  if (c) c.onclick = async () => { c.disabled = true; await fetch('/api/version/comprobar', { method: 'POST', credentials: 'include' }).catch(() => {}); toast('Buscando… en un minuto se ve si hay versión nueva.'); setTimeout(pintarVersion, 65000); };
}
function esperarActualizacion(antes) {
  const t = setInterval(async () => {
    try {
      const v = await (await fetch('/api/version', { credentials: 'include' })).json();
      const r = v.resultado || {};
      if (r.estado === 'ok' && v.instalada?.commit && v.instalada.commit !== antes) { clearInterval(t); toast('Servidor actualizado. Recargando…'); setTimeout(() => location.reload(), 1500); }
      else if (r.estado === 'error') { clearInterval(t); toast('La actualización ha fallado. Avisa a Claude con el archivo ultima.log del servidor.'); pintarVersion(); }
    } catch { /* el servidor se está reiniciando */ }
  }, 10000);
}

// ---------------------------------------------------------------------------
// Batería: registro automático cada 30 s mientras el adaptador está conectado
// ---------------------------------------------------------------------------
async function muestraBateria() {
  if (!estado.conectado || !estado.elm || estado.bateriaOcupada) return;
  try {
    let rpm = null;
    try { rpm = (await estado.obd.leerPid(0x0c)).valor; } catch { /* */ }
    const v = await estado.elm.tension();
    if (v === null) return;
    const ev = evaluarTension(v, { rpm });
    const m = { fecha: new Date().toISOString(), tension: v, rpm, situacion: ev.situacion, estado: ev.estado };
    estado.bateriaAuto.push(m);
    if (estado.bateriaAuto.length > 2000) estado.bateriaAuto.splice(0, 500);
    estado.lecturasSesion.push({ tipo: 'bateria-auto', ...m });
    const caja = $('#bat-auto');
    if (caja) caja.innerHTML = htmlBateriaAuto();
  } catch { /* el adaptador puede estar ocupado: se reintenta en la siguiente vuelta */ }
}
function iniciarRegistroBateria() {
  pararRegistroBateria();
  muestraBateria();
  temporizadorBateria = setInterval(muestraBateria, BATERIA_AUTO_MS);
}
function pararRegistroBateria() { if (temporizadorBateria) clearInterval(temporizadorBateria); temporizadorBateria = null; }

function htmlBateriaAuto() {
  const a = estado.bateriaAuto;
  if (!a.length) return '<h3 style="margin:0 0 4px">Batería</h3><p class="suave peq">Se registra sola cada 30 segundos mientras el adaptador esté conectado.</p>';
  const u = a[a.length - 1];
  const ev = evaluarTension(u.tension, { rpm: u.rpm });
  const reposo = a.filter((x) => x.situacion === 'reposo').map((x) => x.tension);
  const motor = a.filter((x) => x.situacion === 'motor').map((x) => x.tension);
  const rR = resumenMuestras(reposo); const rM = resumenMuestras(motor);
  const color = { bien: 'verde', correcta: 'verde', aceptable: 'ambar', baja: 'rojo', descargada: 'rojo', alta: 'rojo' }[ev.estado] || '';
  return `<h3 style="margin:0 0 4px">Batería <span class="peq suave">· registro automático</span></h3>
    <p><span class="etiqueta-estado ${color}">${formatear(u.tension)} V</span> ${ev.situacion === 'motor' ? 'motor en marcha' : 'motor parado'} · ${esc(ev.mensaje)}</p>
    <p class="peq suave">${a.length} medidas desde las ${new Date(a[0].fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}${rR ? ` · parado ${formatear(rR.min)}–${formatear(rR.max)} V` : ''}${rM ? ` · en marcha ${formatear(rM.min)}–${formatear(rM.max)} V` : ''}</p>
    <div class="fila-btn"><button class="btn sec" id="bat-prueba3">Pruebas de batería y alternador</button></div>`;
}

// Registro descargable: comunicación completa + lecturas y pruebas de la sesión (para revisar con Claude)
function descargarRegistro() {
  const datos = {
    app: 'Reyman Diag', version: VERSION, modo: PRUEBAS ? 'pruebas' : DEMO ? 'demo' : 'normal', creado: new Date().toISOString(),
    navegador: navigator.userAgent, transporte: estado.transporte?.tipo || null, adaptador: estado.elm?.info || null,
    lecturas: estado.lecturasSesion, registro: estado.registroCompleto,
  };
  const b = new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `reyman-diag-registro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// Prueba de batería: tensión actual y curva de arranque (para ajustar los umbrales con coches reales)
function dialogoBateria() {
  const d = dialogo(`<h3>Batería y alternador</h3>
    <p class="suave">1. Con el <strong>motor parado</strong> y el contacto puesto, pulsa «Medir reposo».<br>2. Pulsa «Medir arranque» y <strong>arranca el coche</strong> en los 10 segundos siguientes.<br>3. Con el <strong>motor en marcha</strong>, pulsa «Probar alternador» y sigue los pasos.</p>
    <div id="bat-res" class="panel" style="min-height:64px"><span class="suave">Sin medir.</span></div>
    <div class="campo"><label for="bat-nota">Nota (estado real de la batería, si lo sabes)</label><input id="bat-nota" placeholder="Ej.: batería nueva / comprobador dice 60 % / cuesta arrancar"></div>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cerrar</button><button class="btn sec" id="bat-reposo">Medir reposo</button><button class="btn" id="bat-arranque">Medir arranque</button><button class="btn sec" id="bat-alt">Probar alternador</button></div>`);
  estado.bateriaOcupada = true;
  d.addEventListener('close', () => { estado.bateriaOcupada = false; });
  const res = $('#bat-res', d);
  const nota = () => $('#bat-nota', d).value.trim() || null;
  const bloquear = (b) => d.querySelectorAll('#bat-reposo,#bat-arranque,#bat-alt').forEach((x) => { x.disabled = b; });
  $('#bat-alt', d).onclick = async (e) => {
    e.preventDefault();
    bloquear(true);
    const pasoMedir = async (texto) => {
      res.innerHTML = `<div class="progreso"><span class="giro"></span>${texto}</div><p class="peq suave" id="alt-vivo"></p>`;
      return muestrearTension(estado.elm, { obd: estado.obd, duracionMs: 8000, intervaloMs: 200, alMuestra: (m) => { const x = $('#alt-vivo', d); if (x) x.textContent = `${formatear(m.v)} V${m.rpm !== null ? ` · ${formatear(m.rpm)} rpm` : ''}`; } });
    };
    try {
      let rpm0 = null;
      try { rpm0 = (await estado.obd.leerPid(0x0c)).valor; } catch { /* */ }
      if (rpm0 !== null && rpm0 < 300) throw new Error('El motor está parado. Arráncalo y vuelve a pulsar «Probar alternador».');
      const p1 = await pasoMedir('Paso 1 de 2: <strong>ralentí, sin consumidores</strong> (luces y climatizador apagados). Midiendo 8 s…');
      const parcial = evaluarAlternador({ ralenti: p1.tensiones });
      res.innerHTML = `<p>Ralentí: <strong>${formatear(parcial.ralenti.media)} V</strong> de media (${formatear(parcial.ralenti.min)}–${formatear(parcial.ralenti.max)} V).</p>
        <div class="aviso"><strong>Paso 2 de 2.</strong> Enciende las <strong>luces de cruce, la luneta térmica y el ventilador al máximo</strong>, acelera a unas <strong>2.000 rpm</strong> y mantenlas. Cuando estés listo, pulsa «Medir con consumo».</div>
        <div class="fila-btn"><button class="btn" id="alt-p2">Medir con consumo</button></div>`;
      $('#alt-p2', d).onclick = async (ev2) => {
        ev2.preventDefault();
        const p2 = await pasoMedir('Paso 2 de 2: <strong>con consumo y a 2.000 rpm</strong>. Mantén el acelerador. Midiendo 8 s…');
        const rpmMedia = p2.rpm.length ? p2.rpm.reduce((a, b) => a + b, 0) / p2.rpm.length : null;
        const r = evaluarAlternador({ ralenti: p1.tensiones, conCarga: p2.tensiones, rpmCarga: rpmMedia });
        estado.lecturasSesion.push({ tipo: 'alternador', fecha: new Date().toISOString(), ralenti: p1.muestras, conCarga: p2.muestras, evaluacion: r, nota: nota() });
        const col = { correcto: 'verde', justo: 'ambar', 'no-carga': 'rojo', sobrecarga: 'rojo' }[r.estado];
        res.innerHTML = `<p><span class="etiqueta-estado ${col}">${esc({ correcto: 'Carga correcta', justo: 'Carga justa', 'no-carga': 'No carga', sobrecarga: 'Sobrecarga' }[r.estado])}</span> ${esc(r.mensaje)}</p>
          <p class="peq">Ralentí ${formatear(r.ralenti.media)} V · con consumo ${formatear(r.conCarga.media)} V (mín. ${formatear(r.conCarga.min)} V)${rpmMedia ? ` a ${formatear(Math.round(rpmMedia))} rpm` : ''}.</p>
          ${r.avisos.length ? `<ul class="peq">${r.avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
        bloquear(false);
      };
    } catch (err) { res.innerHTML = `<div class="aviso error">${esc(err.message)}</div>`; bloquear(false); }
  };
  $('#bat-reposo', d).onclick = async (e) => {
    e.preventDefault();
    bloquear(true);
    try {
      let rpm = null;
      try { rpm = (await estado.obd.leerPid(0x0c)).valor; } catch { /* */ }
      const v = await estado.elm.tension();
      const ev = evaluarTension(v, { rpm });
      // Recién apagado el motor, la batería conserva una «carga superficial» y la tensión sale más alta de lo real
      const ultMotor = [...estado.bateriaAuto].reverse().find((x) => x.situacion === 'motor');
      const recienApagado = ev.situacion === 'reposo' && ultMotor && Date.now() - new Date(ultMotor.fecha).getTime() < 20 * 60000;
      if (recienApagado) ev.aviso = 'El motor estaba en marcha hace menos de 20 minutos: la tensión sale algo alta por la carga superficial. Para un dato fiable, mide antes del primer arranque del día o tras 30 minutos parado.';
      estado.lecturasSesion.push({ tipo: 'bateria-reposo', recienApagado: !!recienApagado, fecha: new Date().toISOString(), tension: v, rpm, situacion: detectarSituacion(v, rpm), evaluacion: ev, nota: nota() });
      res.innerHTML = `<p><strong>${formatear(v)} V</strong> leídos (${ev.situacion === 'motor' ? 'motor en marcha' : 'reposo'}, ${formatear(ev.tension)} V compensados).</p><p>${esc(ev.mensaje)}${ev.carga !== undefined ? ` Carga aprox.: ${ev.carga} %.` : ''}</p>${ev.aviso ? `<p class="peq aviso">${esc(ev.aviso)}</p>` : ''}`;
    } catch (err) { res.innerHTML = `<div class="aviso error">${esc(err.message)}</div>`; }
    bloquear(false);
  };
  $('#bat-arranque', d).onclick = async (e) => {
    e.preventDefault();
    bloquear(true);
    res.innerHTML = '<div class="progreso"><span class="giro"></span>Preparado: <strong>arranca el coche ahora</strong>…</div><canvas id="bat-curva" style="width:100%;height:180px"></canvas>';
    const muestras = [];
    try {
      const r = await medirArranque(estado.elm, { duracionMs: 10000, intervaloMs: 20, alMuestra: (m) => { muestras.push(m); if (muestras.length % 5 === 0) dibujarLinea($('#bat-curva', d), muestras.map((x) => x.v), { min: 8, max: 15, rejilla: true, etiquetas: true, unidad: 'V' }); } });
      const a = r.analisis;
      estado.lecturasSesion.push({ tipo: 'bateria-arranque', fecha: new Date().toISOString(), muestras: r.muestras, analisis: a, nota: nota() });
      res.innerHTML = a?.detectado
        ? `<p><strong>${esc(a.mensaje)}</strong></p><p>Mientras gira el motor de arranque: <strong>${formatear(a.meseta)} V</strong> durante ${(a.duracionMs / 1000).toFixed(1).replace('.', ',')} s · pico inicial ${formatear(a.pico)} V · antes ${formatear(a.antes)} V · después ${formatear(a.despues)} V · ${r.muestras.length} medidas.</p>${a.avisos?.length ? `<ul class="peq">${a.avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<canvas id="bat-curva" style="width:100%;height:180px"></canvas>`
        : `<p>${esc(a?.mensaje || 'Sin medidas.')}</p><p class="peq suave">${r.muestras.length} medidas. Algunos adaptadores responden despacio y no ven la caída: el registro lo dirá.</p>`;
      const cv = $('#bat-curva', d); if (cv) dibujarLinea(cv, r.muestras.map((x) => x.v), { min: 8, max: 15, rejilla: true, etiquetas: true, unidad: 'V' });
    } catch (err) { res.innerHTML = `<div class="aviso error">${esc(err.message)}</div>`; }
    bloquear(false);
  };
}

function log(dir, txt) {
  estado.registro.push(`${dir === 'tx' ? '→' : dir === 'rx' ? '←' : '·'} ${txt.replace(/\r/g, ' | ')}`);
  estado.registroCompleto.push({ t: new Date().toISOString(), dir, txt });
  if (estado.registroCompleto.length > 30000) estado.registroCompleto.splice(0, 5000);
  if (estado.registro.length > 400) estado.registro.splice(0, 100);
  const r = $('#registro');
  if (r) { r.textContent = estado.registro.slice(-60).join('\n'); r.scrollTop = r.scrollHeight; }
}

function dialogoSimulador() {
  const d = dialogo(`<h3>Simulador</h3><p class="suave">Elige el coche de prueba.</p>
    <div class="campo"><label for="sim-coche">Coche</label><select id="sim-coche">${Object.entries(COCHES_SIM).map(([k, c]) => `<option value="${k}">${esc(c.nombre)}</option>`).join('')}</select></div>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn" id="sim-ok">Conectar</button></div>`);
  $('#sim-ok', d).onclick = (e) => { e.preventDefault(); const c = $('#sim-coche', d).value; d.close(); conectar('sim', c); };
}

// Wi-Fi: solo con el programa de enlace del portátil (la app se abre en http://localhost:35001)
function conPuente() { return ['localhost', '127.0.0.1'].includes(location.hostname) || !!estado.puente; }

// Interfaz J2534 distinta de la V200 (VCMI…): se elige de las instaladas en el portátil y se recuerda
function otraJ2534() { try { return localStorage.getItem('reyman-diag-j2534') || ''; } catch { return ''; } }
async function dialogoOtraJ2534() {
  if (!estado.puente?.interfaces) await buscarPuente();
  const lista = (estado.puente?.interfaces || []).filter((n) => n !== 'V200');
  if (!lista.length) { toast('El programa de enlace no encuentra ninguna otra interfaz J2534 instalada.'); return; }
  const ult = otraJ2534();
  const d = dialogo(`<h3>Otra interfaz Autel</h3><p class="suave">Elige la interfaz que tienes enchufada por USB. Si no sabes cuál, prueba primero «MaxiFlash VCMI».</p>
    <div class="campo"><label for="j2534-sel">Interfaz</label><select id="j2534-sel">${lista.map((n) => `<option ${n === ult || (!ult && n === 'MaxiFlash VCMI') ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn" id="j2534-ok">Conectar</button></div>`);
  $('#j2534-ok', d).onclick = (e) => {
    e.preventDefault();
    const n = $('#j2534-sel', d).value;
    try { localStorage.setItem('reyman-diag-j2534', n); } catch { /* */ }
    d.close();
    conectar('j2534', n);
  };
}

// Desde diag.talleresreyman.es: ¿está abierto el programa de enlace en este ordenador? (V200 y adaptador Wi-Fi)
// Chrome puede preguntar la primera vez si la web puede acceder a los dispositivos de la red local: hay que permitirlo.
async function buscarPuente() {
  if (DEMO && !PRUEBAS) return;
  try {
    const r = await fetch('http://localhost:35001/estado', { signal: AbortSignal.timeout(2000), cache: 'no-store' });
    const d = await r.json();
    if (d.ok) { estado.puente = d; if ($('#v-conectar') && !estado.conectado) vConectar(); }
  } catch { estado.puente = null; }
}
function cfgWifi() {
  try { return { ...WIFI_POR_DEFECTO, ...JSON.parse(localStorage.getItem('reyman-diag-wifi') || '{}') }; } catch { return { ...WIFI_POR_DEFECTO }; }
}
function dialogoWifi() {
  const c = cfgWifi();
  const d = dialogo(`<h3>Adaptador Wi-Fi</h3><p class="suave">Conecta el portátil a la red Wi-Fi del adaptador (WiFi_OBDII, WiCAN… ) y deja abierta la ventana del programa de enlace.</p>
    <div class="campo"><label for="w-ip">Dirección del adaptador</label><input id="w-ip" value="${esc(c.host)}" inputmode="decimal"></div>
    <div class="campo"><label for="w-puerto">Puerto</label><input id="w-puerto" value="${esc(c.puerto)}" inputmode="numeric"></div>
    <p class="peq suave">Normalmente 192.168.0.10 y 35000. Algunos usan 192.168.4.1.</p>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn" id="w-ok">Conectar</button></div>`);
  $('#w-ok', d).onclick = (e) => {
    e.preventDefault();
    const host = $('#w-ip', d).value.trim();
    const puerto = Number($('#w-puerto', d).value) || 35000;
    try { localStorage.setItem('reyman-diag-wifi', JSON.stringify({ host, puerto })); } catch { /* */ }
    d.close();
    conectar('wifi');
  };
}

async function conectar(tipo, coche) {
  const prog = $('#con-progreso');
  prog.hidden = false;
  const paso = (t) => { prog.innerHTML = `<div class="progreso"><span class="giro"></span>${esc(t)}</div>`; estadoBarra(t, 'busy'); };
  try {
    if (estado.conectado) await desconectar(true);
    paso('Buscando el adaptador…');
    estado.transporte = tipo === 'ble' ? crearTransporteBle() : tipo === 'serie' ? crearTransporteSerie() : tipo === 'wifi' ? crearTransporteWifi(cfgWifi()) : tipo === 'j2534' ? crearTransporteJ2534({ puente: `ws://localhost:35001/j2534${coche ? `?dll=${encodeURIComponent(coche)}` : ''}`, log: (t) => log('j2534', t) }) : crearSimulador({ coche, escaneo: true });
    await estado.transporte.conectar();
    estado.transporte.alDesconectarse(() => { estado.conectado = false; estadoBarra('Adaptador desconectado'); toast('Se ha perdido la conexión con el adaptador.'); });
    estado.elm = new Elm327(estado.transporte, { log, timeoutMs: tipo === 'j2534' ? 20000 : undefined });
    estado.uds = null; estado.modo06 = null; estado.bateriaHv = null;
    if (estado.hvVivo) { clearInterval(estado.hvVivo); estado.hvVivo = null; }
    paso('Comunicando con el coche…');
    await estado.elm.iniciar();
    estado.obd = new Obd(estado.elm);
    estado.conectado = true;
    iniciarRegistroBateria();
    estado.soloConsulta = false;
    await leerTodo();
  } catch (e) {
    estado.conectado = false;
    estadoBarra('Sin conectar');
    if (e.name === 'NotFoundError' || e.name === 'AbortError') { prog.hidden = true; return; }
    prog.innerHTML = `<div class="aviso error"><strong>No se ha podido conectar.</strong><br>${esc(e.message)}</div>
      <p class="peq suave">Comprueba que el adaptador tiene la luz encendida, que el contacto está puesto y que el Bluetooth del dispositivo está activado. En Android, la app pide permiso de ubicación/dispositivos cercanos para buscar el adaptador.</p>`;
  }
}

async function desconectar(silencioso) {
  estado.vivo.activo = false;
  pararRegistroBateria();
  try { await estado.elm?.cerrar(); } catch { /* */ }
  estado.conectado = false;
  estado.elm = null; estado.obd = null;
  estadoBarra('Sin conectar');
  if (!silencioso) ir('conectar');
}

async function leerTodo() {
  const prog = $('#con-progreso');
  const paso = (t) => { if (prog) { prog.hidden = false; prog.innerHTML = `<div class="progreso"><span class="giro"></span>${esc(t)}</div>`; } estadoBarra(t, 'busy'); };
  const l = await estado.obd.lecturaCompleta(paso);
  l.usuario = estado.yo?.usuario?.nombre;
  // El escaneo de todas las centralitas sigue valiendo tras releer; y si dio el bastidor, se reutiliza
  if (estado.modo06) l.modo06 = estado.modo06;
  if (estado.bateriaHv) l.bateriaHv = estado.bateriaHv;
  if (estado.uds) {
    l.uds = estado.uds;
    if (estado.uds.vin && !l.vehiculo?.valido) l.vehiculo = { ...decodificarVin(estado.uds.vin), fuente: 'UDS (22 F190)' };
  }
  estado.lectura = l;
  estado.lecturaId = null;
  estado.lecturasSesion.push({ tipo: 'lectura', fecha: l.fecha, transporte: estado.transporte?.tipo, lectura: l });
  estadoBarra(`${estado.transporte.nombre}${l.tension ? ` · ${formatear(l.tension)} V` : ''}`, 'on');
  insignias();
  // Buscar la OT por el VIN
  estado.ot = null;
  estado.coincidencias = [];
  if (l.vehiculo?.valido) {
    try {
      const r = await api.buscarOt({ vin: l.vehiculo.vin });
      estado.coincidencias = r.coincidencias || [];
      estado.abiertas = r.abiertas || [];
    } catch { /* sin servidor */ }
  }
  ir('vehiculo');
}

function insignias() {
  const n = (estado.lectura?.averias || []).filter((a) => a.tipo !== 'permanente').length;
  const ins = $('#ins-averias');
  if (ins) { ins.hidden = !n; ins.textContent = n; }
}

// ---------------------------------------------------------------------------
// Vehículo y OT
// ---------------------------------------------------------------------------
function vVehiculo() {
  const l = estado.lectura;
  const v = l.vehiculo || {};
  const el = $('#v-vehiculo');
  const av = l.averias || [];
  const conf = av.filter((a) => a.tipo === 'confirmada').length;
  const pend = av.filter((a) => a.tipo === 'pendiente').length;
  const rd = l.readiness || {};
  const km = l.datos?.find((d) => d.pid === 0xa6)?.valor;
  const comb = l.datos?.find((d) => d.pid === 0x51);
  el.innerHTML = `
    <div class="vehiculo-cab">
      <div>
        <h1>${esc(estado.ot?.vehiculo || (v.marca && v.marca !== 'Desconocida' ? v.marca : 'Vehículo'))}</h1>
        <p class="suave">${v.valido ? `Bastidor ${esc(v.vin)}` : 'El coche no ha dado el bastidor por OBD'}</p>
      </div>
      ${estado.ot?.matricula ? `<div class="matricula"><span>${esc(formatoMatricula(estado.ot.matricula))}</span></div>` : ''}
    </div>
    <div id="ot-zona"></div>
    <div class="resumen" style="margin-top:12px">
      <button class="celda ${conf ? 'rojo' : 'verde'}" data-ir2="averias"><div class="num">${conf}</div><div>Confirmadas</div></button>
      <button class="celda ${pend ? 'ambar' : 'verde'}" data-ir2="averias"><div class="num">${pend}</div><div>Pendientes</div></button>
      <button class="celda ${rd.semaforo === 'verde' ? 'verde' : rd.semaforo === 'amarillo' ? 'ambar' : 'rojo'}" data-ir2="itv"><div class="num">${rd.semaforo === 'verde' ? 'Sí' : rd.semaforo ? 'No' : '—'}</div><div>Apto ITV</div></button>
    </div>
    <div class="panel">
      <dl class="datos-vehiculo">
        ${dato('Marca', v.marca)}${dato('Año modelo', v.año)}${dato('Combustible', comb?.texto)}${dato('Kilómetros', km !== undefined ? formatear(km) : null)}
        ${dato('Tensión batería', l.tension ? `${formatear(l.tension)} V` : null)}${dato('Protocolo', l.adaptador?.protocolo?.nombre)}
        ${(l.centralitas || []).map((c) => dato(c.modulo, [c.nombre, c.calibracion].filter(Boolean).join(' · ') || 'Responde')).join('')}
      </dl>
    </div>
    <div class="panel" id="bat-auto">${htmlBateriaAuto()}</div>
    ${esFord(l) ? `<div class="panel" id="bat-hv">${htmlBateriaHv()}</div>` : ''}
    ${estado.conectado ? `<div class="fila-btn"><button class="btn sec" id="releer2">Leer de nuevo</button><button class="btn sec" id="bat-prueba2">Batería y alternador</button>${PRUEBAS ? '<button class="btn sec" id="reg-descargar2">Descargar registro</button>' : ''}<button class="btn" data-ir2="averias">Ver averías</button></div>` : '<p class="suave peq">Lectura guardada (solo consulta).</p>'}`;
  el.querySelectorAll('[data-ir2]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir2)));
  $('#releer2', el)?.addEventListener('click', leerTodo);
  $('#bat-prueba2', el)?.addEventListener('click', dialogoBateria);
  if (!el.dataset.bat) { el.dataset.bat = '1'; el.addEventListener('click', (e) => { if (e.target.closest('#bat-prueba3')) dialogoBateria(); }); }
  $('#reg-descargar2', el)?.addEventListener('click', descargarRegistro);
  if (!el.dataset.hv) {
    el.dataset.hv = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('#hv-leer')) leerBateriaHv();
      else if (e.target.closest('#hv-vivo')) alternarHvVivo();
    });
  }
  pintarOt();
}

// Batería de alta tensión de los híbridos Ford (BECM): carga, tensión y celdas
function htmlBateriaHv() {
  const b = estado.bateriaHv;
  const vivo = !!estado.hvVivo;
  const botones = estado.conectado ? `<div class="fila-btn"><button class="btn sec" id="hv-leer" ${estado.hvOcupado || vivo ? 'disabled' : ''}>${b ? 'Leer de nuevo' : 'Leer batería híbrida'}</button><button class="btn sec" id="hv-vivo" aria-pressed="${vivo}">${vivo ? 'Parar' : 'En vivo (cada 2 s)'}</button></div>` : '';
  let cuerpo = '<p class="peq suave">Solo híbridos Ford. Datos de la centralita de la batería (BECM), los mismos que lee la Autel.</p>';
  if (b?.error) cuerpo = `<div class="aviso">${esc(b.error)} Si este Ford no es híbrido, es normal.</div>`;
  else if (b) {
    const dec = (x, n) => x.toFixed(n).replace('.', ',');
    cuerpo = `<dl class="datos-vehiculo">
      ${dato('Carga (SOC)', b.carga !== undefined ? `${dec(b.carga, 1)} %` : null)}${dato('Tensión total', b.tension !== undefined ? `${dec(b.tension, 1)} V` : null)}
      ${dato('Celdas (extremos)', b.celdaA !== undefined ? `${dec(b.celdaA, 3)} V · ${dec(b.celdaB, 3)} V` : null)}${dato('Diferencia entre celdas', b.difCeldasMv !== undefined ? `${b.difCeldasMv} mV` : null)}
      ${dato('Km (BECM)', b.km !== undefined ? formatear(b.km) : null)}${dato('Hora', new Date(b.fecha).toLocaleTimeString('es-ES'))}
    </dl>${b.avisos.map((a) => `<div class="aviso peq">${esc(a)}</div>`).join('')}
    <p class="peq suave">La carga normal de un híbrido sin enchufe se mueve entre el 40 y el 70 %. Diferencia entre celdas: hasta 30 mV normal, más de 80 mV indica desequilibrio (orientativo).</p>`;
  }
  return `<h3>Batería de alta tensión (híbrido Ford)</h3>${cuerpo}${botones}`;
}

function pintarHv() { const x = $('#bat-hv'); if (x) x.innerHTML = htmlBateriaHv(); }

async function leerBateriaHv({ silencioso = false } = {}) {
  if (!estado.conectado || estado.hvOcupado || estado.bateriaOcupada) return;
  estado.hvOcupado = true;
  estado.bateriaOcupada = true;
  if (!silencioso) pintarHv();
  try {
    const r = await leerBateriaHibridaFord(estado.elm);
    estado.bateriaHv = r;
    estado.lectura.bateriaHv = r;
    estado.lecturasSesion.push({ tipo: 'bateria-hv', fecha: r.fecha, bateriaHv: r });
  } catch (e) {
    estado.bateriaHv = { fecha: new Date().toISOString(), error: e.message, valores: [], avisos: [] };
  } finally {
    estado.hvOcupado = false;
    estado.bateriaOcupada = false;
    pintarHv();
  }
}

function alternarHvVivo() {
  if (estado.hvVivo) { clearInterval(estado.hvVivo); estado.hvVivo = null; pintarHv(); return; }
  estado.hvVivo = setInterval(() => {
    if (!estado.conectado || !$('#bat-hv')) { clearInterval(estado.hvVivo); estado.hvVivo = null; return; }
    leerBateriaHv({ silencioso: true });
  }, 2000);
  leerBateriaHv();
}

function dato(t, v) { return v === null || v === undefined || v === '' ? '' : `<div class="dato"><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>`; }
function formatoMatricula(m) { const s = String(m).toUpperCase().replace(/[\s-]/g, ''); return /^\d{4}[A-Z]{3}$/.test(s) ? `${s.slice(0, 4)} ${s.slice(4)}` : s; }

function pintarOt() {
  const z = $('#ot-zona');
  if (estado.soloConsulta) { z.innerHTML = estado.ot ? `<p class="suave">OT ${esc(estado.ot.ot)}</p>` : ''; return; }
  if (estado.ot) {
    z.innerHTML = `<div class="panel ot-propuesta"><strong>OT ${esc(estado.ot.ot)}</strong> · ${esc(estado.ot.cliente || '')}<br><span class="suave peq">${estado.lecturaId ? 'Lectura guardada en la OT.' : 'Guardando…'}</span> <button class="btn fantasma" id="cambiar-ot" style="min-height:40px;margin-left:8px">Cambiar</button></div>`;
    $('#cambiar-ot').onclick = () => { estado.ot = null; pintarOt(); };
    return;
  }
  const c = estado.coincidencias?.[0];
  if (c) {
    z.innerHTML = `<div class="panel ot-propuesta"><p>Este bastidor coincide con la <strong>OT ${esc(c.ot)}</strong>: ${esc(c.vehiculo)}, matrícula ${esc(formatoMatricula(c.matricula))}.</p>
      <div class="fila-btn"><button class="btn" id="ot-ok">Guardar en la OT ${esc(c.ot)}</button><button class="btn fantasma" id="ot-otra">Elegir otra</button></div></div>`;
    $('#ot-ok').onclick = () => asociarOt(c);
    $('#ot-otra').onclick = dialogoOt;
  } else {
    z.innerHTML = `<div class="aviso">No hay ninguna OT abierta con este bastidor. Asocia la lectura a una OT o escribe la matrícula.<div class="fila-btn"><button class="btn" id="ot-elegir">Asociar a OT o matrícula</button></div></div>`;
    $('#ot-elegir').onclick = dialogoOt;
  }
}

function dialogoOt() {
  const abiertas = estado.abiertas || [];
  const d = dialogo(`<h3>Asociar la lectura</h3>
    ${abiertas.length ? `<div class="campo"><label for="ot-sel">OT abierta</label><select id="ot-sel"><option value="">— Elige una OT —</option>${abiertas.map((o, i) => `<option value="${i}">${esc(o.ot)} · ${esc(formatoMatricula(o.matricula))} · ${esc(o.vehiculo)}</option>`).join('')}</select></div>` : ''}
    <div class="campo"><label for="ot-mat">O escribe la matrícula (sin OT)</label><input id="ot-mat" autocomplete="off" autocapitalize="characters" placeholder="1234 ABC"></div>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn" id="ot-guardar">Guardar</button></div>`);
  $('#ot-guardar', d).onclick = async (e) => {
    e.preventDefault();
    const i = $('#ot-sel', d)?.value;
    const mat = $('#ot-mat', d).value.trim();
    if (i) { d.close(); return asociarOt(abiertas[Number(i)]); }
    if (!mat) return toast('Elige una OT o escribe la matrícula.');
    d.close();
    const r = await api.buscarOt({ matricula: mat }).catch(() => ({ coincidencias: [] }));
    asociarOt(r.coincidencias?.[0] || { ot: null, matricula: mat.replace(/[\s-]/g, '').toUpperCase(), cliente: 'Sin OT' });
  };
}

async function asociarOt(o) {
  estado.ot = o;
  pintarOt();
  try {
    const r = await api.guardarLectura(cuerpoLectura());
    estado.lecturaId = r.id;
    toast(o.ot ? `Lectura guardada en la OT ${o.ot}.` : `Lectura guardada para ${formatoMatricula(o.matricula)}.`);
  } catch (e) {
    toast(`No se pudo guardar la lectura: ${e.message}`);
  }
  if (estado.vista === 'vehiculo') vVehiculo();
}

function cuerpoLectura() {
  return { ot: estado.ot?.ot || null, matricula: estado.ot?.matricula || null, vin: estado.lectura?.vehiculo?.vin || null, lectura: estado.lectura };
}

// ---------------------------------------------------------------------------
// Averías
// ---------------------------------------------------------------------------
function vAverias() {
  const l = estado.lectura;
  const av = l.averias || [];
  const el = $('#v-averias');
  const grupo = (tipo, titulo, ayuda) => {
    const lista = av.filter((a) => a.tipo === tipo);
    if (!lista.length) return '';
    return `<h2>${titulo} <span class="suave">(${lista.length})</span></h2><p class="peq suave">${ayuda}</p>${lista.map((a) => `
      <div class="averia ${tipo}">
        <div class="placa">${esc(a.codigo)}</div>
        <div><div class="desc">${esc(a.descripcion)}</div>
        <div class="meta">${esc(a.sistema)} · ${esc(a.modulo)} ${a.fabricante ? '<span class="etiqueta fab">Código de marca</span>' : ''}</div></div>
      </div>`).join('')}`;
  };
  el.innerHTML = `<h1>Averías</h1>
    ${av.length ? '' : '<div class="panel vacio"><strong>Sin averías</strong>Ninguna centralita OBD ha devuelto códigos.</div>'}
    ${grupo('confirmada', 'Confirmadas', 'Encienden o pueden encender el testigo de avería.')}
    ${grupo('pendiente', 'Pendientes', 'Detectadas una vez; se confirman si vuelven a aparecer.')}
    ${grupo('permanente', 'Permanentes', 'No se pueden borrar: desaparecen solas cuando el coche comprueba que está reparado.')}
    ${l.freezeFrame?.dtc ? `<h2>Freeze frame de ${esc(l.freezeFrame.dtc.codigo)}</h2><div class="panel"><p class="peq suave">Valores del motor en el momento en que apareció la avería.</p><dl class="datos-vehiculo">${l.freezeFrame.valores.map((x) => dato(x.nombre, `${formatear(x.valor)} ${x.unidad}`)).join('')}</dl></div>` : ''}
    ${(l.erroresLectura || []).length ? `<div class="aviso peq">Algunas lecturas no se completaron: ${l.erroresLectura.map((e) => `modo ${esc(e.modo)} (${esc(e.error)})`).join(', ')}.</div>` : ''}
    <div class="fila-btn">
      ${estado.conectado ? '<button class="btn sec" id="av-releer">Leer de nuevo</button>' : ''}
      ${estado.conectado && puede('diag.borrar') && av.some((a) => a.tipo !== 'permanente') ? '<button class="btn peligro" id="av-borrar">Borrar averías</button>' : ''}
    </div>
    <section class="todas" id="uds">${htmlUds()}</section>`;
  enlazarUds(el);
  $('#av-releer', el)?.addEventListener('click', async () => { await leerTodo(); ir('averias'); });
  $('#av-borrar', el)?.addEventListener('click', dialogoBorrar);
}

// ---------------------------------------------------------------------------
// Todas las centralitas (UDS por CAN)
// ---------------------------------------------------------------------------
function htmlUds() {
  const u = estado.uds || estado.lectura?.uds;
  const j2534 = estado.transporte?.tipo === 'j2534';
  const cab = `<h2>Todas las centralitas</h2><p class="peq suave">${j2534 ? 'Busca todas las centralitas del bus CAN (motor, ABS, airbag, carrocería…) y lee sus averías. Hazlo con el <strong>contacto puesto y el motor parado</strong>. Tarda unos 20 segundos.' : 'Con este adaptador solo se consultan las direcciones OBD estándar. Con la MaxiVCI (J2534) se buscan todas.'}</p>`;
  if (estado.udsOcupado) return `${cab}<div class="progreso"><span class="giro"></span>${esc(estado.udsOcupado)}</div>`;
  const boton = estado.conectado ? `<div class="fila-btn"><button class="btn sec" id="uds-escanear">${u ? 'Escanear de nuevo' : 'Escanear todas las centralitas'}</button>${u && puede('diag.borrar') && u.centralitas.some((c) => c.averias.length) ? '<button class="btn peligro" id="uds-borrar-todas">Borrar averías de todas</button>' : ''}</div>` : '';
  if (!u) return cab + boton;
  const conAv = u.centralitas.filter((c) => c.averias.length).length;
  const estadoTxt = (e) => [e.activa ? 'activa' : '', e.confirmada ? 'confirmada' : '', e.pendiente && !e.confirmada ? 'pendiente' : ''].filter(Boolean).join(' · ') || 'memorizada';
  const lista = u.centralitas.map((c) => `
    <details class="centralita ${c.averias.length ? 'con-averias' : ''}" ${c.averias.length ? 'open' : ''}>
      <summary><strong>${esc(c.nombre)}</strong> <span class="peq suave">${esc(c.tx)} → ${esc(c.rx)}${c.referencia ? ` · ref. ${esc(c.referencia)}` : ''}</span>
        <span class="etiqueta-estado ${c.error ? 'ambar' : c.averias.length ? 'rojo' : 'verde'}">${c.error ? 'sin leer' : c.averias.length ? `${c.averias.length} ${c.averias.length === 1 ? 'avería' : 'averías'}` : 'sin averías'}</span></summary>
      ${c.error ? `<p class="peq aviso">${esc(c.error)}</p>` : ''}
      ${c.averias.map((a) => `<div class="averia ${a.estado.confirmada ? 'confirmada' : 'pendiente'}"><div class="placa">${esc(a.completo)}</div><div><div class="desc">${esc(a.descripcion)}</div><div class="meta">${esc(a.sistema)} · ${esc(estadoTxt(a.estado))}${a.estado.testigo ? ' · enciende testigo' : ''} ${a.fabricante ? '<span class="etiqueta fab">Código de marca</span>' : ''}</div></div></div>`).join('')}
      ${c.averias.length && estado.conectado && puede('diag.borrar') ? `<div class="fila-btn"><button class="btn fantasma peligro-txt" data-uds-borrar="${esc(c.rx)}">Borrar averías de ${esc(c.nombre)}</button></div>` : ''}
    </details>`).join('');
  return `${cab}<p><strong>${u.centralitas.length}</strong> centralitas encontradas · <strong>${conAv}</strong> con averías · ${esc(new Date(u.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))}${u.vin ? ` · bastidor ${esc(u.vin)}` : ''}</p>${lista}${boton}`;
}

function enlazarUds(el) {
  if (el.dataset.uds) return;
  el.dataset.uds = '1';
  el.addEventListener('click', (e) => {
    if (e.target.closest('#uds-escanear')) escanearTodas();
    else if (e.target.closest('#uds-borrar-todas')) dialogoBorrarUds(null);
    else if (e.target.closest('[data-uds-borrar]')) dialogoBorrarUds(e.target.closest('[data-uds-borrar]').dataset.udsBorrar);
  });
}

function pintarUds() { const s = $('#uds'); if (s) s.innerHTML = htmlUds(); }

async function escanearTodas() {
  if (!estado.conectado || estado.udsOcupado) return;
  estado.bateriaOcupada = true;
  const paso = (t) => { estado.udsOcupado = t; pintarUds(); estadoBarra(t, 'busy'); };
  try {
    paso('Buscando centralitas…');
    const pares = await escanearCentralitas(estado.elm, { progreso: paso });
    const centralitas = await leerTodasLasCentralitas(estado.elm, pares, { progreso: paso, vin: estado.lectura?.vehiculo?.valido ? estado.lectura.vehiculo.vin : null });
    const vin = centralitas.find((c) => c.vin)?.vin || null;
    estado.uds = { fecha: new Date().toISOString(), transporte: estado.transporte.tipo, vin, centralitas };
    estado.lectura.uds = estado.uds;
    estado.lecturasSesion.push({ tipo: 'uds', fecha: estado.uds.fecha, uds: estado.uds });
    // Bastidor por la vía del fabricante si el coche no lo dio por OBD
    if (vin && !estado.lectura.vehiculo?.valido) {
      estado.lectura.vehiculo = { ...decodificarVin(vin), fuente: 'UDS (22 F190)' };
      toast(`Bastidor leído de la centralita: ${vin}`);
    }
    if (!pares.length) toast('No ha contestado ninguna centralita a la diagnosis.');
  } catch (e) {
    toast(`No se ha podido completar el escaneo: ${e.message}`);
  } finally {
    estado.udsOcupado = null;
    estado.bateriaOcupada = false;
    estadoBarra(`${estado.transporte?.nombre || ''}`, estado.conectado ? 'on' : '');
    pintarUds();
  }
}

function dialogoBorrarUds(rx) {
  const u = estado.uds;
  const objetivo = u.centralitas.filter((c) => c.averias.length && (rx === null || c.rx === rx));
  if (!objetivo.length) return;
  const d = dialogo(`<h3>Borrar averías ${rx ? `de ${esc(objetivo[0].nombre)}` : `de ${objetivo.length} centralitas`}</h3>
    <ul class="peq">${objetivo.map((c) => `<li><strong>${esc(c.nombre)}</strong>: ${c.averias.map((a) => esc(a.completo)).join(', ')}</li>`).join('')}</ul>
    <div class="aviso peq">Borrar no repara nada: si la avería sigue, volverá. Algunas centralitas (airbag, ABS) no la borran hasta que se repara la causa.</div>
    <div class="campo"><label for="ub-motivo">Motivo</label><select id="ub-motivo"><option>Reparación terminada</option><option>Comprobación tras borrar (diagnóstico)</option><option>Avería intermitente: ver si vuelve</option><option>Otro</option></select></div>
    <label class="check"><input type="checkbox" id="ub-conf"><span>He revisado las averías y quiero borrarlas.</span></label>
    <p class="peq suave">Quedará registrado quién borra, cuándo y qué códigos había.</p>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn peligro" id="ub-ok" disabled>Borrar</button></div>`);
  $('#ub-conf', d).onchange = (e) => { $('#ub-ok', d).disabled = !e.target.checked; };
  $('#ub-ok', d).onclick = async (e) => {
    e.preventDefault();
    const motivo = $('#ub-motivo', d).value;
    d.close();
    await borrarUds(objetivo, motivo);
  };
}

async function borrarUds(objetivo, motivo) {
  estado.bateriaOcupada = true;
  const paso = (t) => { estado.udsOcupado = t; pintarUds(); estadoBarra(t, 'busy'); };
  const resultados = [];
  try {
    if (!estado.lecturaId) {
      const r = await api.guardarLectura(cuerpoLectura());
      estado.lecturaId = r.id;
    }
    for (const c of objetivo) {
      const codigos = c.averias.map((a) => `${c.rx}:${a.completo}`);
      const p = await api.pedirBorrado({ lectura_id: estado.lecturaId, ot: estado.ot?.ot || null, matricula: estado.ot?.matricula || null, vin: estado.lectura.vehiculo?.vin, codigos, motivo: `${motivo} · ${c.nombre} (${c.tx}/${c.rx})` });
      if (!p.permitido) { toast('No tienes permiso para borrar averías.'); break; }
      paso(`Borrando ${c.nombre}…`);
      const r = await borrarCentralita(estado.elm, c);
      await api.resultadoBorrado(p.id, { ok: r.ok, error: r.error, sesionExtendida: r.sesionExtendida, centralita: c.nombre }).catch(() => {});
      paso(`Comprobando ${c.nombre}…`);
      const despues = await leerCentralita(estado.elm, c);
      const i = estado.uds.centralitas.findIndex((x) => x.rx === c.rx);
      if (i >= 0) estado.uds.centralitas[i] = despues;
      resultados.push({ nombre: c.nombre, ok: r.ok, error: r.error, quedan: despues.averias.length });
    }
    estado.lecturasSesion.push({ tipo: 'uds-borrado', fecha: new Date().toISOString(), motivo, resultados });
    const mal = resultados.filter((r) => !r.ok || r.quedan);
    toast(mal.length ? `Hecho, pero ${mal.map((r) => `${r.nombre}: ${r.ok ? `quedan ${r.quedan}` : r.error}`).join(' · ')}` : 'Averías borradas y comprobadas.');
  } catch (e) {
    toast(`Borrado interrumpido: ${e.message}`);
  } finally {
    estado.udsOcupado = null;
    estado.bateriaOcupada = false;
    estadoBarra(`${estado.transporte?.nombre || ''}`, estado.conectado ? 'on' : '');
    pintarUds();
  }
}

function dialogoBorrar() {
  const l = estado.lectura;
  const codigos = l.averias.filter((a) => a.tipo !== 'permanente').map((a) => a.codigo);
  const d = dialogo(`<h3>Borrar averías</h3>
    <p>Se borrarán <strong>${codigos.join(', ')}</strong> de todas las centralitas OBD. También se borran el freeze frame y los monitores de la ITV, que tendrán que volver a completarse circulando.</p>
    <div class="campo"><label for="b-motivo">Motivo</label><select id="b-motivo"><option>Reparación terminada</option><option>Comprobación tras borrar (diagnóstico)</option><option>Avería intermitente: ver si vuelve</option><option>Otro</option></select></div>
    <label class="check"><input type="checkbox" id="b-conf"><span>He guardado la lectura y entiendo que el coche no debe ir a la ITV hasta completar los monitores.</span></label>
    <p class="peq suave">Quedará registrado quién borra, cuándo y qué códigos había.</p>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn peligro" id="b-ok" disabled>Borrar averías</button></div>`);
  $('#b-conf', d).onchange = (e) => { $('#b-ok', d).disabled = !e.target.checked; };
  $('#b-ok', d).onclick = async (e) => {
    e.preventDefault();
    d.close();
    await borrar(codigos, $('#b-motivo', d).value);
  };
}

async function borrar(codigos, motivo) {
  // 1. Guardar lectura previa (si no se había guardado) y pedir permiso al servidor: deja el registro antes de tocar el coche.
  try {
    if (!estado.lecturaId) {
      const r = await api.guardarLectura(cuerpoLectura());
      estado.lecturaId = r.id;
    }
    const p = await api.pedirBorrado({ lectura_id: estado.lecturaId, ot: estado.ot?.ot || null, matricula: estado.ot?.matricula || null, vin: estado.lectura.vehiculo?.vin, codigos, motivo });
    if (!p.permitido) return toast('No tienes permiso para borrar averías.');
    estadoBarra('Borrando averías…', 'busy');
    let resultado;
    try {
      const r = await estado.obd.borrarAverias();
      resultado = { ok: true, centralitas: r.centralitas };
    } catch (err) {
      resultado = { ok: false, error: err.message };
    }
    await api.resultadoBorrado(p.id, resultado).catch(() => {});
    if (!resultado.ok) { toast(`El coche no aceptó el borrado: ${resultado.error}`); estadoBarra(estado.transporte.nombre, 'on'); return; }
    const antes = { ...estado.ot };
    await leerTodo();
    estado.ot = antes.ot || antes.matricula ? antes : null;
    estado.lectura.borrado = { fecha: new Date().toISOString(), usuario: estado.yo?.usuario?.nombre, codigos, motivo };
    if (estado.ot) await asociarOt(estado.ot);
    toast('Averías borradas. Lectura posterior guardada.');
    ir('averias');
  } catch (e) {
    toast(`No se ha borrado nada: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Pre-ITV
// ---------------------------------------------------------------------------
function vItv() {
  const rd = estado.lectura.readiness || {};
  const el = $('#v-itv');
  if (rd.error || !rd.semaforo) { el.innerHTML = `<h1>Pre-ITV</h1><div class="aviso">No se pudo leer el estado de los monitores: ${esc(rd.error || 'sin datos')}</div>`; return; }
  const titulo = { verde: 'Listo para la ITV', amarillo: 'Monitores sin completar', rojo: 'No apto para la ITV' }[rd.semaforo];
  const dist = estado.lectura.datos?.find((d) => d.pid === 0x31)?.valor;
  const calent = estado.lectura.datos?.find((d) => d.pid === 0x30)?.valor;
  el.innerHTML = `<h1>Pre-ITV</h1>
    <div class="semaforo ${rd.semaforo}" style="margin-top:12px"><div class="luz" aria-hidden="true"></div><div><h3>${titulo}</h3><p>${esc(rd.motivo)}</p></div></div>
    <div class="panel"><dl class="datos-vehiculo">
      ${dato('Testigo de avería (MIL)', rd.mil ? 'Encendido' : 'Apagado')}${dato('Averías de emisiones', rd.numAverias)}${dato('Motor', rd.motor === 'diesel' ? 'Diésel (encendido por compresión)' : 'Gasolina (encendido por chispa)')}
      ${dato('Km desde el último borrado', dist !== undefined ? formatear(dist) : null)}${dato('Arranques en caliente desde el borrado', calent)}
    </dl></div>
    <h2>Monitores</h2>
    <div class="panel"><ul class="monitores">${rd.monitores.map((m) => `<li><span>${esc(m.nombre)}</span><span class="${m.estado === 'ok' ? 'ok' : 'pend'}">${m.estado === 'ok' ? 'Completado' : 'Pendiente'}</span></li>`).join('')}</ul></div>
    ${rd.semaforo === 'amarillo' ? '<p class="peq suave">Para completar los monitores suele bastar con 2-3 ciclos de conducción mixta (motor frío hasta temperatura, ciudad y carretera). El de evaporación y el del filtro de partículas son los que más tardan.</p>' : ''}
    <section class="todas" id="m06">${htmlModo06()}</section>`;
  const s06 = $('#m06', el);
  s06.onclick = (e) => { if (e.target.closest('#m06-leer')) leerModo06(); };
}

// Modo 06: pruebas internas de los monitores (lo cerca del límite que está cada cosa)
function htmlModo06() {
  const m = estado.modo06;
  const ocupado = estado.m06Ocupado;
  const cab = `<h2>Pruebas internas de los monitores (modo 06)</h2>
    <p class="peq suave">Resultados de las pruebas que hace la propia centralita: catalizador, sondas lambda, EVAP, fallos de encendido por cilindro... Cada valor con su mínimo y máximo. Sirve para ver lo que está <strong>cerca del límite</strong> antes de que se encienda el testigo.</p>`;
  const boton = estado.conectado ? `<div class="fila-btn"><button class="btn sec" id="m06-leer" ${ocupado ? 'disabled' : ''}>${m ? 'Leer de nuevo' : 'Leer pruebas (modo 06)'}</button></div>` : '';
  if (ocupado) return `${cab}<p class="peq">${esc(ocupado)}</p>`;
  if (!m) return `${cab}${boton}`;
  if (m.error) return `${cab}<div class="aviso">${esc(m.error)}</div>${boton}`;
  if (!m.total) return `${cab}<p>El coche no da resultados del modo 06.</p>${boton}`;
  const cerca = (x) => x.ok && x.margen !== null && x.margen < 10;
  const fila = (x) => `<tr class="${!x.ok ? 'm06-mal' : cerca(x) ? 'm06-cerca' : ''}"><td>${esc(x.prueba)}${x.escalaConocida ? '' : ' <small>(escala sin traducir)</small>'}</td><td class="num">${formatear(x.valor)} ${esc(x.unidad)}</td><td class="num">${formatear(x.min)} – ${formatear(x.max)}</td><td>${!x.ok ? '<strong class="peligro-txt">Fuera</strong>' : cerca(x) ? 'Cerca del límite' : 'Bien'}</td></tr>`;
  const bloques = m.ecus.map((e) => {
    const grupos = new Map();
    for (const x of e.pruebas) (grupos.get(x.monitor) || grupos.set(x.monitor, []).get(x.monitor)).push(x);
    return `<h3>${esc(e.nombre || e.modulo)} <small class="suave">${esc(e.ecu)}</small></h3>
      <table class="m06"><thead><tr><th>Prueba</th><th>Valor</th><th>Límites</th><th></th></tr></thead><tbody>
      ${[...grupos].map(([mon, xs]) => `<tr class="m06-mon"><td colspan="4">${esc(mon)}</td></tr>${xs.map(fila).join('')}`).join('')}
      </tbody></table>`;
  }).join('');
  const resumen = m.fuera ? `<div class="aviso"><strong>${m.fuera} prueba${m.fuera > 1 ? 's' : ''} fuera de límites.</strong> Aunque no haya avería todavía, es lo primero que hay que revisar.</div>` : `<p><strong>${m.total} pruebas</strong>, todas dentro de límites.</p>`;
  return `${cab}${resumen}<div class="tabla-scroll">${bloques}</div>${boton}`;
}

async function leerModo06() {
  if (!estado.conectado || estado.m06Ocupado) return;
  estado.bateriaOcupada = true;
  const pintar = () => { const s = $('#m06'); if (s) s.innerHTML = htmlModo06(); };
  const paso = (t) => { estado.m06Ocupado = t; pintar(); estadoBarra(t, 'busy'); };
  try {
    const r = await estado.obd.modo06(paso);
    // Nombre de la centralita (09 0A) si se leyó
    for (const e of r.ecus) e.nombre = estado.lectura.centralitas?.find((c) => c.ecu === e.ecu)?.nombre || null;
    estado.modo06 = r;
  } catch (e) {
    estado.modo06 = { fecha: new Date().toISOString(), error: e.code === 'NO DATA' ? 'El coche no contesta al modo 06.' : e.message, ecus: [], total: 0, fuera: 0 };
  } finally {
    estado.lectura.modo06 = estado.modo06;
    estado.lecturasSesion.push({ tipo: 'modo06', fecha: estado.modo06.fecha, modo06: estado.modo06 });
    estado.m06Ocupado = null;
    estado.bateriaOcupada = false;
    estadoBarra(`${estado.transporte?.nombre || ''}`, estado.conectado ? 'on' : '');
    pintar();
  }
}

// ---------------------------------------------------------------------------
// Datos en vivo
// ---------------------------------------------------------------------------
function vVivo() {
  const el = $('#v-vivo');
  const sop = new Set(estado.lectura.soportados || []);
  const grupos = GRUPOS_EN_VIVO.map((g) => ({ ...g, pids: g.pids.filter((p) => sop.has(p)) })).filter((g) => g.pids.length);
  if (!grupos.find((g) => g.id === estado.vivo.grupo)) estado.vivo.grupo = grupos[0]?.id;
  const g = grupos.find((x) => x.id === estado.vivo.grupo);
  if (!estado.vivo.sel || !g?.pids.includes(estado.vivo.sel)) estado.vivo.sel = g?.pids[0];
  const rec = estado.vivo.grabando;
  el.innerHTML = `<h1>Datos en vivo</h1>
    <div class="grupos" role="group" aria-label="Grupo de datos">${grupos.map((x) => `<button data-g="${x.id}" aria-pressed="${x.id === estado.vivo.grupo}">${esc(x.nombre)}</button>`).join('')}</div>
    <div class="indicadores">${(g?.pids || []).map((p) => `<button class="indicador" data-pid="${p}" aria-pressed="${p === estado.vivo.sel}"><div class="nombre">${esc(PIDS[p].nombre)}</div><div><span class="valor" id="val-${p}">—</span><span class="unidad">${esc(PIDS[p].unidad)}</span></div><canvas id="spk-${p}" aria-hidden="true"></canvas></button>`).join('')}</div>
    <div class="panel"><h3 id="sel-nombre">${esc(PIDS[estado.vivo.sel]?.nombre || '')}</h3><canvas class="grafica-grande" id="grafica"></canvas></div>
    <div class="fila-btn">${rec ? `<span class="grabando">Grabando · <span id="rec-t">0</span> s</span><button class="btn" id="rec-parar">Parar y guardar en la OT</button>` : '<button class="btn sec" id="rec-ini">Grabar sesión (prueba de carretera)</button>'}</div>
    <p class="peq suave">Cuantos menos datos a la vez, más rápido se refrescan. Con el adaptador real se leen unos 6-10 valores por segundo.</p>`;
  el.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { estado.vivo.grupo = b.dataset.g; vVivo(); });
  el.querySelectorAll('[data-pid]').forEach((b) => b.onclick = () => { estado.vivo.sel = Number(b.dataset.pid); vVivo(); });
  $('#rec-ini', el)?.addEventListener('click', () => { estado.vivo.grabando = { inicio: Date.now(), pids: g.pids, muestras: [] }; vVivo(); });
  $('#rec-parar', el)?.addEventListener('click', pararGrabacion);
  pintarVivo();
}

let bucleEnMarcha = false;
async function bucleVivo() {
  if (bucleEnMarcha) return;
  bucleEnMarcha = true;
  try {
    while (estado.vivo.activo && estado.conectado) {
      const sop = new Set(estado.lectura.soportados || []);
      const g = GRUPOS_EN_VIVO.find((x) => x.id === estado.vivo.grupo);
      const pids = (g?.pids || []).filter((p) => sop.has(p));
      if (!pids.length) break;
      const valores = await estado.obd.leerPids(pids);
      const t = Date.now();
      for (const v of valores) {
        const h = (estado.vivo.hist[v.pid] ||= []);
        h.push(v.valor);
        if (h.length > 120) h.shift();
      }
      if (estado.vivo.grabando) {
        estado.vivo.grabando.muestras.push({ t: t - estado.vivo.grabando.inicio, v: Object.fromEntries(valores.map((x) => [x.pid, x.valor])) });
        if (estado.vivo.grabando.muestras.length > 20000) await pararGrabacion();
      }
      pintarVivo();
      await new Promise((r) => setTimeout(r, 60));
    }
  } catch (e) {
    toast(`Lectura en vivo detenida: ${e.message}`);
  } finally {
    bucleEnMarcha = false;
  }
}

function pintarVivo() {
  if (estado.vista !== 'vivo') return;
  for (const [pid, h] of Object.entries(estado.vivo.hist)) {
    const val = $(`#val-${pid}`);
    if (!val) continue;
    val.textContent = formatear(h[h.length - 1]);
    const c = $(`#spk-${pid}`);
    if (c) dibujarLinea(c, h.slice(-40));
  }
  const sel = estado.vivo.sel;
  const gc = $('#grafica');
  if (gc && estado.vivo.hist[sel]) dibujarLinea(gc, estado.vivo.hist[sel], { rejilla: true, etiquetas: true, unidad: PIDS[sel]?.unidad || '' });
  const rt = $('#rec-t');
  if (rt && estado.vivo.grabando) rt.textContent = Math.round((Date.now() - estado.vivo.grabando.inicio) / 1000);
}

async function pararGrabacion() {
  const g = estado.vivo.grabando;
  estado.vivo.grabando = null;
  if (!g) return;
  try {
    const r = await api.guardarSesion({
      lectura_id: estado.lecturaId, ot: estado.ot?.ot || null, matricula: estado.ot?.matricula || null, vin: estado.lectura.vehiculo?.vin,
      inicio: new Date(g.inicio).toISOString(), duracion_s: Math.round((Date.now() - g.inicio) / 1000),
      pids: g.pids.map((p) => ({ pid: p, nombre: PIDS[p].nombre, unidad: PIDS[p].unidad })), muestras: g.muestras,
    });
    toast(`Sesión guardada (${g.muestras.length} muestras)${r.destino ? `: ${r.destino}` : ''}.`);
  } catch (e) {
    toast(`No se pudo guardar la sesión: ${e.message}`);
  }
  if (estado.vista === 'vivo') vVivo();
}

// ---------------------------------------------------------------------------
// Informe, IA e historial
// ---------------------------------------------------------------------------
function vInforme() {
  const el = $('#v-informe');
  const ia = estado.yo?.ia;
  const l = estado.lectura;
  el.innerHTML = `<h1>Informe</h1>
    <div class="panel">
      <h3>Diagnóstico asistido</h3>
      <p class="peq suave">La IA relaciona las averías, el freeze frame y los datos del motor y propone las comprobaciones por orden. ${ia ? `Gastado este mes: ${formatear(ia.gastadoMes)} € de ${formatear(ia.topeMes)} €.` : ''}</p>
      <div id="ia-zona">${l.ia?.texto ? `<div class="ia-texto">${esc(l.ia.texto)}</div>` : ''}</div>
      <div class="fila-btn">${puede('diag.ia') ? `<button class="btn sec" id="ia-btn">${l.ia ? 'Volver a analizar' : 'Analizar con IA'}</button>` : ''}</div>
    </div>
    <div class="panel">
      <h3>Informe en PDF</h3>
      <p class="peq suave">Se abre listo para imprimir o «Guardar como PDF».</p>
      <div class="fila-btn"><button class="btn sec" id="inf-int">Informe interno</button><button class="btn sec" id="inf-cli">Informe para el cliente</button></div>
      ${puede('diag.enviar_cliente') ? '<div class="fila-btn"><button class="btn" id="inf-enviar">Enviar al cliente por correo</button></div>' : ''}
    </div>
    <div class="panel"><h3>Lecturas anteriores de este coche</h3><div id="hist" class="peq suave">${estado.ot?.matricula ? 'Cargando…' : 'Asocia la lectura a una OT o matrícula para ver el historial.'}</div></div>`;
  $('#ia-btn', el)?.addEventListener('click', analizarIa);
  $('#inf-int', el).onclick = () => abrirInforme('interno');
  $('#inf-cli', el).onclick = () => abrirInforme('cliente');
  $('#inf-enviar', el)?.addEventListener('click', dialogoEnviar);
  if (estado.ot?.matricula) cargarHistorial();
}

async function analizarIa() {
  const z = $('#ia-zona');
  z.innerHTML = '<div class="progreso"><span class="giro"></span>Analizando…</div>';
  try {
    const r = await api.diagnosticoIa({ lectura_id: estado.lecturaId, lectura: estado.lectura, vehiculo: estado.ot?.vehiculo });
    estado.lectura.ia = { texto: r.texto, fecha: new Date().toISOString() };
    if (estado.yo.ia) { estado.yo.ia.gastadoMes = r.gastadoMes; estado.yo.ia.topeMes = r.topeMes; }
    vInforme();
  } catch (e) {
    z.innerHTML = `<div class="aviso error">${esc(e.message)}</div>`;
  }
}

function abrirInforme(version) {
  const l = { ...estado.lectura, ot: estado.ot?.ot, matricula: estado.ot?.matricula ? formatoMatricula(estado.ot.matricula) : null, descripcionVehiculo: estado.ot?.vehiculo };
  const html = htmlInforme(l, { version, taller: estado.yo?.taller, logo: window.REYMAN_LOGO || 'logo.png' });
  const w = DEMO ? null : window.open('', '_blank');
  if (!w) {
    // Sin ventana nueva (bloqueada o vista embebida): se muestra dentro de la app
    const d = dialogo(`<h3>${version === 'cliente' ? 'Informe para el cliente' : 'Informe interno'}</h3><iframe title="Informe" style="width:100%;height:65vh;border:1px solid var(--linea);border-radius:8px;background:#fff"></iframe><div class="fila-btn"><button class="btn" value="cancel" formmethod="dialog">Cerrar</button></div>`);
    d.style.width = 'min(860px, calc(100vw - 24px))';
    $('iframe', d).srcdoc = html;
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 400);
}

function dialogoEnviar() {
  const d = dialogo(`<h3>Enviar al cliente</h3>
    <p class="peq suave">Se envía el informe para el cliente (sin datos técnicos internos) desde talleresreyman@gmail.com.</p>
    <div class="campo"><label for="e-mail">Correo del cliente</label><input id="e-mail" type="email" inputmode="email" autocomplete="off" value="${esc(estado.ot?.email || '')}"></div>
    <label class="check"><input type="checkbox" id="e-ia" ${estado.lectura.ia ? 'checked' : ''}><span>Incluir la valoración del diagnóstico asistido</span></label>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cancelar</button><button class="btn" id="e-ok">Enviar informe</button></div>`);
  $('#e-ok', d).onclick = async (e) => {
    e.preventDefault();
    const email = $('#e-mail', d).value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Escribe un correo válido.');
    d.close();
    try {
      if (!estado.lecturaId) { const r = await api.guardarLectura(cuerpoLectura()); estado.lecturaId = r.id; }
      const r = await api.enviarInforme({ lectura_id: estado.lecturaId, email, incluirIa: $('#e-ia', d).checked, ia: estado.lectura.ia || null });
      toast(r.demo ? `Demostración: el informe se enviaría a ${email}.` : `Informe enviado a ${email}.`);
    } catch (err) {
      toast(`No se ha enviado: ${err.message}`);
    }
  };
}

async function cargarHistorial() {
  try {
    const r = await api.historial(estado.ot.matricula);
    const h = $('#hist');
    if (!h) return;
    if (!r.lecturas?.length) { h.textContent = 'No hay lecturas anteriores.'; return; }
    h.innerHTML = `<table class="hist"><thead><tr><th>Fecha</th><th>OT</th><th>Averías</th></tr></thead><tbody>${r.lecturas.map((x) => {
      const av = (x.lectura?.averias || x.averias || []).map((a) => a.codigo);
      return `<tr><td>${new Date(x.creada).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(x.ot || '—')}</td><td>${esc(av.join(', ') || 'Ninguna')}</td></tr>`;
    }).join('')}</tbody></table>`;
  } catch (e) {
    const h = $('#hist'); if (h) h.textContent = `No se pudo cargar: ${e.message}`;
  }
}

function dialogoConsulta() {
  const d = dialogo(`<h3>Consultar lecturas guardadas</h3>
    <div class="campo"><label for="c-mat">Matrícula</label><input id="c-mat" autocapitalize="characters" autocomplete="off" placeholder="1234 ABC"></div>
    <div id="c-res"></div>
    <div class="fila-btn"><button class="btn fantasma" value="cancel" formmethod="dialog">Cerrar</button><button class="btn" id="c-buscar">Buscar</button></div>`);
  $('#c-buscar', d).onclick = async (e) => {
    e.preventDefault();
    const mat = $('#c-mat', d).value.replace(/[\s-]/g, '').toUpperCase();
    if (!mat) return;
    const res = $('#c-res', d);
    res.innerHTML = '<div class="progreso"><span class="giro"></span>Buscando…</div>';
    try {
      const r = await api.historial(mat);
      if (!r.lecturas?.length) { res.innerHTML = '<p class="suave">No hay lecturas guardadas para esta matrícula.</p>'; return; }
      res.innerHTML = r.lecturas.map((x, i) => `<button class="btn fantasma ancho" style="margin:4px 0;justify-content:space-between" data-i="${i}"><span>${new Date(x.creada).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span><span>OT ${esc(x.ot || '—')}</span></button>`).join('');
      res.querySelectorAll('[data-i]').forEach((b) => b.onclick = (ev) => {
        ev.preventDefault();
        const x = r.lecturas[Number(b.dataset.i)];
        estado.lectura = x.lectura;
        estado.lecturaId = x.id;
        estado.ot = { ot: x.ot, matricula: x.matricula };
        estado.soloConsulta = true;
        d.close();
        insignias();
        ir('vehiculo');
      });
    } catch (err) {
      res.innerHTML = `<div class="aviso error">${esc(err.message)}</div>`;
    }
  };
}

// ---------------------------------------------------------------------------
// Utilidades de interfaz
// ---------------------------------------------------------------------------
function dialogo(html) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog">${html}</form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
  d.showModal();
  return d;
}

let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4500);
}

window.addEventListener('beforeunload', (e) => {
  if (estado.vivo.grabando) { e.preventDefault(); e.returnValue = ''; }
});

arrancar();
