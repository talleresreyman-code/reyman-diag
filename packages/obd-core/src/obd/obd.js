// Reyman Diag · Servicios OBD de alto nivel sobre el ELM327
import { datosDeServicio, esCan, nombreEcu, ObdError } from './parser.js';
import { decodificarPid, decodificarSoportados, PIDS } from './pids.js';
import { decodificarReadiness } from './readiness.js';
import { extraerDtcs, describirDtc } from './dtc.js';
import { vinDesdeBytes, decodificarVin } from './vin.js';
import { extraerPruebas, decodificarMidsSoportados } from './modo06.js';

export class Obd {
  constructor(elm) {
    this.elm = elm;
    this.soportados = null;
  }

  async pedir(cmd, servicio, timeout) {
    const raw = await this.elm.enviar(cmd, timeout);
    return datosDeServicio(raw, servicio, cmd);
  }

  /** Lista de PIDs del modo 01 que soporta el motor (encadenando 00, 20, 40...). */
  async pidsSoportados() {
    if (this.soportados) return this.soportados;
    const todos = new Set();
    for (let base = 0; base <= 0xc0; base += 0x20) {
      let r;
      try { r = await this.pedir(`01${hexb(base)}`, 0x01); } catch { break; }
      let siguiente = false;
      for (const resp of r.respuestas) {
        if (resp.datos[0] !== base) continue;
        const lista = decodificarSoportados(base, resp.datos.slice(1, 5));
        lista.forEach((p) => todos.add(p));
        if (lista.includes(base + 0x20)) siguiente = true;
      }
      if (!siguiente) break;
    }
    this.soportados = [...todos].sort((a, b) => a - b);
    return this.soportados;
  }

  /** VIN (modo 09 PID 02). */
  async vin() {
    const r = await this.pedir('0902', 0x09, 8000);
    const datos = r.respuestas[0].legacy
      ? r.respuestas.flatMap((x) => x.datos.slice(2))
      : r.respuestas[0].datos.slice(1);
    const vin = vinDesdeBytes(r.respuestas[0].legacy ? [0x02, ...datos] : [0x02, ...datos]);
    return decodificarVin(vin);
  }

  /** Nombre de la centralita (modo 09 PID 0A) y calibración (09 04), si las da. */
  async infoCentralitas() {
    const out = [];
    for (const [pid, campo] of [[0x0a, 'nombre'], [0x04, 'calibracion']]) {
      try {
        const r = await this.pedir(`09${hexb(pid)}`, 0x09);
        for (const resp of r.respuestas) {
          const ecu = out.find((e) => e.ecu === resp.ecu) || out[out.push({ ecu: resp.ecu, modulo: nombreEcu(resp.ecu) }) - 1];
          ecu[campo] = String.fromCharCode(...resp.datos.slice(2).filter((b) => b >= 0x20 && b < 0x7f)).trim();
        }
      } catch { /* no todas lo soportan */ }
    }
    return out;
  }

  /**
   * Modo 06: resultados de las pruebas de los monitores, por centralita (solo CAN).
   * Devuelve { ecus: [{ ecu, modulo, pruebas:[...] }], fuera: nº de pruebas fuera de límites }.
   */
  async modo06(progreso = () => {}) {
    const porEcu = new Map();
    const ecu = (id) => porEcu.get(id) || porEcu.set(id, { ecu: id, modulo: nombreEcu(id), mids: [], pruebas: [] }).get(id);
    progreso('Buscando pruebas del modo 06…');
    for (let base = 0; base <= 0xe0; base += 0x20) {
      let r;
      try { r = await this.pedir(`06${hexb(base)}`, 0x06); } catch (e) { if (base === 0) throw e; break; }
      if (!esCan(r.tipo)) throw new ObdError('NO_CAN', 'El modo 06 solo se lee en coches con CAN.');
      let siguiente = false;
      for (const resp of r.respuestas) {
        if (resp.datos[0] !== base || resp.datos.length < 5) continue;
        const lista = decodificarMidsSoportados(base, resp.datos.slice(1, 5));
        ecu(resp.ecu).mids.push(...lista.filter((m) => m % 0x20 !== 0));
        if (lista.includes(base + 0x20)) siguiente = true;
      }
      if (!siguiente) break;
    }
    const mids = [...new Set([...porEcu.values()].flatMap((e) => e.mids))].sort((a, b) => a - b);
    for (const [i, mid] of mids.entries()) {
      progreso(`Leyendo pruebas del modo 06 (${i + 1} de ${mids.length})…`);
      let r;
      try { r = await this.pedir(`06${hexb(mid)}`, 0x06, 4000); } catch { continue; }
      for (const resp of r.respuestas) {
        if (resp.datos[0] !== mid) continue;
        ecu(resp.ecu).pruebas.push(...extraerPruebas(resp.datos));
      }
    }
    const ecus = [...porEcu.values()].filter((e) => e.pruebas.length).map(({ mids: _m, ...e }) => e);
    return { fecha: new Date().toISOString(), ecus, total: ecus.reduce((n, e) => n + e.pruebas.length, 0), fuera: ecus.reduce((n, e) => n + e.pruebas.filter((x) => !x.ok).length, 0) };
  }

  /** Estado de monitores y testigo MIL (modo 01 PID 01). */
  async readiness() {
    const r = await this.pedir('0101', 0x01);
    const validas = r.respuestas.filter((x) => x.datos[0] === 0x01 && x.datos.length >= 5);
    if (!validas.length) { const m = r.respuestas[0]; return { ecu: m.ecu, ...decodificarReadiness(m.datos.slice(1, 5)) }; }
    // Varias centralitas (híbridos: motor + sistema híbrido...): se juntan, como hace la ITV.
    // El tipo de motor lo da la que tiene más monitores no continuos (la de motor).
    const bitsC = (x) => x.toString(2).split('1').length - 1;
    const motor = validas.reduce((m, x) => (bitsC(x.datos[3]) > bitsC(m.datos[3]) ? x : m));
    let A = 0; let B = motor.datos[2] & 0x08; let C = 0; let D = 0; let n = 0;
    for (const x of validas) {
      const [, a, b, c, d] = x.datos;
      if (a & 0x80) A |= 0x80;
      n += a & 0x7f;
      B |= b & 0x77;
      if ((x.datos[2] & 0x08) === (motor.datos[2] & 0x08)) { C |= c; D |= d & c; }
    }
    A |= Math.min(n, 0x7f);
    return { ecu: motor.ecu, ecus: validas.map((x) => x.ecu), ...decodificarReadiness([A, B, C, D]) };
  }

  /** Averías: modo 03 (confirmadas), 07 (pendientes) y 0A (permanentes). */
  async averias() {
    const tipos = [
      { modo: '03', servicio: 0x03, tipo: 'confirmada' },
      { modo: '07', servicio: 0x07, tipo: 'pendiente' },
      { modo: '0A', servicio: 0x0a, tipo: 'permanente' },
    ];
    const lista = [];
    const errores = [];
    for (const t of tipos) {
      try {
        const r = await this.pedir(t.modo, t.servicio, 8000);
        const can = esCan(r.tipo);
        for (const resp of r.respuestas) {
          for (const codigo of extraerDtcs(resp.datos, can)) {
            if (lista.some((d) => d.codigo === codigo && d.tipo === t.tipo && d.ecu === resp.ecu)) continue;
            lista.push({ ...describirDtc(codigo), tipo: t.tipo, ecu: resp.ecu, modulo: nombreEcu(resp.ecu) });
          }
        }
      } catch (e) {
        if (e.code !== 'NO DATA') errores.push({ modo: t.modo, error: e.message });
      }
    }
    return { averias: lista, errores };
  }

  /** Freeze frame (modo 02, trama 0): DTC que lo provocó y valores de los PIDs disponibles. */
  async freezeFrame(pidsDeseados) {
    let dtc = null;
    try {
      const r = await this.pedir('020200', 0x02);
      const d = r.respuestas[0].datos; // [02, 00, b1, b2]
      if (d.length >= 4 && (d[2] || d[3])) dtc = extraerDtcs([d[2], d[3]], false)[0];
    } catch (e) {
      if (e.code === 'NO DATA') return { dtc: null, valores: [] };
      throw e;
    }
    if (!dtc) return { dtc: null, valores: [] };
    const valores = [];
    const lista = pidsDeseados || [0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x11, 0x42];
    for (const pid of lista) {
      try {
        const r = await this.pedir(`02${hexb(pid)}00`, 0x02);
        const d = r.respuestas[0].datos; // [pid, trama, datos...]
        if (d[0] !== pid) continue;
        valores.push(decodificarPid(pid, d.slice(2)));
      } catch { /* PID no guardado */ }
    }
    return { dtc: describirDtc(dtc), valores };
  }

  /** Lee un PID del modo 01. */
  async leerPid(pid) {
    const r = await this.pedir(`01${hexb(pid)}`, 0x01);
    const resp = r.respuestas.find((x) => x.datos[0] === pid);
    if (!resp) throw new ObdError('NO DATA', 'Sin dato');
    return decodificarPid(pid, resp.datos.slice(1, 1 + (PIDS[pid]?.bytes || 4)));
  }

  /** Lee varios PIDs; los que fallan se devuelven con valor null. */
  async leerPids(pids) {
    const out = [];
    for (const pid of pids) {
      try { out.push(await this.leerPid(pid)); } catch (e) { out.push({ pid, nombre: PIDS[pid]?.nombre || `PID ${hexb(pid)}`, unidad: PIDS[pid]?.unidad || '', valor: null, error: e.message }); }
    }
    return out;
  }

  /** Borra averías (modo 04). Solo debe llamarse tras la confirmación y el registro en el servidor. */
  async borrarAverias() {
    const raw = await this.elm.enviar('04', 10000);
    const r = datosDeServicio(raw, 0x04, '04');
    this.soportados = null;
    return { ok: true, centralitas: r.respuestas.map((x) => nombreEcu(x.ecu)) };
  }

  /** Lectura completa para la recepción del coche. */
  async lecturaCompleta(progreso = () => {}) {
    const res = { fecha: new Date().toISOString(), adaptador: this.elm.info };
    progreso('Leyendo bastidor (VIN)…');
    try { res.vehiculo = await this.vin(); } catch (e) { res.vehiculo = { valido: false, error: e.message }; }
    progreso('Leyendo centralitas…');
    res.centralitas = await this.infoCentralitas();
    progreso('Leyendo estado de monitores (pre-ITV)…');
    try { res.readiness = await this.readiness(); } catch (e) { res.readiness = { error: e.message }; }
    progreso('Leyendo averías…');
    const av = await this.averias();
    res.averias = av.averias;
    res.erroresLectura = av.errores;
    progreso('Leyendo freeze frame…');
    try { res.freezeFrame = await this.freezeFrame(); } catch (e) { res.freezeFrame = { error: e.message }; }
    progreso('Leyendo datos del motor…');
    res.soportados = await this.pidsSoportados().catch(() => []);
    const extra = [0x21, 0x31, 0x30, 0x4d, 0x4e, 0x51, 0xa6, 0x42, 0x5b].filter((p) => res.soportados.includes(p));
    res.datos = await this.leerPids(extra);
    try { res.tension = await this.elm.tension(); } catch { /* opcional */ }
    return res;
  }
}

export const hexb = (n) => n.toString(16).toUpperCase().padStart(2, '0');
