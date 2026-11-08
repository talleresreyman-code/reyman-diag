// Reyman Diag · Servicios OBD de alto nivel sobre el ELM327
import { datosDeServicio, esCan, nombreEcu, ObdError } from './parser.js';
import { decodificarPid, decodificarSoportados, infoPid, longitudPid, grupoDeSenal } from './pids.js';
import { decodificarReadiness } from './readiness.js';
import { extraerDtcs, describirDtc } from './dtc.js';
import { vinDesdeBytes, decodificarVin } from './vin.js';
import { extraerPruebas, decodificarMidsSoportados } from './modo06.js';
import { decodificarCalid, decodificarCvn, decodificarIpt, decodificarInfotiposSoportados, textoDeBytes } from './modo09.js';

export class Obd {
  constructor(elm) {
    this.elm = elm;
    this.soportados = null;
    this.protocolo = null; // 'clasico' (SAE J1979, servicios 01-0A) o 'uds' (SAE J1979-2, OBD sobre UDS)
  }

  /** ¿El coche habla OBD clásico o OBD sobre UDS (J1979-2, obligatorio en EE. UU. desde 2027 y ya en algunos 2022+)? */
  async detectar() {
    if (this.protocolo) return this.protocolo;
    if (this.elm.info?.obdUds) return (this.protocolo = 'uds');
    try { await this.pedir('0100', 0x01); this.protocolo = 'clasico'; } catch (e) {
      try { await this.pedir('22F400', 0x22); this.protocolo = 'uds'; } catch { this.protocolo = 'clasico'; throw e; }
    }
    return this.protocolo;
  }

  get esUds() { return this.protocolo === 'uds'; }

  /** Pide un PID (01 xx o 22 F4xx) y devuelve las respuestas con datos = [pid, bytes...] como en el modo 01. */
  async pedirPid(pid, timeout) {
    if (!this.esUds) return this.pedir(`01${hexb(pid)}`, 0x01, timeout);
    const r = await this.pedir(`22F4${hexb(pid)}`, 0x22, timeout);
    return { ...r, respuestas: r.respuestas.filter((x) => x.datos[0] === 0xf4).map((x) => ({ ...x, datos: x.datos.slice(1) })) };
  }

  /** Pide un infotipo (09 xx o 22 F8xx) con datos = [infotipo, nº elementos, bytes...] como en el modo 09. */
  async pedirInfo(it, timeout) {
    if (!this.esUds) return this.pedir(`09${hexb(it)}`, 0x09, timeout);
    const r = await this.pedir(`22F8${hexb(it)}`, 0x22, timeout);
    return { ...r, respuestas: r.respuestas.filter((x) => x.datos[0] === 0xf8).map((x) => ({ ...x, datos: it % 0x20 === 0 ? x.datos.slice(1) : [x.datos[1], 0x01, ...x.datos.slice(2)] })) };
  }

  async pedir(cmd, servicio, timeout) {
    const raw = await this.elm.enviar(cmd, timeout);
    return datosDeServicio(raw, servicio, cmd);
  }

  /** Lista de PIDs del modo 01 que soporta el motor (encadenando 00, 20, 40...). */
  async pidsSoportados() {
    if (this.soportados) return this.soportados;
    const todos = new Set();
    await this.detectar().catch(() => {});
    for (let base = 0; base <= 0xc0; base += 0x20) {
      let r;
      try { r = await this.pedirPid(base); } catch { break; }
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
    const r = await this.pedirInfo(0x02, 8000);
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
        const r = await this.pedirInfo(pid);
        for (const resp of r.respuestas) {
          const ecu = out.find((e) => e.ecu === resp.ecu) || out[out.push({ ecu: resp.ecu, modulo: nombreEcu(resp.ecu) }) - 1];
          ecu[campo] = String.fromCharCode(...resp.datos.slice(2).filter((b) => b >= 0x20 && b < 0x7f)).trim();
        }
      } catch { /* no todas lo soportan */ }
    }
    return out;
  }

  /**
   * Servicio 09 completo, por centralita: nombre, calibraciones con su CVN, número de serie y contadores de uso
   * de los monitores (IUMPR). Devuelve { ecus: [{ ecu, modulo, nombre, calibraciones:[{id, cvn}], serie, ipt }] }.
   */
  async modo09(progreso = () => {}) {
    const porEcu = new Map();
    const ecu = (id) => porEcu.get(id) || porEcu.set(id, { ecu: id, modulo: nombreEcu(id), calibraciones: [] }).get(id);
    let soportados = [];
    try {
      const r = await this.pedirInfo(0x00);
      for (const x of r.respuestas) if (x.datos[0] === 0) soportados.push(...decodificarInfotiposSoportados(0, x.datos.slice(1, 5)));
    } catch { /* sin mapa: se prueba todo */ }
    soportados = soportados.length ? [...new Set(soportados)] : [0x04, 0x06, 0x08, 0x0a, 0x0b, 0x0d];
    const pedir = async (it, f) => {
      if (!soportados.includes(it)) return;
      try {
        const r = await this.pedirInfo(it, 6000);
        for (const x of r.respuestas) if (x.datos[0] === it) f(ecu(x.ecu), x.datos.slice(2));
      } catch { /* esa centralita no lo da */ }
    };
    progreso('Leyendo identificación de las centralitas…');
    await pedir(0x0a, (e, d) => { e.nombre = textoDeBytes(d).replace(/-/g, ' ').replace(/\s+/g, ' '); });
    await pedir(0x04, (e, d) => { e.calibraciones = decodificarCalid(d).map((id) => ({ id })); });
    await pedir(0x06, (e, d) => { decodificarCvn(d).forEach((c, i) => { (e.calibraciones[i] ||= { id: null }).cvn = c; }); });
    await pedir(0x0d, (e, d) => { e.serie = textoDeBytes(d); });
    progreso('Leyendo contadores de uso de los monitores…');
    await pedir(0x08, (e, d) => { e.ipt = decodificarIpt(0x08, d); });
    await pedir(0x0b, (e, d) => { e.ipt = decodificarIpt(0x0b, d); });
    return { fecha: new Date().toISOString(), soportados, ecus: [...porEcu.values()] };
  }

  /**
   * Modo 06: resultados de las pruebas de los monitores, por centralita (solo CAN).
   * Devuelve { ecus: [{ ecu, modulo, pruebas:[...] }], fuera: nº de pruebas fuera de límites }.
   */
  async modo06(progreso = () => {}) {
    if (this.esUds) throw new ObdError('NO_CAN', 'Este coche usa OBD sobre UDS: el modo 06 va por 22 F6xx y aún no se lee.');
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
    const r = await this.pedirPid(0x01);
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
    if (this.esUds) return this.averiasUds();
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

  /** Averías en OBD sobre UDS: 19 42 33 (confirmadas 08, pendientes 04) y 19 55 33 (permanentes). Con el byte FTB. */
  async averiasUds() {
    const lista = [];
    const errores = [];
    const peticiones = [
      { cmd: '19423308FF', tipo: 'confirmada', sub: 0x42 },
      { cmd: '19423304FF', tipo: 'pendiente', sub: 0x42 },
      { cmd: '195533', tipo: 'permanente', sub: 0x55 },
    ];
    for (const p of peticiones) {
      try {
        const r = await this.pedir(p.cmd, 0x19, 8000);
        for (const resp of r.respuestas) {
          const d = resp.datos;
          if (d[0] !== p.sub) continue;
          // 42: [42, 33, dispEstado, dispGravedad, formato, (gravedad, dtc×3, estado)…] · 55: [55, 33, dispEstado, formato, (dtc×3, estado)…]
          const ini = p.sub === 0x42 ? 5 : 4;
          const paso = p.sub === 0x42 ? 5 : 4;
          for (let i = ini; i + paso <= d.length; i += paso) {
            const reg = d.slice(i, i + paso);
            const [b1, b2, ftb, est] = p.sub === 0x42 ? reg.slice(1) : reg;
            if (!b1 && !b2) continue;
            const codigo = extraerDtcs([b1, b2], false)[0];
            if (lista.some((x) => x.codigo === codigo && x.tipo === p.tipo && x.ecu === resp.ecu)) continue;
            lista.push({ ...describirDtc(codigo), tipo: p.tipo, ecu: resp.ecu, modulo: nombreEcu(resp.ecu), ftb, estado: est });
          }
        }
      } catch (e) {
        if (e.code !== 'NO DATA') errores.push({ modo: p.cmd.slice(0, 4), error: e.message });
      }
    }
    return { averias: lista, errores };
  }

  /** Freeze frame (modo 02, trama 0): DTC que lo provocó y valores de los PIDs disponibles. */
  async freezeFrame(pidsDeseados) {
    if (this.esUds) return { dtc: null, valores: [], nota: 'En OBD sobre UDS el freeze frame va por 19 04: aún no se lee.' };
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
    const r = await this.pedirPid(pid);
    const resp = r.respuestas.find((x) => x.datos[0] === pid);
    if (!resp) throw new ObdError('NO DATA', 'Sin dato');
    return { ...decodificarPid(pid, resp.datos.slice(1, 1 + longitudPid(pid))), ecu: resp.ecu };
  }

  /** Lee varios PIDs; los que fallan se devuelven con valor null. */
  async leerPids(pids) {
    const out = [];
    for (const pid of pids) {
      try { out.push(await this.leerPid(pid)); } catch (e) { out.push({ pid, ...infoPid(pid), valor: null, senales: [], error: e.message }); }
    }
    return out;
  }

  /**
   * Foto de todos los datos del modo 01 que soporta el coche (una lectura de cada PID).
   * Devuelve { fecha, pids: n, grupos: [{ id, datos: [{ pid, id, nombre, valor, unidad, texto, ecu }] }] }.
   */
  async fotoCompleta(progreso = () => {}) {
    const sop = (await this.pidsSoportados().catch(() => [])).filter((p) => p % 0x20 !== 0 && p !== 0x01 && p !== 0x41 && p !== 0x02);
    const datos = [];
    let i = 0;
    for (const pid of sop) {
      progreso(`Leyendo datos ${++i}/${sop.length}…`);
      try {
        const r = await this.leerPid(pid);
        for (const s of r.senales) datos.push({ pid, id: s.id, nombre: s.nombre, valor: s.valor, unidad: s.unidad, texto: s.texto, ecu: r.ecu, grupo: grupoDeSenal(s.id) });
      } catch { /* sin dato */ }
    }
    const grupos = [];
    for (const d of datos) {
      let g = grupos.find((x) => x.id === d.grupo);
      if (!g) grupos.push(g = { id: d.grupo, datos: [] });
      g.datos.push(d);
    }
    return { fecha: new Date().toISOString(), pids: sop.length, grupos };
  }

  /** Borra averías (modo 04). Solo debe llamarse tras la confirmación y el registro en el servidor. */
  async borrarAverias() {
    if (this.esUds) {
      const raw = await this.elm.enviar('14FFFF33', 10000);
      const r = datosDeServicio(raw, 0x14, '14FFFF33');
      this.soportados = null;
      return { ok: true, centralitas: r.respuestas.map((x) => nombreEcu(x.ecu)) };
    }
    const raw = await this.elm.enviar('04', 10000);
    const r = datosDeServicio(raw, 0x04, '04');
    this.soportados = null;
    return { ok: true, centralitas: r.respuestas.map((x) => nombreEcu(x.ecu)) };
  }

  /** Lectura completa para la recepción del coche. */
  async lecturaCompleta(progreso = () => {}) {
    const res = { fecha: new Date().toISOString(), adaptador: this.elm.info };
    await this.detectar().catch(() => {});
    res.protocoloObd = this.protocolo === 'uds' ? 'OBD sobre UDS (SAE J1979-2)' : 'OBD clásico (SAE J1979)';
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
    const extra = [0x21, 0x31, 0x30, 0x4d, 0x4e, 0x51, 0xa6, 0x42, 0x5b, 0x9a, 0xb2].filter((p) => res.soportados.includes(p));
    res.datos = await this.leerPids(extra);
    try { res.tension = await this.elm.tension(); } catch { /* opcional */ }
    return res;
  }
}

export const hexb = (n) => n.toString(16).toUpperCase().padStart(2, '0');
