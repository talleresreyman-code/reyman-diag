// Reyman Connect · app de cliente
// Pantallas: Inicio · Averías · Batería · Mantenimiento · Mi taller.
// Los datos se guardan en el móvil; solo salen hacia el taller si el cliente lo vincula y lo acepta.

import { cargar, guardar, borrarTodo } from './almacen.js';
import { crearTransporte, conectar, comprobarCoche, formasDeConectar, esNativa, WIFI_NATIVO_POR_DEFECTO } from './comprobacion.js';
import { peorGravedad, NIVELES } from '@reyman/obd-core/obd/gravedad.js';
import { evaluarTension, medirArranque, HistorialBateria, avisosBateria, TIPOS_BATERIA, evaluarReposo } from '@reyman/obd-core/bateria.js';
import { estadoMantenimiento, kmActuales } from '@reyman/obd-core/mantenimiento.js';
import { COCHES_SIM } from '@reyman/obd-core/transport/simulador.js';

const DEMO = globalThis.REYMAN_CONNECT_DEMO === true || new URLSearchParams(location.search).has('demo');
const API = globalThis.REYMAN_CONNECT_API || 'https://diag.talleresreyman.es';
const VERSION_CONSENTIMIENTO = '2026-11';
const TALLER_DEMO = {
  codigo: 'REYMAN',
  ficha: { nombre: 'Talleres Reyman', marca: 'CGA Car Service', telefono: '665 942 470', whatsapp: '34665942470', email: 'talleresreyman@gmail.com', direccion: 'Camino del Puente Viejo, 1D (frente C/ Ávila), 28500 Arganda del Rey, Madrid', horario: 'Lunes a jueves 8:00–16:00 · Viernes 8:00–15:00', web: 'https://www.talleresreyman.com' },
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtFechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtKm = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('es-ES')} km` : '—');
const fmtV = (v) => (Number.isFinite(v) ? `${v.toFixed(1).replace('.', ',')} V` : '—');

const I = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z"/></svg>',
  averias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 0 1 14 0v3H5z"/><path d="M3 18h18M12 8v3"/></svg>',
  bateria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V5h3v2M14 7V5h3v2M7 13h3M15.5 11.5v3M14 13h3"/></svg>',
  mant: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  taller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/></svg>',
  bt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg>',
  tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/></svg>',
};

const st = {
  datos: null,
  vista: 'inicio',
  sesion: null, // { transporte, elm, obd }
  ocupado: null, // texto del progreso
  error: null,
  midiendo: null, // { muestras }
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
async function persistir() { await guardar(st.datos); }

function ultimaLectura() { return st.datos.lecturas[0] || null; }

function historial() { return new HistorialBateria(st.datos.bateria); }

function km() { return kmActuales(st.datos.kmLecturas); }

function mantenimiento() {
  const m = st.datos.mantenimiento;
  return estadoMantenimiento({ ...m, km: km()?.km });
}

function estadoBateria() {
  const h = historial();
  const reposo = h.ultima('reposo');
  const motor = h.ultima('motor');
  const ultimoArranque = st.datos.arranques[0] || null;
  const tipo = st.datos.ajustes.tipoBateria;
  const evR = reposo ? evaluarReposo(reposo.tension, { tipo, compensacionV: 0 }) : null;
  const evM = motor ? evaluarTension(motor.tension, { compensacionV: 0 }) : null;
  return {
    reposo, motor, ultimoArranque, evR, evM,
    avisos: avisosBateria({ reposo: evR, carga: evM, arranque: ultimoArranque, tendencia: h.tendencia() }),
  };
}

function toast(txt) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = txt;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function dialogo(html) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="dlg">${html}</form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

function nivelColor(n) {
  return { parar: 'rojo', urgente: 'rojo', vencida: 'rojo', descargada: 'rojo', debil: 'rojo', baja: 'ambar', taller: 'ambar', aviso: 'ambar', pronto: 'ambar', justa: 'ambar', aceptable: 'ambar', vigilar: 'amarillo', info: 'azul' }[n] || 'verde';
}

// ---------------------------------------------------------------------------
// Conexión y comprobación
// ---------------------------------------------------------------------------
function log() {}

async function asegurarConexion(opDemo = {}) {
  if (st.sesion) return st.sesion;
  const op = DEMO ? { simulador: st.datos.demoCoche || 'diesel', ...opDemo } : { conexion: st.datos.conexion, adaptador: st.datos.adaptador, alElegir: (d) => { st.datos.adaptador = { deviceId: d.deviceId, nombre: d.name }; } };
  const transporte = await crearTransporte(op);
  st.sesion = await conectar(transporte, { log });
  transporte.alDesconectarse?.(() => { st.sesion = null; pintar(); toast('Se ha perdido la conexión con el adaptador.'); });
  return st.sesion;
}

async function desconectar() {
  const s = st.sesion;
  st.sesion = null;
  try { await s?.elm.cerrar(); } catch { /* */ }
  pintar();
}

function mensajeError(e) {
  if (e?.code === 'SIN_BLUETOOTH' || e?.code === 'SIN_WIFI') return e.message;
  if (st.datos.conexion?.tipo === 'wifi') return `${e?.message || 'Error desconocido'}${e?.code === 'SIN_ADAPTADOR' ? '' : '. Comprueba que estás conectado a la red Wi-Fi del adaptador y que el contacto está puesto.'}`;
  if (e?.code === 'SIN_VEHICULO') return e.message;
  if (/cancel/i.test(e?.message || '') || e?.name === 'NotFoundError') return null;
  return `${e?.message || 'Error desconocido'}. Comprueba que el adaptador está enchufado, que el contacto está puesto y que el Bluetooth del móvil está activado.`;
}

async function comprobar() {
  if (st.ocupado) return;
  st.error = null;
  st.ocupado = 'Conectando con el adaptador…';
  pintar();
  try {
    const s = await asegurarConexion();
    const r = await comprobarCoche(s, (txt) => { st.ocupado = txt; pintar(); });
    const d = st.datos;
    if (r.vehiculo?.valido) {
      d.vehiculo = { ...(d.vehiculo || {}), vin: r.vehiculo.vin, marca: r.vehiculo.marca, anio: r.vehiculo.año };
    }
    d.lecturas.unshift({ fecha: r.fecha, km: r.km ?? null, averias: r.averias.map((a) => ({ codigo: a.codigo, tipo: a.tipo, descripcion: a.descripcion, modulo: a.modulo })), tension: r.tension, situacion: r.situacion });
    d.lecturas = d.lecturas.slice(0, 20);
    if (r.km) d.kmLecturas.push({ fecha: r.fecha, km: r.km, origen: 'obd' });
    if (r.tension !== null) {
      const h = historial().agregar({ fecha: r.fecha, tension: r.bateria.tension, situacion: r.situacion, estado: r.bateria.estado });
      d.bateria = h.toJSON();
    }
    await persistir();
    toast(r.averias.length ? `Comprobado: ${r.averias.length} ${r.averias.length === 1 ? 'avería' : 'averías'}.` : 'Comprobado: sin averías.');
  } catch (e) {
    st.error = mensajeError(e);
    st.sesion = null;
  } finally {
    st.ocupado = null;
    pintar();
  }
}

// ---------------------------------------------------------------------------
// Pintado general
// ---------------------------------------------------------------------------
const VISTAS = [
  { id: 'inicio', nombre: 'Inicio', icono: I.inicio },
  { id: 'averias', nombre: 'Averías', icono: I.averias },
  { id: 'bateria', nombre: 'Batería', icono: I.bateria },
  { id: 'mant', nombre: 'Mantenimiento', icono: I.mant },
  { id: 'taller', nombre: 'Mi taller', icono: I.taller },
];

function pintar() {
  const raiz = document.getElementById('app');
  const v = st.vista;
  raiz.innerHTML = `
    <header class="cab">
      <img class="logo" src="${esc(globalThis.REYMAN_LOGO || 'logo.png')}" alt="Talleres Reyman">
      <div class="cab-txt"><strong>Reyman Connect</strong>${DEMO ? '<span class="demo">Demostración</span>' : ''}</div>
      <span class="punto ${st.sesion ? 'on' : ''}" title="${st.sesion ? 'Adaptador conectado' : 'Sin conectar'}"></span>
    </header>
    <main id="vista" tabindex="-1">${{ inicio: vInicio, averias: vAverias, bateria: vBateria, mant: vMant, taller: vTaller }[v]()}</main>
    <nav class="tabs" aria-label="Secciones">${VISTAS.map((x) => `<button data-vista="${x.id}" ${x.id === v ? 'aria-current="page"' : ''}>${x.icono}<span>${x.nombre}</span></button>`).join('')}</nav>`;
  raiz.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.vista; pintar(); window.scrollTo(0, 0); }));
  ({ inicio: eInicio, averias: eAverias, bateria: eBateria, mant: eMant, taller: eTaller }[v])(raiz);
}

function bloqueOcupado() {
  if (st.ocupado) return `<div class="panel progreso" role="status"><span class="giro"></span>${esc(st.ocupado)}</div>`;
  if (st.error) return `<div class="aviso rojo" role="alert"><strong>No se ha podido comprobar.</strong> ${esc(st.error)}</div>`;
  return '';
}

function avisoLista(avisos) {
  if (!avisos.length) return '';
  return `<ul class="avisos">${avisos.map((a) => `<li class="aviso ${nivelColor(a.nivel)}">${esc(a.texto)}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------
function vInicio() {
  const d = st.datos;
  const l = ultimaLectura();
  const veh = d.vehiculo;
  const codigos = l ? l.averias.map((a) => a.codigo) : [];
  const g = l ? peorGravedad(codigos) : null;
  const b = estadoBateria();
  const m = mantenimiento();
  const kmA = km();
  const avisos = [
    ...(g === 'parar' ? [{ nivel: 'urgente', texto: NIVELES.parar.texto }] : []),
    ...b.avisos,
    ...m.avisos,
  ];
  const fichaAv = !l ? ['gris', 'Sin comprobar', 'Pulsa «Comprobar mi coche»'] : !codigos.length ? ['verde', 'Sin averías', fmtFechaHora(l.fecha)] : [nivelColor(g), `${codigos.length} ${codigos.length === 1 ? 'avería' : 'averías'}`, NIVELES[g].titulo];
  const bEst = b.ultimoArranque?.estado === 'debil' ? b.ultimoArranque.estado : b.evR?.estado || (b.evM ? b.evM.estado : null);
  const fichaBat = !bEst ? ['gris', 'Sin datos', 'Se mide al comprobar'] : [nivelColor(bEst), b.reposo ? fmtV(b.reposo.tension) : fmtV(b.motor?.tension), b.ultimoArranque?.estado === 'debil' ? 'Arranque débil' : (b.evR || b.evM).mensaje.split('.')[0]];
  const rev = m.revision;
  const fichaMant = !rev ? ['gris', 'Sin configurar', 'Apunta tu última revisión'] : [nivelColor(rev.estado), rev.estado === 'vencida' ? 'Revisión vencida' : rev.kmRestantes !== null ? `Faltan ${fmtKm(Math.max(0, rev.kmRestantes))}` : `Faltan ${Math.max(0, rev.diasRestantes)} días`, `Toca antes del ${fmtFecha(rev.venceFecha)}`];
  return `
    <section class="coche panel">
      <div class="coche-top">
        <div>
          <p class="etq">Mi coche</p>
          <h1>${veh ? esc(veh.alias || [veh.marca, veh.anio].filter(Boolean).join(' · ') || 'Mi coche') : 'Sin identificar'}</h1>
          <p class="suave">${veh?.matricula ? `<span class="matricula">${esc(veh.matricula)}</span>` : '<button class="enlace" id="mat-editar">Añadir matrícula</button>'} ${kmA ? `· ${fmtKm(kmA.km)}${kmA.estimado ? ' (estimado)' : ''}` : ''}</p>
        </div>
        ${veh?.matricula ? '<button class="enlace" id="mat-editar" aria-label="Editar datos del coche">Editar</button>' : ''}
      </div>
      <button class="btn grande" id="comprobar" ${st.ocupado ? 'disabled' : ''}>${I.bt} ${st.sesion ? 'Comprobar de nuevo' : 'Comprobar mi coche'}</button>
      ${!st.sesion && !st.ocupado ? `<p class="peq suave centrado">${DEMO ? 'Modo demostración: usa un coche simulado.' : 'Enchufa el adaptador en la toma OBD (bajo el volante) y pon el contacto.'}</p>` : ''}
      ${st.sesion ? '<button class="enlace centrado" id="desconectar">Desconectar el adaptador</button>' : ''}
      ${!DEMO ? `<p class="peq suave centrado">Adaptador: ${esc(textoConexion())} · <button class="enlace" id="adaptador">Cambiar</button></p>` : ''}
    </section>
    ${bloqueOcupado()}
    <section class="fichas">
      ${ficha('averias', 'Averías', fichaAv)}
      ${ficha('bateria', 'Batería', fichaBat)}
      ${ficha('mant', 'Mantenimiento', fichaMant)}
    </section>
    ${avisoLista(avisos)}
    ${d.taller ? `<section class="panel mini-taller"><p class="etq">Mi taller</p><strong>${esc(d.taller.ficha.nombre)}</strong><div class="fila-btn"><a class="btn sec" href="tel:${esc(d.taller.ficha.telefono.replace(/\s/g, ''))}">${I.tel} Llamar</a><button class="btn sec" data-ir="taller">Pedir cita</button></div></section>` : `<section class="panel"><p><strong>¿Quieres que tu taller te avise?</strong></p><p class="suave peq">Vincula tu taller para enviarle las averías con un toque y pedir cita.</p><button class="btn sec" data-ir="taller">Vincular mi taller</button></section>`}
    ${DEMO ? `<section class="panel demo-ctl"><label for="demo-coche" class="etq">Coche simulado</label><select id="demo-coche">${Object.entries(COCHES_SIM).map(([k, c]) => `<option value="${k}" ${k === (d.demoCoche || 'diesel') ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select><button class="enlace" id="demo-reset">Borrar los datos de la demostración</button></section>` : ''}`;
}

function ficha(vista, titulo, [color, valor, detalle]) {
  return `<button class="ficha ${color}" data-ir="${vista}"><span class="etq">${esc(titulo)}</span><strong>${esc(valor)}</strong><span class="peq">${esc(detalle)}</span></button>`;
}

function eInicio(el) {
  $('#comprobar', el)?.addEventListener('click', comprobar);
  $('#desconectar', el)?.addEventListener('click', desconectar);
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.ir; pintar(); window.scrollTo(0, 0); }));
  el.querySelectorAll('#mat-editar').forEach((b) => b.addEventListener('click', dialogoCoche));
  $('#adaptador', el)?.addEventListener('click', dialogoAdaptador);
  $('#demo-coche', el)?.addEventListener('change', async (e) => { st.datos.demoCoche = e.target.value; await desconectar(); await persistir(); toast('Coche simulado cambiado.'); });
  $('#demo-reset', el)?.addEventListener('click', async () => { await borrarTodo(); st.datos = await cargar(); await desconectar(); toast('Datos borrados.'); });
}

function textoConexion() {
  const c = st.datos.conexion || { tipo: 'ble' };
  if (c.tipo === 'wifi') return `Wi-Fi ${c.host || WIFI_NATIVO_POR_DEFECTO.host}`;
  return st.datos.adaptador?.nombre ? `Bluetooth (${st.datos.adaptador.nombre})` : 'Bluetooth';
}

// Bluetooth (vLinker, WiCAN Pro con BLE, ELM327 BLE) o Wi-Fi (WiCAN Pro, ELM327 Wi-Fi)
function dialogoAdaptador() {
  const c = st.datos.conexion || { tipo: 'ble' };
  const d = dialogo(`<h2>Adaptador</h2>
    <label class="check"><input type="radio" name="a-tipo" value="ble" ${c.tipo !== 'wifi' ? 'checked' : ''}> <span><strong>Bluetooth</strong><br><span class="peq suave">vLinker, WiCAN Pro con Bluetooth activado (clave 123456) u otro ELM327 Bluetooth LE.</span></span></label>
    <label class="check"><input type="radio" name="a-tipo" value="wifi" ${c.tipo === 'wifi' ? 'checked' : ''}> <span><strong>Wi-Fi</strong><br><span class="peq suave">WiCAN Pro u otro ELM327 Wi-Fi. Antes, conecta el móvil a la red Wi-Fi del adaptador (WiCAN_…).</span></span></label>
    <div id="a-wifi" ${c.tipo === 'wifi' ? '' : 'hidden'}>
      <label class="campo"><span>Dirección</span><input id="a-host" value="${esc(c.host || WIFI_NATIVO_POR_DEFECTO.host)}" inputmode="decimal"></label>
      <label class="campo"><span>Puerto</span><input id="a-puerto" value="${esc(c.puerto || WIFI_NATIVO_POR_DEFECTO.puerto)}" inputmode="numeric"></label>
    </div>
    ${st.datos.adaptador ? `<p class="peq suave">Bluetooth recordado: ${esc(st.datos.adaptador.nombre || 'adaptador')} · <button class="enlace" id="a-olvidar" type="button">Olvidar</button></p>` : ''}
    <div class="fila-btn"><button class="btn fantasma" value="cancel">Cancelar</button><button class="btn" id="a-ok" value="ok">Guardar</button></div>`);
  d.querySelectorAll('[name="a-tipo"]').forEach((r) => r.addEventListener('change', () => { $('#a-wifi', d).hidden = d.querySelector('[name="a-tipo"]:checked').value !== 'wifi'; }));
  $('#a-olvidar', d)?.addEventListener('click', async () => { st.datos.adaptador = null; await persistir(); toast('Adaptador Bluetooth olvidado: la próxima vez se buscará de nuevo.'); d.close(); pintar(); });
  $('#a-ok', d).addEventListener('click', async () => {
    const tipo = d.querySelector('[name="a-tipo"]:checked').value;
    st.datos.conexion = tipo === 'wifi'
      ? { tipo, host: $('#a-host', d).value.trim() || WIFI_NATIVO_POR_DEFECTO.host, puerto: Number($('#a-puerto', d).value) || WIFI_NATIVO_POR_DEFECTO.puerto }
      : { tipo: 'ble' };
    await desconectar();
    await persistir();
    pintar();
  });
}

function dialogoCoche() {
  const v = st.datos.vehiculo || {};
  const d = dialogo(`<h2>Mi coche</h2>
    <label class="campo"><span>Matrícula</span><input id="c-mat" value="${esc(v.matricula || '')}" autocapitalize="characters" maxlength="10" placeholder="1234ABC"></label>
    <label class="campo"><span>Nombre (opcional)</span><input id="c-alias" value="${esc(v.alias || '')}" maxlength="40" placeholder="El Golf de casa"></label>
    <label class="campo"><span>Kilómetros actuales (si los sabes)</span><input id="c-km" inputmode="numeric" placeholder="${esc(km()?.km || '')}"></label>
    <div class="fila-btn"><button class="btn fantasma" value="cancel">Cancelar</button><button class="btn" id="c-ok" value="ok">Guardar</button></div>`);
  $('#c-ok', d).addEventListener('click', async () => {
    st.datos.vehiculo = { ...v, matricula: $('#c-mat', d).value.replace(/[\s-]/g, '').toUpperCase() || null, alias: $('#c-alias', d).value.trim() || null };
    const k = Number($('#c-km', d).value.replace(/\D/g, ''));
    if (k > 0) st.datos.kmLecturas.push({ fecha: new Date().toISOString(), km: k, origen: 'manual' });
    await persistir();
    pintar();
  });
}

// ---------------------------------------------------------------------------
// Averías
// ---------------------------------------------------------------------------
function vAverias() {
  const l = ultimaLectura();
  if (!l) return `<h1>Averías</h1>${bloqueOcupado()}<div class="panel vacio"><p>Todavía no has comprobado el coche.</p><button class="btn" id="comprobar">Comprobar ahora</button></div>`;
  const lista = l.averias.map((a) => ({ ...a, g: NIVELES[peorGravedad([a.codigo])] }));
  const tipo = { confirmada: 'Activa', pendiente: 'Pendiente (ha aparecido alguna vez)', permanente: 'Guardada' };
  return `<h1>Averías</h1>
    <p class="suave peq">Comprobado el ${esc(fmtFechaHora(l.fecha))}.</p>
    ${bloqueOcupado()}
    ${!lista.length ? '<div class="panel ok-grande"><strong>Sin averías</strong><p class="suave">El motor no tiene ningún código de avería guardado.</p></div>' : ''}
    <ul class="lista-averias">${lista.map((a) => `
      <li class="averia ${nivelColor(a.g.nivel)}">
        <div class="averia-cab"><span class="codigo">${esc(a.codigo)}</span><span class="insignia ${nivelColor(a.g.nivel)}">${esc(a.g.titulo)}</span></div>
        <p class="desc">${esc(a.descripcion)}</p>
        <p class="peq suave">${esc(tipo[a.tipo] || a.tipo)}${a.modulo ? ` · ${esc(a.modulo)}` : ''}</p>
        <p class="peq">${esc(a.g.texto)}${a.g.nota ? ` ${esc(a.g.nota)}` : ''}</p>
      </li>`).join('')}</ul>
    <div class="fila-btn col">
      <button class="btn" id="comprobar" ${st.ocupado ? 'disabled' : ''}>Comprobar de nuevo</button>
      ${lista.length && st.datos.taller ? '<button class="btn sec" id="enviar-taller">Enviar las averías a mi taller</button>' : ''}
      ${lista.length ? '<button class="btn fantasma peligro-txt" id="borrar">Apagar el testigo (borrar averías)</button>' : ''}
    </div>
    <p class="peq suave">La gravedad es orientativa. Ante cualquier duda, consulta con tu taller.</p>`;
}

function eAverias(el) {
  el.querySelectorAll('#comprobar').forEach((b) => b.addEventListener('click', comprobar));
  $('#enviar-taller', el)?.addEventListener('click', () => enviarAlTaller('estado'));
  $('#borrar', el)?.addEventListener('click', dialogoBorrar);
}

function dialogoBorrar() {
  const d = dialogo(`<h2>Apagar el testigo</h2>
    <div class="aviso ambar"><strong>Borrar las averías no repara nada.</strong> Si el fallo sigue, el testigo volverá a encenderse. Además se borra la información que necesita el taller para diagnosticar.</div>
    <label class="check"><input type="checkbox" id="b-ok"> Lo entiendo: quiero borrar las averías</label>
    <div class="fila-btn"><button class="btn fantasma" value="cancel">Cancelar</button><button class="btn peligro" id="b-si" value="ok" disabled>Borrar</button></div>`);
  $('#b-ok', d).addEventListener('change', (e) => { $('#b-si', d).disabled = !e.target.checked; });
  $('#b-si', d).addEventListener('click', async () => {
    st.ocupado = 'Borrando averías…';
    pintar();
    try {
      const s = await asegurarConexion();
      await s.obd.borrarAverias();
      st.ocupado = null;
      toast('Averías borradas. Comprobando de nuevo…');
      await comprobar();
    } catch (e) {
      st.ocupado = null;
      st.error = mensajeError(e);
      pintar();
    }
  });
}

// ---------------------------------------------------------------------------
// Batería
// ---------------------------------------------------------------------------
function vBateria() {
  const b = estadoBateria();
  const ev = b.evR || b.evM;
  const h = historial();
  const reposos = h.lecturas.filter((x) => x.situacion === 'reposo').slice(-30);
  const a = b.ultimoArranque;
  const midiendo = st.midiendo;
  return `<h1>Batería</h1>
    ${bloqueOcupado()}
    <section class="panel bat-grande ${ev ? nivelColor(ev.estado) : 'gris'}">
      ${b.reposo ? `<p class="etq">En reposo · ${esc(fmtFechaHora(b.reposo.fecha))}</p><p class="cifra">${esc(fmtV(b.reposo.tension))}</p><p><strong>${esc(b.evR.mensaje)}</strong></p><p class="suave peq">Carga aproximada: ${b.evR.carga} %</p>` : '<p class="etq">En reposo</p><p class="suave">Sin datos todavía. Comprueba el coche con el motor parado y el contacto puesto, mejor por la mañana antes de arrancar.</p>'}
      ${b.motor ? `<p class="peq">Con el motor en marcha: <strong>${esc(fmtV(b.motor.tension))}</strong> · ${esc(b.evM.mensaje)}</p>` : ''}
    </section>
    <section class="panel">
      <h2>Prueba de arranque</h2>
      <p class="suave peq">La mejor forma de saber si la batería aguanta. Con el contacto puesto y el motor parado, pulsa «Medir» y arranca el coche.</p>
      ${midiendo ? `<div class="progreso" role="status"><span class="giro"></span>${midiendo.muestras.length < 3 ? 'Preparado: arranca el coche ahora…' : 'Midiendo…'}</div><canvas id="curva" width="640" height="220" aria-label="Tensión durante el arranque"></canvas>` : ''}
      ${!midiendo && a ? `<div class="resultado ${nivelColor(a.estado)}"><strong>${esc(a.mensaje)}</strong><p class="peq">Tensión mientras arranca: ${esc(fmtV(a.minimo))} · ${esc(fmtFechaHora(a.fecha))}</p></div><canvas id="curva" width="640" height="220" aria-label="Tensión durante el último arranque"></canvas>` : ''}
      <button class="btn" id="medir" ${st.ocupado || midiendo ? 'disabled' : ''}>Medir arranque</button>
    </section>
    ${avisoLista(b.avisos)}
    ${reposos.length >= 2 ? `<section class="panel"><h2>Historial en reposo</h2><canvas id="hist" width="640" height="180" aria-label="Historial de tensión en reposo"></canvas><p class="peq suave">${reposos.length} medidas desde el ${esc(fmtFecha(reposos[0].fecha))}.</p></section>` : ''}
    <section class="panel">
      <label class="campo"><span>Tipo de batería</span><select id="tipo-bat">${Object.entries(TIPOS_BATERIA).map(([k, t]) => `<option value="${k}" ${k === st.datos.ajustes.tipoBateria ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>
      <p class="peq suave">Si tu coche tiene start-stop, normalmente es AGM. Si no lo sabes, déjalo en convencional.</p>
    </section>`;
}

function dibujar(canvas, puntos, { min, max, lineas = [], etiquetaX = (x) => x } = {}) {
  if (!canvas || puntos.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height; const m = { l: 44, r: 10, t: 10, b: 24 };
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim() || '#1d57a5';
  const xs = puntos.map((p) => p.x); const ys = puntos.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = min ?? Math.min(...ys) - 0.3; const y1 = max ?? Math.max(...ys) + 0.3;
  const X = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  ctx.clearRect(0, 0, W, H);
  ctx.font = '20px Barlow, sans-serif';
  ctx.fillStyle = color('--gris');
  ctx.strokeStyle = color('--linea');
  ctx.lineWidth = 1;
  for (const v of [y0, (y0 + y1) / 2, y1]) {
    ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(W - m.r, Y(v)); ctx.stroke();
    ctx.fillText(v.toFixed(1), 2, Y(v) + 6);
  }
  for (const l of lineas) {
    ctx.strokeStyle = color(l.color); ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(m.l, Y(l.y)); ctx.lineTo(W - m.r, Y(l.y)); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color('--gris');
  ctx.fillText(etiquetaX(x0), m.l, H - 2);
  const t1 = etiquetaX(x1); ctx.fillText(t1, W - m.r - ctx.measureText(t1).width, H - 2);
  ctx.strokeStyle = color('--azul'); ctx.lineWidth = 3;
  ctx.beginPath();
  puntos.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
  ctx.stroke();
}

function dibujarCurva(el) {
  const muestras = st.midiendo?.muestras || st.datos.arranques[0]?.muestras || [];
  dibujar($('#curva', el), muestras.map((m) => ({ x: m.t / 1000, y: m.v })), { min: 8, max: 15, lineas: [{ y: 9.6, color: '--rojo' }, { y: 10, color: '--ambar' }], etiquetaX: (x) => `${x.toFixed(1)} s` });
}

function eBateria(el) {
  dibujarCurva(el);
  const reposos = historial().lecturas.filter((x) => x.situacion === 'reposo').slice(-30);
  dibujar($('#hist', el), reposos.map((r, i) => ({ x: i, y: r.tension })), { min: 11.6, max: 13, lineas: [{ y: 12.3, color: '--ambar' }], etiquetaX: (x) => fmtFecha(reposos[Math.round(x)]?.fecha) });
  $('#medir', el)?.addEventListener('click', medir);
  $('#tipo-bat', el)?.addEventListener('change', async (e) => { st.datos.ajustes.tipoBateria = e.target.value; await persistir(); pintar(); });
}

async function medir() {
  st.error = null;
  st.ocupado = 'Conectando con el adaptador…';
  pintar();
  try {
    const s = await asegurarConexion();
    st.ocupado = null;
    st.midiendo = { muestras: [] };
    pintar();
    if (DEMO) { s.transporte._pararMotor?.(); setTimeout(() => s.transporte._arrancar?.(), 1500); }
    let ultimoPintado = 0;
    const { muestras, analisis } = await medirArranque(s.elm, {
      duracionMs: 10000,
      intervaloMs: 40,
      alMuestra: (m) => {
        st.midiendo.muestras.push(m);
        if (Date.now() - ultimoPintado > 250) { ultimoPintado = Date.now(); const c = $('#curva'); if (c) dibujarCurva(document); if (st.midiendo.muestras.length === 3) pintar(); }
      },
    });
    st.midiendo = null;
    if (!analisis?.detectado) {
      toast('No se ha detectado el arranque. Vuelve a intentarlo.');
    } else {
      const fecha = new Date().toISOString();
      st.datos.arranques.unshift({ fecha, minimo: analisis.minimo, estado: analisis.estado, mensaje: analisis.mensaje, muestras: muestras.map((m) => ({ t: m.t, v: m.v })) });
      st.datos.arranques = st.datos.arranques.slice(0, 5);
      st.datos.bateria = historial().agregar({ fecha, tension: analisis.despues, situacion: 'motor', estado: analisis.carga === 'correcta' ? 'correcta' : 'baja' }).toJSON();
      await persistir();
    }
  } catch (e) {
    st.midiendo = null;
    st.error = mensajeError(e);
    st.sesion = null;
  } finally {
    st.ocupado = null;
    pintar();
  }
}

// ---------------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------------
function barra(porc, color) { return `<div class="barra"><span class="${color}" style="width:${Math.min(100, Math.max(2, porc))}%"></span></div>`; }

function vMant() {
  const m = st.datos.mantenimiento;
  const e = mantenimiento();
  const kmA = km();
  return `<h1>Mantenimiento</h1>
    <section class="panel">
      <p class="etq">Kilómetros</p>
      <p class="cifra-m">${kmA ? esc(fmtKm(kmA.km)) : '—'}</p>
      <p class="peq suave">${kmA ? (kmA.estimado ? `Estimado con tu ritmo (${Math.round(kmA.kmDia || 0)} km/día). Se corrige al comprobar el coche.` : 'Leído del coche.') : 'Algunos coches no dan los km por la toma OBD: apúntalos a mano.'}</p>
      <button class="enlace" id="km-manual">Apuntar los km a mano</button>
    </section>
    <section class="panel">
      <h2>Revisión</h2>
      ${e.revision ? `${barra(e.revision.porcentaje, nivelColor(e.revision.estado))}
        <p><strong>${e.revision.estado === 'vencida' ? 'Vencida' : e.revision.kmRestantes !== null ? `Faltan ${esc(fmtKm(Math.max(0, e.revision.kmRestantes)))}` : `Faltan ${Math.max(0, e.revision.diasRestantes)} días`}</strong> · como muy tarde el ${esc(fmtFecha(e.revision.venceFecha))}</p>` : '<p class="suave">Apunta cuándo fue la última revisión para avisarte de la siguiente.</p>'}
      <div class="dos">
        <label class="campo"><span>Última revisión</span><input type="date" id="r-fecha" value="${esc(m.ultimaRevision?.fecha || '')}"></label>
        <label class="campo"><span>Km en esa revisión</span><input id="r-km" inputmode="numeric" value="${esc(m.ultimaRevision?.km ?? '')}"></label>
        <label class="campo"><span>Cada (km)</span><input id="r-ikm" inputmode="numeric" value="${esc(m.intervaloKm)}"></label>
        <label class="campo"><span>Cada (meses)</span><input id="r-imes" inputmode="numeric" value="${esc(m.intervaloMeses)}"></label>
      </div>
      <p class="peq suave">Si no sabes los intervalos de tu coche, pregunta en tu taller. 15.000 km o 12 meses es lo más habitual.</p>
    </section>
    <section class="panel">
      <h2>ITV</h2>
      ${e.itv ? `<p><strong>${e.itv.estado === 'vencida' ? 'Caducada' : `Caduca en ${e.itv.diasRestantes} días`}</strong> · ${esc(fmtFecha(e.itv.fecha))}</p>` : ''}
      <label class="campo"><span>Fecha de caducidad de la ITV</span><input type="date" id="itv-fecha" value="${esc(m.itv?.fecha || '')}"></label>
    </section>
    <button class="btn" id="m-guardar">Guardar</button>
    ${avisoLista(e.avisos)}
    ${st.datos.taller && e.avisos.length ? '<button class="btn sec" data-ir="taller">Pedir cita en mi taller</button>' : ''}`;
}

function eMant(el) {
  $('#km-manual', el)?.addEventListener('click', dialogoCoche);
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.ir; pintar(); }));
  $('#m-guardar', el)?.addEventListener('click', async () => {
    const n = (id) => { const v = Number($(id, el).value.replace(/\D/g, '')); return v > 0 ? v : null; };
    const m = st.datos.mantenimiento;
    const f = $('#r-fecha', el).value;
    m.ultimaRevision = f ? { fecha: f, km: n('#r-km') } : null;
    m.intervaloKm = n('#r-ikm') || 15000;
    m.intervaloMeses = n('#r-imes') || 12;
    m.itv = $('#itv-fecha', el).value ? { fecha: $('#itv-fecha', el).value } : null;
    await persistir();
    toast('Guardado.');
    pintar();
  });
}

// ---------------------------------------------------------------------------
// Mi taller
// ---------------------------------------------------------------------------
function vTaller() {
  const t = st.datos.taller;
  if (!t) {
    return `<h1>Mi taller</h1>
      <section class="panel">
        <p>Vincula tu taller para enviarle las averías y el estado del coche con un toque, y pedir cita.</p>
        <label class="campo"><span>Código del taller</span><input id="t-codigo" autocapitalize="characters" placeholder="REYMAN" value="REYMAN"></label>
        <p class="peq suave">Lo tienes en tu factura o en el código QR del taller.</p>
        <button class="btn" id="t-buscar">Buscar taller</button>
      </section>
      <section class="panel peq suave"><strong>Tus datos son tuyos.</strong> Sin vincular un taller, nada sale de tu móvil. Al vincularlo, solo se envía lo que tú decides enviar.</section>`;
  }
  const f = t.ficha;
  return `<h1>Mi taller</h1>
    <section class="panel taller-ficha">
      <h2>${esc(f.nombre)}</h2>${f.marca ? `<p class="suave peq">${esc(f.marca)}</p>` : ''}
      <p>${esc(f.direccion)}</p>
      <p class="peq suave">${esc(f.horario)}</p>
      <div class="fila-btn">
        <a class="btn sec" href="tel:${esc(f.telefono.replace(/\s/g, ''))}">${I.tel} Llamar</a>
        ${f.whatsapp ? `<a class="btn sec" href="https://wa.me/${esc(f.whatsapp)}" target="_blank" rel="noopener">${I.wa} WhatsApp</a>` : ''}
      </div>
    </section>
    <section class="panel">
      <h2>Enviar el estado del coche</h2>
      <p class="suave peq">Se envían las averías, los km y la batería de la última comprobación${ultimaLectura() ? ` (${esc(fmtFechaHora(ultimaLectura().fecha))})` : ''}.</p>
      <button class="btn" id="t-estado" ${ultimaLectura() ? '' : 'disabled'}>Enviar al taller</button>
    </section>
    <section class="panel">
      <h2>Pedir cita</h2>
      <label class="campo"><span>Tu nombre</span><input id="c-nombre" autocomplete="name" value="${esc(st.datos.contacto?.nombre || '')}"></label>
      <label class="campo"><span>Tu teléfono</span><input id="c-tel" type="tel" autocomplete="tel" value="${esc(st.datos.contacto?.telefono || '')}"></label>
      <label class="campo"><span>¿Qué le pasa al coche? (opcional)</span><textarea id="c-msg" rows="3" maxlength="1000"></textarea></label>
      <button class="btn" id="t-cita">Pedir cita</button>
      <p class="peq suave">El taller te llamará para darte día y hora.</p>
    </section>
    <p class="peq suave">Vinculado el ${esc(fmtFecha(t.consentimiento.fecha))}. <button class="enlace" id="t-quitar">Desvincular el taller</button></p>`;
}

function eTaller(el) {
  $('#t-buscar', el)?.addEventListener('click', async () => {
    const codigo = $('#t-codigo', el).value.trim().toUpperCase();
    if (!codigo) return;
    try {
      const ficha = DEMO ? (codigo === 'REYMAN' ? TALLER_DEMO.ficha : null) : (await pedirApi(`/api/connect/talleres/${encodeURIComponent(codigo)}`)).taller;
      if (!ficha) throw new Error('No hay ningún taller con ese código.');
      dialogoConsentimiento(codigo, ficha);
    } catch (e) { toast(e.message); }
  });
  $('#t-estado', el)?.addEventListener('click', () => enviarAlTaller('estado'));
  $('#t-cita', el)?.addEventListener('click', () => {
    const nombre = $('#c-nombre', el).value.trim();
    const telefono = $('#c-tel', el).value.trim();
    if (!nombre || telefono.replace(/\D/g, '').length < 9) return toast('Escribe tu nombre y un teléfono válido.');
    st.datos.contacto = { nombre, telefono };
    enviarAlTaller('cita', { contacto: { nombre, telefono }, mensaje: $('#c-msg', el).value.trim() });
  });
  $('#t-quitar', el)?.addEventListener('click', async () => { st.datos.taller = null; await persistir(); toast('Taller desvinculado.'); pintar(); });
}

function dialogoConsentimiento(codigo, ficha) {
  const d = dialogo(`<h2>Vincular ${esc(ficha.nombre)}</h2>
    <p>Cuando tú lo pidas, la app enviará a <strong>${esc(ficha.nombre)}</strong>:</p>
    <ul class="peq"><li>La matrícula y el bastidor del coche.</li><li>Las averías, los kilómetros y el estado de la batería.</li><li>Tu nombre y teléfono, solo si pides cita.</li></ul>
    <p class="peq suave">El taller usará estos datos para atenderte y contactar contigo. Nunca se envía tu ubicación. Puedes desvincularlo cuando quieras.</p>
    <label class="check"><input type="checkbox" id="k-ok"> Acepto enviar estos datos al taller cuando yo lo pida</label>
    <div class="fila-btn"><button class="btn fantasma" value="cancel">Cancelar</button><button class="btn" id="k-si" value="ok" disabled>Vincular</button></div>`);
  $('#k-ok', d).addEventListener('change', (e) => { $('#k-si', d).disabled = !e.target.checked; });
  $('#k-si', d).addEventListener('click', async () => {
    st.datos.taller = { codigo, ficha, consentimiento: { version: VERSION_CONSENTIMIENTO, fecha: new Date().toISOString() } };
    await persistir();
    toast(`${ficha.nombre} vinculado.`);
    pintar();
  });
}

async function pedirApi(ruta, cuerpo) {
  const r = await fetch(API + ruta, cuerpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se ha podido contactar con el taller. Revisa la conexión a internet.');
  return j;
}

async function enviarAlTaller(tipo, extra = {}) {
  const t = st.datos.taller;
  if (!t) return;
  const l = ultimaLectura();
  const b = estadoBateria();
  const cuerpo = {
    codigoTaller: t.codigo, tipo,
    matricula: st.datos.vehiculo?.matricula || null, vin: st.datos.vehiculo?.vin || null,
    vehiculo: st.datos.vehiculo ? { marca: st.datos.vehiculo.marca, anio: st.datos.vehiculo.anio } : null,
    km: km()?.km || null,
    averias: (l?.averias || []).map((a) => ({ codigo: a.codigo, tipo: a.tipo, descripcion: a.descripcion, gravedad: peorGravedad([a.codigo]) })),
    bateria: b.reposo || b.motor ? { tension: (b.reposo || b.motor).tension, estado: (b.evR || b.evM).estado, situacion: b.reposo ? 'reposo' : 'motor', minimoArranque: b.ultimoArranque?.minimo || null } : null,
    consentimiento: { aceptado: true, ...t.consentimiento },
    ...extra,
  };
  try {
    if (DEMO) await new Promise((r) => setTimeout(r, 600));
    else await pedirApi('/api/connect/avisos', cuerpo);
    await persistir();
    toast(tipo === 'cita' ? `Petición enviada. ${t.ficha.nombre} te llamará.` : `Enviado a ${t.ficha.nombre}.`);
    pintar();
  } catch (e) { toast(e.message); }
}

// ---------------------------------------------------------------------------
async function iniciar() {
  st.datos = await cargar();
  if (!st.datos.conexion) st.datos.conexion = { tipo: 'ble' };
  if (!DEMO && !esNativa() && !formasDeConectar().webBle) st.error = 'Este navegador no permite Bluetooth. Usa la app Reyman Connect o Chrome en Android.';
  pintar();
}

iniciar();
