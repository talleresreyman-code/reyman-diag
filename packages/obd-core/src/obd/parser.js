// Reyman Diag · Parser de respuestas del ELM327
// Convierte el texto que devuelve el adaptador en mensajes por centralita (ECU),
// reensamblando las tramas ISO-TP (CAN) y quitando cabeceras y checksums (protocolos antiguos).
// Funciona igual en el navegador y en Node (tests).

export const ELM_ERRORES = {
  'NO DATA': 'El vehículo no ha respondido a esta petición (sin datos).',
  'UNABLE TO CONNECT': 'No se ha podido conectar con el vehículo. Comprueba el contacto puesto y el conector OBD.',
  'CAN ERROR': 'Error en el bus CAN. Comprueba el conector y que el contacto esté puesto.',
  'BUS ERROR': 'Error en el bus de comunicación.',
  'BUS INIT: ...ERROR': 'Falló la inicialización del bus (protocolo antiguo).',
  'BUS INIT:...ERROR': 'Falló la inicialización del bus (protocolo antiguo).',
  'BUFFER FULL': 'El adaptador se ha saturado de datos.',
  'DATA ERROR': 'Datos recibidos con errores.',
  'FB ERROR': 'Error de realimentación en el adaptador.',
  'LV RESET': 'Tensión baja: el adaptador se ha reiniciado.',
  'STOPPED': 'Petición interrumpida.',
  'ACT ALERT': 'El adaptador entró en reposo por inactividad.',
  '?': 'Comando no reconocido por el adaptador.',
  'ERR94': 'Error grave de CAN en el adaptador.',
};

export class ObdError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const NRC = {
  0x10: 'Rechazo general',
  0x11: 'Servicio no soportado',
  0x12: 'Subfunción no soportada',
  0x13: 'Longitud o formato incorrecto',
  0x21: 'Ocupado, repetir petición',
  0x22: 'Condiciones no correctas (p. ej. motor arrancado)',
  0x31: 'Petición fuera de rango',
  0x33: 'Acceso de seguridad denegado',
  0x78: 'Respuesta pendiente',
};
export const describirNRC = (b) => NRC[b] || `Código 0x${b.toString(16).toUpperCase().padStart(2, '0')}`;

/** Limpia la respuesta bruta: quita eco, prompt, "SEARCHING..." y líneas vacías. */
export function limpiarLineas(raw, comando = '') {
  const cmd = comando.replace(/\s+/g, '').toUpperCase();
  return String(raw)
    .replace(/>/g, '')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^SEARCHING/i.test(l))
    .filter((l) => !(cmd && l.replace(/\s+/g, '').toUpperCase() === cmd));
}

/** Si la respuesta es un error del ELM, devuelve el código; si no, null. */
export function errorElm(lineas) {
  for (const l of lineas) {
    const u = l.toUpperCase();
    for (const k of Object.keys(ELM_ERRORES)) {
      if (u === k || (k.length > 3 && u.includes(k))) return k;
    }
  }
  return null;
}

const esHex = (t) => /^[0-9A-F]+$/i.test(t);

/** Parte una línea en bytes. Acepta "7E8 06 41 00 ..." y también sin espacios ("7E8064100..."). */
function tokenizar(linea) {
  let l = linea.toUpperCase().replace(/[^0-9A-F: ]/g, '');
  // Formato sin cabecera con números de línea "0: 49 02 01 ..." (ATH0 en CAN)
  const m = l.match(/^([0-9A-F]):\s*(.*)$/);
  if (m) return { linea: parseInt(m[1], 16), tokens: m[2].trim().split(/\s+/).filter(Boolean) };
  if (!l.includes(' ')) {
    // Sin espacios (ATS0). Si empieza con cabecera de 11 bits la separamos.
    const out = [];
    let resto = l;
    if (resto.length % 2 === 1) { out.push(resto.slice(0, 3)); resto = resto.slice(3); }
    for (let i = 0; i < resto.length; i += 2) out.push(resto.slice(i, i + 2));
    return { tokens: out };
  }
  return { tokens: l.split(/\s+/).filter(Boolean) };
}

/**
 * Analiza la respuesta y devuelve una lista de mensajes { ecu, bytes:number[] }.
 * - Detecta CAN 11 bits (cabecera de 3 caracteres), CAN 29 bits (18 DA F1 xx / 18 DB 33 F1)
 *   y protocolos antiguos (cabecera de 3 bytes + checksum).
 * - Reensambla ISO-TP: trama única (0N), primera trama (1N NN) y consecutivas (2N).
 */
export function analizarRespuesta(raw, comando = '') {
  const lineas = limpiarLineas(raw, comando);
  const err = errorElm(lineas);
  if (err) throw new ObdError(err, ELM_ERRORES[err]);

  const tramasPorEcu = new Map();
  const sinCabecera = [];
  let tipo = null;

  for (const l of lineas) {
    const { tokens, linea } = tokenizar(l);
    if (!tokens.length || !tokens.every(esHex)) continue;

    if (linea !== undefined) { sinCabecera.push({ linea, tokens }); tipo = 'can-sin-cabecera'; continue; }

    // Longitud total sin cabecera (ATH0 en CAN multi-trama: "014")
    if (tokens.length === 1 && tokens[0].length === 3 && sinCabecera.length === 0 && tipo === null) {
      tipo = 'can-sin-cabecera';
      continue;
    }

    let ecu, datos;
    if (tokens[0].length === 3) {
      tipo = tipo || 'can11';
      ecu = tokens[0];
      datos = tokens.slice(1);
      datos = datos.slice(0, datos.length); // ISO-TP se resuelve abajo
      push(tramasPorEcu, ecu, datos.map((h) => parseInt(h, 16)));
    } else if (tokens.length >= 5 && tokens[0] === '18' && (tokens[1] === 'DA' || tokens[1] === 'DB')) {
      tipo = tipo || 'can29';
      ecu = tokens.slice(0, 4).join('');
      push(tramasPorEcu, ecu, tokens.slice(4).map((h) => parseInt(h, 16)));
    } else if (tokens.length >= 4 && tokens.every((t) => t.length === 2) && tipo !== 'can-sin-cabecera') {
      // ¿CAN sin cabecera de una sola trama (ATH0)? Empieza por PCI 0N y la longitud cuadra.
      const pci = parseInt(tokens[0], 16);
      // Cabecera de protocolo antiguo: 2º byte = dirección del equipo de diagnosis (6B en J1850/ISO 9141, F1 en KWP)
      const cabeceraLegacy = tokens.length >= 5 && (tokens[1] === '6B' || tokens[1] === 'F1');
      if (cabeceraLegacy) {
        tipo = tipo || 'legacy';
        const b = tokens.map((h) => parseInt(h, 16));
        pushLegacy(tramasPorEcu, tokens[2], b.slice(3, b.length - 1));
      } else if (pci > 0 && pci <= 7 && tokens.length - 1 >= pci && tokens.length <= 8 && esRespuestaServicio(parseInt(tokens[1], 16))) {
        tipo = tipo || 'can11';
        push(tramasPorEcu, '7E8', tokens.map((h) => parseInt(h, 16)));
      } else if (esRespuestaServicio(parseInt(tokens[0], 16))) {
        // Protocolo antiguo sin cabecera (ATH0)
        tipo = tipo || 'legacy-sin-cabecera';
        const b = tokens.map((h) => parseInt(h, 16));
        pushLegacy(tramasPorEcu, '10', b);
      } else {
        // Protocolo antiguo con cabecera: 3 bytes cabecera + datos + checksum
        tipo = tipo || 'legacy';
        const b = tokens.map((h) => parseInt(h, 16));
        ecu = tokens[2];
        pushLegacy(tramasPorEcu, ecu, b.slice(3, b.length - 1));
      }
    }
  }

  const mensajes = [];
  if (sinCabecera.length) {
    sinCabecera.sort((a, b) => a.linea - b.linea);
    const bytes = sinCabecera.flatMap((s) => s.tokens.map((h) => parseInt(h, 16)));
    mensajes.push({ ecu: '7E8', bytes });
  }
  for (const [ecu, tramas] of tramasPorEcu) {
    if (tipo === 'legacy' || tipo === 'legacy-sin-cabecera') {
      for (const t of tramas) mensajes.push({ ecu, bytes: t, legacy: true });
    } else {
      mensajes.push({ ecu, bytes: reensamblarIsoTp(tramas) });
    }
  }
  return { tipo, mensajes };
}

function push(map, ecu, bytes) {
  if (!map.has(ecu)) map.set(ecu, []);
  map.get(ecu).push(bytes);
}
function pushLegacy(map, ecu, bytes) { push(map, ecu, bytes); }

// Respuestas positivas de servicio (0x40 + servicio) o negativa (0x7F)
function esRespuestaServicio(b) {
  return (b >= 0x41 && b <= 0x4A) || b === 0x7F || b === 0x50 || b === 0x62 || b === 0x59 || b === 0x54;
}

/** Reensambla las tramas CAN ISO-TP de una ECU en el mensaje completo. */
export function reensamblarIsoTp(tramas) {
  // Tramas únicas (puede haber varias respuestas independientes de la misma ECU: las concatenamos)
  // «Respuesta pendiente» (7F xx 78) no es la respuesta: la centralita contestará después
  const unicas = tramas.filter((t) => (t[0] >> 4) === 0 && !(t[1] === 0x7f && t[3] === 0x78));
  const primera = tramas.find((t) => (t[0] >> 4) === 1);
  if (!primera) {
    return unicas.flatMap((t) => t.slice(1, 1 + (t[0] & 0x0f)));
  }
  const total = ((primera[0] & 0x0f) << 8) | primera[1];
  let datos = primera.slice(2);
  const consecutivas = tramas
    .filter((t) => (t[0] >> 4) === 2)
    .map((t, i) => ({ sn: t[0] & 0x0f, orden: i, datos: t.slice(1) }));
  // El número de secuencia da la vuelta de 0xF a 0x0: el orden de llegada manda.
  for (const c of consecutivas) datos = datos.concat(c.datos);
  return datos.slice(0, total);
}

/**
 * Atajo: envía la respuesta de un servicio y devuelve, por ECU, los bytes que siguen
 * al byte de respuesta positiva. Lanza ObdError en respuestas negativas de todas las ECU.
 */
export function datosDeServicio(raw, servicio, comando = '') {
  const { mensajes, tipo } = analizarRespuesta(raw, comando);
  const ok = [];
  const negativas = [];
  for (const m of mensajes) {
    if (m.bytes[0] === 0x7f) { negativas.push({ ecu: m.ecu, nrc: m.bytes[2] }); continue; }
    if (m.bytes[0] === servicio + 0x40) ok.push({ ecu: m.ecu, datos: m.bytes.slice(1), legacy: !!m.legacy });
  }
  if (!ok.length && negativas.length) {
    const e = new ObdError('NEGATIVA', `La centralita rechazó la petición: ${describirNRC(negativas[0].nrc)}`);
    e.nrc = negativas[0].nrc;
    throw e;
  }
  if (!ok.length) throw new ObdError('NO DATA', ELM_ERRORES['NO DATA']);
  return { tipo, respuestas: ok, negativas };
}

export const esCan = (tipo) => tipo === 'can11' || tipo === 'can29' || tipo === 'can-sin-cabecera';

/** Nombre legible de la centralita a partir de su cabecera. */
export function nombreEcu(ecu) {
  const u = String(ecu).toUpperCase();
  const mapa11 = { '7E8': 'Motor', '7E9': 'Cambio', '7EA': 'Híbrido / 3ª ECU', '7EB': 'ECU 4', '7EC': 'ECU 5', '7ED': 'ECU 6', '7EE': 'ECU 7', '7EF': 'ECU 8' };
  if (mapa11[u]) return mapa11[u];
  if (u.startsWith('18DAF1')) {
    const a = u.slice(6);
    return a === '10' ? 'Motor' : a === '18' ? 'Cambio' : `ECU 0x${a}`;
  }
  if (u === '10') return 'Motor';
  return `ECU ${u}`;
}
