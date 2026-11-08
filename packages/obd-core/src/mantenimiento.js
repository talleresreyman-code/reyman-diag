// Reyman Connect · Mantenimiento por kilómetros y fechas
// El cliente apunta la última revisión (fecha y km) y la fecha de la próxima ITV.
// Los km actuales salen del cuentakilómetros por OBD (PID A6) cuando el coche lo da;
// si no, se estiman con el ritmo de km/día de las lecturas anteriores y se marcan como estimados.

export const POR_DEFECTO = { intervaloKm: 15000, intervaloMeses: 12, avisoKm: 1500, avisoDias: 30 };

const DIA = 86400000;
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / DIA);

/**
 * Km actuales a partir de las lecturas guardadas [{ fecha, km, origen: 'obd'|'manual' }].
 * Devuelve { km, estimado, kmDia } o null.
 */
export function kmActuales(lecturas = [], hoy = new Date()) {
  const ok = lecturas.filter((l) => Number.isFinite(l.km) && l.km > 0).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (!ok.length) return null;
  const ultima = ok[ok.length - 1];
  // Ritmo de km/día solo si hay al menos una semana de datos
  const primera = dias(ok[0].fecha, ultima.fecha) >= 7 ? ok[0] : null;
  const kmDia = primera && dias(primera.fecha, ultima.fecha) > 0 ? (ultima.km - primera.km) / dias(primera.fecha, ultima.fecha) : null;
  const transcurridos = Math.max(0, dias(ultima.fecha, hoy));
  if (transcurridos === 0 || !kmDia || kmDia <= 0) return { km: ultima.km, estimado: transcurridos > 0, kmDia, fecha: ultima.fecha };
  return { km: Math.round(ultima.km + kmDia * transcurridos), estimado: true, kmDia, fecha: ultima.fecha };
}

const sumarMeses = (fecha, meses) => { const d = new Date(fecha); d.setMonth(d.getMonth() + meses); return d; };

/**
 * Estado del mantenimiento.
 * @param {object} p { ultimaRevision: {fecha, km}, intervaloKm, intervaloMeses, km, itv: {fecha}, hoy }
 */
export function estadoMantenimiento(p = {}) {
  const hoy = p.hoy ? new Date(p.hoy) : new Date();
  const cfg = { ...POR_DEFECTO, ...p };
  const out = { revision: null, itv: null, avisos: [] };

  if (p.ultimaRevision?.fecha) {
    const venceFecha = sumarMeses(p.ultimaRevision.fecha, cfg.intervaloMeses);
    const diasRestantes = dias(hoy, venceFecha);
    let kmRestantes = null;
    let porcKm = null;
    if (Number.isFinite(p.ultimaRevision.km) && Number.isFinite(p.km)) {
      kmRestantes = p.ultimaRevision.km + cfg.intervaloKm - p.km;
      porcKm = Math.min(100, Math.max(0, Math.round(((p.km - p.ultimaRevision.km) / cfg.intervaloKm) * 100)));
    }
    const porcTiempo = Math.min(100, Math.max(0, Math.round((dias(p.ultimaRevision.fecha, hoy) / dias(p.ultimaRevision.fecha, venceFecha)) * 100)));
    const vencida = diasRestantes < 0 || (kmRestantes !== null && kmRestantes < 0);
    const pronto = !vencida && (diasRestantes <= cfg.avisoDias || (kmRestantes !== null && kmRestantes <= cfg.avisoKm));
    out.revision = {
      venceFecha: venceFecha.toISOString().slice(0, 10), diasRestantes, kmRestantes,
      porcentaje: Math.max(porcTiempo, porcKm ?? 0), estado: vencida ? 'vencida' : pronto ? 'pronto' : 'ok',
    };
    if (vencida) out.avisos.push({ nivel: 'aviso', texto: 'La revisión está vencida. Pide cita en tu taller.' });
    else if (pronto) out.avisos.push({ nivel: 'info', texto: kmRestantes !== null && kmRestantes <= cfg.avisoKm ? `Faltan unos ${Math.max(0, kmRestantes).toLocaleString('es-ES')} km para la revisión.` : `La revisión toca en ${diasRestantes} días.` });
  }

  if (p.itv?.fecha) {
    const diasRestantes = dias(hoy, p.itv.fecha);
    const estado = diasRestantes < 0 ? 'vencida' : diasRestantes <= 30 ? 'pronto' : 'ok';
    out.itv = { fecha: p.itv.fecha, diasRestantes, estado };
    if (estado === 'vencida') out.avisos.push({ nivel: 'urgente', texto: 'La ITV está caducada: no puedes circular con ella vencida.' });
    else if (estado === 'pronto') out.avisos.push({ nivel: 'info', texto: `La ITV caduca en ${diasRestantes} días. Te podemos hacer la pre-ITV.` });
  }
  return out;
}
