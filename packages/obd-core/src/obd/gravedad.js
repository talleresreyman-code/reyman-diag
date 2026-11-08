// Reyman Connect · Gravedad de una avería para el conductor (no para el mecánico)
// Tres niveles, pensados para decidir qué hacer ahora:
//   parar   → rojo: parar en cuanto sea seguro y llamar al taller o a la asistencia.
//   taller  → naranja: se puede circular con cuidado, pero hay que ir al taller pronto.
//   vigilar → amarillo: no es urgente; revisarlo en la próxima visita.
// Es orientativo: la app lo dice siempre así y remite al taller.

export const NIVELES = {
  parar: { nivel: 'parar', titulo: 'Para en cuanto puedas', texto: 'Puede dañar el motor o afectar a la seguridad. Para en un sitio seguro y llama al taller o a tu asistencia.' },
  taller: { nivel: 'taller', titulo: 'Ve al taller pronto', texto: 'Puedes circular con cuidado, sin forzar el motor, pero conviene revisarlo en los próximos días.' },
  vigilar: { nivel: 'vigilar', titulo: 'Revísalo sin prisa', texto: 'No es urgente. Coméntalo en la próxima revisión o cuando pases por el taller.' },
};

// Reglas en orden: la primera que encaja manda. `de`/`a` = rango de códigos P0xxx (en hexadecimal, como el código).
const REGLAS = [
  { de: 'P0217', a: 'P0218', g: 'parar', nota: 'Exceso de temperatura.' },
  { de: 'P0520', a: 'P0524', g: 'parar', nota: 'Presión de aceite.' },
  { de: 'P0093', a: 'P0093', g: 'parar', nota: 'Posible fuga de combustible.' },
  { de: 'P0300', a: 'P0312', g: 'taller', nota: 'Fallo de encendido: si el testigo del motor parpadea, para, porque puede dañar el catalizador.' },
  { de: 'P0335', a: 'P0339', g: 'taller', nota: 'Sensor de cigüeñal: el motor podría pararse.' },
  { de: 'P0340', a: 'P0349', g: 'taller' },
  { de: 'P0087', a: 'P0092', g: 'taller', nota: 'Presión de combustible.' },
  { de: 'P0115', a: 'P0119', g: 'taller', nota: 'Sensor de temperatura del motor: vigila el indicador de temperatura.' },
  { de: 'P0125', a: 'P0128', g: 'vigilar', nota: 'El motor tarda en calentar (termostato).' },
  { de: 'P0171', a: 'P0175', g: 'taller' },
  { de: 'P0299', a: 'P0299', g: 'taller', nota: 'Falta de turbo: evita acelerar a fondo.' },
  { de: 'P0234', a: 'P0234', g: 'taller', nota: 'Exceso de presión del turbo.' },
  { de: 'P0380', a: 'P0384', g: 'vigilar', nota: 'Calentadores: en invierno puede costar arrancar.' },
  { de: 'P0400', a: 'P0409', g: 'vigilar' },
  { de: 'P0420', a: 'P0439', g: 'vigilar', nota: 'Catalizador: puede dar problemas en la ITV.' },
  { de: 'P0440', a: 'P0457', g: 'vigilar', nota: 'Vapores de combustible: revisa que el tapón del depósito cierre bien.' },
  { de: 'P0500', a: 'P0503', g: 'taller' },
  { de: 'P0560', a: 'P0563', g: 'taller', nota: 'Tensión del sistema eléctrico: revisa batería y alternador.' },
  { de: 'P0700', a: 'P0799', g: 'taller', nota: 'Cambio de marchas.' },
  { de: 'P2002', a: 'P2002', g: 'taller', nota: 'Filtro de partículas: haz un trayecto por autovía y, si sigue, ve al taller.' },
  { de: 'P2452', a: 'P2463', g: 'taller', nota: 'Filtro de partículas: haz un trayecto por autovía y, si sigue, ve al taller.' },
  { de: 'P0101', a: 'P0104', g: 'taller' },
];

const valor = (c) => parseInt(c.slice(1), 16);

/** Devuelve { nivel, titulo, texto, nota? } para un código de avería. */
export function gravedad(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (!/^[PCBU][0-9A-F]{4}$/.test(c)) return { ...NIVELES.taller };
  if (c[0] === 'P') {
    for (const r of REGLAS) if (valor(c) >= valor(r.de) && valor(c) <= valor(r.a)) return { ...NIVELES[r.g], ...(r.nota ? { nota: r.nota } : {}) };
    return { ...NIVELES.taller };
  }
  if (c[0] === 'C') return { ...NIVELES.taller, nota: 'Chasis (frenos, ABS, dirección): revísalo pronto.' };
  if (c[0] === 'U') return { ...NIVELES.taller, nota: 'Comunicación entre centralitas.' };
  return { ...NIVELES.vigilar, nota: 'Carrocería o confort.' };
}

/** La peor gravedad de una lista de averías (para el semáforo de la pantalla principal). */
export function peorGravedad(codigos) {
  const orden = ['vigilar', 'taller', 'parar'];
  let peor = null;
  for (const c of codigos) {
    const g = gravedad(c).nivel;
    if (!peor || orden.indexOf(g) > orden.indexOf(peor)) peor = g;
  }
  return peor;
}
