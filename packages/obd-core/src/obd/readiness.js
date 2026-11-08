// Reyman Diag · Monitores de disponibilidad (readiness) — PID 01 del modo 01
// Bytes: A = MIL + nº de averías; B = continuos y tipo de motor; C = no continuos disponibles; D = no continuos sin completar.

const CONTINUOS = [
  { bit: 0, nombre: 'Fallos de encendido' },
  { bit: 1, nombre: 'Sistema de combustible' },
  { bit: 2, nombre: 'Componentes generales' },
];

const NO_CONT_GASOLINA = [
  { bit: 0, nombre: 'Catalizador' },
  { bit: 1, nombre: 'Catalizador calefactado' },
  { bit: 2, nombre: 'Sistema de evaporación (EVAP)' },
  { bit: 3, nombre: 'Aire secundario' },
  { bit: 4, nombre: 'Refrigerante A/A' },
  { bit: 5, nombre: 'Sonda lambda' },
  { bit: 6, nombre: 'Calefacción sonda lambda' },
  { bit: 7, nombre: 'Sistema EGR / VVT' },
];

const NO_CONT_DIESEL = [
  { bit: 0, nombre: 'Catalizador NMHC' },
  { bit: 1, nombre: 'Reducción NOx / SCR (AdBlue)' },
  { bit: 3, nombre: 'Presión de sobrealimentación' },
  { bit: 5, nombre: 'Sensor gases de escape' },
  { bit: 6, nombre: 'Filtro de partículas (DPF)' },
  { bit: 7, nombre: 'Sistema EGR / VVT' },
];

/**
 * Devuelve { mil, numAverias, motor:'gasolina'|'diesel', monitores:[{nombre, tipo, estado:'ok'|'pendiente'}], semaforo }.
 * Semáforo pre-ITV:
 *  - rojo: testigo MIL encendido o averías confirmadas
 *  - amarillo: algún monitor no completado (en ITV puede dar desfavorable según la estación y el año)
 *  - verde: sin MIL y todos los monitores completos
 */
export function decodificarReadiness(bytes) {
  const [A, B, C, D] = bytes;
  const mil = (A & 0x80) !== 0;
  const numAverias = A & 0x7f;
  const diesel = (B & 0x08) !== 0;
  const monitores = [];

  for (const m of CONTINUOS) {
    if (B & (1 << m.bit)) {
      monitores.push({ nombre: m.nombre, tipo: 'continuo', estado: (B & (1 << (m.bit + 4))) ? 'pendiente' : 'ok' });
    }
  }
  for (const m of diesel ? NO_CONT_DIESEL : NO_CONT_GASOLINA) {
    if (C & (1 << m.bit)) {
      monitores.push({ nombre: m.nombre, tipo: 'no continuo', estado: (D & (1 << m.bit)) ? 'pendiente' : 'ok' });
    }
  }

  const pendientes = monitores.filter((m) => m.estado === 'pendiente');
  let semaforo = 'verde';
  let motivo = 'Sin testigo de avería y todos los monitores completados.';
  if (mil || numAverias > 0) {
    semaforo = 'rojo';
    motivo = mil ? 'Testigo de avería (MIL) encendido.' : `${numAverias} avería(s) de emisiones registradas.`;
  } else if (pendientes.length) {
    semaforo = 'amarillo';
    motivo = `${pendientes.length} monitor(es) sin completar: ${pendientes.map((p) => p.nombre).join(', ')}. Conviene un ciclo de conducción antes de la ITV.`;
  }
  return { mil, numAverias, motor: diesel ? 'diesel' : 'gasolina', monitores, semaforo, motivo };
}
