// Reyman Connect · estado de la app y navegación

import { guardar } from './almacen.js';

export const DEMO = globalThis.REYMAN_CONNECT_DEMO === true || new URLSearchParams(globalThis.location?.search || '').has('demo');

export const TALLER = {
  nombre: 'Talleres Reyman', marca: 'CGA Car Service', telefono: '665 942 470', whatsapp: '34665942470',
  direccion: 'Camino del Puente Viejo, 1D (frente C/ Ávila), 28500 Arganda del Rey, Madrid',
  horario: 'Lunes a jueves de 8:00 a 16:00 · Viernes de 8:00 a 15:00',
  mapa: 'https://www.google.com/maps/search/?api=1&query=Talleres+Reyman+Arganda+del+Rey',
};

export const st = {
  datos: null,
  vista: 'inicio', // inicio · coches · docs · diag (pestañas) · averias · bateria · mant · solicitud (subpantallas)
  historia: [], // pantallas anteriores para «Volver» (y el botón atrás de Android)
  sol: null, // solicitud que se está rellenando
  filtroDocs: { matricula: null, tipo: null },
  sesion: null, // { transporte, elm, obd }
  ocupado: null,
  error: null,
  midiendo: null,
  vincular: null,
  cargandoCliente: false,
  bloqueada: false, // pantalla de Face ID / huella / código
  errorBloqueo: null,
  ocultaDesde: null, // cuándo se fue la app al segundo plano
  condiciones: null, // casillas de la pantalla de condiciones
};

export async function persistir() { await guardar(st.datos); }

let pintarFn = () => {};
export function alPintar(fn) { pintarFn = fn; }
export function pintar() { pintarFn(); }

const PESTANAS = ['inicio', 'coches', 'docs', 'diag'];
export const esPestana = (v) => PESTANAS.includes(v);

/** Ir a una pantalla. Las pestañas limpian el historial; las subpantallas se apilan para poder volver. */
export function ir(vista) {
  if (esPestana(vista)) st.historia = [];
  else if (st.vista !== vista) st.historia.push(st.vista);
  st.vista = vista;
  pintar();
  window.scrollTo(0, 0);
}

export function volver() {
  if (!st.historia.length) return false;
  st.vista = st.historia.pop();
  if (st.vista !== 'solicitud') st.sol = st.historia.includes('solicitud') ? st.sol : null;
  pintar();
  window.scrollTo(0, 0);
  return true;
}
