// Reyman Connect · talleres que reciben avisos de la app de cliente.
// El código es lo que el cliente escribe o escanea (QR de la factura). tenant_id = el del taller en App Reyman.
// Cuando haya más talleres, esto pasará a la base de datos de la App Reyman.

export const TALLERES_CONNECT = {
  REYMAN: {
    tenant: 'reyman',
    nombre: 'Talleres Reyman',
    marca: 'CGA Car Service',
    telefono: '665 942 470',
    whatsapp: '34665942470',
    email: 'talleresreyman@gmail.com',
    direccion: 'Camino del Puente Viejo, 1D (frente C/ Ávila), 28500 Arganda del Rey, Madrid',
    horario: 'Lunes a jueves 8:00–16:00 · Viernes 8:00–15:00',
    web: 'https://www.talleresreyman.com',
  },
};

export function buscarTaller(codigo, talleres = TALLERES_CONNECT) {
  const c = String(codigo || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return c && talleres[c] ? { codigo: c, ...talleres[c] } : null;
}

/** Datos que se pueden enseñar al cliente (sin el tenant interno). */
export function fichaPublica(t) {
  if (!t) return null;
  const { tenant, ...rest } = t;
  return rest;
}
