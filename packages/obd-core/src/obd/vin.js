// Reyman Diag · Bastidor (VIN, ISO 3779)
// Marca a partir del WMI (3 primeros caracteres) y año modelo a partir del 10º carácter.

const WMI = {
  // España
  VSS: 'SEAT', VS6: 'Ford (España)', VSK: 'Nissan (España)', VSE: 'Suzuki (España)', VSX: 'Opel (España)',
  VS7: 'Citroën (España)', VR3: 'Peugeot', VR1: 'DS', VR7: 'Citroën', 
  VWV: 'Volkswagen (España)',
  // Francia
  VF1: 'Renault', VF3: 'Peugeot', VF7: 'Citroën', VF6: 'Renault (vehículos industriales)', VF8: 'Matra', VNK: 'Toyota (Francia)', VF9: 'Bugatti',
  UU1: 'Dacia', UU6: 'Daewoo (Rumanía)',
  // Alemania
  WVW: 'Volkswagen', WV1: 'Volkswagen comerciales', WV2: 'Volkswagen (furgonetas)', WV3: 'Volkswagen (camiones)',
  WAU: 'Audi', WUA: 'Audi Sport', TRU: 'Audi (Hungría)',
  WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i', WMW: 'MINI', WBX: 'BMW (SUV)',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz (SUV)', WDF: 'Mercedes-Benz (comerciales)', W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz (SUV)', W1V: 'Mercedes-Benz (furgonetas)', W1T: 'Mercedes-Benz (camiones)', WMX: 'Mercedes-AMG',
  WME: 'smart', W0L: 'Opel', W0V: 'Opel', WF0: 'Ford (Europa)', WP0: 'Porsche', WP1: 'Porsche (SUV)',
  // Italia
  ZFA: 'Fiat', ZFC: 'Fiat (comerciales)', ZAR: 'Alfa Romeo', ZLA: 'Lancia', ZFF: 'Ferrari', ZHW: 'Lamborghini', ZAM: 'Maserati', ZCF: 'Iveco', ZAP: 'Piaggio', ZDM: 'Ducati',
  // Reino Unido
  SAL: 'Land Rover', SAJ: 'Jaguar', SAD: 'Jaguar (SUV)', SCC: 'Lotus', SCB: 'Bentley', SCF: 'Aston Martin', SHH: 'Honda (Reino Unido)', SJN: 'Nissan (Reino Unido)', SB1: 'Toyota (Reino Unido)', SFD: 'Alexander Dennis',
  // República Checa / Eslovaquia / Europa del Este
  TMB: 'Škoda', TMA: 'Hyundai (Chequia)', TMK: 'Karosa', TK9: 'SOR', TSM: 'Suzuki (Hungría)', UU3: 'ARO',
  VNE: 'Renault Trucks', YV1: 'Volvo', YV4: 'Volvo (SUV)', YS3: 'Saab', YS2: 'Scania', XLR: 'DAF', XL9: 'Spyker',
  U5Y: 'Kia (Eslovaquia)', KNE: 'Kia (Europa)', TMT: 'Tatra', NMT: 'Toyota (Turquía)', NM0: 'Ford (Turquía)', NM4: 'Tofaş (Fiat)',
  // Asia
  JHM: 'Honda', JHL: 'Honda', JMZ: 'Mazda', JM1: 'Mazda', JN1: 'Nissan', JN8: 'Nissan (SUV)', JT1: 'Toyota', JT2: 'Toyota', JTD: 'Toyota', JTE: 'Toyota', JTH: 'Lexus', JTJ: 'Lexus',
  JS1: 'Suzuki (motos)', JS2: 'Suzuki', JS3: 'Suzuki', JSA: 'Suzuki', JF1: 'Subaru', JF2: 'Subaru', JMB: 'Mitsubishi', JMY: 'Mitsubishi', JA3: 'Mitsubishi', JA4: 'Mitsubishi', JAA: 'Isuzu', JAL: 'Isuzu',
  KMH: 'Hyundai', KMF: 'Hyundai (comerciales)', KNA: 'Kia', KND: 'Kia (SUV)', KPT: 'SsangYong / KGM', KL1: 'Chevrolet (Corea)', KLA: 'Daewoo', MAL: 'Hyundai (India)', MA3: 'Suzuki (India)', MAJ: 'Ford (India)',
  LSV: 'Volkswagen (China)', LFV: 'FAW-Volkswagen', LRW: 'Tesla (China)', LGX: 'BYD', LC0: 'BYD', LVS: 'Ford (China)', LJ1: 'JAC', LSJ: 'MG (SAIC)', LDC: 'Dongfeng Peugeot-Citroën', LVV: 'Chery', L6T: 'Geely', LB3: 'Geely', LYV: 'Volvo (China)', LPS: 'Polestar', LMG: 'GAC',
  // América
  '1FA': 'Ford (EE. UU.)', '1FT': 'Ford (EE. UU.)', '1G1': 'Chevrolet', '1GC': 'Chevrolet', '1C4': 'Chrysler / Jeep', '1J4': 'Jeep', '1HG': 'Honda (EE. UU.)', '2HG': 'Honda (Canadá)', '3VW': 'Volkswagen (México)',
  '5YJ': 'Tesla', '7SA': 'Tesla', '4T1': 'Toyota (EE. UU.)', '5UX': 'BMW (EE. UU.)', '4JG': 'Mercedes-Benz (EE. UU.)', '93H': 'Honda (Brasil)', '9BW': 'Volkswagen (Brasil)',
  // Otros
  XTA: 'Lada', X7L: 'Renault (Rusia)', Z94: 'Hyundai (Rusia)', MMB: 'Mitsubishi (Tailandia)', MR0: 'Toyota (Tailandia)', MNT: 'Nissan (Tailandia)', AHT: 'Toyota (Sudáfrica)', AAV: 'Volkswagen (Sudáfrica)',
};

// Primeros 2 caracteres cuando el WMI exacto no está en la tabla
const WMI2 = { VF: 'Francia', VS: 'España', VR: 'Stellantis (Francia)', WV: 'Volkswagen', WD: 'Mercedes-Benz', W1: 'Mercedes-Benz', WB: 'BMW', WA: 'Audi', ZF: 'Fiat', TM: 'Chequia', JT: 'Toyota', JN: 'Nissan', KM: 'Hyundai', KN: 'Kia', YV: 'Volvo', SA: 'Reino Unido', LS: 'China' };

const AÑO = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function validarVin(vin) {
  return typeof vin === 'string' && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase());
}

/** Decodifica marca y año a partir del VIN. El año es ambiguo cada 30 años: se elige el más reciente no futuro. */
export function decodificarVin(vin) {
  const v = String(vin || '').toUpperCase().trim();
  if (!validarVin(v)) return { vin: v, valido: false };
  const marca = WMI[v.slice(0, 3)] || WMI2[v.slice(0, 2)] || 'Desconocida';
  // Ford de Europa (Colonia, Valencia, Turquía): el año de fabricación va en la posición 11 (la 10 es otra cosa)
  const fordEuropa = /^(WF0|WF1|VS6|NM0)/.test(v);
  const idx = AÑO.indexOf(fordEuropa ? v[10] : v[9]);
  let año = null;
  if (idx >= 0) {
    const actual = new Date().getFullYear() + 1;
    año = 1980 + idx;
    while (año + 30 <= actual) año += 30;
  }
  return { vin: v, valido: true, marca, año, wmi: v.slice(0, 3), numeroSerie: v.slice(11) };
}

/** Convierte los bytes de la respuesta del modo 09 PID 02 en el VIN. */
export function vinDesdeBytes(datos) {
  // CAN: [02, 01, 17 bytes ASCII]; protocolos antiguos: varias líneas [02, nº, 4 bytes]
  let b = datos;
  if (b[0] === 0x02) b = b.slice(1);
  if (b.length > 17 && b[0] <= 0x05) b = b.slice(1);
  const txt = String.fromCharCode(...b.filter((x) => x >= 0x30 && x <= 0x5a));
  return txt.slice(-17);
}
