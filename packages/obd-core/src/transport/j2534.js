// Reyman Diag · Transporte J2534 (MaxiVCI V200 y otras interfaces PassThru) a través del programa de enlace del portátil.
// El enlace (j2534puente.cs) solo pasa mensajes a la DLL J2534. Aquí se hace todo lo demás y se presenta al resto
// de la app como si fuera un ELM327: acepta los mismos comandos de texto (ATZ, ATSH, 0100, 1902FF...) y contesta
// con el mismo formato (cabeceras, tramas ISO-TP), así el motor OBD, la batería y UDS funcionan sin cambios.
// Solo CAN (ISO 15765-4): 11 y 29 bits, 500 y 250 kbaud.
// Desde la v0.4.1 el ISO-TP (tramas largas y control de flujo) lo hace el enlace sobre CAN «crudo» (orden isotp):
// con el ISO 15765 de la propia V200 las respuestas de varias tramas no llegaban (bastidor, calibración, averías UDS).
// Extra frente a un ELM: «STSCAN» busca todas las centralitas que contestan a diagnosis en el bus (ver escanear()).

export const J2534_POR_DEFECTO = { puente: 'ws://localhost:35001/j2534' };

const CAN = 5;
const BITS29 = 0x100; // CAN_29BIT_ID
const PASS = 1;

export const PROTOCOLOS_J2534 = {
  6: { codigo: '6', bits: 11, baud: 500000, nombre: 'ISO 15765-4 (CAN 11/500)' },
  7: { codigo: '7', bits: 29, baud: 500000, nombre: 'ISO 15765-4 (CAN 29/500)' },
  8: { codigo: '8', bits: 11, baud: 250000, nombre: 'ISO 15765-4 (CAN 11/250)' },
  9: { codigo: '9', bits: 29, baud: 250000, nombre: 'ISO 15765-4 (CAN 29/250)' },
};
const ORDEN_AUTO = ['6', '8', '7', '9'];

const hx = (n, l = 2) => n.toString(16).toUpperCase().padStart(l, '0');
const id4 = (id) => [(id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
const aHex = (b) => b.map((x) => hx(x)).join('');
const deHex = (h) => (h.match(/.{2}/g) || []).map((x) => parseInt(x, 16));

/** Canal de líneas sobre WebSocket (en el navegador). */
export function canalWebSocket(url, WebSocketImpl = globalThis.WebSocket) {
  let ws = null;
  let alLinea = () => {};
  let alCerrar = () => {};
  return {
    abrir: () => new Promise((resolve, reject) => {
      let listo = false;
      try { ws = new WebSocketImpl(url); } catch (e) { reject(e); return; }
      const t = setTimeout(() => { if (!listo) { try { ws.close(); } catch { /* */ } reject(Object.assign(new Error('El programa de enlace no responde.'), { code: 'TIMEOUT' })); } }, 15000);
      ws.onmessage = (ev) => {
        const txt = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(new Uint8Array(ev.data));
        if (!listo) {
          if (txt.startsWith('PUENTE_OK')) { listo = true; clearTimeout(t); resolve(txt.slice(9).trim()); return; }
          if (txt.startsWith('PUENTE_ERROR')) { clearTimeout(t); reject(Object.assign(new Error(txt.replace(/^PUENTE_ERROR:?\s*/, '')), { code: 'PUENTE' })); return; }
        }
        for (const l of txt.split('\n')) if (l.trim()) alLinea(l.trim());
      };
      ws.onerror = () => { if (!listo) { clearTimeout(t); reject(Object.assign(new Error('No está abierto el programa de enlace. Ábrelo en el portátil («Iniciar Reyman Diag») y vuelve a intentarlo.'), { code: 'SIN_PUENTE' })); } };
      ws.onclose = () => { if (listo) alCerrar(); };
    }),
    enviar: (l) => { if (!ws || ws.readyState !== 1) throw new Error('El enlace con la interfaz está cerrado.'); ws.send(l); },
    alLinea: (f) => { alLinea = f; },
    alCerrar: (f) => { alCerrar = f; },
    cerrar: () => { try { ws?.close(); } catch { /* */ } },
  };
}

/**
 * @param {object} op { puente (URL), canal (canal de líneas ya creado: pruebas), log(texto) }
 */
export function crearTransporteJ2534(op = {}) {
  const canal = op.canal || canalWebSocket(op.puente || J2534_POR_DEFECTO.puente, op.WebSocketImpl);
  const logInterno = op.log || (() => {});
  let cb = () => {};
  let alDesconectar = () => {};
  let seq = 1;
  const pendientes = new Map();
  const respondedores = new Map(); // orden OBD general -> nº de centralitas que contestan
  let cola = Promise.resolve();
  const st = {
    eco: true, cabeceras: false, espacios: true, quiere: '0', proto: null, canal: null,
    tx: null, cra: null, info: null, interfaz: null,
  };

  canal.alLinea((l) => {
    const m = l.match(/^(\d+)\s+(OK|ERR)\s?(.*)$/);
    if (!m) return;
    const p = pendientes.get(Number(m[1]));
    if (!p) return;
    pendientes.delete(Number(m[1]));
    clearTimeout(p.t);
    if (m[2] === 'OK') {
      if (/^\s*ERRLEER/.test(m[3])) p.reject(Object.assign(new Error(`Error de lectura en la interfaz (${m[3].trim()})`), { code: 'J2534' }));
      else p.resolve(m[3]);
    } else {
      const e = m[3].match(/^(\d+)\s*(.*)$/) || [null, '0', m[3]];
      p.reject(Object.assign(new Error(e[2] || 'Error de la interfaz'), { code: 'J2534', j2534: Number(e[1]) }));
    }
  });
  canal.alCerrar(() => {
    for (const p of pendientes.values()) p.reject(new Error('Se ha cerrado el enlace con la interfaz.'));
    pendientes.clear();
    alDesconectar();
  });

  function rpc(orden, timeoutMs = 10000) {
    const n = seq++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pendientes.delete(n); reject(Object.assign(new Error(`La interfaz no responde (${orden.split(' ')[0]}).`), { code: 'TIMEOUT' })); }, timeoutMs);
      pendientes.set(n, { resolve, reject, t });
      logInterno(`j2534> ${n} ${orden}`);
      try { canal.enviar(`${n} ${orden}`); } catch (e) { clearTimeout(t); pendientes.delete(n); reject(e); }
    });
  }

  /** Mensajes de una lectura: [{ id, datos:[...] }] */
  function mensajes(resto) {
    return resto.trim().split(/\s+/).filter(Boolean).map((x) => {
      const [, , h] = x.split(',');
      const b = deHex(h || '');
      return { id: ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0, datos: b.slice(4) };
    }).filter((m) => m.datos.length);
  }

  const funcional = (p) => (p.bits === 29 ? 0x18db33f1 : 0x7df);

  async function abrirCanal(p) {
    const ch = Number(await rpc(`conectar ${CAN} ${p.bits === 29 ? BITS29 : 0} ${p.baud}`));
    // Solo se reciben las direcciones de diagnosis (600–7FF en 11 bits, 18DAxxxx en 29 bits)
    if (p.bits === 11) {
      await rpc(`filtro ${ch} ${PASS} ${CAN} 0 00000700 00000700 -`);
      await rpc(`filtro ${ch} ${PASS} ${CAN} 0 00000700 00000600 -`);
    } else {
      await rpc(`filtro ${ch} ${PASS} ${CAN} ${BITS29} 1FFF0000 18DA0000 -`);
    }
    st.canal = ch;
    return ch;
  }

  async function cerrarCanal() {
    if (st.canal === null) return;
    const ch = st.canal;
    st.canal = null;
    try { await rpc(`desconectar ${ch}`); } catch { /* */ }
  }

  /** Envía una petición ISO 15765 y devuelve las respuestas [{ id, datos }] (sin «respuesta pendiente»). */
  async function peticion(p, tx, rx, carga, { esperaPrimero, esperaSiguientes, max }) {
    const r = await rpc(`isotp ${st.canal} ${p.bits === 29 ? 1 : 0} ${hx(tx, 8)} ${rx === null ? 'obd' : hx(rx, 8)} ${max} ${esperaPrimero} ${esperaSiguientes} ${aHex(carga)}`, esperaPrimero + 15000);
    return mensajes(r).filter((m) => !(m.datos[0] === 0x7f && m.datos[2] === 0x78) && (rx === null || m.id === rx));
  }

  async function asegurarProtocolo() {
    if (st.proto) return false;
    const candidatos = st.quiere === '0' ? ORDEN_AUTO : [st.quiere];
    for (const c of candidatos) {
      const p = PROTOCOLOS_J2534[c];
      if (!p) continue;
      try {
        await abrirCanal(p);
        const r = await peticion(p, funcional(p), null, [0x01, 0x00], { esperaPrimero: 400, esperaSiguientes: 120, max: 8 });
        if (r.length) { st.proto = p; return true; }
      } catch (e) { logInterno(`j2534: ${c} ${e.message}`); }
      await cerrarCanal();
    }
    const e = new Error('UNABLE TO CONNECT');
    e.code = 'SIN_VEHICULO';
    throw e;
  }

  // Dirección de respuesta para una petición física (como hace un ELM sin ATCRA)
  function rxPara(p, tx) {
    if (st.cra !== null) return st.cra;
    if (p.bits === 11) return tx + 8;
    return (0x18daf100 | ((tx >>> 8) & 0xff)) >>> 0; // 18DAxxF1 -> 18DAF1xx
  }

  // Formato de salida igual que un ELM327 con CAF1: tramas ISO-TP con cabecera
  function tramas(datos) {
    if (datos.length <= 7) return [[datos.length, ...datos]];
    const out = [[0x10 | (datos.length >> 8), datos.length & 0xff, ...datos.slice(0, 6)]];
    let sn = 1;
    for (let i = 6; i < datos.length; i += 7) {
      const t = datos.slice(i, i + 7);
      while (t.length < 7) t.push(0xaa);
      out.push([0x20 | (sn & 0x0f), ...t]);
      sn++;
    }
    return out;
  }

  function formatear(p, resp) {
    const sep = st.espacios ? ' ' : '';
    const lineas = [];
    for (const m of resp) {
      const cab = p.bits === 11 ? hx(m.id, 3) : id4(m.id).map((x) => hx(x)).join(sep);
      if (st.cabeceras) {
        for (const t of tramas(m.datos)) lineas.push(`${cab}${sep}${t.map((x) => hx(x)).join(sep)}`);
      } else if (m.datos.length <= 7) {
        lineas.push(m.datos.map((x) => hx(x)).join(sep));
      } else {
        lineas.push(hx(m.datos.length, 3));
        tramas(m.datos).forEach((t, i) => lineas.push(`${hx(i & 0xf, 1)}:${sep}${t.slice(i === 0 ? 2 : 1).map((x) => hx(x)).join(sep)}`));
      }
    }
    return lineas;
  }

  async function solicitud(bytes) {
    const buscado = await asegurarProtocolo();
    const p = st.proto;
    const tx = st.tx ?? funcional(p);
    const esFuncional = tx === funcional(p);
    const rx = esFuncional ? null : rxPara(p, tx);
    // Petición general: si ya sabemos cuántas centralitas contestan a esta orden, no se espera a más
    // (así los datos en vivo van unas 4 veces más rápido en coches con varias centralitas OBD, como los híbridos)
    const clave = aHex(bytes);
    const conocidas = esFuncional ? respondedores.get(clave) : null;
    const resp = await peticion(p, tx, rx, bytes, esFuncional
      ? { esperaPrimero: 300, esperaSiguientes: 120, max: conocidas || 8 }
      : { esperaPrimero: 1500, esperaSiguientes: 60, max: 1 });
    if (esFuncional && bytes[0] === 0x01 && resp.length) respondedores.set(clave, Math.max(resp.length, conocidas || 0));
    const out = buscado && st.quiere === '0' ? ['SEARCHING...'] : [];
    if (!resp.length) return [...out, 'NO DATA'];
    return [...out, ...formatear(p, resp)];
  }

  /**
   * Busca centralitas de diagnosis en el bus (TesterPresent 3E 00 a cada dirección física).
   * Seguridad: primero escucha 1,5 s sin enviar nada y NO envía nunca con un identificador que ya use el coche.
   * Devuelve líneas «TX RX» (p. ej. «6A8 688»).
   */
  async function escanear() {
    await asegurarProtocolo();
    const p = st.proto;
    const ch = st.canal;
    const flags = p.bits === 29 ? BITS29 : 0;
    const pares = [];
    {
      await rpc(`limpiar ${ch}`).catch(() => {});
      // 1. Escuchar
      const escuchados = mensajes(await rpc(`leer ${ch} 2000 1500 1500`, 20000));
      const ocupados = new Set(escuchados.map((m) => m.id));
      logInterno(`j2534: escaneo, ID en uso por el coche: ${[...ocupados].map((x) => hx(x, 3)).join(' ') || 'ninguno'}`);
      // 2. Preguntar a cada dirección libre
      const candidatos = [];
      if (p.bits === 11) {
        for (let id = 0x600; id <= 0x7ff; id++) if (id !== 0x7df && !(id >= 0x7e8 && id <= 0x7ef) && !ocupados.has(id)) candidatos.push(id);
      } else {
        for (let e = 0; e <= 0xff; e++) { const id = (0x18da00f1 | (e << 8)) >>> 0; if (e !== 0xf1 && !ocupados.has(id)) candidatos.push(id); }
      }
      for (const tx of candidatos) {
        const r = mensajes(await rpc(`enviarleer ${ch} ${CAN} ${flags} 3 30 10 ${aHex([...id4(tx), 0x02, 0x3e, 0x00, 0x55, 0x55, 0x55, 0x55, 0x55])}`));
        for (const m of r) {
          if (m.id === tx || ocupados.has(m.id)) continue;
          const d = m.datos;
          const positiva = d[0] === 0x02 && d[1] === 0x7e && d[2] === 0x00;
          const negativa = d[0] === 0x03 && d[1] === 0x7f && d[2] === 0x3e;
          if ((positiva || negativa) && !pares.some((x) => x.rx === m.id)) pares.push({ tx, rx: m.id });
        }
      }
    }
    if (!pares.length) return ['NO DATA'];
    return pares.map((x) => (p.bits === 11 ? `${hx(x.tx, 3)} ${hx(x.rx, 3)}` : `${hx(x.tx, 8)} ${hx(x.rx, 8)}`));
  }

  async function procesar(linea) {
    const c = linea.replace(/\s+/g, '').toUpperCase();
    if (!c) return [];
    if (c === 'STSCAN') return escanear();
    if (c.startsWith('AT')) {
      const a = c.slice(2);
      if (a === 'Z' || a === 'WS' || a === 'D') {
        Object.assign(st, { eco: true, cabeceras: false, espacios: true, tx: null, cra: null });
        return ['', 'ELM327 v1.5'];
      }
      if (a === 'I') return ['ELM327 v1.5'];
      if (a === '@1') return [`Reyman J2534 · ${st.interfaz || 'PassThru'}`];
      if (a === 'E0' || a === 'E1') { st.eco = a === 'E1'; return ['OK']; }
      if (a === 'H0' || a === 'H1') { st.cabeceras = a === 'H1'; return ['OK']; }
      if (a === 'S0' || a === 'S1') { st.espacios = a === 'S1'; return ['OK']; }
      if (a === 'PC') { await cerrarCanal(); st.proto = null; respondedores.clear(); return ['OK']; }
      if (/^(SP|TP)A?[0-9A-C]$/.test(a)) {
        const q = a.slice(-1);
        st.quiere = PROTOCOLOS_J2534[q] ? q : '0';
        if (st.proto && st.quiere !== '0' && st.proto.codigo !== st.quiere) { await cerrarCanal(); st.proto = null; }
        return ['OK'];
      }
      if (a === 'DPN') return [st.proto ? `${st.quiere === '0' ? 'A' : ''}${st.proto.codigo}` : '0'];
      if (a === 'DP') return [st.proto ? `${st.quiere === '0' ? 'AUTO, ' : ''}${st.proto.nombre}` : 'AUTO'];
      if (a === 'RV') { const mv = Number(await rpc('tension')); return [`${(mv / 1000).toFixed(1)}V`]; }
      if (a.startsWith('SH')) {
        const h = a.slice(2);
        if (!/^[0-9A-F]{3}$|^[0-9A-F]{6}$|^[0-9A-F]{8}$/.test(h)) return ['?'];
        st.tx = h.length === 6 ? parseInt(`18${h}`, 16) >>> 0 : parseInt(h, 16) >>> 0;
        return ['OK'];
      }
      if (a.startsWith('CRA')) { const h = a.slice(3); st.cra = h ? parseInt(h, 16) >>> 0 : null; return ['OK']; }
      if (a === 'AR') { st.cra = null; return ['OK']; }
      return ['OK']; // ATL0, ATAT1, ATST, ATCAF1, ATM0...: sin efecto aquí
    }
    if (!/^[0-9A-F]+$/.test(c) || c.length % 2) return ['?'];
    return solicitud(deHex(c));
  }

  return {
    tipo: 'j2534',
    nombre: 'MaxiVCI (J2534)',
    get info() { return { ...st.info, interfaz: st.interfaz, protocolo: st.proto }; },
    async conectar() {
      const nombre = await canal.abrir();
      st.interfaz = nombre || 'J2534';
      try { await rpc('abrir', 20000); } catch (e) {
        // 8 = ocupada por otro programa; 1/3/4 = no está enchufada o sin controlador
        const msg = e.j2534 === 8 ? 'La V200 está ocupada: cierra Maxi PC Suite y la tablet MS919, desenchufa el USB y vuelve a enchufarlo.'
          : [1, 3, 4].includes(e.j2534) ? 'No se encuentra la V200: comprueba el cable USB y que tenga la luz verde.' : `No se puede abrir la interfaz: ${e.message}`;
        try { canal.cerrar(); } catch { /* */ }
        throw Object.assign(new Error(msg), { code: 'J2534', j2534: e.j2534 });
      }
      try { const v = await rpc('version'); const [fw, dll, api] = v.split('|'); st.info = { firmware: fw?.trim(), dll: dll?.trim(), api: api?.trim() }; } catch { /* */ }
      this.nombre = `${st.interfaz} (J2534)`;
    },
    escribir(texto) {
      for (const l of texto.split('\r')) {
        if (!l.trim()) continue;
        cola = cola.then(async () => {
          let salida;
          try { salida = await procesar(l); } catch (e) {
            logInterno(`j2534: ${e.message}`);
            // 8 = la interfaz se ha desconectado del ordenador (USB): se avisa a la app para que lo muestre
            if (e.j2534 === 8 && !st.perdida) { st.perdida = true; setTimeout(() => alDesconectar(), 0); }
            salida = [e.code === 'SIN_VEHICULO' ? 'UNABLE TO CONNECT' : e.code === 'TIMEOUT' ? 'STOPPED' : 'CAN ERROR'];
          }
          const eco = st.eco ? `${l.trim()}\r` : '';
          cb(`${eco}${salida.join('\r')}\r\r>`);
        });
      }
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      try { await cerrarCanal(); await rpc('cerrar', 3000); } catch { /* */ }
      canal.cerrar();
    },
    // Para las pruebas
    _rpc: rpc,
    _estado: st,
  };
}
