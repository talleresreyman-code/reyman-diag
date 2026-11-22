// Reyman Connect · solicitudes del cliente al taller
//
// Los cinco motivos por los que un cliente contacta con el taller:
//   1. Mantenimiento (revisión, aceite, ruedas, frenos, ITV…)
//   2. Avería (testigo, ruido, fuga, síntomas…)
//   3. Presupuesto (por curiosidad o porque lo quiere hacer)
//   4. Consulta técnica (de su coche o de otro)
//   5. Facturas y pagos
//
// La app no inventa un canal nuevo: rellena en pocos toques lo que el taller necesita saber y lo abre en
// WhatsApp, ya escrito y ordenado. El cliente solo pulsa «Enviar» (y si quiere añade fotos, vídeo o una nota de voz).
// Lo recibe el asistente IA REYMAN, que ya no tiene que preguntar nada, y el equipo lo ve clasificado.
// Sin servidor nuevo y sin coste: es el cliente quien escribe.
//
// Este módulo es lógica pura (sin pantalla), para poder probarlo.

import { resumenRevision, textoRevision } from './libro.js';

export const WHATSAPP_TALLER = '34665942470';

export const TIPOS = {
  mant: { id: 'mant', titulo: 'Mantenimiento', sub: 'Revisión, aceite, ruedas, frenos, ITV…', cabecera: 'Pedir cita · Mantenimiento', emoji: '🔧' },
  averia: { id: 'averia', titulo: 'Le pasa algo al coche', sub: 'Testigo encendido, ruido, fuga, tirones…', cabecera: 'Avería · Pedir cita', emoji: '⚠️' },
  presupuesto: { id: 'presupuesto', titulo: 'Pedir presupuesto', sub: 'Saber cuánto cuesta un trabajo', cabecera: 'Presupuesto', emoji: '💶' },
  consulta: { id: 'consulta', titulo: 'Consulta técnica', sub: 'Una duda de tu coche o de otro', cabecera: 'Consulta técnica', emoji: '💬' },
  admin: { id: 'admin', titulo: 'Facturas y pagos', sub: 'Copias, importes, formas de pago', cabecera: 'Facturas y pagos', emoji: '🧾' },
};
export const ORDEN_TIPOS = ['mant', 'averia', 'presupuesto', 'consulta', 'admin'];

export const MANT = [
  ['revision', 'Revisión / cambio de aceite'], ['neumaticos', 'Neumáticos'], ['frenos', 'Frenos'], ['preitv', 'Pre-ITV'],
  ['itv', 'Pasar la ITV'], ['aire', 'Aire acondicionado'], ['bateria', 'Batería'], ['distribucion', 'Distribución'],
  ['automatico', 'Cambio automático'], ['amortiguadores', 'Amortiguadores'], ['luces', 'Luces y escobillas'], ['otro', 'Otra cosa'],
];
export const GAMAS = [['eco', 'Económica'], ['calidad', 'Calidad'], ['premium', 'Premium']];

export const SINTOMAS = [
  ['testigo', 'Testigo encendido'], ['ruido', 'Ruido'], ['fuga', 'Fuga o mancha'], ['humo', 'Humo'],
  ['tirones', 'Tirones o vibraciones'], ['potencia', 'Pierde fuerza'], ['arranque', 'Le cuesta arrancar o no arranca'],
  ['frenos', 'Frena raro'], ['direccion', 'Dirección rara'], ['clima', 'No enfría o no calienta'], ['otro', 'Otra cosa'],
];
export const TESTIGOS = [
  ['motor', 'Motor'], ['aceite', 'Aceite'], ['bateria', 'Batería'], ['frenos', 'Frenos / ABS'], ['temperatura', 'Temperatura'],
  ['airbag', 'Airbag'], ['presion', 'Presión de ruedas'], ['diesel', 'Precalentamiento / filtro de partículas'], ['otro', 'Otro'],
];
export const CUANDO_PASA = [
  ['siempre', 'Siempre'], ['frio', 'En frío'], ['caliente', 'En caliente'], ['arrancar', 'Al arrancar'], ['acelerar', 'Al acelerar'],
  ['frenar', 'Al frenar'], ['girar', 'Al girar'], ['velocidad', 'A cierta velocidad'], ['baches', 'En baches'],
];
export const DESDE = [['hoy', 'Desde hoy'], ['dias', 'Desde hace unos días'], ['semanas', 'Desde hace semanas']];
export const CIRCULAR = [['si', 'Puedo circular normal'], ['dudas', 'Circulo, pero me preocupa'], ['no', 'No puedo circular']];

export const PRESUPUESTO = [
  ['revision', 'Revisión'], ['frenos', 'Frenos'], ['neumaticos', 'Neumáticos'], ['distribucion', 'Distribución'],
  ['embrague', 'Embrague'], ['aire', 'Aire acondicionado'], ['averia', 'Reparar una avería'], ['otro', 'Otra cosa'],
];
export const PLAZO = [['informar', 'Solo quiero saber el precio'], ['hacer', 'Quiero hacerlo']];

export const SOBRE = [['mio', 'Mi coche'], ['otro', 'Otro coche'], ['general', 'Una duda general']];

export const ADMIN = [
  ['copia', 'Necesito una factura o una copia'], ['importe', 'Duda con un importe'], ['pago', 'Forma de pago'],
  ['financiar', 'Financiar una reparación'], ['datos', 'Cambiar mis datos de facturación'], ['otro', 'Otra cosa'],
];

export const CUANDO = [['pronto', 'Lo antes posible'], ['semana', 'Esta semana'], ['proxima', 'La semana que viene'], ['dia', 'Un día concreto']];
export const RECOGIDA = [['listo', 'Cuando esté listo'], ['hora', 'Necesito una hora concreta']];

const nombre = (lista, id) => lista.find(([k]) => k === id)?.[1] || id;
const nombres = (lista, ids) => (ids || []).map((id) => nombre(lista, id));

/** Solicitud vacía de un tipo (con el coche elegido, si se sabe). */
export function nuevaSolicitud(tipo, { coche = null, sel = [] } = {}) {
  return {
    tipo, coche, otro: { marca: '', modelo: '', matricula: '', km: '', anio: '' }, km: '',
    sel: [...sel], testigos: [], pasa: [], desde: null, circular: null, codigos: true,
    neumaticos: { medida: '', cantidad: '', gama: null },
    plazo: null, sobre: null, cuando: null, dia: '', recogida: null, horaRecogida: '', sustitucion: false, texto: '',
  };
}

/** Coches que puede elegir el cliente: los de su ficha del taller y el que tiene en la app (sin repetir). */
export function cochesDisponibles(datos) {
  const out = [];
  const vistos = new Set();
  for (const v of datos?.clienteDatos?.vehiculos || []) {
    const m = limpiaMatricula(v.matricula);
    if (!m || vistos.has(m)) continue;
    vistos.add(m);
    out.push({ id: m, matricula: m, marca: v.marca || '', modelo: v.modelo || '', motor: v.motor || '', nombre: [v.marca, v.modelo].filter(Boolean).join(' '), km: Number(v.km) > 0 ? Number(v.km) : null, origen: 'taller', itv: v.proxima_itv || v.itv_cliente || '', enTaller: enTaller(v) });
  }
  const loc = datos?.vehiculo;
  const mLoc = limpiaMatricula(loc?.matricula);
  if (loc && (!mLoc || !vistos.has(mLoc)) && (mLoc || loc.marca)) {
    out.push({ id: mLoc || 'app', matricula: mLoc || '', nombre: loc.alias || [loc.marca, loc.anio].filter(Boolean).join(' ') || 'Mi coche', km: null, origen: 'app', itv: datos?.mantenimiento?.itv?.fecha ? fechaES(datos.mantenimiento.itv.fecha) : '' });
  }
  return out;
}

/** El coche está físicamente en el taller (no basta con tener una OT abierta o un presupuesto). */
export const enTaller = (v) => v?.en_taller === true || v?.estado?.en_taller === true;

export function limpiaMatricula(m) { return String(m || '').replace(/[\s-]/g, '').toUpperCase(); }

/** «2026-12-15» → «15/12/2026» */
export function fechaES(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

/** «15/12/2026» o «2026-12-15» → Date (mediodía, sin problemas de zona horaria) o null */
export function leerFecha(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return null;
}

export function diasHasta(fecha, hoy = new Date()) {
  const f = fecha instanceof Date ? fecha : leerFecha(fecha);
  if (!f) return null;
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  return Math.round((f - h) / 86400000);
}

/** El taller abre de lunes a viernes. */
export function esDiaCerrado(iso) {
  const f = leerFecha(iso);
  if (!f) return false;
  const d = f.getDay();
  return d === 0 || d === 6;
}

const fmtKm = (n) => `${Math.round(n).toLocaleString('es-ES')} km`;
const numero = (s) => { const n = Number(String(s ?? '').replace(/\D/g, '')); return n > 0 ? n : null; };

/** Coche de la solicitud resuelto: { nombre, matricula, km } o null. */
export function cocheDe(sol, coches) {
  if (sol.coche === 'otro') {
    const o = sol.otro;
    return { nombre: [o.marca, o.modelo].filter((x) => x && x.trim()).join(' ').trim(), marca: (o.marca || '').trim(), modelo: (o.modelo || '').trim(), anio: String(o.anio || '').replace(/\D/g, '').slice(0, 4), matricula: limpiaMatricula(o.matricula), km: numero(o.km), otro: true };
  }
  const c = coches.find((x) => x.id === sol.coche);
  if (!c) return null;
  return { nombre: c.nombre, marca: c.marca || '', modelo: c.modelo || '', anio: '', matricula: c.matricula, km: numero(sol.km) || null, kmUltimo: c.km };
}

/** ¿Qué tipo de solicitud necesita coche? */
export const necesitaCoche = (sol) => sol.tipo !== 'admin' && !(sol.tipo === 'consulta' && sol.sobre !== 'mio');

/** Devuelve el primer problema que impide enviar (texto para el cliente) o null. */
export function validar(sol, coches = [], { sinCita = false } = {}) {
  if (necesitaCoche(sol)) {
    if (!sol.coche) return 'Elige el coche.';
    const c = cocheDe(sol, coches);
    if (sol.coche === 'otro' && (!c.nombre || !c.matricula)) return 'Escribe la marca, el modelo y la matrícula del coche.';
    if (sol.tipo === 'presupuesto' && !(c?.km)) return 'Para el presupuesto necesitamos los kilómetros actuales del coche.';
  }
  if (sol.tipo === 'mant' && !sol.sel.length) return 'Marca qué necesitas.';
  if (sol.tipo === 'averia' && !sol.sel.length && !sol.texto.trim()) return 'Marca qué notas o cuéntanoslo.';
  if (sol.tipo === 'presupuesto') {
    if (!sol.sel.length && !sol.texto.trim()) return 'Dinos qué trabajo quieres presupuestar.';
    if (sol.sel.includes('otro') && !sol.texto.trim()) return 'Cuéntanos qué trabajo quieres presupuestar.';
    if (!sol.plazo) return 'Dinos si solo quieres saber el precio o si quieres hacerlo.';
  }
  if (sol.tipo === 'consulta') {
    if (!sol.sobre) return 'Dinos si es de tu coche, de otro o una duda general.';
    if (!sol.texto.trim()) return 'Escribe tu consulta.';
  }
  if (sol.tipo === 'admin' && !sol.sel.length) return 'Marca de qué se trata.';
  if (pideCita(sol) && !sinCita) {
    if (!sol.cuando) return 'Dinos cuándo te viene bien.';
    if (sol.cuando === 'dia') {
      if (!sol.dia) return 'Elige el día.';
      if (esDiaCerrado(sol.dia)) return 'Sábados y domingos estamos cerrados: elige otro día.';
    }
    if (sol.tipo === 'mant') {
      if (!sol.recogida) return 'Dinos cuándo necesitas recoger el coche.';
      if (sol.recogida === 'hora' && !/^\d{2}:\d{2}$/.test(sol.horaRecogida || '')) return 'Indica la hora a la que necesitas recogerlo.';
      if (sol.recogida === 'hora' && !horaValida(sol.horaRecogida, sol.dia)) return 'Esa hora está fuera de nuestro horario (lunes a jueves hasta las 16:00, viernes hasta las 15:00).';
    }
  }
  if (sol.tipo === 'admin' && sol.sel.includes('otro') && !sol.texto.trim()) return 'Cuéntanos de qué se trata.';
  return null;
}

/** Hora de recogida dentro del horario (8:00 a 16:00; viernes hasta las 15:00). */
export function horaValida(hhmm, diaIso = '') {
  const m = String(hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const min = Number(m[1]) * 60 + Number(m[2]);
  const viernes = leerFecha(diaIso)?.getDay() === 5;
  return min >= 8 * 60 && min <= (viernes ? 15 : 16) * 60;
}

/** La solicitud pide día de entrada (mantenimiento, avería o presupuesto que quiere hacer). */
export const pideCita = (sol) => sol.tipo === 'mant' || sol.tipo === 'averia' || (sol.tipo === 'presupuesto' && sol.plazo === 'hacer');

/** Referencia corta para encontrar la solicitud: RC-AAMMDD-HHMM */
export function referencia(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `RC-${String(fecha.getFullYear()).slice(2)}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}`;
}

/**
 * Mensaje de WhatsApp ya escrito, ordenado para que el equipo (y el asistente) lo entiendan a la primera.
 * @param sol solicitud
 * @param op { coches, cliente (nombre), codigos (averías leídas con el adaptador), fecha }
 */
export function construirMensaje(sol, { coches = [], cliente = '', codigos = [], fecha = new Date() } = {}) {
  const t = TIPOS[sol.tipo];
  const L = [];
  L.push(cliente ? `Hola, soy ${cliente}. Os escribo desde la app Reyman Connect.` : 'Hola, os escribo desde la app Reyman Connect.');
  L.push('');
  L.push(`${t.emoji} *${t.cabecera}*`);

  if (necesitaCoche(sol) || (sol.tipo === 'consulta' && sol.sobre === 'otro' && sol.coche)) {
    const c = cocheDe(sol, coches);
    if (c) {
      const km = c.km ? fmtKm(c.km) : c.kmUltimo ? `${fmtKm(c.kmUltimo)} en la última visita` : '';
      L.push(`🚗 ${[c.nombre, c.matricula].filter(Boolean).join(' · ')}${km ? ` · ${km}` : ''}`);
    }
  }

  if (sol.tipo === 'mant') {
    L.push(`🛠️ ${nombres(MANT, sol.sel).join(', ')}`);
    if (sol.sel.includes('neumaticos')) {
      const n = sol.neumaticos;
      const partes = [n.medida && `medida ${n.medida.trim()}`, n.cantidad && `${n.cantidad} ${n.cantidad === '1' ? 'rueda' : 'ruedas'}`, n.gama && `gama ${nombre(GAMAS, n.gama).toLowerCase()}`].filter(Boolean);
      if (partes.length) L.push(`🛞 Neumáticos: ${partes.join(' · ')}`);
    }
  }

  if (sol.tipo === 'averia') {
    if (sol.sel.length) L.push(`🔎 ${nombres(SINTOMAS, sol.sel).join(', ')}`);
    if (sol.sel.includes('testigo') && sol.testigos.length) L.push(`💡 Testigo: ${nombres(TESTIGOS, sol.testigos).join(', ')}`);
    if (sol.pasa.length) L.push(`⏱️ Pasa: ${nombres(CUANDO_PASA, sol.pasa).join(', ').toLowerCase()}`);
    if (sol.desde) L.push(`📆 ${nombre(DESDE, sol.desde)}`);
    if (sol.circular) L.push(`${sol.circular === 'no' ? '⛔' : '🚦'} ${nombre(CIRCULAR, sol.circular)}`);
    if (sol.codigos && codigos.length) L.push(`📟 Códigos leídos con el adaptador: ${codigos.join(', ')}`);
    if (sol.pre?.ok) L.push(`🤖 Prediagnóstico Reyman Online: ${sol.pre.titulo || 'hecho'} (${{ rojo: 'no circular', amarillo: 'revisar pronto', verde: 'sin urgencia' }[sol.pre.gravedad] || sol.pre.gravedad})`);
  }

  if (sol.tipo === 'presupuesto') {
    if (sol.sel.length) L.push(`🛠️ ${nombres(PRESUPUESTO, sol.sel).join(', ')}`);
    if (sol.plazo) L.push(`🎯 ${nombre(PLAZO, sol.plazo)}`);
  }

  if (sol.tipo === 'consulta') L.push(`❓ Sobre: ${nombre(SOBRE, sol.sobre).toLowerCase()}`);

  if (sol.tipo === 'admin') L.push(`📌 ${nombres(ADMIN, sol.sel).join(', ')}`);

  if (pideCita(sol) && sol.cuando) {
    const cuando = sol.cuando === 'dia' && sol.dia ? `El ${diaSemana(sol.dia)} ${fechaES(sol.dia)}` : nombre(CUANDO, sol.cuando);
    L.push(`📅 ${cuando}`);
    if (sol.tipo === 'mant' && sol.recogida) L.push(`🕓 Recogida: ${sol.recogida === 'hora' && sol.horaRecogida ? `necesito el coche a las ${sol.horaRecogida}` : 'cuando esté listo'}`);
    if (sol.sustitucion) L.push('🚙 Necesitaría coche de sustitución');
  }

  if (sol.texto.trim()) { L.push(''); L.push(`📝 ${sol.texto.trim()}`); }
  L.push('');
  L.push(`Ref. ${referencia(fecha)}`);
  return L.join('\n');
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function diaSemana(iso) { const f = leerFecha(iso); return f ? DIAS[f.getDay()] : ''; }

export const urlWhatsApp = (texto, numero = WHATSAPP_TALLER) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

/** Resumen de una línea para «Mis solicitudes». */
export function resumen(sol, coches = []) {
  const c = necesitaCoche(sol) ? cocheDe(sol, coches) : null;
  const que = sol.tipo === 'mant' ? nombres(MANT, sol.sel) : sol.tipo === 'averia' ? nombres(SINTOMAS, sol.sel) : sol.tipo === 'presupuesto' ? nombres(PRESUPUESTO, sol.sel) : sol.tipo === 'admin' ? nombres(ADMIN, sol.sel) : [];
  return [TIPOS[sol.tipo].titulo, que.slice(0, 2).join(', ') || sol.texto.trim().slice(0, 40), c?.matricula].filter(Boolean).join(' · ');
}

/**
 * Lo que el cliente tiene pendiente, de más a menos urgente: presupuestos por responder, coche terminado,
 * ITV y revisión cerca. Cada aviso lleva la acción que lo resuelve.
 */
export function pendientes(datos, { hoy = new Date(), revision = null } = {}) {
  const out = [];
  const cd = datos?.clienteDatos;
  for (const p of cd?.presupuestos || []) {
    out.push({ id: `presu-${p.token}`, color: 'ambar', titulo: 'Tienes un presupuesto por responder', detalle: [p.vehiculo, p.matricula].filter(Boolean).join(' · '), accion: { tipo: 'presupuesto', token: p.token }, boton: 'Ver y responder' });
  }
  for (const c of cochesDisponibles(datos)) {
    const d = diasHasta(c.itv, hoy);
    if (d === null || d > 45) continue;
    out.push({
      id: `itv-${c.id}`, color: d < 0 ? 'rojo' : 'ambar',
      titulo: d < 0 ? `La ITV del ${c.matricula || c.nombre} está caducada` : d === 0 ? `La ITV del ${c.matricula || c.nombre} caduca hoy` : `La ITV del ${c.matricula || c.nombre} caduca en ${d} ${d === 1 ? 'día' : 'días'}`,
      detalle: `${c.itv}. Te la pasamos nosotros, con pre-ITV.`, accion: { tipo: 'solicitud', sol: 'mant', coche: c.id, sel: ['preitv', 'itv'] }, boton: 'Pedir cita',
    });
  }
  // revisión de cada coche según su libro de mantenimiento del taller (si no está ya en el taller)
  for (const v of cd?.vehiculos || []) {
    if (!v.libro || enTaller(v)) continue;
    const rv = resumenRevision(v.libro, { hoy });
    if (!rv || rv.dias === null || rv.dias > 30 || rv.dias < -180) continue;
    const m = limpiaMatricula(v.matricula);
    out.push({ id: `rev-${m}`, color: rv.vencida ? 'rojo' : 'ambar', titulo: rv.vencida ? `Le toca la revisión al ${m}` : `Se acerca la revisión del ${m}`,
      detalle: [[v.marca, v.modelo].filter(Boolean).join(' '), textoRevision(rv)].filter(Boolean).join(' · '), accion: { tipo: 'solicitud', sol: 'mant', coche: m, sel: ['revision'] }, boton: 'Pedir cita' });
  }
  if (revision && ['pronto', 'vencida'].includes(revision.estado)) {
    const c = cochesDisponibles(datos).find((x) => x.origen === 'app');
    out.push({ id: 'revision', color: revision.estado === 'vencida' ? 'rojo' : 'ambar', titulo: revision.estado === 'vencida' ? 'Te toca la revisión' : 'Se acerca la revisión', detalle: 'Según los km y la fecha de la última.', accion: { tipo: 'solicitud', sol: 'mant', coche: c?.id || null, sel: ['revision'] }, boton: 'Pedir cita' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reyman Online (prediagnóstico con IA de talleresreyman.com/que-le-pasa-a-mi-coche/) desde la app
// Mismo servicio (n8n «Reyman Online · Prediagnóstico web», POST /webhook/reyman-online): el cliente recibe la
// orientación y la urgencia, y al taller le llega la ficha técnica por correo y al panel, como desde la web.
// ---------------------------------------------------------------------------
export const RE_MOVIL = /^[67]\d{8}$/;
export const limpiaMovil = (t) => { let x = String(t || '').replace(/\D/g, ''); if (x.length === 11 && x.startsWith('34')) x = x.slice(2); return x; };

/** Síntoma principal para Reyman Online: los de riesgo primero (el servicio los trata como «no circular»). */
export function sintomaPrincipal(sol) {
  if (sol.sel.includes('frenos') || sol.testigos.includes('frenos')) return 'Frenos';
  if (sol.sel.includes('direccion')) return 'Dirección';
  if (sol.testigos.includes('temperatura')) return 'Temperatura';
  const primero = sol.sel.find((x) => x !== 'otro');
  return primero ? nombre(SINTOMAS, primero) : 'Otra cosa';
}

/** Qué falta para pedir el prediagnóstico (texto para el cliente) o null. */
export function validarPrediagnostico(sol, coches, { nombre: n = '', telefono = '' } = {}) {
  const e = validar(sol, coches, { sinCita: true });
  if (e) return e;
  const c = cocheDe(sol, coches);
  if (!c?.matricula && !c?.marca && !c?.nombre) return 'Dinos la matrícula o la marca del coche.';
  if (!String(n).trim()) return 'Escribe tu nombre.';
  if (!RE_MOVIL.test(limpiaMovil(telefono))) return 'Escribe un móvil válido (9 cifras, empieza por 6 o 7).';
  if (!sol.rgpd || !sol.acepto) return 'Marca las dos casillas para hacer el prediagnóstico.';
  return null;
}

/** Cuerpo para el servicio Reyman Online (mismas claves que el formulario de la web). */
export function cuerpoReymanOnline(sol, { coches = [], nombre: n = '', telefono = '', codigos = [], foto = null } = {}) {
  const c = cocheDe(sol, coches) || {};
  const marca = c.marca || (c.nombre || '').split(' ')[0] || '';
  const modelo = c.modelo || (c.nombre || '').split(' ').slice(1).join(' ');
  const guiadas = [
    ...nombres(SINTOMAS, sol.sel),
    ...(sol.sel.includes('testigo') && sol.testigos.length ? [`Testigo: ${nombres(TESTIGOS, sol.testigos).join(', ')}`] : []),
    ...(sol.circular ? [nombre(CIRCULAR, sol.circular)] : []),
  ].join('; ');
  return {
    nombre: String(n).trim(), telefono: limpiaMovil(telefono),
    matricula: c.matricula || '', marca, modelo, motor: '', anio: c.anio || '', km: String(c.km || c.kmUltimo || ''),
    sintoma: sintomaPrincipal(sol), guiadas, cuando: nombres(CUANDO_PASA, sol.pasa).join(', '), desde: sol.desde ? nombre(DESDE, sol.desde) : '',
    descripcion: sol.texto.trim(),
    codigos: sol.codigos && codigos.length ? codigos.join(' ') : '', origen_codigos: sol.codigos && codigos.length ? 'Lector OBD propio o app' : '',
    ...(foto ? { foto } : {}),
    contacto: 'Desde la app Reyman Connect', rgpd: !!sol.rgpd, acepto: !!sol.acepto, web: '', origen: 'reyman-connect',
  };
}

/** ¿Está abierto el taller? Lunes a jueves de 8:00 a 16:00 y viernes de 8:00 a 15:00 (los festivos no se tienen en cuenta). */
export function estadoTaller(f = new Date()) {
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const cierre = (d) => (d === 5 ? 15 : d >= 1 && d <= 4 ? 16 : null);
  const d = f.getDay(); const min = f.getHours() * 60 + f.getMinutes();
  const c = cierre(d);
  if (c && min >= 480 && min < c * 60) return { abierto: true, texto: `Abierto ahora · hasta las ${c}:00` };
  if (c && min < 480) return { abierto: false, texto: 'Cerrado · abrimos hoy a las 8:00' };
  for (let i = 1; i <= 7; i++) {
    const dd = (d + i) % 7;
    if (cierre(dd)) return { abierto: false, texto: `Cerrado · abrimos ${i === 1 ? 'mañana' : `el ${DIAS[dd]}`} a las 8:00` };
  }
  return { abierto: false, texto: 'Cerrado' };
}
