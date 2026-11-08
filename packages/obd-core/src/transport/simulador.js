// Reyman Diag · Simulador de ELM327 + coche
// Responde como un vLinker real conectado a un coche CAN 11 bits (protocolo 6), con dos centralitas
// (motor 7E8 y cambio 7E9), averías, freeze frame, monitores y datos en vivo que varían en el tiempo.
// Sirve para probar la app sin adaptador y para los tests del parser.

const hx = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export const COCHES_SIM = {
  diesel: {
    nombre: 'VW Golf 2.0 TDI (simulado)',
    vin: 'WVWZZZAUZHW512345',
    combustible: 4,
    averias: { confirmada: ['P0401', 'P2463'], pendiente: ['P0299'], permanente: ['P0401'] },
    freeze: { dtc: 'P0401', valores: { 0x04: 62, 0x05: 88, 0x0b: 148, 0x0c: 2150, 0x0d: 74, 0x0f: 31, 0x10: 41.2, 0x11: 38, 0x42: 14.1 } },
    km: 148230,
  },
  gasolina: {
    nombre: 'SEAT León 1.5 TSI (simulado)',
    vin: 'VSSZZZKLZMR024680',
    combustible: 1,
    averias: { confirmada: ['P0301', 'P0171', 'P0420'], pendiente: ['P0302'], permanente: [] },
    freeze: { dtc: 'P0301', valores: { 0x04: 35, 0x05: 91, 0x0b: 42, 0x0c: 820, 0x0d: 0, 0x0f: 28, 0x10: 3.4, 0x11: 4, 0x42: 13.9 } },
    km: 61420,
  },
  kuga: {
    nombre: 'Ford Kuga 2.5 FHEV 2023 (simulado)',
    vin: 'WF0FXXWPMHPE00628',
    combustible: 17,
    averias: { confirmada: [], pendiente: [], permanente: [] },
    freeze: null,
    km: 47248,
  },
  sinAverias: {
    nombre: 'Toyota Corolla Hybrid (simulado, sin averías)',
    vin: 'NMTBZ3BE20R123456',
    combustible: 17,
    averias: { confirmada: [], pendiente: [], permanente: [] },
    freeze: null,
    km: 32110,
  },
};

// Centralitas para diagnosis UDS (todas las centralitas). tx = petición, rx = respuesta.
// Las averías llevan 3 bytes de código + estado (bit0 activa, bit2 pendiente, bit3 confirmada).
const UDS_SIM = {
  diesel: [
    { nombre: 'MOTOR', tx: '7E0', rx: '7E8', vin: true, dtcs: [['P0401', 0x00, 0x09], ['P2463', 0x00, 0x08]] },
    { nombre: 'CAMBIO DSG', tx: '7E1', rx: '7E9', dtcs: [] },
    { nombre: 'ABS ESP', tx: '713', rx: '77D', dtcs: [['C0035', 0x1f, 0x09]] },
    { nombre: 'AIRBAG', tx: '715', rx: '77F', dtcs: [['B1001', 0x13, 0x28]], borrarNecesitaSesion: true },
    { nombre: 'GATEWAY', tx: '710', rx: '77A', vin: true, dtcs: [['U0100', 0x00, 0x04]] },
  ],
  gasolina: [
    { nombre: 'MOTOR', tx: '7E0', rx: '7E8', vin: true, dtcs: [['P0301', 0x00, 0x09]] },
    { nombre: 'ABS ESP', tx: '713', rx: '77D', dtcs: [] },
    { nombre: 'CUADRO', tx: '714', rx: '77E', dtcs: [['U0121', 0x00, 0x08]] },
  ],
  // Kuga híbrido real: las centralitas Ford no dan nombre por 22 F197; el BECM da los datos de la batería
  kuga: [
    { nombre: null, tx: '7E0', rx: '7E8', vin: true, dtcs: [] },
    { nombre: null, tx: '7E4', rx: '7EC', dtcs: [], dids: { '4801': [0x6c, 0xfc], '480D': [0x57, 0x52], '4840': [0x0e, 0x8f], '4841': [0x0e, 0x93], 'DD01': [0x00, 0xb8, 0x94] } },
    { nombre: null, tx: '7E6', rx: '7EE', vin: true, dtcs: [] },
    { nombre: null, tx: '726', rx: '72E', vin: true, dtcs: [] },
    { nombre: null, tx: '746', rx: '74E', dtcs: [] },
    { nombre: null, tx: '7D0', rx: '7D8', vin: true, dtcs: [['U0140', 0x00, 0x08]] },
  ],
  sinAverias: [
    { nombre: 'MOTOR', tx: '7E0', rx: '7E8', vin: true, dtcs: [] },
    { nombre: 'HIBRIDO', tx: '7E2', rx: '7EA', dtcs: [] },
  ],
};

function dtcABytes(code) {
  const letra = { P: 0, C: 1, B: 2, U: 3 }[code[0]];
  const d1 = Number(code[1]);
  const d2 = parseInt(code[2], 16);
  return [(letra << 6) | (d1 << 4) | d2, parseInt(code.slice(3), 16)];
}

export function crearSimulador(opciones = {}) {
  const coche = JSON.parse(JSON.stringify(COCHES_SIM[opciones.coche || 'diesel']));
  const latencia = opciones.latenciaMs ?? 40;
  const uds = JSON.parse(JSON.stringify(UDS_SIM[opciones.coche || 'diesel'] || []));
  const estado = { eco: true, cabeceras: false, espacios: true, conectado: false, borradas: false, t0: Date.now(), cabeceraPeticion: '7DF', cra: null,
    motor: opciones.motor || 'marcha', tArranque: null, fallo: null };
  // Batería: tensión en reposo, de carga con el motor en marcha y mínimo durante el arranque
  const bat = { reposo: 12.55, carga: 14.1, arranqueMin: 10.4, ...(opciones.bateria || {}) };
  let cb = () => {};

  const motorEnMarcha = () => estado.motor !== 'parado';

  // Tensión en la toma OBD según el estado del motor (sin azar: los tests necesitan valores estables)
  function tensionActual() {
    const ahora = Date.now();
    if (estado.motor === 'parado') return bat.reposo + 0.01 * Math.sin(ahora / 700);
    if (estado.tArranque !== null) {
      const dt = (ahora - estado.tArranque) / 1000;
      if (dt < 0.12) return bat.reposo - (bat.reposo - bat.arranqueMin) * (dt / 0.12);
      if (dt < 1.0) return bat.arranqueMin + 0.35 + 0.15 * Math.sin(dt * 40);
      if (dt < 1.6) return bat.arranqueMin + 0.5 + (bat.carga - bat.arranqueMin - 0.5) * ((dt - 1.0) / 0.6);
    }
    return bat.carga + 0.05 * Math.sin(ahora / 900);
  }
  // Fallo intermitente activo (inyectado por los tests o la demo)
  const falloActivo = () => estado.fallo && Date.now() < estado.fallo.hasta;
  const diesel = coche.combustible === 4;

  function vivo(pid) {
    const t = (Date.now() - estado.t0) / 1000;
    let rpm = estado.motor === 'parado' ? 0 : 800 + 1400 * (0.5 + 0.5 * Math.sin(t / 6)) + 60 * Math.sin(t * 3);
    if (falloActivo() && rpm > 0) rpm += estado.fallo.efectoRpm * Math.sin(t * 37);
    const vel = Math.max(0, (rpm - 850) / 30);
    const temp = Math.min(90, 40 + t * 0.8);
    const v = {
      0x04: 20 + rpm / 60, 0x05: temp, 0x06: 1.6 * Math.sin(t), 0x07: diesel ? 0 : 7.8, 0x0b: diesel ? 100 + rpm / 20 : 30 + rpm / 80,
      0x0c: rpm, 0x0d: vel, 0x0e: 8 + 4 * Math.sin(t / 2), 0x0f: 24 + Math.sin(t / 30), 0x10: rpm / 60, 0x11: 4 + rpm / 120,
      0x1f: t, 0x21: estado.borradas ? 0 : 412, 0x23: diesel ? 300 + rpm / 3 : 120, 0x2c: diesel ? 30 + 20 * Math.sin(t / 4) : 0,
      0x2f: 54, 0x30: estado.borradas ? 0 : 38, 0x31: estado.borradas ? 0 : 1260, 0x33: 94, 0x3c: 380 + rpm / 10,
      0x42: tensionActual(), 0x44: 1, 0x46: 19, 0x4d: estado.borradas ? 0 : 640, 0x4e: estado.borradas ? 0 : 5200,
      0x51: coche.combustible, 0x59: diesel ? 300 + rpm / 3 : 120, 0x5c: Math.max(0, temp - 5), 0x5e: rpm / 400,
      0x7c: diesel ? 290 + rpm / 8 : 0, 0xa6: coche.km,
    };
    return v[pid];
  }

  function codificarPid(pid, valor) {
    const w = (n) => { n = Math.max(0, Math.min(65535, Math.round(n))); return [n >> 8, n & 0xff]; };
    const b = (n) => [Math.max(0, Math.min(255, Math.round(n)))];
    switch (pid) {
      case 0x04: case 0x11: case 0x2c: case 0x2f: case 0x45: case 0x49: return b((valor * 255) / 100);
      case 0x05: case 0x0f: case 0x46: case 0x5c: return b(valor + 40);
      case 0x06: case 0x07: case 0x08: case 0x09: return b((valor * 128) / 100 + 128);
      case 0x0b: case 0x0d: case 0x30: case 0x33: case 0x51: return b(valor);
      case 0x0c: return w(valor * 4);
      case 0x0e: return b((valor + 64) * 2);
      case 0x10: return w(valor * 100);
      case 0x1f: case 0x21: case 0x31: case 0x4d: case 0x4e: return w(valor);
      case 0x23: case 0x59: return w(valor * 10);
      case 0x3c: case 0x7c: return w((valor + 40) * 10);
      case 0x42: return w(valor * 1000);
      case 0x44: return w((valor * 65536) / 2);
      case 0x5e: return w(valor * 20);
      case 0xa6: { const n = Math.round(valor * 10); return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; }
      default: return null;
    }
  }

  const SOPORTADOS = [0x01, 0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x1c, 0x1f, 0x20, 0x21, 0x23, 0x2c, 0x2f, 0x30, 0x31, 0x33, 0x3c, 0x40, 0x42, 0x44, 0x46, 0x4d, 0x4e, 0x51, 0x59, 0x5c, 0x5e, 0x60, 0x7c, 0x80, 0xa0, 0xa6];

  function mapaSoportados(base) {
    const out = [0, 0, 0, 0];
    for (const p of SOPORTADOS) {
      if (p > base && p <= base + 32) {
        const i = p - base - 1;
        out[Math.floor(i / 8)] |= 0x80 >> (i % 8);
      }
    }
    return out;
  }

  // Trama la respuesta en ISO-TP con cabecera
  function tramar(ecu, payload) {
    const lineas = [];
    if (payload.length <= 7) {
      lineas.push([payload.length, ...payload]);
    } else {
      lineas.push([0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)]);
      let sn = 1;
      for (let i = 6; i < payload.length; i += 7) {
        const trozo = payload.slice(i, i + 7);
        while (trozo.length < 7) trozo.push(0x55);
        lineas.push([0x20 | (sn & 0x0f), ...trozo]);
        sn++;
      }
    }
    return lineas.map((bytes) => {
      if (!estado.cabeceras) {
        // Sin cabecera: ISO-TP con números de línea como hace el ELM (solo multi-trama)
        return null;
      }
      const sep = estado.espacios ? ' ' : '';
      return [ecu, ...bytes.map(hx)].join(sep);
    }).filter(Boolean).concat(!estado.cabeceras ? sinCabecera(payload) : []);
  }

  function sinCabecera(payload) {
    const sep = estado.espacios ? ' ' : '';
    if (payload.length <= 7) return [payload.map(hx).join(sep)];
    const out = [payload.length.toString(16).toUpperCase().padStart(3, '0')];
    for (let i = 0, n = 0; i < payload.length; i += 7, n++) out.push(`${(n & 0xf).toString(16).toUpperCase()}:${sep}${payload.slice(i, i + 7).map(hx).join(sep)}`);
    return out;
  }

  function responderObd(cmd) {
    const bytes = cmd.match(/.{2}/g).map((h) => parseInt(h, 16));
    const servicio = bytes[0];
    const r = []; // [ecu, payload]
    const motor = (p) => r.push(['7E8', p]);
    const cambio = (p) => r.push(['7E9', p]);

    if (servicio === 0x01) {
      const pid = bytes[1];
      if ([0x00, 0x20, 0x40, 0x60, 0x80, 0xa0].includes(pid)) {
        motor([0x41, pid, ...mapaSoportados(pid)]);
        if (pid === 0x00) cambio([0x41, 0x00, 0x98, 0x18, 0x00, 0x01]);
      } else if (pid === 0x01) {
        const nConf = coche.averias.confirmada.length;
        const A = (nConf ? 0x80 : 0) | nConf;
        // Motor: continuos disponibles (0x07); diésel bit 3; completitud en bits 4-6
        const B = 0x07 | (diesel ? 0x08 : 0) | (estado.borradas ? 0x10 : 0);
        const C = diesel ? 0xe9 : 0xe5; // diésel: NMHC, sobrealim., sensor gases, DPF, EGR · gasolina: cat, evap, lambda, calef., EGR
        const D = estado.borradas ? C : diesel ? 0x40 : 0x04; // diésel: DPF sin completar · gasolina: EVAP sin completar
        motor([0x41, 0x01, A, B, C, D]);
      } else if (pid === 0x1c) {
        motor([0x41, 0x1c, 0x06]);
      } else {
        const v = vivo(pid);
        const enc = v === undefined ? null : codificarPid(pid, v);
        if (enc && SOPORTADOS.includes(pid)) motor([0x41, pid, ...enc]);
      }
    } else if (servicio === 0x02) {
      const pid = bytes[1];
      if (!coche.freeze || estado.borradas) return [];
      if (pid === 0x02) motor([0x42, 0x02, 0x00, ...dtcABytes(coche.freeze.dtc)]);
      else if (coche.freeze.valores[pid] !== undefined) motor([0x42, pid, 0x00, ...codificarPid(pid, coche.freeze.valores[pid])]);
    } else if ([0x03, 0x07, 0x0a].includes(servicio)) {
      const tipo = { 3: 'confirmada', 7: 'pendiente', 10: 'permanente' }[servicio];
      const lista = coche.averias[tipo];
      motor([servicio + 0x40, lista.length, ...lista.flatMap(dtcABytes)]);
      cambio([servicio + 0x40, 0x00]);
    } else if (servicio === 0x04) {
      // Con contacto puesto se puede borrar con el motor parado o en marcha
      coche.averias.confirmada = [];
      coche.averias.pendiente = [];
      estado.borradas = true;
      motor([0x44]);
      cambio([0x44]);
    } else if (servicio === 0x06) {
      // Modo 06: lambda B1S1 (01), catalizador B1 (21), EVAP 0,020" (3C) y fallos de encendido cil. 1-4 (A2-A5)
      const mid = bytes[1];
      const w = (n) => [(n >> 8) & 0xff, n & 0xff];
      const p = (m, tid, uas, v, mn, mx) => [m, tid, uas, ...w(v), ...w(mn), ...w(mx)];
      const mapa = {
        0x00: [0x46, 0x00, 0x80, 0x00, 0x00, 0x01], 0x20: [0x46, 0x20, 0x80, 0x00, 0x00, 0x11], 0x40: [0x46, 0x40, 0x00, 0x00, 0x00, 0x01],
        0x60: [0x46, 0x60, 0x00, 0x00, 0x00, 0x01], 0x80: [0x46, 0x80, 0x00, 0x00, 0x00, 0x01], 0xa0: [0x46, 0xa0, 0x78, 0x00, 0x00, 0x00],
        0x01: [0x46, ...p(0x01, 0x01, 0x0a, 3690, 0, 4100), ...p(0x01, 0x02, 0x0a, 2050, 1640, 8200), ...p(0x01, 0x85, 0x24, 12, 0, 40)],
        0x21: [0x46, ...p(0x21, 0x80, 0x20, diesel ? 140 : 236, 0, 230)], // gasolina: catalizador justo por encima del límite
        0x3c: [0x46, ...p(0x3c, 0x80, 0x29, 40, 0, 300)],
        0xa2: [0x46, ...p(0xa2, 0x0b, 0x24, 0, 0, 65535), ...p(0xa2, 0x0c, 0x24, 0, 0, 65535)],
        0xa3: [0x46, ...p(0xa3, 0x0b, 0x24, 2, 0, 65535), ...p(0xa3, 0x0c, 0x24, 5, 0, 65535)],
        0xa4: [0x46, ...p(0xa4, 0x0b, 0x24, 0, 0, 65535), ...p(0xa4, 0x0c, 0x24, 0, 0, 65535)],
        0xa5: [0x46, ...p(0xa5, 0x0b, 0x24, 0, 0, 65535), ...p(0xa5, 0x0c, 0x24, 0, 0, 65535)],
      };
      if (mapa[mid]) motor(mapa[mid]);
    } else if (servicio === 0x09) {
      const pid = bytes[1];
      if (pid === 0x02) motor([0x49, 0x02, 0x01, ...[...coche.vin].map((c) => c.charCodeAt(0))]);
      else if (pid === 0x0a) {
        motor([0x49, 0x0a, 0x01, ...[...'ECM-EngineControl'].map((c) => c.charCodeAt(0)), 0, 0, 0]);
        cambio([0x49, 0x0a, 0x01, ...[...'TCM-TransmisCtrl'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
      } else if (pid === 0x04) motor([0x49, 0x04, 0x01, ...[...'04L906056KT  4521'].map((c) => c.charCodeAt(0)).slice(0, 16)]);
      else if (pid === 0x00) motor([0x49, 0x00, 0x55, 0x40, 0x00, 0x00]);
    }
    if (!r.length) return ['NO DATA'];
    return r.flatMap(([ecu, p]) => tramar(ecu, p));
  }

  // Diagnosis UDS de una centralita concreta (ATSH/ATCRA)
  function responderUds(e, cmd) {
    const b = cmd.match(/.{2}/g).map((h) => parseInt(h, 16));
    const s = b[0];
    let r;
    const ascii = (t) => [...t].map((c) => c.charCodeAt(0));
    if (s === 0x3e) r = [0x7e, 0x00];
    else if (s === 0x10) { e.sesion = b[1]; r = [0x50, b[1], 0x00, 0x32, 0x01, 0xf4]; }
    else if (s === 0x22 && e.dids?.[cmd.slice(2, 6)]) r = [0x62, b[1], b[2], ...e.dids[cmd.slice(2, 6)]];
    else if (s === 0x22 && b[1] === 0xf1 && b[2] === 0x97 && e.nombre) r = [0x62, 0xf1, 0x97, ...ascii(e.nombre)];
    else if (s === 0x22 && b[1] === 0xf1 && b[2] === 0x87 && e.nombre) r = [0x62, 0xf1, 0x87, ...ascii(`5Q0${e.tx}000A`)];
    else if (s === 0x22 && b[1] === 0xf1 && b[2] === 0x90 && e.vin) r = [0x62, 0xf1, 0x90, ...ascii(coche.vin)];
    else if (s === 0x22) r = [0x7f, 0x22, 0x31];
    else if (s === 0x19 && b[1] === 0x02) r = [0x59, 0x02, 0xff, ...e.dtcs.flatMap(([c, sub, st]) => [...dtcABytes(c), sub, st])];
    else if (s === 0x14) {
      if (e.borrarNecesitaSesion && e.sesion !== 3) r = [0x7f, 0x14, 0x22];
      else { e.dtcs = []; r = [0x54]; }
    } else return null; // servicios OBD (01, 03...): los atiende responderObd
    return tramar(estado.cra || e.rx, r);
  }

  function procesar(linea) {
    const cmd = linea.replace(/\s+/g, '').toUpperCase();
    if (!cmd) return [];
    if (cmd.startsWith('AT')) {
      const a = cmd.slice(2);
      if (a === 'Z') { Object.assign(estado, { eco: true, cabeceras: false, espacios: true }); return ['', 'ELM327 v1.5']; }
      if (a === 'I') return ['ELM327 v1.5'];
      if (a === 'E0') { estado.eco = false; return ['OK']; }
      if (a === 'E1') { estado.eco = true; return ['OK']; }
      if (a === 'H0') { estado.cabeceras = false; return ['OK']; }
      if (a === 'H1') { estado.cabeceras = true; return ['OK']; }
      if (a === 'S0') { estado.espacios = false; return ['OK']; }
      if (a === 'S1') { estado.espacios = true; return ['OK']; }
      if (a === 'RV') return [`${tensionActual().toFixed(1)}V`];
      if (a === 'DPN') return ['A6'];
      if (a === 'DP') return ['AUTO, ISO 15765-4 (CAN 11/500)'];
      if (a.startsWith('SH')) { estado.cabeceraPeticion = a.slice(2); return ['OK']; }
      if (a.startsWith('CRA')) { estado.cra = a.slice(3) || null; return ['OK']; }
      if (a === 'AR') { estado.cra = null; return ['OK']; }
      return ['OK'];
    }
    if (cmd === 'STSCAN') {
      // Solo el transporte J2534 escanea el bus; un ELM normal contesta «?»
      if (!opciones.escaneo) return ['?'];
      return uds.map((e) => `${e.tx} ${e.rx}`);
    }
    if (!/^[0-9A-F]+$/.test(cmd) || cmd.length % 2) return ['?'];
    if (estado.cabeceraPeticion !== '7DF') {
      const e = uds.find((x) => x.tx === estado.cabeceraPeticion);
      const r = e ? responderUds(e, cmd) : null;
      if (r) return r;
      if (!e) return ['NO DATA'];
    }
    const resp = responderObd(cmd);
    if (!estado.conectado) { estado.conectado = true; return ['SEARCHING...', ...resp]; }
    return resp;
  }

  return {
    tipo: 'simulador',
    nombre: 'Simulador',
    coche,
    async conectar() { await new Promise((r) => setTimeout(r, latencia * 5)); },
    escribir(texto) {
      const lineas = texto.split('\r').filter((l) => l.trim());
      for (const l of lineas) {
        const out = procesar(l);
        const eco = estado.eco ? l.trim() + '\r' : '';
        const txt = eco + out.join('\r') + '\r\r>';
        setTimeout(() => cb(txt), latencia + Math.random() * latencia);
      }
    },
    alRecibir(f) { cb = f; },
    alDesconectarse() {},
    async desconectar() {},
    // Control del coche simulado (tests y demo)
    _pararMotor() { estado.motor = 'parado'; estado.tArranque = null; },
    _arrancar() { estado.motor = 'marcha'; estado.tArranque = Date.now(); },
    _tension: tensionActual,
    /** Fallo intermitente: añade una avería pendiente y altera las rpm durante unos segundos. */
    _inyectarFallo({ codigo = 'P0300', duracionS = 3, efectoRpm = 450, confirmar = false } = {}) {
      estado.fallo = { codigo, hasta: Date.now() + duracionS * 1000, efectoRpm };
      if (!coche.averias.pendiente.includes(codigo)) coche.averias.pendiente.push(codigo);
      if (confirmar && !coche.averias.confirmada.includes(codigo)) coche.averias.confirmada.push(codigo);
    },
    // Acceso directo para los tests
    _procesar: procesar,
    _estado: estado,
  };
}
