// Reyman Connect · bienvenida y ficha del cliente (enlace personal de «Mi taller» que llega por WhatsApp)

import { st, DEMO, TALLER, persistir, pintar } from '../estado.js';
import { $, esc, I, toast, nombreCorto } from '../ui.js';
import { tokenDeTexto, pedirDatos, leerPortapapeles } from '../cliente.js';
import { urlWhatsApp } from '../solicitudes.js';

export const urlPedirEnlace = () => urlWhatsApp('Hola, quiero mi enlace de cliente para la app Reyman Connect.', TALLER.whatsapp);

export function pintarBienvenida(raiz) {
  const v = st.vincular;
  const coches = v?.datos?.vehiculos || [];
  raiz.innerHTML = `<div class="bienvenida">
    <img class="logo-b" src="${esc(globalThis.REYMAN_LOGO || 'logo.png')}" alt="Talleres Reyman">
    <h1>${v?.datos ? `Hola, ${esc(nombreCorto(v.datos.cliente))}` : 'Tu taller en el móvil'}</h1>
    <p class="sub">Pide cita, cuéntanos qué le pasa a tu coche y sigue la reparación. Todo por WhatsApp, como siempre, pero más fácil.</p>
    ${v?.cargando ? '<div class="panel progreso" role="status"><span class="giro"></span>Buscando tu ficha en el taller…</div>' : ''}
    ${v?.error ? `<div class="panel"><div class="aviso rojo" role="alert">${esc(v.error)}</div><div class="fila-btn col"><a class="btn sec" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedir un enlace nuevo por WhatsApp</a><button class="btn fantasma" id="b-cancelar">Volver</button></div></div>` : ''}
    ${v?.datos ? `<div class="panel">
        <p>Hemos encontrado tu ficha de <strong>Talleres Reyman</strong>${coches.length ? ` con ${coches.length === 1 ? 'tu' : 'tus'} ${coches.slice(0, 3).map((c) => `${esc([c.marca, c.modelo].filter(Boolean).join(' '))} <span class="matricula">${esc(c.matricula)}</span>`).join(', ')}${coches.length > 3 ? '…' : ''}` : ''}.</p>
        <button class="btn grande" id="b-entrar">Entrar</button>
        <p class="peq suave centrado" style="margin-top:8px">Sin usuario ni contraseña.</p>
        <button class="enlace centrado" id="b-cancelar">No soy yo</button>
      </div>` : ''}
    ${!v ? `<div class="panel">
        <p><strong>¿Ya eres cliente de Talleres Reyman?</strong></p>
        <p class="peq suave">Usa el enlace personal que te enviamos por WhatsApp: verás tus coches, la reparación, presupuestos y facturas.</p>
        <div class="fila-btn col">
          <button class="btn" id="b-pegar">Pegar mi enlace de WhatsApp</button>
          <a class="btn sec" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} No lo tengo: pedirlo por WhatsApp</a>
        </div>
      </div>
      <div class="panel"><button class="btn fantasma ancho" id="b-saltar">Entrar sin mi ficha</button><p class="peq suave centrado" style="margin-top:8px">Podrás pedir cita y escribirnos igual. Tu ficha la puedes añadir después.</p></div>` : ''}
  </div>`;
  enlazarPegar(raiz);
  $('#b-saltar', raiz)?.addEventListener('click', async () => { st.datos.bienvenidaVista = true; await persistir(); pintar(); });
  $('#b-cancelar', raiz)?.addEventListener('click', () => { st.vincular = null; pintar(); });
  $('#b-entrar', raiz)?.addEventListener('click', confirmarVinculo);
}

/** Botón «Pegar mi enlace de WhatsApp» (bienvenida y aviso de Inicio). */
export function enlazarPegar(el) {
  $('#b-pegar', el)?.addEventListener('click', async () => {
    const txt = await leerPortapapeles();
    const t = tokenDeTexto(txt);
    if (t) return prepararVinculo(t);
    const manual = prompt('No encontramos el enlace en el portapapeles. Pégalo aquí (el que empieza por talleresreyman.com/mi-taller):', '');
    const t2 = tokenDeTexto(manual);
    if (t2) prepararVinculo(t2);
    else if (manual !== null) toast('Ese enlace no es válido. Pídelo por WhatsApp y te lo enviamos.');
  });
}

export async function prepararVinculo(token) {
  st.vincular = { token, cargando: true };
  pintar();
  try {
    st.vincular = { token, datos: await pedirDatos(token, { demo: DEMO }) };
  } catch (e) {
    st.vincular = { token, error: e.message };
  }
  pintar();
}

async function confirmarVinculo() {
  const { token, datos } = st.vincular || {};
  if (!datos) return;
  const d = st.datos;
  d.cliente = { token, nombre: datos.cliente || '', desde: new Date().toISOString() };
  d.clienteDatos = datos;
  d.bienvenidaVista = true;
  if (!d.contacto?.nombre && datos.cliente) d.contacto = { ...(d.contacto || {}), nombre: datos.cliente };
  const c = datos.vehiculos?.[0];
  if (c && !d.vehiculo?.matricula) d.vehiculo = { ...(d.vehiculo || {}), matricula: c.matricula, marca: c.marca, alias: [c.marca, c.modelo].filter(Boolean).join(' ') };
  if (c?.km && !d.kmLecturas.length && Number(c.km) > 0) d.kmLecturas.push({ fecha: new Date().toISOString(), km: Number(c.km), origen: 'taller' });
  st.vincular = null;
  st.vista = 'inicio';
  st.historia = [];
  await persistir();
  toast('¡Listo! Ya tienes tu ficha del taller en la app.');
  pintar();
}

export async function refrescarCliente() {
  const c = st.datos.cliente;
  if (!c || st.cargandoCliente) return;
  st.cargandoCliente = true;
  try {
    st.datos.clienteDatos = await pedirDatos(c.token, { demo: DEMO });
    await persistir();
    if (!document.querySelector('dialog[open]') && st.vista !== 'solicitud') pintar();
  } catch { /* se queda la última copia */ }
  st.cargandoCliente = false;
}

/** Refresca si la copia tiene más de 2 minutos. */
export function refrescarSiViejo() {
  const age = Date.now() - new Date(st.datos.clienteDatos?.actualizado || 0).getTime();
  if (st.datos.cliente && age > 120000) refrescarCliente();
}

export async function quitarFicha() {
  if (!confirm('¿Quitar tu ficha de Talleres Reyman de esta app? Podrás volver a entrar con tu enlace de WhatsApp.')) return;
  st.datos.cliente = null; st.datos.clienteDatos = null;
  await persistir();
  toast('Ficha quitada.');
  pintar();
}
