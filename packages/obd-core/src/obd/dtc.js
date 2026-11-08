// Reyman Diag · Códigos de avería (DTC)
// Decodificación de los 2 bytes del estándar y descripciones en español de los códigos genéricos (SAE J2012).
// Los códigos de fabricante (P1xxx, P3xxx, B/C/U con segundo dígito 1 o 3) no son públicos: se muestran
// con la descripción del sistema y se marcan como "específico del fabricante".

const LETRAS = ['P', 'C', 'B', 'U'];
export const SISTEMAS_LETRA = { P: 'Motor / cambio', C: 'Chasis', B: 'Carrocería', U: 'Red de comunicación' };

/** Convierte 2 bytes en un código tipo P0301. */
export function decodificarDtc(b1, b2) {
  const letra = LETRAS[b1 >> 6];
  const d1 = (b1 >> 4) & 0x03;
  const d2 = (b1 & 0x0f).toString(16).toUpperCase();
  const d34 = b2.toString(16).toUpperCase().padStart(2, '0');
  return `${letra}${d1}${d2}${d34}`;
}

/** Extrae los códigos de la respuesta de los modos 03/07/0A. En CAN el primer byte es el número de códigos. */
export function extraerDtcs(datos, esCan) {
  let b = datos;
  if (esCan) b = datos.slice(1);
  const out = [];
  for (let i = 0; i + 1 < b.length; i += 2) {
    if (b[i] === 0 && b[i + 1] === 0) continue;
    out.push(decodificarDtc(b[i], b[i + 1]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Descripciones
// ---------------------------------------------------------------------------

const D = {
  // Medición de aire y combustible
  P0010: 'Circuito del actuador de posición del árbol de levas de admisión, banco 1',
  P0011: 'Posición árbol de levas de admisión: avance excesivo o rendimiento, banco 1',
  P0012: 'Posición árbol de levas de admisión: retraso excesivo, banco 1',
  P0013: 'Circuito del actuador de posición del árbol de levas de escape, banco 1',
  P0014: 'Posición árbol de levas de escape: avance excesivo o rendimiento, banco 1',
  P0016: 'Correlación cigüeñal / árbol de levas, banco 1 sensor A',
  P0017: 'Correlación cigüeñal / árbol de levas, banco 1 sensor B',
  P0018: 'Correlación cigüeñal / árbol de levas, banco 2 sensor A',
  P0030: 'Circuito de control del calefactor sonda lambda, banco 1 sensor 1',
  P0036: 'Circuito de control del calefactor sonda lambda, banco 1 sensor 2',
  P0045: 'Circuito del solenoide de control de presión del turbo',
  P0087: 'Presión de rampa / sistema de combustible demasiado baja',
  P0088: 'Presión de rampa / sistema de combustible demasiado alta',
  P0089: 'Rendimiento del regulador de presión de combustible',
  P0093: 'Fuga grande detectada en el sistema de combustible',
  P0096: 'Rango / rendimiento del sensor de temperatura del aire de admisión 2',
  P0100: 'Circuito del caudalímetro (MAF)',
  P0101: 'Rango / rendimiento del caudalímetro (MAF)',
  P0102: 'Caudalímetro (MAF): entrada baja',
  P0103: 'Caudalímetro (MAF): entrada alta',
  P0105: 'Circuito del sensor de presión absoluta del colector (MAP)',
  P0106: 'Rango / rendimiento del sensor MAP / presión barométrica',
  P0107: 'Sensor MAP / barométrico: entrada baja',
  P0108: 'Sensor MAP / barométrico: entrada alta',
  P0110: 'Circuito del sensor de temperatura del aire de admisión',
  P0112: 'Sensor de temperatura del aire de admisión: entrada baja',
  P0113: 'Sensor de temperatura del aire de admisión: entrada alta',
  P0115: 'Circuito del sensor de temperatura del refrigerante',
  P0116: 'Rango / rendimiento del sensor de temperatura del refrigerante',
  P0117: 'Sensor de temperatura del refrigerante: entrada baja',
  P0118: 'Sensor de temperatura del refrigerante: entrada alta',
  P0120: 'Circuito del sensor de posición de mariposa / pedal A',
  P0121: 'Rango / rendimiento del sensor de posición de mariposa A',
  P0122: 'Sensor de posición de mariposa A: entrada baja',
  P0123: 'Sensor de posición de mariposa A: entrada alta',
  P0125: 'Temperatura de refrigerante insuficiente para el control en lazo cerrado',
  P0128: 'Termostato: temperatura del refrigerante por debajo de la de regulación',
  P0130: 'Circuito de la sonda lambda, banco 1 sensor 1',
  P0131: 'Sonda lambda banco 1 sensor 1: tensión baja',
  P0132: 'Sonda lambda banco 1 sensor 1: tensión alta',
  P0133: 'Sonda lambda banco 1 sensor 1: respuesta lenta',
  P0134: 'Sonda lambda banco 1 sensor 1: sin actividad',
  P0135: 'Circuito del calefactor de la sonda lambda, banco 1 sensor 1',
  P0136: 'Circuito de la sonda lambda, banco 1 sensor 2',
  P0137: 'Sonda lambda banco 1 sensor 2: tensión baja',
  P0138: 'Sonda lambda banco 1 sensor 2: tensión alta',
  P0139: 'Sonda lambda banco 1 sensor 2: respuesta lenta',
  P0140: 'Sonda lambda banco 1 sensor 2: sin actividad',
  P0141: 'Circuito del calefactor de la sonda lambda, banco 1 sensor 2',
  P0155: 'Circuito del calefactor de la sonda lambda, banco 2 sensor 1',
  P0161: 'Circuito del calefactor de la sonda lambda, banco 2 sensor 2',
  P0170: 'Corrección de combustible, banco 1',
  P0171: 'Mezcla demasiado pobre, banco 1',
  P0172: 'Mezcla demasiado rica, banco 1',
  P0174: 'Mezcla demasiado pobre, banco 2',
  P0175: 'Mezcla demasiado rica, banco 2',
  P0180: 'Circuito del sensor de temperatura del combustible A',
  P0190: 'Circuito del sensor de presión de rampa de combustible',
  P0191: 'Rango / rendimiento del sensor de presión de rampa',
  P0192: 'Sensor de presión de rampa: entrada baja',
  P0193: 'Sensor de presión de rampa: entrada alta',
  P0200: 'Circuito de inyectores',
  P0217: 'Sobretemperatura del motor',
  P0219: 'Exceso de régimen del motor',
  P0220: 'Circuito del sensor de posición de mariposa / pedal B',
  P0221: 'Rango / rendimiento del sensor de posición de mariposa B',
  P0222: 'Sensor de posición de mariposa B: entrada baja',
  P0223: 'Sensor de posición de mariposa B: entrada alta',
  P0230: 'Circuito primario de la bomba de combustible',
  P0234: 'Sobrealimentación excesiva del turbo',
  P0235: 'Circuito del sensor de presión de sobrealimentación A',
  P0236: 'Rango / rendimiento del sensor de presión de sobrealimentación A',
  P0237: 'Sensor de presión de sobrealimentación A: entrada baja',
  P0238: 'Sensor de presión de sobrealimentación A: entrada alta',
  P0243: 'Circuito de la electroválvula de descarga (wastegate) A',
  P0251: 'Bomba de inyección: control de dosificación A (leva / rotor / inyector)',
  P0263: 'Contribución / equilibrio del cilindro 1',
  P0299: 'Sobrealimentación insuficiente del turbo',
  // Encendido
  P0300: 'Fallos de encendido aleatorios / múltiples cilindros',
  P0313: 'Fallo de encendido detectado con nivel de combustible bajo',
  P0314: 'Fallo de encendido en un cilindro (no especificado)',
  P0320: 'Circuito del sensor de régimen / posición del encendido (distribuidor)',
  P0322: 'Sensor de régimen del motor: sin señal',
  P0325: 'Circuito del sensor de picado 1, banco 1',
  P0326: 'Rango / rendimiento del sensor de picado 1, banco 1',
  P0327: 'Sensor de picado 1 banco 1: entrada baja',
  P0328: 'Sensor de picado 1 banco 1: entrada alta',
  P0335: 'Circuito del sensor de posición del cigüeñal A',
  P0336: 'Rango / rendimiento del sensor de posición del cigüeñal A',
  P0337: 'Sensor de posición del cigüeñal A: entrada baja',
  P0338: 'Sensor de posición del cigüeñal A: entrada alta',
  P0339: 'Sensor de posición del cigüeñal A: señal intermitente',
  P0340: 'Circuito del sensor de posición del árbol de levas A, banco 1',
  P0341: 'Rango / rendimiento del sensor de posición del árbol de levas A, banco 1',
  P0342: 'Sensor de posición del árbol de levas A banco 1: entrada baja',
  P0343: 'Sensor de posición del árbol de levas A banco 1: entrada alta',
  P0345: 'Circuito del sensor de posición del árbol de levas A, banco 2',
  P0365: 'Circuito del sensor de posición del árbol de levas B, banco 1',
  P0380: 'Circuito de calentadores (bujías de precalentamiento) A',
  P0382: 'Circuito de calentadores (bujías de precalentamiento) B',
  // Control de emisiones auxiliar
  P0400: 'Caudal de recirculación de gases (EGR)',
  P0401: 'Caudal de recirculación de gases (EGR) insuficiente',
  P0402: 'Caudal de recirculación de gases (EGR) excesivo',
  P0403: 'Circuito de control de la válvula EGR',
  P0404: 'Rango / rendimiento del circuito de control EGR',
  P0405: 'Sensor de posición EGR A: entrada baja',
  P0406: 'Sensor de posición EGR A: entrada alta',
  P0410: 'Sistema de inyección de aire secundario',
  P0420: 'Eficiencia del catalizador por debajo del umbral, banco 1',
  P0421: 'Eficiencia del catalizador en fase de calentamiento por debajo del umbral, banco 1',
  P0430: 'Eficiencia del catalizador por debajo del umbral, banco 2',
  P0440: 'Sistema de control de emisiones evaporativas (EVAP)',
  P0441: 'Caudal de purga incorrecto en el sistema EVAP',
  P0442: 'Fuga pequeña detectada en el sistema EVAP',
  P0443: 'Circuito de la válvula de purga del canister',
  P0446: 'Circuito de control de ventilación del sistema EVAP',
  P0455: 'Fuga grande detectada en el sistema EVAP',
  P0456: 'Fuga muy pequeña detectada en el sistema EVAP',
  P0460: 'Circuito del sensor de nivel de combustible',
  P0470: 'Circuito del sensor de presión de escape',
  P0480: 'Circuito de control del electroventilador 1',
  P0481: 'Circuito de control del electroventilador 2',
  P0489: 'Circuito de control EGR: entrada baja',
  P0490: 'Circuito de control EGR: entrada alta',
  // Velocidad, ralentí y entradas
  P0500: 'Sensor de velocidad del vehículo A',
  P0501: 'Rango / rendimiento del sensor de velocidad del vehículo A',
  P0503: 'Sensor de velocidad del vehículo A: señal intermitente / irregular',
  P0505: 'Sistema de control del ralentí',
  P0506: 'Régimen de ralentí inferior al esperado',
  P0507: 'Régimen de ralentí superior al esperado',
  P0520: 'Circuito del sensor / interruptor de presión de aceite',
  P0521: 'Rango / rendimiento del sensor de presión de aceite',
  P0524: 'Presión de aceite del motor demasiado baja',
  P0530: 'Circuito del sensor de presión del refrigerante del A/A',
  P0560: 'Tensión del sistema',
  P0562: 'Tensión del sistema baja',
  P0563: 'Tensión del sistema alta',
  P0571: 'Circuito del interruptor de freno A',
  P0599: 'Circuito de control del calefactor del termostato: entrada alta',
  // Centralita y salidas
  P0600: 'Enlace de comunicación serie',
  P0601: 'Error de suma de verificación de la memoria interna de la centralita',
  P0602: 'Error de programación de la centralita',
  P0603: 'Error de memoria KAM de la centralita',
  P0604: 'Error de memoria RAM de la centralita',
  P0605: 'Error de memoria ROM de la centralita',
  P0606: 'Procesador de la centralita',
  P0607: 'Rendimiento del módulo de control',
  P0615: 'Circuito del relé de arranque',
  P0620: 'Circuito de control del alternador',
  P0627: 'Circuito de control de la bomba de combustible: abierto',
  P0641: 'Circuito de tensión de referencia de sensores A: abierto',
  P0651: 'Circuito de tensión de referencia de sensores B: abierto',
  P0670: 'Circuito del módulo de control de calentadores (precalentamiento)',
  P0671: 'Circuito de la bujía de precalentamiento del cilindro 1',
  P0672: 'Circuito de la bujía de precalentamiento del cilindro 2',
  P0673: 'Circuito de la bujía de precalentamiento del cilindro 3',
  P0674: 'Circuito de la bujía de precalentamiento del cilindro 4',
  P0675: 'Circuito de la bujía de precalentamiento del cilindro 5',
  P0676: 'Circuito de la bujía de precalentamiento del cilindro 6',
  P0685: 'Circuito de control del relé principal de la centralita: abierto',
  P0688: 'Circuito de detección del relé principal de la centralita: abierto',
  P0697: 'Circuito de tensión de referencia de sensores C: abierto',
  // Cambio
  P0700: 'Sistema de control del cambio (pedir averías a la centralita del cambio)',
  P0705: 'Circuito del sensor de rango del cambio (selector PRNDL)',
  P0710: 'Circuito del sensor de temperatura del aceite del cambio',
  P0715: 'Circuito del sensor de velocidad de entrada / turbina',
  P0720: 'Circuito del sensor de velocidad de salida',
  P0725: 'Circuito de la entrada de régimen del motor al cambio',
  P0730: 'Relación de marcha incorrecta',
  P0731: 'Relación incorrecta en 1ª',
  P0732: 'Relación incorrecta en 2ª',
  P0733: 'Relación incorrecta en 3ª',
  P0734: 'Relación incorrecta en 4ª',
  P0735: 'Relación incorrecta en 5ª',
  P0740: 'Circuito del embrague del convertidor de par',
  P0741: 'Embrague del convertidor de par: rendimiento o bloqueado en abierto',
  P0750: 'Electroválvula de cambio A',
  P0755: 'Electroválvula de cambio B',
  P0760: 'Electroválvula de cambio C',
  P0765: 'Electroválvula de cambio D',
  P0780: 'Fallo en el cambio de marcha',
  P0841: 'Rango / rendimiento del sensor de presión de aceite del cambio A',
  P0868: 'Presión de aceite del cambio baja',
  // P2xxx frecuentes (diésel y emisiones)
  P2002: 'Eficiencia del filtro de partículas (DPF) por debajo del umbral, banco 1',
  P2015: 'Rango / rendimiento del sensor de posición de las trampillas del colector de admisión, banco 1',
  P2031: 'Circuito del sensor de temperatura de gases de escape, banco 1 sensor 2',
  P2032: 'Sensor de temperatura de gases de escape banco 1 sensor 2: entrada baja',
  P2033: 'Sensor de temperatura de gases de escape banco 1 sensor 2: entrada alta',
  P2047: 'Circuito del inyector de reductor (AdBlue): abierto, banco 1',
  P2080: 'Rango / rendimiento del sensor de temperatura de gases de escape, banco 1 sensor 1',
  P2096: 'Corrección de combustible posterior al catalizador: mezcla demasiado pobre, banco 1',
  P2097: 'Corrección de combustible posterior al catalizador: mezcla demasiado rica, banco 1',
  P2101: 'Rango / rendimiento del circuito del motor de mariposa',
  P2106: 'Sistema de control del actuador de mariposa: potencia limitada forzada',
  P2135: 'Correlación de tensión entre sensores de posición de mariposa / pedal A y B',
  P2138: 'Correlación de tensión entre sensores de posición del pedal D y E',
  P2146: 'Circuito de alimentación del grupo de inyectores A: abierto',
  P2187: 'Mezcla demasiado pobre al ralentí, banco 1',
  P2188: 'Mezcla demasiado rica al ralentí, banco 1',
  P2195: 'Sonda lambda banco 1 sensor 1: señal bloqueada en pobre',
  P2196: 'Sonda lambda banco 1 sensor 1: señal bloqueada en rico',
  P2200: 'Circuito del sensor de NOx, banco 1',
  P2209: 'Rango / rendimiento del circuito del calefactor del sensor de NOx, banco 1 sensor 1',
  P2237: 'Circuito de corriente de bombeo de la sonda lambda: abierto, banco 1 sensor 1',
  P2263: 'Rendimiento del sistema de sobrealimentación (turbo)',
  P2279: 'Fuga de aire en el sistema de admisión',
  P2293: 'Rendimiento del regulador de presión de combustible 2',
  P2299: 'Incompatibilidad de posición pedal de freno / pedal de acelerador',
  P2413: 'Rendimiento del sistema de recirculación de gases (EGR)',
  P2425: 'Circuito de la válvula de control del refrigerante del enfriador EGR: abierto',
  P2452: 'Circuito del sensor de presión diferencial del filtro de partículas A',
  P2453: 'Rango / rendimiento del sensor de presión diferencial del filtro de partículas A',
  P2454: 'Sensor de presión diferencial del filtro de partículas A: entrada baja',
  P2455: 'Sensor de presión diferencial del filtro de partículas A: entrada alta',
  P2458: 'Duración de la regeneración del filtro de partículas',
  P2459: 'Frecuencia de regeneración del filtro de partículas',
  P2463: 'Acumulación de hollín en el filtro de partículas',
  P2563: 'Rango / rendimiento del sensor de posición del control de sobrealimentación (geometría variable)',
  // Red de comunicación (U0xxx)
  U0001: 'Bus de comunicación CAN de alta velocidad',
  U0073: 'Bus de comunicación de los módulos de control desactivado (bus off)',
  U0100: 'Comunicación perdida con la centralita de motor (ECM/PCM) A',
  U0101: 'Comunicación perdida con la centralita del cambio (TCM)',
  U0102: 'Comunicación perdida con el módulo de control de la caja transfer',
  U0103: 'Comunicación perdida con el módulo de control del selector de marchas',
  U0121: 'Comunicación perdida con la centralita del ABS',
  U0122: 'Comunicación perdida con el módulo de control de estabilidad',
  U0126: 'Comunicación perdida con el sensor de ángulo de dirección',
  U0128: 'Comunicación perdida con el módulo del freno de estacionamiento',
  U0131: 'Comunicación perdida con el módulo de la dirección asistida',
  U0140: 'Comunicación perdida con el módulo de control de carrocería (BCM)',
  U0151: 'Comunicación perdida con el módulo del airbag',
  U0155: 'Comunicación perdida con el cuadro de instrumentos',
  U0164: 'Comunicación perdida con el módulo de climatización',
  U0401: 'Datos no válidos recibidos de la centralita de motor',
  U0402: 'Datos no válidos recibidos de la centralita del cambio',
  U0415: 'Datos no válidos recibidos del módulo del ABS',
};


// Generados por patrón: fallos de encendido por cilindro, inyectores por cilindro
function generado(code) {
  let m;
  if ((m = code.match(/^P030([1-9])$/)) || (m = code.match(/^P031([0-2])$/))) {
    const n = code.startsWith('P031') ? 10 + Number(m[1]) : Number(m[1]);
    return `Fallo de encendido detectado en el cilindro ${n}`;
  }
  if ((m = code.match(/^P02(0[1-9]|1[0-2])$/))) return `Circuito del inyector del cilindro ${Number(m[1])}`;
  return null;
}

const CATEGORIAS = [
  [/^P0[01]/, 'Medición de aire y combustible'],
  [/^P02/, 'Medición de combustible (inyectores)'],
  [/^P03/, 'Encendido / fallos de encendido'],
  [/^P04/, 'Control auxiliar de emisiones'],
  [/^P05/, 'Velocidad, ralentí y entradas auxiliares'],
  [/^P06/, 'Centralita y salidas auxiliares'],
  [/^P0[789]/, 'Cambio'],
  [/^P0A/, 'Propulsión híbrida'],
  [/^P2/, 'Motor / emisiones (genérico ampliado)'],
  [/^P[13]/, 'Motor / cambio (específico del fabricante)'],
  [/^C/, 'Chasis (frenos, suspensión, dirección)'],
  [/^B/, 'Carrocería (airbag, confort, climatización)'],
  [/^U/, 'Red de comunicación entre centralitas'],
];

/** Devuelve { codigo, descripcion, sistema, fabricante:boolean }. */
export function describirDtc(codigo) {
  const c = String(codigo).toUpperCase();
  const sistema = (CATEGORIAS.find(([re]) => re.test(c)) || [null, SISTEMAS_LETRA[c[0]] || 'Desconocido'])[1];
  const fabricante = /^P[13]/.test(c) || /^[BCU][13]/.test(c);
  const descripcion = D[c] || generado(c) || (fabricante
    ? 'Código específico del fabricante: consultar la información técnica de la marca.'
    : 'Código genérico sin descripción en la base local.');
  return { codigo: c, descripcion, sistema, fabricante, conocido: !!(D[c] || generado(c)) };
}

export const TOTAL_DESCRIPCIONES = Object.keys(D).length + 24;
