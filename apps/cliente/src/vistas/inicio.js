// Reyman Connect · Inicio: qué pasa con mi coche, qué tengo pendiente y «¿qué necesitas?»

import { st, TALLER, DEMO } from '../estado.js';
import { esc, I, IM, fmtFechaHora, nombreCorto, toast } from '../ui.js';
import { estadoCorto, abrir, urlPresupuesto } from '../cliente.js';
import { TIPOS, ORDEN_TIPOS, pendientes, enTaller, estadoTaller } from '../solicitudes.js';
import { mantenimiento } from './diagnostico.js';
import { abrirSolicitud } from './solicitud.js';
import { enlazarPegar, urlPedirEnlace, refrescarSiViejo } from './bienvenida.js';


/** Coches que están físicamente en el taller ahora mismo (terminado primero). Si no hay ninguno, no se enseña nada. */
export function cochesEnTaller() {
  const vs = st.datos.clienteDatos?.vehiculos || [];
  return vs.filter((v) => v.estado && enTaller(v)).sort((a, b) => (b.estado.terminado ? 1 : 0) - (a.estado.terminado ? 1 : 0));
}

export function tarjetaEstado(v) {
  const e = estadoCorto(v);
  if (!e) return '';
  return `<button class="panel aviso-taller ${e.color}" data-ir="coches">
    <span class="etq">Tu coche en el taller</span>
    <strong>${e.color === 'verde' ? '✅ ' : ''}${esc(e.texto)}</strong>
    <span class="peq">${esc([v.marca, v.modelo].filter(Boolean).join(' '))} · ${esc(v.matricula)}${e.extra ? ` · ${esc(e.extra)}` : ''}</span>
    ${e.motivo ? `<span class="peq suave">${esc(e.motivo)}</span>` : ''}
  </button>`;
}

export function fichaTaller() {
  const e = estadoTaller();
  return `<section class="taller-tarjeta">
    <div class="tt-cab">
      <img src="${esc(globalThis.REYMAN_LOGO_BLANCO || 'logo-blanco.png')}" alt="Talleres Reyman · CGA Car Service">
      <span class="tt-estado ${e.abierto ? 'abierto' : ''}"><span class="tt-punto"></span>${esc(e.texto)}</span>
    </div>
    <div class="tt-cuerpo">
      <a class="tt-fila" href="${esc(TALLER.mapa)}" target="_blank" rel="noopener"><span class="tt-ico">${I.mapa}</span><span><strong>Camino del Puente Viejo, 1D</strong><br><span class="peq suave">Frente a la C/ Ávila · 28500 Arganda del Rey</span></span></a>
      <div class="tt-fila"><span class="tt-ico">🕗</span><span><strong>Lunes a jueves</strong> 8:00 – 16:00<br><strong>Viernes</strong> 8:00 – 15:00 <span class="peq suave">· festivos cerrado</span></span></div>
      <a class="tt-fila" href="tel:${esc(TALLER.telefono.replace(/\s/g, ''))}"><span class="tt-ico">${I.tel}</span><span><strong>${esc(TALLER.telefono)}</strong><br><span class="peq suave">Teléfono y WhatsApp</span></span></a>
      <div class="tt-botones">
        <a class="btn wa" href="https://wa.me/${esc(TALLER.whatsapp)}" target="_blank" rel="noopener">${I.wa} WhatsApp</a>
        <a class="btn" href="tel:${esc(TALLER.telefono.replace(/\s/g, ''))}">${I.tel} Llamar</a>
        <a class="btn sec" href="${esc(TALLER.mapa)}" target="_blank" rel="noopener">${I.mapa} Cómo llegar</a>
      </div>
    </div>
  </section>`;
}

export function vInicio() {
  const d = st.datos;
  const nombre = nombreCorto(d.contacto?.nombre || d.cliente?.nombre);
  const enTaller = cochesEnTaller();
  const rev = mantenimiento().revision;
  const pend = pendientes(d, { revision: rev });
  const sols = (d.solicitudes || []).slice(0, 3);
  return `
    <h1 class="saludo">${nombre ? `Hola, ${esc(nombre)}` : 'Hola'}</h1>
    ${enTaller.map(tarjetaEstado).join('')}
    ${pend.length ? `<section class="pendientes">${pend.map((p) => `
      <div class="panel pendiente ${p.color}">
        <div><strong>${esc(p.titulo)}</strong>${p.detalle ? `<br><span class="peq">${esc(p.detalle)}</span>` : ''}</div>
        <button class="btn ${p.color === 'rojo' ? '' : 'sec'}" data-pend="${esc(p.id)}">${esc(p.boton)}</button>
      </div>`).join('')}</section>` : ''}
    <h2 class="titulo-sec">¿Qué necesitas?</h2>
    <section class="motivos">
      ${ORDEN_TIPOS.map((t) => `<button class="motivo m-${t}" data-sol="${t}"><span class="m-icono">${IM[t]}</span><span class="m-txt"><strong>${esc(TIPOS[t].titulo)}</strong><span class="peq">${esc(TIPOS[t].sub)}</span></span>${I.flecha}</button>`).join('')}
    </section>
    ${!d.cliente ? `<details class="panel plegable">
      <summary><strong>¿Ya eres cliente?</strong> <span class="peq suave">Añade tu ficha</span></summary>
      <p class="peq suave" style="margin-top:8px">Con tu enlace personal de WhatsApp verás tus coches, la reparación, presupuestos y facturas.</p>
      <div class="fila-btn col"><button class="btn sec" id="b-pegar">Pegar mi enlace de WhatsApp</button><a class="btn fantasma" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedirlo por WhatsApp</a></div>
    </details>` : ''}
    ${sols.length ? `<section class="panel"><p class="etq">Lo último que nos has pedido</p><ul class="lista-sol">${sols.map((x) => `<li><span>${esc(x.resumen)}</span><span class="peq suave">${esc(fmtFechaHora(x.fecha))}</span></li>`).join('')}</ul></section>` : ''}
    ${fichaTaller()}`;
}

export function eInicio(el) {
  enlazarPegar(el);
  const pend = pendientes(st.datos, { revision: mantenimiento().revision });
  el.querySelectorAll('[data-pend]').forEach((b) => b.addEventListener('click', () => {
    const p = pend.find((x) => x.id === b.dataset.pend);
    if (!p) return;
    if (p.accion.tipo === 'presupuesto') return DEMO ? toast('En la demostración no hay presupuesto.') : abrir(urlPresupuesto(p.accion.token));
    abrirSolicitud(p.accion.sol, { coche: p.accion.coche, sel: p.accion.sel });
  }));
  refrescarSiViejo();
}
