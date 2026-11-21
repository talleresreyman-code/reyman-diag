// Reyman Connect · diagnóstico remoto: el taller lee (y si hace falta borra) las averías del coche del cliente
// a distancia, a través del adaptador y de esta app. El cliente da permiso cada vez, ve qué hace el taller y corta cuando quiere.

import { st, DEMO, pintar } from '../estado.js';
import { $, esc, I, toast } from '../ui.js';
import { crearTransporte } from '../comprobacion.js';
import { abrirRemoto, urlRemotoWs, mantenerPantalla } from '../cliente.js';
import { crearPuenteRemoto, describirComando } from '@reyman/obd-core/transport/remoto.js';

// st.remoto: { fase: 'inicio'|'conectando'|'esperando'|'activo'|'fin', codigo, caduca, usuario, accion, comandos, borrado, motivo, error }
const R = () => (st.remoto ||= { fase: 'inicio' });
let puente = null;
let transporte = null;

async function terminar(motivo) {
  const p = puente; const t = transporte;
  puente = null; transporte = null;
  try { p?.cerrar(motivo); } catch { /* */ }
  try { await t?.desconectar?.(); } catch { /* */ }
  mantenerPantalla(false);
}

async function empezar() {
  if (DEMO) { toast('En la demostración no está disponible.'); return; }
  const r = R();
  r.fase = 'conectando'; r.error = null; r.motivo = null; r.comandos = 0; r.borrado = false; r.accion = null; r.usuario = null;
  pintar();
  try {
    // El adaptador lo usa el taller: si la app lo tenía abierto para «Comprobar», se suelta primero
    if (st.sesion) { const s = st.sesion; st.sesion = null; try { await s.elm.cerrar(); } catch { /* */ } }
    transporte = await crearTransporte({ conexion: st.datos.conexion, adaptador: st.datos.adaptador, alElegir: (d) => { st.datos.adaptador = { deviceId: d.deviceId, nombre: d.name }; } });
    await transporte.conectar();
    const v = st.datos.vehiculo || {};
    const a = await abrirRemoto({
      codigoTaller: st.datos.taller?.codigo || 'REYMAN', consentimiento: true,
      nombre: st.datos.cliente?.nombre || st.datos.contacto?.nombre || null, matricula: v.matricula || null, vin: v.vin || null,
      adaptador: transporte.nombre || null,
    });
    const ws = new WebSocket(urlRemotoWs(a.codigo, a.clave));
    await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('No se ha podido abrir la conexión con el taller.')); });
    puente = crearPuenteRemoto({
      transporte, ws,
      alTaller: (u) => { r.fase = 'activo'; r.usuario = u; toast(`${u} está revisando tu coche.`); pintar(); },
      alComando: (d) => {
        r.comandos++;
        const que = describirComando(d);
        if (que === 'Borrando averías') r.borrado = true;
        if (que && que !== r.accion) { r.accion = que; const x = $('#rm-accion'); if (x) x.textContent = que; else pintar(); }
      },
      alFin: (m) => { r.fase = 'fin'; r.motivo = m; terminar(m); pintar(); },
    });
    r.codigo = a.codigo; r.caduca = a.caduca; r.fase = 'esperando';
    mantenerPantalla(true);
  } catch (e) {
    await terminar();
    r.fase = 'inicio';
    r.error = /cancel/i.test(e?.message || '') ? null : `${e?.message || 'Error desconocido'}${e?.code === 'SIN_ADAPTADOR' ? '' : ''}`;
  }
  pintar();
}

export function vRemoto() {
  const r = R();
  const cab = '<h1>Diagnóstico remoto</h1>';
  if (r.fase === 'conectando') return `${cab}<div class="panel progreso" role="status"><span class="giro"></span>Conectando con el adaptador y con el taller…</div>`;
  if (r.fase === 'esperando') {
    return `${cab}<section class="panel centrado">
        <p class="etq">Tu código</p>
        <p class="cifra" style="letter-spacing:.15em">${esc(r.codigo.replace(/(\d{3})(\d{3})/, '$1 $2'))}</p>
        <p><strong>Díselo al taller por teléfono o WhatsApp.</strong></p>
        <p class="peq suave">Caduca en 10 minutos si nadie del taller entra.</p>
      </section>
      <section class="panel peq">
        <p>Mientras dure: <strong>deja esta pantalla abierta</strong> y el móvil cerca del coche, con el contacto puesto.</p>
        <p class="suave">Si llamas al taller, usa el altavoz y vuelve a esta pantalla.</p>
      </section>
      <button class="btn fantasma ancho" id="rm-cortar">Cancelar</button>`;
  }
  if (r.fase === 'activo') {
    return `${cab}<section class="panel" style="border-left:6px solid var(--verde)">
        <p><strong>${esc(r.usuario || 'El taller')} está revisando tu coche</strong></p>
        <p class="peq">Ahora: <span id="rm-accion">${esc(r.accion || 'Comunicando con el coche')}</span></p>
        ${r.borrado ? '<p class="peq"><strong>El taller ha borrado las averías.</strong> Si el fallo sigue, el testigo volverá a encenderse.</p>' : ''}
      </section>
      <section class="panel peq"><p><strong>No quites el contacto ni cierres la app</strong> hasta que el taller te diga que ha terminado.</p></section>
      <button class="btn peligro ancho" id="rm-cortar">Terminar ahora</button>`;
  }
  if (r.fase === 'fin') {
    return `${cab}<section class="panel"><p><strong>Sesión terminada.</strong></p><p class="peq suave">${esc(r.motivo || '')}</p>${r.borrado ? '<p class="peq">El taller borró las averías durante la sesión.</p>' : ''}</section>
      <button class="btn ancho" data-ir="diag">Volver</button>`;
  }
  return `${cab}
    <p class="suave">Si tu coche tiene un fallo, el taller puede leer las averías a distancia con tu adaptador, sin que tengas que ir.</p>
    ${r.error ? `<div class="aviso rojo" role="alert">${esc(r.error)}</div>` : ''}
    <section class="panel peq">
      <p><strong>Antes de empezar</strong></p>
      <ul>
        <li>Enchufa el adaptador y pon el contacto (motor parado).</li>
        <li>El móvil necesita Internet: si el adaptador es Wi-Fi, mejor por Bluetooth.</li>
        <li>Llama o escribe al taller: te pedirán el código que sale al pulsar el botón.</li>
      </ul>
    </section>
    <section class="panel peq suave">
      Solo el taller con tu código puede conectarse, y solo mientras esta pantalla esté abierta (30 minutos como mucho). Verás en todo momento qué está haciendo y puedes cortar cuando quieras. Queda registrado quién se conecta y cuándo.
    </section>
    <button class="btn grande" id="rm-permitir">${I.bt} Permitir al taller</button>`;
}

export function eRemoto(el) {
  $('#rm-permitir', el)?.addEventListener('click', empezar);
  $('#rm-cortar', el)?.addEventListener('click', async () => {
    const r = R();
    await terminar('El cliente ha terminado la sesión.');
    r.fase = 'fin'; r.motivo = 'Has terminado la sesión.';
    pintar();
  });
}

/** Al salir de la pantalla de inicio de la sesión se deja todo listo para la próxima vez. */
export function reiniciarRemoto() { if (!puente && st.remoto?.fase !== 'conectando') st.remoto = { fase: 'inicio' }; }
