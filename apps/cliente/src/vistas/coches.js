// Reyman Connect · Mis coches: cada coche con su matrícula, sus datos, su estado y lo que apunta el cliente (seguro, póliza…)

import { st, ir, persistir, pintar } from '../estado.js';
import { $, esc, I, fmtKm, placa, dialogo, toast } from '../ui.js';
import { estadoCorto } from '../cliente.js';
import { cochesDisponibles, diasHasta, limpiaMatricula, enTaller, leerFecha } from '../solicitudes.js';
import { enlazarPegar, urlPedirEnlace, refrescarSiViejo } from './bienvenida.js';
import { resumenRevision, textoRevision } from '../libro.js';
import { kmReales } from './libro.js';

const fechaCorta = (iso) => { const f = leerFecha(iso); return f ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };

function insigniaFecha(prefijo, fecha, avisarDias = 45) {
  const d = diasHasta(fecha);
  if (d === null) return '';
  const color = d < 0 ? 'rojo' : d <= avisarDias ? 'ambar' : 'verde';
  return `<span class="insignia ${color}">${esc(prefijo)} ${d < 0 ? 'caducado' : `hasta ${esc(/\//.test(fecha) ? fecha : fechaCorta(fecha))}`}</span>`;
}

const fila = (etq, valor) => (valor ? `<div class="dato"><dt>${esc(etq)}</dt><dd>${valor}</dd></div>` : '');

function misDatos(m) {
  const x = st.datos.misCoches?.[m] || {};
  const hay = x.aseguradora || x.poliza || x.asistencia || x.vence || x.notas;
  return `<div class="mis-datos">
    <div class="md-cab"><strong>Mis datos de este coche</strong><button class="enlace" data-editar="${esc(m)}">${hay ? 'Editar' : 'Añadir'}</button></div>
    ${hay ? `<dl class="datos">
      ${fila('Seguro', esc(x.aseguradora || ''))}
      ${fila('Nº de póliza', esc(x.poliza || ''))}
      ${fila('Vence el seguro', x.vence ? esc(fechaCorta(x.vence)) : '')}
      ${fila('Asistencia en carretera', esc(x.asistencia || ''))}
      ${fila('Notas', esc(x.notas || ''))}
    </dl>
    ${x.asistencia ? `<a class="btn sec ancho" href="tel:${esc(x.asistencia.replace(/[^\d+]/g, ''))}">${I.tel} Llamar a mi asistencia en carretera</a>` : ''}`
    : '<p class="peq suave">Apunta tu seguro, la póliza y el teléfono de asistencia en carretera: los tendrás a mano si te quedas tirado. Solo se guardan en tu móvil, cifrados.</p>'}
  </div>`;
}

function botones(m, conDocs, nDocs) {
  return `<div class="fila-btn tres">
    <button class="btn sec" data-sol="mant" data-coche="${esc(m)}">Pedir cita</button>
    <button class="btn sec" data-sol="averia" data-coche="${esc(m)}">Le pasa algo</button>
    ${conDocs ? `<button class="btn fantasma" data-docs="${esc(m)}" ${nDocs ? '' : 'disabled'}>Documentos${nDocs ? ` (${nDocs})` : ''}</button>` : '<button class="btn fantasma" data-ir="diag">Diagnóstico</button>'}
  </div>`;
}

/** Acceso al libro de mantenimiento con la próxima revisión de un vistazo. */
function libroMini(v, m) {
  if (!v.libro) return '';
  const rv = resumenRevision(v.libro, { kmActuales: kmReales(m) });
  const t = rv ? textoRevision(rv) : '';
  return `<button class="libro-mini ${rv ? rv.color : ''}" data-libro="${esc(m)}"><span><strong>Libro de mantenimiento</strong><span class="peq suave">${t ? `Revisión: ${esc(t.charAt(0).toLowerCase() + t.slice(1))}` : `${Number(v.libro.visitas) || 0} visitas al taller`}</span></span></button>`;
}

export function vCoches() {
  const d = st.datos;
  const vs = d.clienteDatos?.vehiculos || [];
  const docs = d.clienteDatos?.documentos || [];
  const app = cochesDisponibles(d).find((c) => c.origen === 'app');
  return `<h1>Mis coches</h1>
    ${!vs.length && !app ? `<section class="panel vacio"><p>Aquí verás tus coches con su estado, la última visita y la ITV.</p>
      <div class="fila-btn col"><button class="btn" id="b-pegar">Pegar mi enlace de WhatsApp</button><a class="btn sec" href="${esc(urlPedirEnlace())}" target="_blank" rel="noopener">${I.wa} Pedir mi enlace por WhatsApp</a></div></section>` : ''}
    ${vs.map((v) => {
      const dentro = enTaller(v);
      const e = dentro ? estadoCorto(v) : null;
      const m = limpiaMatricula(v.matricula);
      const nDocs = docs.filter((x) => (x.matriculas || []).map(limpiaMatricula).includes(m)).length;
      const mis = d.misCoches?.[m] || {};
      return `<section class="panel vehiculo">
        <div class="v-cab">${placa(v.matricula, { grande: true })}<div class="insignias">${dentro ? '<span class="insignia ambar">En el taller</span>' : ''}${insigniaFecha('ITV', v.proxima_itv || v.itv_cliente)}${mis.vence ? insigniaFecha('Seguro', mis.vence, 30) : ''}</div></div>
        <h2 class="v-nombre">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</h2>
        ${v.motor ? `<p class="peq suave">Motor ${esc(v.motor)}</p>` : ''}
        ${e ? `<div class="aviso ${e.color}" style="margin-top:10px"><strong>${esc(e.texto)}</strong>${e.extra ? `<br><span class="peq">${esc(e.extra)}</span>` : ''}${e.motivo ? `<br><span class="peq">${esc(e.motivo)}</span>` : ''}</div>` : ''}
        <dl class="datos">
          ${fila('Última visita', esc(v.ultima_visita || ''))}
          ${fila('Km en la última visita', Number(v.km) > 0 ? esc(fmtKm(Number(v.km))) : '')}
          ${fila('Km al año (aprox.)', Number(v.km_anuales) > 0 ? esc(fmtKm(Number(v.km_anuales))) : '')}
          ${fila('Último trabajo', esc(v.ultimo_trabajo || ''))}
          ${fila('Próxima ITV', esc(v.proxima_itv || v.itv_cliente || ''))}
          ${fila('Bastidor', v.bastidor ? `<span class="mono">${esc(v.bastidor)}</span>` : '')}
          ${fila('Visitas al taller', Number(v.visitas) > 0 ? esc(String(v.visitas)) : '')}
        </dl>
        ${libroMini(v, m)}
        ${misDatos(m)}
        ${botones(m, true, nDocs)}
      </section>`;
    }).join('')}
    ${app ? `<section class="panel vehiculo">
      <div class="v-cab">${app.matricula ? placa(app.matricula, { grande: true }) : '<span class="suave">Sin matrícula</span>'}<div class="insignias">${insigniaFecha('ITV', app.itv)}</div></div>
      <h2 class="v-nombre">${esc(app.nombre)}</h2>
      <p class="peq suave">Es el coche que tienes en la app con el adaptador.</p>
      ${misDatos(app.id)}
      ${botones(app.id, false, 0)}
    </section>` : ''}
    ${d.cliente ? '<p class="peq suave">¿Falta algún coche o hay algún dato mal? Escríbenos y lo corregimos en tu ficha. <button class="enlace" data-sol="admin">Escribir</button></p>' : ''}`;
}

function editar(m) {
  const x = st.datos.misCoches?.[m] || {};
  const d = dialogo(`<h2>Mis datos · ${esc(m)}</h2>
    <p class="peq suave">Solo se guardan en tu móvil, cifrados. El taller no los ve.</p>
    <label class="campo"><span>Compañía de seguros</span><input id="md-aseg" value="${esc(x.aseguradora || '')}" maxlength="40" autocapitalize="words"></label>
    <label class="campo"><span>Nº de póliza</span><input id="md-poliza" value="${esc(x.poliza || '')}" maxlength="30"></label>
    <label class="campo"><span>Fecha de vencimiento del seguro</span><input id="md-vence" type="date" value="${esc(x.vence || '')}"></label>
    <label class="campo"><span>Teléfono de asistencia en carretera</span><input id="md-asist" type="tel" inputmode="tel" value="${esc(x.asistencia || '')}" maxlength="20"></label>
    <label class="campo"><span>Notas (presión de ruedas, código de radio…)</span><textarea id="md-notas" rows="3" maxlength="400">${esc(x.notas || '')}</textarea></label>
    <div class="fila-btn"><button class="btn fantasma" value="cancel">Cancelar</button><button class="btn" id="md-ok" value="ok">Guardar</button></div>
    ${Object.keys(x).length ? '<button class="enlace peligro-txt" id="md-borrar" type="button">Borrar estos datos</button>' : ''}`);
  $('#md-ok', d).addEventListener('click', async () => {
    const v = (id) => $(id, d).value.trim();
    st.datos.misCoches = { ...(st.datos.misCoches || {}), [m]: { aseguradora: v('#md-aseg'), poliza: v('#md-poliza'), vence: v('#md-vence'), asistencia: v('#md-asist'), notas: v('#md-notas') } };
    await persistir();
    toast('Guardado en tu móvil.');
    pintar();
  });
  $('#md-borrar', d)?.addEventListener('click', async () => {
    const c = { ...(st.datos.misCoches || {}) }; delete c[m]; st.datos.misCoches = c;
    await persistir(); d.close(); pintar();
  });
}

export function eCoches(el) {
  enlazarPegar(el);
  el.querySelectorAll('[data-docs]').forEach((b) => b.addEventListener('click', () => { st.filtroDocs = { matricula: b.dataset.docs, tipo: null }; ir('docs'); }));
  el.querySelectorAll('[data-libro]').forEach((b) => b.addEventListener('click', () => { st.libro = b.dataset.libro; ir('libro'); }));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editar(b.dataset.editar)));
  refrescarSiViejo();
}
