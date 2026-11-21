// Reyman Connect · Documentos: presupuestos por responder, facturas, órdenes de reparación… por coche

import { st, DEMO, pintar } from '../estado.js';
import { $, esc, I, toast, fmtFechaHora, chips } from '../ui.js';
import { urlDocumento, urlPresupuesto, abrir, credDe } from '../cliente.js';
import { limpiaMatricula } from '../solicitudes.js';
import { enlazarPegar, urlPedirEnlace, refrescarCliente, refrescarSiViejo, quitarFicha } from './bienvenida.js';

const PLURAL = { Factura: 'Facturas', Presupuesto: 'Presupuestos', 'Orden de reparación': 'Órdenes de reparación', Albarán: 'Albaranes' };
const plural = (t) => PLURAL[t] || t;

const fechaDoc = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function vDocs() {
  const d = st.datos;
  if (!d.cliente) {
    return `<h1>Documentos</h1><section class="panel vacio"><p>Con tu enlace personal de WhatsApp verás aquí tus presupuestos, facturas y órdenes de reparación desde 2024.</p>
      <div class="fila-btn col"><button class="btn" id="b-pegar">Pegar mi enlace de WhatsApp</button><a class="btn sec" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedir mi enlace por WhatsApp</a></div></section>`;
  }
  const cd = d.clienteDatos || { documentos: [], presupuestos: [] };
  const f = st.filtroDocs;
  const todos = cd.documentos || [];
  const mats = [...new Set(todos.flatMap((x) => (x.matriculas || []).map(limpiaMatricula)))].filter(Boolean);
  const tipos = [...new Set(todos.map((x) => x.tipo))].filter(Boolean);
  const docs = todos.filter((x) => (!f.matricula || (x.matriculas || []).map(limpiaMatricula).includes(f.matricula)) && (!f.tipo || x.tipo === f.tipo));
  return `<h1>Documentos</h1>
    ${st.cargandoCliente && !cd.actualizado ? '<div class="panel progreso"><span class="giro"></span>Cargando tus documentos…</div>' : ''}
    ${(cd.presupuestos || []).map((p) => `<section class="panel presu pendiente ambar">
      <div><span class="etq">Presupuesto por responder</span><strong>${esc(p.vehiculo || '')} <span class="matricula">${esc(p.matricula || '')}</span></strong><br><span class="peq suave">Nº ${esc(p.num || '')}</span></div>
      <button class="btn" data-presu="${esc(p.token)}">Ver y responder</button>
    </section>`).join('')}
    ${mats.length > 1 ? `<div class="filtro">${chips('f-mat', [['', 'Todos los coches'], ...mats.map((m) => [m, m])], f.matricula || '')}</div>` : ''}
    ${tipos.length > 1 ? `<div class="filtro">${chips('f-tipo', [['', 'Todo'], ...tipos.map((t) => [t, plural(t)])], f.tipo || '')}</div>` : ''}
    <section class="panel" style="margin-top:12px">
      ${docs.length ? docs.slice(0, 40).map((x) => `<button class="doc" data-doc="${esc(x.id)}"><span><strong>${esc(x.tipo)}</strong> · ${esc(x.nombre)}<br><span class="peq suave">${esc(fechaDoc(x.fecha))}${x.matriculas?.length ? ` · ${esc(x.matriculas.join(', '))}` : ''}</span></span><span class="enlace">PDF</span></button>`).join('') : '<p class="suave">No hay documentos con este filtro.</p>'}
      ${docs.length > 40 ? `<p class="peq suave">Y ${docs.length - 40} más: filtra por coche para verlos.</p>` : ''}
    </section>
    <button class="btn sec ancho" data-sol="admin">${I.factura} ¿Dudas con una factura o un pago?</button>
    <p class="peq suave" style="margin-top:12px">${cd.actualizado ? `Actualizado: ${esc(fmtFechaHora(cd.actualizado))}. ` : ''}<button class="enlace" id="d-recargar">Actualizar</button> · <button class="enlace" id="d-quitar">Quitar mi ficha de esta app</button></p>`;
}

export function eDocs(el) {
  enlazarPegar(el);
  if (!st.datos.cliente) return;
  const cred = credDe(st.datos.cliente);
  el.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => (DEMO ? toast('En la demostración no hay PDF.') : abrir(urlDocumento(cred, b.dataset.doc)))));
  el.querySelectorAll('[data-presu]').forEach((b) => b.addEventListener('click', () => (DEMO ? toast('En la demostración no hay presupuesto.') : abrir(urlPresupuesto(b.dataset.presu)))));
  el.querySelectorAll('[data-chips]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (g.dataset.chips === 'f-mat') st.filtroDocs.matricula = b.dataset.valor || null;
    else st.filtroDocs.tipo = b.dataset.valor || null;
    pintar();
  }));
  $('#d-recargar', el)?.addEventListener('click', async () => { await refrescarCliente(); toast('Datos actualizados.'); });
  $('#d-quitar', el)?.addEventListener('click', quitarFicha);
  refrescarSiViejo();
}
