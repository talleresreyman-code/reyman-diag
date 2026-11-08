// Reyman Diag / Reyman Connect · Batería
// Lee la tensión en la toma OBD (ATRV del ELM327) y la interpreta:
// - en reposo (motor parado, mejor tras unas horas sin arrancar): estado de carga aproximado,
// - con el motor en marcha: si el alternador carga bien,
// - durante el arranque: caída mínima, que es lo que mejor delata una batería débil.
// La toma OBD suele leer 0,1–0,2 V menos que los bornes: se compensa con `compensacionV`.
// Umbrales para baterías de plomo (normal y EFB). AGM: algo más altos (tipo 'agm').

export const TIPOS_BATERIA = {
  normal: { nombre: 'Convencional / EFB', desplaz: 0 },
  agm: { nombre: 'AGM (start-stop)', desplaz: 0.1 },
};

export const UMBRALES = {
  reposo: { bien: 12.5, aceptable: 12.3, baja: 12.0 }, // por debajo de "baja" = descargada
  carga: { min: 13.2, max: 15.3 }, // carga inteligente, AGM e híbridos (Ford Kuga: 15,0 V) llegan a ~15,2 V
  arranque: { buena: 10.0, justa: 9.6 }, // mínimo durante el arranque
};

// Tensión en reposo → % de carga aproximado (batería de plomo 12 V a ~20 °C)
const TABLA_CARGA = [[11.51, 10], [11.66, 20], [11.81, 30], [11.96, 40], [12.1, 50], [12.24, 60], [12.37, 70], [12.5, 80], [12.62, 90], [12.73, 100]];

export const SITUACION = { REPOSO: 'reposo', MOTOR: 'motor', ARRANQUE: 'arranque' };

const r1 = (n) => Math.round(n * 100) / 100;

export function porcentajeCarga(v, tipo = 'normal') {
  const x = v - (TIPOS_BATERIA[tipo]?.desplaz || 0);
  if (x <= TABLA_CARGA[0][0]) return x < 11.3 ? 0 : TABLA_CARGA[0][1];
  for (let i = 1; i < TABLA_CARGA.length; i++) {
    const [v1, p1] = TABLA_CARGA[i];
    const [v0, p0] = TABLA_CARGA[i - 1];
    if (x <= v1) return Math.round(p0 + ((x - v0) / (v1 - v0)) * (p1 - p0));
  }
  return 100;
}

/** Con el motor en marcha la tensión supera ~13 V; parado y con contacto, queda por debajo. */
export function detectarSituacion(v, rpm = null) {
  // Motor parado pero tensión de carga: híbrido en READY (convertidor DC-DC), cargador conectado o recién apagado
  if (rpm !== null && rpm !== undefined) return rpm > 300 || v >= 13.3 ? SITUACION.MOTOR : SITUACION.REPOSO;
  return v >= 13.0 ? SITUACION.MOTOR : SITUACION.REPOSO;
}

export function evaluarReposo(vMedida, { tipo = 'normal', compensacionV = 0.1 } = {}) {
  const v = r1(vMedida + compensacionV);
  const d = TIPOS_BATERIA[tipo]?.desplaz || 0;
  const u = UMBRALES.reposo;
  let estado;
  let mensaje;
  if (v >= u.bien + d) { estado = 'bien'; mensaje = 'Batería bien cargada.'; }
  else if (v >= u.aceptable + d) { estado = 'aceptable'; mensaje = 'Carga aceptable. Si el coche hace trayectos cortos, conviene vigilarla.'; }
  else if (v >= u.baja + d) { estado = 'baja'; mensaje = 'Batería baja. Puede fallar en el próximo arranque en frío: revísala en el taller.'; }
  else { estado = 'descargada'; mensaje = 'Batería descargada. Hay que cargarla o cambiarla cuanto antes.'; }
  return { situacion: SITUACION.REPOSO, tension: v, carga: porcentajeCarga(v, tipo), estado, mensaje };
}

export function evaluarCarga(vMedida, { compensacionV = 0.1 } = {}) {
  const v = r1(vMedida + compensacionV);
  const { min, max } = UMBRALES.carga;
  if (v < min) return { situacion: SITUACION.MOTOR, tension: v, estado: 'baja', mensaje: 'Con el motor en marcha la tensión es baja: el alternador podría no estar cargando.' };
  if (v > max) return { situacion: SITUACION.MOTOR, tension: v, estado: 'alta', mensaje: 'Tensión de carga demasiado alta: revisar el regulador del alternador.' };
  return { situacion: SITUACION.MOTOR, tension: v, estado: 'correcta', mensaje: 'El alternador carga correctamente.' };
}

/** Evalúa una lectura suelta: decide si es reposo o motor y aplica lo que toque. */
export function evaluarTension(v, op = {}) {
  if (detectarSituacion(v, op.rpm) !== SITUACION.MOTOR) return evaluarReposo(v, op);
  const r = evaluarCarga(v, op);
  if (op.rpm !== null && op.rpm !== undefined && op.rpm <= 300 && r.estado === 'correcta') {
    r.mensaje = 'Cargando con el motor parado (en un híbrido es el convertidor DC-DC; si no, un cargador).';
  }
  return r;
}

/**
 * Analiza la curva de un arranque. `muestras` = [{ t (ms), v }] en orden.
 * Al empezar a girar, el motor de arranque pide un pico de corriente que hunde la tensión una décima de segundo
 * (comprobado en un PSA: 9,2 V un instante y 10,5–11 V mientras gira). Ese pico no dice nada de la batería:
 * lo que cuenta es la «meseta», la tensión mientras el motor de arranque gira. Se evalúa la meseta y el pico
 * se informa aparte.
 */
export function analizarArranque(muestras, { compensacionV = 0.1, ignorarPicoMs = 150 } = {}) {
  if (!muestras?.length) return null;
  const vs = muestras.map((m) => m.v);
  const antes = Math.max(...vs.slice(0, Math.max(1, Math.min(3, vs.length))));
  let iPico = 0;
  for (let i = 1; i < vs.length; i++) if (vs[i] < vs[iPico]) iPico = i;
  const despues = r1(vs[vs.length - 1] + compensacionV);
  const caida = r1(antes - vs[iPico]);
  if (caida < 0.8) return { detectado: false, minimo: r1(vs[iPico] + compensacionV), antes: r1(antes + compensacionV), despues, mensaje: 'No se ha detectado el arranque. Pulsa «Medir» con el motor parado y arranca el coche en los 10 segundos siguientes.' };
  // Ventana del arranque: desde que la tensión cae hasta que vuelve a acercarse a la de reposo (el motor ya ha arrancado)
  const umbral = antes - 0.8;
  const iIni = vs.findIndex((v) => v < umbral);
  let iFin = iIni;
  while (iFin + 1 < vs.length && vs[iFin + 1] < umbral) iFin++;
  const ventana = muestras.slice(iIni, iFin + 1);
  const t0 = ventana[0].t;
  let sinPico = ventana.filter((m) => m.t - t0 >= ignorarPicoMs).map((m) => m.v);
  if (!sinPico.length) sinPico = ventana.length > 1 ? ventana.slice(1).map((m) => m.v) : ventana.map((m) => m.v);
  const orden = [...sinPico].sort((a, b) => a - b);
  const mediana = orden.length % 2 ? orden[(orden.length - 1) / 2] : (orden[orden.length / 2 - 1] + orden[orden.length / 2]) / 2;
  const meseta = r1(mediana + compensacionV);
  const pico = r1(vs[iPico] + compensacionV);
  const duracionMs = ventana[ventana.length - 1].t - t0;
  const u = UMBRALES.arranque;
  let estado;
  let mensaje;
  if (meseta >= u.buena) { estado = 'buena'; mensaje = 'Arranque fuerte: la batería responde bien.'; }
  else if (meseta >= u.justa) { estado = 'justa'; mensaje = 'Arranque justo: la batería empieza a perder capacidad. Revísala antes del invierno.'; }
  else { estado = 'debil'; mensaje = 'Arranque débil: la batería no aguanta bien la carga. Es probable que falle pronto.'; }
  const avisos = [];
  if (pico < 7.5) avisos.push('El pico inicial baja de 7,5 V: algunas centralitas pueden reiniciarse al arrancar.');
  if (duracionMs > 2500) avisos.push('El motor ha tardado en arrancar (más de 2,5 s girando): si es habitual, revisar también el arranque y la alimentación del motor.');
  return {
    detectado: true, situacion: SITUACION.ARRANQUE, antes: r1(antes + compensacionV), minimo: meseta, meseta, pico, despues, caida,
    duracionMs, tMinMs: muestras[iPico].t - muestras[0].t, muestrasArranque: ventana.length, estado, mensaje, avisos, carga: despues >= 13.2 ? 'correcta' : 'baja',
  };
}

/**
 * Mide un arranque con el adaptador: pregunta la tensión (ATRV) muy seguido durante `duracionMs`.
 * Para en cuanto, tras la caída, la tensión supera la de carga durante un rato.
 */
export async function medirArranque(elm, { duracionMs = 10000, intervaloMs = 60, alMuestra = () => {}, ahora = () => Date.now() } = {}) {
  const muestras = [];
  const t0 = ahora();
  let caido = false;
  let recuperado = 0;
  while (ahora() - t0 < duracionMs) {
    const v = await elm.tension();
    if (v !== null) {
      const m = { t: ahora() - t0, v };
      muestras.push(m);
      alMuestra(m);
      if (muestras.length > 1 && v < muestras[0].v - 0.8) caido = true;
      if (caido && v >= 13.2) { recuperado++; if (recuperado >= 5) break; }
    }
    if (intervaloMs) await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return { muestras, analisis: analizarArranque(muestras) };
}

/**
 * Historial de lecturas guardado en el móvil (o en el servidor del taller).
 * Cada lectura: { fecha: ISO, tension, situacion, estado?, minimo? }
 */
export class HistorialBateria {
  constructor(lecturas = [], { maximo = 500 } = {}) {
    this.lecturas = [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    this.maximo = maximo;
  }

  agregar(l) {
    this.lecturas.push({ ...l, fecha: l.fecha || new Date().toISOString() });
    this.lecturas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (this.lecturas.length > this.maximo) this.lecturas.splice(0, this.lecturas.length - this.maximo);
    return this;
  }

  ultima(situacion) {
    for (let i = this.lecturas.length - 1; i >= 0; i--) if (!situacion || this.lecturas[i].situacion === situacion) return this.lecturas[i];
    return null;
  }

  /** Pendiente de la tensión en reposo en voltios por semana (regresión lineal). null si hay pocos datos. */
  tendencia({ dias = 45, ahora = new Date() } = {}) {
    const desde = new Date(ahora.getTime() - dias * 86400000).toISOString();
    const pts = this.lecturas.filter((l) => l.situacion === SITUACION.REPOSO && l.fecha >= desde)
      .map((l) => [new Date(l.fecha).getTime() / (7 * 86400000), l.tension]);
    if (pts.length < 4) return null;
    const span = pts[pts.length - 1][0] - pts[0][0];
    if (span < 1) return null; // menos de una semana de datos
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    return den ? r1(num / den) : null;
  }

  toJSON() { return this.lecturas; }
}

/**
 * Avisos para el conductor a partir de lo último que se sabe.
 * @returns [{ nivel: 'info'|'aviso'|'urgente', texto }]
 */
export function avisosBateria({ reposo, carga, arranque, tendencia, mes = new Date().getMonth() + 1 } = {}) {
  const out = [];
  if (reposo?.estado === 'descargada') out.push({ nivel: 'urgente', texto: 'Batería descargada: cárgala o cámbiala cuanto antes.' });
  else if (reposo?.estado === 'baja') out.push({ nivel: 'aviso', texto: 'Batería baja: pásate por el taller para comprobarla.' });
  if (arranque?.estado === 'debil') out.push({ nivel: 'urgente', texto: 'Arranque débil: la batería puede dejarte tirado pronto.' });
  else if (arranque?.estado === 'justa') out.push({ nivel: 'aviso', texto: 'La batería pierde fuerza en el arranque. Revísala antes del invierno.' });
  if (carga?.estado === 'baja') out.push({ nivel: 'urgente', texto: 'El alternador no parece cargar la batería. Revísalo cuanto antes.' });
  if (carga?.estado === 'alta') out.push({ nivel: 'aviso', texto: 'Tensión de carga demasiado alta: revisar el alternador.' });
  if (tendencia !== null && tendencia !== undefined && tendencia <= -0.05) out.push({ nivel: 'aviso', texto: 'La tensión en reposo baja semana a semana: la batería se está desgastando.' });
  const invierno = [10, 11, 12, 1].includes(mes);
  if (invierno && (arranque?.estado === 'justa' || reposo?.estado === 'aceptable')) out.push({ nivel: 'info', texto: 'Llega el frío: es buen momento para revisar la batería.' });
  return out;
}

// ---------------------------------------------------------------------------
// Prueba de carga del alternador (motor en marcha), en dos pasos:
//   1. Ralentí sin consumidores.
//   2. Con consumidores (luces de cruce, luneta térmica, ventilador al máximo) y unas 2.000 rpm.
// Ojo: muchos coches desde ~2010 tienen carga inteligente (VAG, BMW, Mercedes, Stellantis…): con la batería
// llena el alternador puede bajar a 12,6–13,2 V a propósito. Por eso en el paso 1 una tensión baja es «aviso»,
// y lo que decide es el paso 2, donde el alternador tiene que cargar.

export const UMBRALES_ALTERNADOR = {
  ralenti: { min: 13.5, max: 14.9, inteligenteMin: 12.6 },
  carga: { buena: 13.2, justa: 12.8 },
  max: 15.0,
};

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function resumenMuestras(vs) {
  const v = vs.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const m = media(v);
  return { media: r1(m), min: r1(Math.min(...v)), max: r1(Math.max(...v)), variacion: r1(Math.max(...v) - Math.min(...v)), n: v.length };
}

/**
 * @param {object} p { ralenti: [V], conCarga: [V], rpmCarga?: número, compensacionV }
 * @returns { estado: 'correcto'|'justo'|'no-carga'|'sobrecarga', mensaje, ralenti, conCarga, avisos[] }
 */
export function evaluarAlternador({ ralenti = [], conCarga = [], rpmCarga = null, compensacionV = 0.1 } = {}) {
  const R = resumenMuestras(ralenti.map((v) => v + compensacionV));
  const C = resumenMuestras(conCarga.map((v) => v + compensacionV));
  const u = UMBRALES_ALTERNADOR;
  const avisos = [];
  if (!R && !C) return null;
  if ((R && R.max > u.max) || (C && C.max > u.max)) {
    return { estado: 'sobrecarga', mensaje: 'Tensión de carga demasiado alta (más de 15 V): revisar el regulador del alternador. Puede dañar la batería.', ralenti: R, conCarga: C, avisos };
  }
  if (R) {
    if (R.media < u.ralenti.inteligenteMin) avisos.push('En ralentí la tensión no llega a 12,6 V: el alternador apenas carga.');
    else if (R.media < u.ralenti.min) avisos.push('En ralentí carga poco (12,6–13,5 V). Es normal si el coche tiene carga inteligente y la batería está llena; si no, revisar.');
    if (R.variacion > 0.6) avisos.push('La tensión oscila mucho en ralentí: revisar conexiones, correa o regulador.');
  }
  if (!C) {
    const ok = R.media >= u.ralenti.min;
    return { estado: ok ? 'correcto' : 'justo', mensaje: ok ? 'En ralentí el alternador carga bien. Haz también el paso con consumo para confirmarlo.' : 'Falta el paso con consumo para saber si el alternador carga de verdad.', ralenti: R, conCarga: null, avisos };
  }
  if (rpmCarga !== null && rpmCarga < 1200) avisos.push('Con consumo, el motor estaba a menos de 1.200 rpm: repite la prueba acelerando a unas 2.000 rpm.');
  let estado; let mensaje;
  if (C.media >= u.carga.buena) { estado = 'correcto'; mensaje = 'El alternador carga correctamente también con consumo.'; }
  else if (C.media >= u.carga.justa) { estado = 'justo'; mensaje = 'Con consumo el alternador carga justo. Revisar alternador, correa y conexiones si la batería se descarga.'; }
  else { estado = 'no-carga'; mensaje = 'Con consumo el alternador no mantiene la tensión: la batería se está descargando. Revisar alternador y correa.'; }
  return { estado, mensaje, ralenti: R, conCarga: C, avisos };
}

/**
 * Toma muestras de tensión (y rpm si se pasa obd) durante `duracionMs`.
 * @returns { tensiones: [V], rpm: [rpm], muestras: [{t, v, rpm}] }
 */
export async function muestrearTension(elm, { obd = null, duracionMs = 8000, intervaloMs = 250, ahora = () => Date.now(), alMuestra = () => {} } = {}) {
  const t0 = ahora();
  const muestras = [];
  while (ahora() - t0 < duracionMs) {
    const v = await elm.tension();
    let rpm = null;
    if (obd) { try { rpm = (await obd.leerPid(0x0c)).valor; } catch { /* */ } }
    if (v !== null) { const m = { t: ahora() - t0, v, rpm }; muestras.push(m); alMuestra(m); }
    if (intervaloMs) await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return { muestras, tensiones: muestras.map((m) => m.v), rpm: muestras.map((m) => m.rpm).filter((x) => x !== null) };
}
