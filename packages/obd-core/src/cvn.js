// Reyman Diag · ¿Software de la centralita original? Comparación del CVN (servicio 09) con referencias.
// El CVN es la suma de verificación que calcula la propia centralita sobre su software (CALID). Si alguien
// reprograma la centralita, normalmente cambia. La lista oficial de CVN de cada fabricante no es pública,
// así que la referencia sale de: 1) una referencia marcada a mano como «original de fábrica»,
// 2) el mismo coche leído antes (si ha cambiado, se ha tocado), 3) otros coches con el mismo software.

/**
 * @param {{calid, cvn, vin}} x lectura actual
 * @param {{ref?: {cvn, creada}, propias: [{cvn, primera, ultima}], otros: [{cvn, coches}]}} datos lo que hay en la base (sin esta lectura)
 * @returns {{estado: 'ok'|'mal'|'dudoso'|'sin_ref', motivo: string, coches?: number}}
 */
export function evaluarCvn(x, { ref, propias = [], otros = [] }) {
  const cvn = norm(x.cvn);
  if (ref) {
    return norm(ref.cvn) === cvn
      ? { estado: 'ok', motivo: 'Coincide con la referencia original de fábrica.' }
      : { estado: 'mal', motivo: `No coincide con la referencia original de fábrica (${norm(ref.cvn)}): software modificado.` };
  }
  const antes = propias.filter((p) => norm(p.cvn) !== cvn).sort((a, b) => new Date(a.primera) - new Date(b.primera));
  if (antes.length) {
    const f = new Date(antes[0].primera).toLocaleDateString('es-ES');
    return { estado: 'mal', motivo: `Ha cambiado desde la lectura del ${f} (antes ${norm(antes[0].cvn)}): la centralita se ha reprogramado.` };
  }
  const total = otros.reduce((n, o) => n + o.coches, 0);
  if (!total) return { estado: 'sin_ref', motivo: 'Primera vez que se lee este software: aún no hay con qué compararlo.' };
  const iguales = otros.filter((o) => norm(o.cvn) === cvn).reduce((n, o) => n + o.coches, 0);
  const mayor = otros.reduce((m, o) => (o.coches > m.coches ? o : m), otros[0]);
  if (iguales && iguales >= total - iguales) {
    return { estado: 'ok', coches: iguales, motivo: `Igual que en ${iguales} coche${iguales > 1 ? 's' : ''} más con el mismo software.` };
  }
  if (!iguales && mayor.coches >= 2) {
    return { estado: 'mal', coches: mayor.coches, motivo: `Distinto de ${mayor.coches} coches con el mismo software (${norm(mayor.cvn)}): probablemente modificado.` };
  }
  return { estado: 'dudoso', coches: total, motivo: `Hay ${total} coche${total > 1 ? 's' : ''} con el mismo software y no todos tienen el mismo CVN: no se puede asegurar.` };
}

export const norm = (s) => String(s || '').replace(/[^0-9A-F]/gi, '').toUpperCase();
export const normCalid = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
