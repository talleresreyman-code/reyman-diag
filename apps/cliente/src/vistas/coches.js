// Reyman Connect · Mis coches: cada coche con su estado, última visita, ITV y accesos directos

import { st, ir } from '../estado.js';
import { esc, I, fmtKm } from '../ui.js';
import { estadoCorto } from '../cliente.js';
import { cochesDisponibles, diasHasta, limpiaMatricula, enTaller } from '../solicitudes.js';
import { enlazarPegar, urlPedirEnlace, refrescarSiViejo } from './bienvenida.js';

function itvTexto(itv) {
  const d = diasHasta(itv);
  if (d === null) return '';
  const color = d < 0 ? 'rojo' : d <= 45 ? 'ambar' : 'verde';
  return `<span class="insignia ${color}">ITV ${d < 0 ? 'caducada' : `hasta ${esc(itv)}`}</span>`;
}

export function vCoches() {
  const d = st.datos;
  const vs = d.clienteDatos?.vehiculos || [];
  const docs = d.clienteDatos?.documentos || [];
  const coches = cochesDisponibles(d);
  const app = coches.find((c) => c.origen === 'app');
  return `<h1>Mis coches</h1>
    ${!vs.length && !app ? `<section class="panel vacio"><p>Aquí verás tus coches con su estado, la última visita y la ITV.</p>
      <div class="fila-btn col"><button class="btn" id="b-pegar">Pegar mi enlace de WhatsApp</button><a class="btn sec" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedir mi enlace por WhatsApp</a></div></section>` : ''}
    ${vs.map((v) => {
      const dentro = enTaller(v);
      const e = dentro ? estadoCorto(v) : null;
      const m = limpiaMatricula(v.matricula);
      const nDocs = docs.filter((x) => (x.matriculas || []).map(limpiaMatricula).includes(m)).length;
      return `<section class="panel vehiculo">
        <div class="coche-top"><div><strong class="v-nombre">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</strong><br><span class="matricula">${esc(v.matricula)}</span></div>
          <div class="insignias">${dentro ? '<span class="insignia ambar">En el taller</span>' : ''}${itvTexto(v.proxima_itv || v.itv_cliente)}</div></div>
        ${e ? `<div class="aviso ${e.color}" style="margin-top:10px"><strong>${esc(e.texto)}</strong>${e.extra ? `<br><span class="peq">${esc(e.extra)}</span>` : ''}${e.motivo ? `<br><span class="peq">${esc(e.motivo)}</span>` : ''}</div>` : ''}
        <p class="peq suave" style="margin-top:8px">${v.ultima_visita ? `Última visita: ${esc(v.ultima_visita)}${Number(v.km) > 0 ? ` · ${esc(fmtKm(Number(v.km)))}` : ''}` : 'Sin visitas registradas'}${v.ultimo_trabajo ? `<br>${esc(v.ultimo_trabajo)}` : ''}</p>
        <div class="fila-btn tres">
          <button class="btn sec" data-sol="mant" data-coche="${esc(m)}">Pedir cita</button>
          <button class="btn sec" data-sol="averia" data-coche="${esc(m)}">Le pasa algo</button>
          <button class="btn fantasma" data-docs="${esc(m)}" ${nDocs ? '' : 'disabled'}>Documentos${nDocs ? ` (${nDocs})` : ''}</button>
        </div>
      </section>`;
    }).join('')}
    ${app ? `<section class="panel vehiculo">
      <div class="coche-top"><div><strong class="v-nombre">${esc(app.nombre)}</strong><br>${app.matricula ? `<span class="matricula">${esc(app.matricula)}</span>` : ''}</div>${itvTexto(app.itv)}</div>
      <p class="peq suave" style="margin-top:8px">Es el coche que tienes en la app con el adaptador.</p>
      <div class="fila-btn tres"><button class="btn sec" data-sol="mant" data-coche="${esc(app.id)}">Pedir cita</button><button class="btn sec" data-sol="averia" data-coche="${esc(app.id)}">Le pasa algo</button><button class="btn fantasma" data-ir="diag">Diagnóstico</button></div>
    </section>` : ''}
    ${d.cliente ? `<p class="peq suave">¿Falta algún coche? Escríbenos y lo añadimos a tu ficha. <button class="enlace" data-sol="admin">Escribir</button></p>` : ''}`;
}

export function eCoches(el) {
  enlazarPegar(el);
  el.querySelectorAll('[data-docs]').forEach((b) => b.addEventListener('click', () => { st.filtroDocs = { matricula: b.dataset.docs, tipo: null }; ir('docs'); }));
  refrescarSiViejo();
}
