// Reyman Connect · diagnóstico con el adaptador OBD (opcional para el cliente)
// Pestaña «Diagnóstico»: comprobar el coche, averías, batería y revisión/ITV que lleva la propia app.

import { st, DEMO, persistir, pintar, ir } from '../estado.js';
import { $, esc, fmtFecha, fmtFechaHora, fmtKm, fmtV, I, toast, dialogo, nivelColor, avisoLista } from '../ui.js';
import { cargar, borrarTodo } from '../almacen.js';
import { crearTransporte, conectar, comprobarCoche, WIFI_NATIVO_POR_DEFECTO } from '../comprobacion.js';
import { peorGravedad, NIVELES } from '@reyman/obd-core/obd/gravedad.js';
import { evaluarTension, medirArranque, HistorialBateria, avisosBateria, TIPOS_BATERIA, evaluarReposo } from '@reyman/obd-core/bateria.js';
import { estadoMantenimiento, kmActuales } from '@reyman/obd-core/mantenimiento.js';
import { COCHES_SIM } from '@reyman/obd-core/transport/simulador.js';
import { abrirSolicitud } from './solicitud.js';

export function ultimaLectura() { return st.datos.lecturas[0] || null; }

export function historial() { return new HistorialBateria(st.datos.bateria); }

export function km() { return kmActuales(st.datos.kmLecturas); }

export function mantenimiento() {
  const m = st.datos.mantenimiento;
  return estadoMantenimiento({ ...m, km: km()?.km });
}

export function estadoBateria() {
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

function bloqueOcupado() {
  if (st.ocupado) return `<div class="panel progreso" role="status"><span class="giro"></span>${esc(st.ocupado)}</div>`;
  if (st.error) return `<div class="aviso rojo" role="alert"><strong>No se ha podido comprobar.</strong> ${esc(st.error)}</div>`;
  return '';
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
      ${lista.length ? `<button class="btn sec" id="enviar-taller">${I.wa} Contárselo al taller</button>` : ''}
      ${lista.length ? '<button class="btn fantasma peligro-txt" id="borrar">Apagar el testigo (borrar averías)</button>' : ''}
    </div>
    <p class="peq suave">La gravedad es orientativa. Ante cualquier duda, consulta con tu taller.</p>`;
}

function eAverias(el) {
  el.querySelectorAll('#comprobar').forEach((b) => b.addEventListener('click', comprobar));
  $('#enviar-taller', el)?.addEventListener('click', () => abrirSolicitud('averia', { coche: cocheApp(), sel: ['testigo'] }));
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
  return `<h1>Revisión e ITV</h1>
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
    ${e.avisos.length ? `<button class="btn sec" data-sol="mant" data-sel="${e.revision?.estado && e.revision.estado !== 'ok' ? 'revision' : 'preitv,itv'}" data-coche="${esc(cocheApp() || '')}">Pedir cita en el taller</button>` : ''}`;
}

function eMant(el) {
  $('#km-manual', el)?.addEventListener('click', dialogoCoche);
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
// Pestaña «Diagnóstico»: el coche que lleva el adaptador
// ---------------------------------------------------------------------------
/** Matrícula del coche de la app (para preseleccionarlo al pedir cita). */
export function cocheApp() {
  return String(st.datos.vehiculo?.matricula || '').replace(/[\s-]/g, '').toUpperCase() || (st.datos.vehiculo ? 'app' : null);
}

/** Códigos de avería de la última lectura (si es reciente, de los últimos 30 días). */
export function codigosRecientes() {
  const l = ultimaLectura();
  if (!l || Date.now() - new Date(l.fecha).getTime() > 30 * 86400000) return [];
  return l.averias.map((a) => a.codigo);
}

function ficha(vista, titulo, [color, valor, detalle]) {
  return `<button class="ficha ${color}" data-ir="${vista}"><span class="etq">${esc(titulo)}</span><strong>${esc(valor)}</strong><span class="peq">${esc(detalle)}</span></button>`;
}

// Ofrecer el adaptador a quien no lo tiene: se pide aquí, se recoge en el taller y le ayudamos a configurarlo.
// Apagado hasta que todo esté desarrollado (decisión de José, 21/11/2026).
export const OFRECER_ADAPTADOR = false;

function bloqueAdaptador() {
  if (!OFRECER_ADAPTADOR) return '';
  return `<button class="btn sec ancho" style="margin-bottom:10px" data-sol="consulta" data-sel="adaptador">${I.wa} Quiero el adaptador: lo recojo en el taller</button>`;
}

/** Sin adaptador todavía: qué es, cómo funciona y para qué sirve (más adelante, con fotos y vídeos). */
function vExplicacion() {
  const v = (ico, tit, txt) => `<li><span class="vt-ico">${ico}</span><span><strong>${tit}</strong><br><span class="peq suave">${txt}</span></span></li>`;
  return `<section class="diag-hero">
      <p class="etq">Diagnóstico desde tu móvil</p>
      <h1>Tu coche te habla.<br>Nosotros te lo traducimos.</h1>
      <p>Con un pequeño adaptador enchufado en el coche, esta app lee lo mismo que la máquina del taller y te lo explica en lenguaje claro.</p>
    </section>
    <section class="panel">
      <h2>¿Qué es?</h2>
      <p class="peq">Un aparato del tamaño de una llave USB que se enchufa en la <strong>toma OBD</strong> del coche, casi siempre bajo el volante, cerca de las rodillas. Se conecta al móvil por Bluetooth o Wi-Fi. La tienen todos los gasolina desde 2001 y los diésel desde 2004.</p>
      <div class="hueco-media">📷 Muy pronto: fotos de dónde está la toma en cada coche</div>
    </section>
    <section class="panel">
      <h2>¿Cómo funciona?</h2>
      <ol class="pasos-diag">
        <li><strong>Enchúfalo</strong> en la toma OBD. Se puede quedar puesto.</li>
        <li><strong>Pon el contacto</strong> y abre Reyman Connect.</li>
        <li>Pulsa <strong>«Comprobar mi coche»</strong>: en unos segundos ves las averías, la batería y los km.</li>
      </ol>
      <div class="hueco-media">▶️ Muy pronto: vídeo de 1 minuto con todo el proceso</div>
    </section>
    <section class="panel">
      <h2>¿Qué ganas teniéndolo?</h2>
      <ul class="ventajas">
        ${v('⚠️', 'Entiendes los testigos', 'Si se enciende uno, sabes qué significa y si puedes seguir circulando o tienes que parar.')}
        ${v('🔋', 'Batería sin sorpresas', 'Mide el arranque y la carga, y te avisa antes de que te deje tirado, sobre todo en invierno.')}
        ${v('🛠️', 'Mantenimiento al día', 'Lleva la cuenta de los kilómetros para recordarte la revisión a tiempo.')}
        ${v('📲', 'Se lo cuentas al taller en un toque', 'Nos llegan los códigos de la avería antes de que traigas el coche: vamos al grano y ahorras tiempo.')}
        ${v('🔒', 'Tus datos, en tu móvil', 'La app no manda nada a nadie si tú no lo pides.')}
      </ul>
    </section>
    <section class="panel">
      <p class="peq suave">${OFRECER_ADAPTADOR ? '' : 'Muy pronto podrás pedirlo y recogerlo en el taller, y te lo dejaremos configurado. '}Si ya tienes un adaptador OBD (vLinker, WiCAN, ELM327 Bluetooth…), puedes usarlo ya.</p>
      ${bloqueAdaptador()}
      <button class="btn ancho" id="ya-tengo">${I.bt} ${st.datos.lecturas.length || st.datos.ajustes.tengoAdaptador ? 'Volver a mi adaptador' : 'Ya tengo un adaptador: conectar'}</button>
    </section>`;
}

export function vDiag() {
  const d = st.datos;
  if (st.verExplicacion || (!d.lecturas.length && !st.sesion && !d.ajustes.tengoAdaptador)) return vExplicacion();
  const l = ultimaLectura();
  const veh = d.vehiculo;
  const codigos = l ? l.averias.map((a) => a.codigo) : [];
  const g = l ? peorGravedad(codigos) : null;
  const b = estadoBateria();
  const m = mantenimiento();
  const kmA = km();
  const avisos = [...(g === 'parar' ? [{ nivel: 'urgente', texto: NIVELES.parar.texto }] : []), ...b.avisos];
  const fichaAv = !l ? ['gris', 'Sin comprobar', 'Pulsa «Comprobar mi coche»'] : !codigos.length ? ['verde', 'Sin averías', fmtFechaHora(l.fecha)] : [nivelColor(g), `${codigos.length} ${codigos.length === 1 ? 'avería' : 'averías'}`, NIVELES[g].titulo];
  const bEst = b.ultimoArranque?.estado === 'debil' ? b.ultimoArranque.estado : b.evR?.estado || (b.evM ? b.evM.estado : null);
  const fichaBat = !bEst ? ['gris', 'Sin datos', 'Se mide al comprobar'] : [nivelColor(bEst), b.reposo ? fmtV(b.reposo.tension) : fmtV(b.motor?.tension), b.ultimoArranque?.estado === 'debil' ? 'Arranque débil' : (b.evR || b.evM).mensaje.split('.')[0]];
  const rev = m.revision;
  const fichaMant = !rev ? ['gris', 'Sin configurar', 'Apunta tu última revisión'] : [nivelColor(rev.estado), rev.estado === 'vencida' ? 'Revisión vencida' : rev.kmRestantes !== null ? `Faltan ${fmtKm(Math.max(0, rev.kmRestantes))}` : `Faltan ${Math.max(0, rev.diasRestantes)} días`, `Toca antes del ${fmtFecha(rev.venceFecha)}`];
  return `<h1>Diagnóstico</h1>
    <p class="suave peq">Con un adaptador OBD enchufado en el coche puedes ver tú mismo las averías y el estado de la batería.</p>
    <section class="coche panel">
      <div class="coche-top">
        <div>
          <p class="etq">Coche con el adaptador</p>
          <h2>${veh ? esc(veh.alias || [veh.marca, veh.anio].filter(Boolean).join(' · ') || 'Mi coche') : 'Sin identificar'}</h2>
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
      ${ficha('mant', 'Revisión e ITV', fichaMant)}
    </section>
    ${avisoLista(avisos)}
    ${codigos.length ? `<button class="btn sec ancho" id="enviar-taller">${I.wa} Contárselo al taller</button>` : ''}
    <button class="enlace" id="ver-explicacion">¿Cómo funciona el diagnóstico desde el móvil?</button>
    ${DEMO ? `<section class="panel demo-ctl"><label for="demo-coche" class="etq">Coche simulado</label><select id="demo-coche">${Object.entries(COCHES_SIM).map(([k, c]) => `<option value="${k}" ${k === (d.demoCoche || 'diesel') ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select><button class="enlace" id="demo-reset">Borrar los datos de la demostración</button></section>` : ''}`;
}

export function eDiag(el) {
  $('#ya-tengo', el)?.addEventListener('click', async () => { st.verExplicacion = false; st.datos.ajustes.tengoAdaptador = true; await persistir(); pintar(); window.scrollTo(0, 0); });
  $('#comprobar', el)?.addEventListener('click', comprobar);
  $('#desconectar', el)?.addEventListener('click', desconectar);
  $('#ver-explicacion', el)?.addEventListener('click', () => { st.verExplicacion = true; pintar(); window.scrollTo(0, 0); });
  el.querySelectorAll('#mat-editar').forEach((b) => b.addEventListener('click', dialogoCoche));
  $('#adaptador', el)?.addEventListener('click', dialogoAdaptador);
  $('#enviar-taller', el)?.addEventListener('click', () => abrirSolicitud('averia', { coche: cocheApp(), sel: ['testigo'] }));
  $('#demo-coche', el)?.addEventListener('change', async (e) => { st.datos.demoCoche = e.target.value; await desconectar(); await persistir(); toast('Coche simulado cambiado.'); });
  $('#demo-reset', el)?.addEventListener('click', async () => { await borrarTodo(); st.datos = await cargar(); st.datos.bienvenidaVista = true; await desconectar(); toast('Datos borrados.'); });
}

export const VISTAS_DIAG = {
  diag: [vDiag, eDiag],
  averias: [vAverias, eAverias],
  bateria: [vBateria, eBateria],
  mant: [vMant, eMant],
};
