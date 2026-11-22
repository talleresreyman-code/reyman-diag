// Reyman Connect · libro de mantenimiento de cada coche (lo manda el taller dentro de «Mi taller», sin precios)
//
// libro = { desde, visitas, servicios, kmAnual, kmHoy, ultimo, proximo, estado[], mantenimiento[], otras[], revision }
//   revision (la más fiable): { ultima: { fecha, km, texto }, plazoMeses, plazoKm, prevista, motivo, dias }
//   proximo (por el aceite): { fecha, km, vencido, items[] } · estado[]: { n, i, est: ok|pronto|toca|sinreg, fecha, km }

import { leerFecha, diasHasta } from './solicitudes.js';

const DIA = 86400000;

/**
 * Próxima revisión del coche: cuándo (fecha y km), cuánto falta y de qué color va.
 * kmActuales: los km reales si se conocen (adaptador o el cliente); si no, los que estima el taller.
 */
export function resumenRevision(libro, { hoy = new Date(), kmActuales = null } = {}) {
  if (!libro) return null;
  const r = libro.revision, p = libro.proximo;
  let ultima = null, fecha = null, kmObjetivo = null, meses = 12, plazoKm = 15000;
  if (r && r.ultima) {
    ultima = r.ultima; fecha = r.prevista; meses = r.plazoMeses || 12; plazoKm = r.plazoKm || 15000;
    kmObjetivo = r.ultima.km ? r.ultima.km + plazoKm : null;
  } else if (p) {
    fecha = p.fecha; kmObjetivo = p.km || null;
    const f = leerFecha(p.fecha); if (f) { const u = new Date(f); u.setMonth(u.getMonth() - 12); ultima = { fecha: u.toISOString().slice(0, 10), km: kmObjetivo ? kmObjetivo - plazoKm : null }; }
  } else return null;
  const kmHoy = Number(kmActuales) > 0 ? Number(kmActuales) : Number(libro.kmHoy) > 0 ? Number(libro.kmHoy) : null;
  const dias = diasHasta(fecha, hoy);
  // cuánto se ha «gastado» del plazo: lo que vaya por delante, tiempo o km
  const fu = leerFecha(ultima && ultima.fecha);
  const porTiempo = fu ? (hoy - fu) / (meses * 30.44 * DIA) : 0;
  const porKm = kmHoy && ultima && ultima.km ? (kmHoy - ultima.km) / plazoKm : 0;
  const frac = Math.max(0, Math.min(1, Math.max(porTiempo, porKm)));
  const kmFaltan = kmHoy && kmObjetivo ? kmObjetivo - kmHoy : null;
  const vencida = (dias !== null && dias < 0) || (kmFaltan !== null && kmFaltan <= 0);
  const color = vencida ? 'rojo' : (dias !== null && dias <= 45) || (kmFaltan !== null && kmFaltan <= 1500) || frac >= 0.85 ? 'ambar' : 'verde';
  return { fecha, dias, kmObjetivo, kmHoy, kmEstimados: !(Number(kmActuales) > 0), kmFaltan, frac, color, vencida, ultima, motivo: r ? r.motivo : 'tiempo', items: (p && p.items) || [] };
}

/** Texto corto para Mis coches e Inicio: «Toca en 3 meses (marzo 2027)», «Vencida desde el 12/03/2026»… */
export function textoRevision(rv) {
  if (!rv) return '';
  const f = leerFecha(rv.fecha);
  const mes = f ? f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '';
  if (rv.vencida) return rv.dias !== null && rv.dias < 0 ? `Vencida desde ${mes}` : 'Ya le toca por kilómetros';
  if (rv.dias === null) return '';
  if (rv.dias <= 31) return rv.dias <= 0 ? 'Le toca ya' : `Le toca en ${rv.dias} ${rv.dias === 1 ? 'día' : 'días'}`;
  const m = Math.round(rv.dias / 30.44);
  return `Le toca en ${m} ${m === 1 ? 'mes' : 'meses'} (${mes})`;
}
