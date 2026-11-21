// Reyman Connect · app de cliente de Talleres Reyman
//
// Pensada desde lo que necesita el cliente cuando contacta con el taller:
//   Inicio      → cómo va mi coche en el taller, qué tengo pendiente y «¿qué necesitas?» (los cinco motivos)
//   Mis coches  → cada coche con su estado, última visita, ITV y accesos directos
//   Documentos  → presupuestos por responder, facturas y órdenes de reparación por coche
//   Diagnóstico → lo del adaptador OBD (opcional)
// Todo lo que el cliente pide sale por WhatsApp, ya escrito y ordenado (vistas/solicitud.js).

import { cargar } from './almacen.js';
import { formasDeConectar, esNativa } from './comprobacion.js';
import { tokenDeTexto, alAbrirEnlace, alBotonAtras } from './cliente.js';
import { st, DEMO, alPintar, ir, volver, esPestana } from './estado.js';
import { $, esc, I } from './ui.js';
import { pintarBienvenida, prepararVinculo, refrescarCliente } from './vistas/bienvenida.js';
import { vInicio, eInicio } from './vistas/inicio.js';
import { vCoches, eCoches } from './vistas/coches.js';
import { vDocs, eDocs } from './vistas/documentos.js';
import { VISTAS_DIAG } from './vistas/diagnostico.js';
import { vSolicitud, eSolicitud, abrirSolicitud } from './vistas/solicitud.js';

const PESTANAS = [
  { id: 'inicio', nombre: 'Inicio', icono: I.inicio },
  { id: 'coches', nombre: 'Mis coches', icono: I.coche },
  { id: 'docs', nombre: 'Documentos', icono: I.docs },
  { id: 'diag', nombre: 'Diagnóstico', icono: I.diag },
];

const VISTAS = {
  inicio: [vInicio, eInicio],
  coches: [vCoches, eCoches],
  docs: [vDocs, eDocs],
  solicitud: [vSolicitud, eSolicitud],
  ...VISTAS_DIAG,
};

/** Pestaña que se marca abajo para cada pantalla. */
const pestanaDe = (v) => (esPestana(v) ? v : ['averias', 'bateria', 'mant'].includes(v) ? 'diag' : st.historia.find(esPestana) || 'inicio');

function pintar() {
  const raiz = document.getElementById('app');
  if (st.vincular || (!st.datos.cliente && !st.datos.bienvenidaVista)) return pintarBienvenida(raiz);
  if (!VISTAS[st.vista] || (st.vista === 'solicitud' && !st.sol)) st.vista = 'inicio';
  const [vista, enlazar] = VISTAS[st.vista];
  const tab = pestanaDe(st.vista);
  const sub = !esPestana(st.vista);
  raiz.innerHTML = `
    <header class="cab">
      ${sub ? `<button class="atras" id="volver" aria-label="Volver">${I.atras}</button>` : `<img class="logo" src="${esc(globalThis.REYMAN_LOGO || 'logo.png')}" alt="Talleres Reyman">`}
      <div class="cab-txt"><strong>${sub ? 'Volver' : 'Talleres Reyman'}</strong>${DEMO ? '<span class="demo">Demostración</span>' : ''}</div>
      ${st.sesion ? '<span class="punto on" title="Adaptador conectado"></span>' : ''}
    </header>
    <main id="vista" tabindex="-1">${vista()}</main>
    <nav class="tabs" aria-label="Secciones">${PESTANAS.map((x) => `<button data-ir="${x.id}" ${x.id === tab ? 'aria-current="page"' : ''}>${x.icono}<span>${x.nombre}</span></button>`).join('')}</nav>`;
  $('#volver', raiz)?.addEventListener('click', () => { if (!volver()) ir('inicio'); });
  // Enlaces comunes: ir a otra pantalla (data-ir) y abrir una solicitud (data-sol, con data-coche y data-sel opcionales)
  raiz.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
  raiz.querySelectorAll('[data-sol]').forEach((b) => b.addEventListener('click', () => abrirSolicitud(b.dataset.sol, { coche: b.dataset.coche || null, sel: b.dataset.sel ? b.dataset.sel.split(',') : [] })));
  enlazar(raiz);
}
alPintar(pintar);

async function iniciar() {
  st.datos = await cargar();
  window.__reymanArrancada = true; // para el aviso de «no ha podido arrancar» de index.html
  if (!st.datos.conexion) st.datos.conexion = { tipo: 'ble' };
  if (!DEMO && !esNativa() && !formasDeConectar().webBle) st.error = 'Este navegador no permite Bluetooth. Usa la app Reyman Connect o Chrome en Android.';
  // Quien ya tenía la app vinculada por código de taller (versiones 0.1–0.3) no vuelve a ver la bienvenida
  if (st.datos.taller) st.datos.bienvenidaVista = true;
  // Enlace de Mi taller en la propia dirección (pruebas en el navegador: ?t=…)
  const tUrl = tokenDeTexto(location.search);
  if (tUrl && tUrl !== st.datos.cliente?.token) prepararVinculo(tUrl);
  pintar();
  alAbrirEnlace((url) => { const t = tokenDeTexto(url); if (t && t !== st.datos.cliente?.token) prepararVinculo(t); });
  alBotonAtras(() => volver());
  if (st.datos.cliente) refrescarCliente();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.datos.cliente) refrescarCliente(); });
}

iniciar();
