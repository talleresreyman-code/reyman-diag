// Reyman Connect · Inicio: qué pasa con mi coche, qué tengo pendiente y «¿qué necesitas?»

import { st, TALLER, DEMO } from '../estado.js';
import { esc, I, fmtFechaHora, nombreCorto, toast } from '../ui.js';
import { estadoCorto, abrir, urlPresupuesto } from '../cliente.js';
import { TIPOS, ORDEN_TIPOS, pendientes } from '../solicitudes.js';
import { mantenimiento } from './diagnostico.js';
import { abrirSolicitud } from './solicitud.js';
import { enlazarPegar, urlPedirEnlace, refrescarSiViejo } from './bienvenida.js';

const ICONO_TIPO = { mant: I.mant, averia: I.alerta, presupuesto: I.euro, consulta: I.charla, admin: I.factura };

/** Coche del cliente en el taller ahora mismo (terminado primero). */
export function cochesEnTaller() {
  const vs = st.datos.clienteDatos?.vehiculos || [];
  return vs.filter((v) => v.estado).sort((a, b) => (b.estado.terminado ? 1 : 0) - (a.estado.terminado ? 1 : 0));
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
  return `<section class="panel taller-ficha">
    <h2>${esc(TALLER.nombre)}</h2>
    <p class="peq">${esc(TALLER.direccion)}</p>
    <p class="peq suave">${esc(TALLER.horario)}</p>
    <div class="fila-btn tres">
      <a class="btn sec" href="https://wa.me/${esc(TALLER.whatsapp)}" target="_blank" rel="noopener">${I.wa} WhatsApp</a>
      <a class="btn sec" href="tel:${esc(TALLER.telefono.replace(/\s/g, ''))}">${I.tel} Llamar</a>
      <a class="btn sec" href="${esc(TALLER.mapa)}" target="_blank" rel="noopener">${I.mapa} Cómo llegar</a>
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
      ${ORDEN_TIPOS.map((t) => `<button class="motivo m-${t}" data-sol="${t}"><span class="m-icono">${ICONO_TIPO[t]}</span><span class="m-txt"><strong>${esc(TIPOS[t].titulo)}</strong><span class="peq">${esc(TIPOS[t].sub)}</span></span>${I.flecha}</button>`).join('')}
    </section>
    ${!d.cliente ? `<section class="panel">
      <p><strong>¿Ya eres cliente?</strong></p>
      <p class="peq suave">Con tu enlace personal de WhatsApp verás tus coches, la reparación, presupuestos y facturas.</p>
      <div class="fila-btn col"><button class="btn sec" id="b-pegar">Pegar mi enlace de WhatsApp</button><a class="btn fantasma" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedirlo por WhatsApp</a></div>
    </section>` : ''}
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
