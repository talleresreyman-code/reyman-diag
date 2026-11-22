// Reyman Connect · Libro de mantenimiento de un coche: próxima revisión, cómo está cada pieza y las visitas al taller

import { st } from '../estado.js';
import { esc, fmtKm, placa } from '../ui.js';
import { leerFecha, limpiaMatricula, cochesDisponibles } from '../solicitudes.js';
import { resumenRevision, textoRevision } from '../libro.js';
import { km } from './diagnostico.js';

const fecha = (iso) => { const f = leerFecha(iso); return f ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };
const mesAnio = (iso) => { const f = leerFecha(iso); return f ? f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : ''; };

const EST = {
  ok: { color: 'verde', txt: 'Bien' },
  pronto: { color: 'ambar', txt: 'Pronto' },
  toca: { color: 'rojo', txt: 'Toca' },
  sinreg: { color: '', txt: 'Sin datos' },
};

/** El coche de Mis coches que se está mirando (y su libro). */
export function cocheDelLibro() {
  const m = st.libro;
  const v = (st.datos.clienteDatos?.vehiculos || []).find((x) => limpiaMatricula(x.matricula) === m);
  return v && v.libro ? v : null;
}

/** Km reales si el adaptador va en este coche (lecturas del adaptador o las que apunta el cliente). */
export function kmReales(m) {
  const app = cochesDisponibles(st.datos).find((c) => c.origen === 'app');
  const loc = limpiaMatricula(st.datos.vehiculo?.matricula);
  if (loc !== m && !(app && app.id === m)) return null;
  const k = km();
  return k && Number(k.km) > 0 ? Number(k.km) : null;
}

function proxima(v, L, m) {
  const rv = resumenRevision(L, { kmActuales: kmReales(m) });
  if (!rv) return `<section class="panel"><h2>Próxima revisión</h2><p class="suave">Aún no tenemos una revisión tuya registrada. Pide cita y te la hacemos.</p>
    <button class="btn ancho" data-sol="mant" data-coche="${esc(m)}" data-sel="revision">Pedir cita para la revisión</button></section>`;
  const pct = Math.round(rv.frac * 100);
  return `<section class="panel libro-prox ${rv.color}">
    <span class="etq">Próxima revisión</span>
    <p class="cifra-m">${esc(textoRevision(rv))}</p>
    <div class="barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Cuánto falta para la revisión"><span class="${rv.color === 'verde' ? '' : rv.color}" style="width:${Math.max(4, pct)}%"></span></div>
    <dl class="datos">
      <div class="dato"><dt>Fecha</dt><dd>${esc(fecha(rv.fecha))}</dd></div>
      ${rv.kmObjetivo ? `<div class="dato"><dt>O al llegar a</dt><dd>${esc(fmtKm(rv.kmObjetivo))}</dd></div>` : ''}
      ${rv.kmHoy ? `<div class="dato"><dt>${rv.kmEstimados ? 'Km hoy (aprox.)' : 'Km hoy'}</dt><dd>${esc(fmtKm(rv.kmHoy))}</dd></div>` : ''}
      ${rv.ultima ? `<div class="dato"><dt>Última revisión</dt><dd>${esc(fecha(rv.ultima.fecha))}${rv.ultima.km ? ` · ${esc(fmtKm(rv.ultima.km))}` : ''}</dd></div>` : ''}
    </dl>
    ${rv.items.length ? `<p class="peq">Con esa revisión conviene mirar: <strong>${esc(rv.items.join(', ').toLowerCase())}</strong>.</p>` : ''}
    ${rv.kmEstimados && rv.kmHoy ? '<p class="peq suave">Los km de hoy son una estimación por lo que sueles hacer al año. Con el adaptador puesto salen los reales.</p>' : ''}
    <button class="btn ancho" data-sol="mant" data-coche="${esc(m)}" data-sel="revision">Pedir cita para la revisión</button>
  </section>`;
}

function piezas(L) {
  const lista = (L.estado || []).filter((e) => e.est !== 'sinreg' || e.k === 'liq_frenos');
  if (!lista.length) return '';
  return `<section class="panel"><h2>Cómo está cada cosa</h2>
    <ul class="piezas">${lista.map((e) => {
      const x = EST[e.est] || EST.sinreg;
      const cuando = e.fecha ? `Cambiado el ${fecha(e.fecha)}${e.km ? ` · ${fmtKm(e.km)}` : ''}` : 'No consta que se haya cambiado en el taller';
      return `<li class="pieza"><span class="p-ico" aria-hidden="true">${esc(e.i || '•')}</span><span class="p-txt"><strong>${esc(e.n)}</strong><span class="peq suave">${esc(cuando)}</span></span>${x.color ? `<span class="insignia ${x.color}">${esc(x.txt)}</span>` : ''}</li>`;
    }).join('')}</ul>
    <p class="peq suave">Las pastillas, discos y ruedas dependen de cómo se gasten: los revisamos en cada visita.</p>
  </section>`;
}

function visitas(L) {
  const mant = L.mantenimiento || [], otras = L.otras || [];
  if (!mant.length && !otras.length) return '';
  return `<h2 class="titulo-sec">Historial en el taller</h2>
    <ol class="linea-tiempo">${mant.map((x) => `<li class="lt-item">
      <div class="lt-cab"><strong>${esc(fecha(x.fecha))}</strong>${x.km ? `<span class="suave">${esc(fmtKm(x.km))}</span>` : ''}<span class="insignia ${x.servicio ? 'verde' : 'azul'}">${esc(x.etiqueta || 'Mantenimiento')}</span></div>
      <p class="lt-tit">${esc(x.titulo)}</p>
      ${(x.items || []).length ? `<ul class="lt-items">${x.items.map((i) => `<li><span aria-hidden="true">${esc(i.i || '•')}</span> ${esc(i.t)}</li>`).join('')}</ul>` : ''}
    </li>`).join('')}</ol>
    ${otras.length ? `<details class="panel plegable"><summary><strong>Otras reparaciones (${otras.length})</strong></summary>
      <ul class="otras">${otras.map((x) => `<li><strong>${esc(fecha(x.fecha))}</strong>${x.km ? ` · <span class="suave">${esc(fmtKm(x.km))}</span>` : ''}<br>${esc(x.titulo)}${(x.trabajos || []).length ? `<br><span class="peq suave">${esc(x.trabajos.join(' · '))}</span>` : ''}</li>`).join('')}</ul>
    </details>` : ''}`;
}

export function vLibro() {
  const v = cocheDelLibro();
  if (!v) return '<h1>Libro de mantenimiento</h1><section class="panel vacio"><p>No hay datos de este coche.</p></section>';
  const L = v.libro, m = limpiaMatricula(v.matricula);
  const desde = L.desde ? mesAnio(L.desde) : '';
  return `<h1>Libro de mantenimiento</h1>
    <div class="libro-cab">${placa(v.matricula, { grande: true })}<div><h2 class="v-nombre">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}</h2>
      <p class="peq suave">${L.visitas ? `${L.visitas} ${L.visitas === 1 ? 'visita' : 'visitas'} al taller${desde ? ` desde ${esc(desde)}` : ''}` : 'Sin visitas registradas'}${Number(L.kmAnual) > 0 ? ` · unos ${esc(fmtKm(L.kmAnual))} al año` : ''}</p></div></div>
    ${proxima(v, L, m)}
    ${piezas(L)}
    ${visitas(L)}
    <p class="peq suave">Son los trabajos hechos en Talleres Reyman. Si has hecho algo en otro sitio, no aparece aquí: cuéntanoslo y lo tenemos en cuenta.</p>`;
}

export function eLibro() {}
