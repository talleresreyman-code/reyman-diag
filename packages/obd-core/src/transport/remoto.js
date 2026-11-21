// Reyman Diag / Reyman Connect · Diagnóstico remoto
// El cliente tiene el adaptador en su coche y la app Reyman Connect abierta; el taller trabaja desde Reyman Diag.
// El servidor (diag.talleresreyman.es) solo empareja las dos puntas por un código de 6 cifras y pasa los mensajes.
//
//   Reyman Diag  ──tx──▶  servidor  ──tx──▶  Connect  ──▶ adaptador (Bluetooth / Wi-Fi)
//   Reyman Diag  ◀──rx──  servidor  ◀──rx──  Connect  ◀── adaptador
//
// Mensajes (JSON por WebSocket):
//   taller → cliente   { t: 'tx', d: 'texto ELM' }
//   cliente → taller   { t: 'rx', d: 'texto ELM' }
//   servidor → taller  { t: 'listo', cliente: { nombre, matricula, vin, adaptador } }   (cliente ya conectado)
//   servidor → cliente { t: 'taller', usuario }                                         (el taller ha entrado)
//   cualquiera         { t: 'fin', motivo }                                              (se acaba la sesión)
//   servidor           { t: 'error', error }

const JSONseguro = (x) => { try { return JSON.parse(x); } catch { return null; } };

/**
 * Transporte para Reyman Diag: el «adaptador» está en el coche del cliente, al otro lado de Internet.
 * @param {object} op { url (wss://…/api/remoto/ws?codigo=…), WebSocket (opcional, para pruebas), esperaMs }
 */
export function crearTransporteRemoto(op = {}) {
  const WS = op.WebSocket || globalThis.WebSocket;
  let ws = null;
  let cb = () => {};
  let alDesconectar = () => {};
  let abierto = false;
  const t = {
    tipo: 'remoto',
    nombre: 'Remoto (app del cliente)',
    cliente: null,
    async conectar() {
      if (!WS) throw new Error('Este navegador no permite conexiones remotas.');
      ws = new WS(op.url);
      await new Promise((ok, mal) => {
        const espera = setTimeout(() => { mal(new Error('El cliente no contesta. Comprueba el código y que tenga la app abierta.')); try { ws.close(); } catch { /* */ } }, op.esperaMs ?? 20000);
        ws.onmessage = (e) => {
          const m = JSONseguro(e.data);
          if (!m) return;
          if (m.t === 'listo') { clearTimeout(espera); t.cliente = m.cliente || null; abierto = true; ok(); }
          else if (m.t === 'error' || m.t === 'fin') { clearTimeout(espera); mal(new Error(m.error || m.motivo || 'Sesión remota cerrada.')); }
        };
        ws.onerror = () => { clearTimeout(espera); mal(new Error('No se ha podido abrir la conexión remota con el servidor.')); };
        ws.onclose = (e) => { clearTimeout(espera); if (!abierto) mal(new Error(e?.reason || 'El servidor ha cerrado la conexión remota.')); };
      });
      ws.onmessage = (e) => {
        const m = JSONseguro(e.data);
        if (!m) return;
        if (m.t === 'rx' && typeof m.d === 'string') cb(m.d);
        else if (m.t === 'fin') { abierto = false; alDesconectar(m.motivo || 'El cliente ha terminado la sesión.'); }
      };
      ws.onclose = () => { if (abierto) { abierto = false; alDesconectar('Se ha cortado la conexión con el cliente.'); } };
      if (t.cliente?.adaptador) t.nombre = `Remoto · ${t.cliente.adaptador}`;
    },
    escribir(texto) {
      if (!abierto) throw new Error('La sesión remota está cerrada.');
      ws.send(JSON.stringify({ t: 'tx', d: texto }));
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      const era = abierto;
      abierto = false;
      try { if (era) ws.send(JSON.stringify({ t: 'fin', motivo: 'El taller ha terminado la sesión.' })); } catch { /* */ }
      try { ws?.close(); } catch { /* */ }
    },
  };
  return t;
}

/**
 * Puente en Reyman Connect: une el adaptador del cliente (transporte ya conectado) con el WebSocket del servidor.
 * Devuelve { cerrar() } y avisa con eventos: alTaller(usuario), alComando(texto), alFin(motivo).
 * No interpreta nada: lo que pide el taller va tal cual al adaptador y la respuesta vuelve tal cual.
 */
export function crearPuenteRemoto({ transporte, ws, alTaller = () => {}, alComando = () => {}, alFin = () => {} }) {
  let vivo = true;
  const fin = (motivo) => { if (!vivo) return; vivo = false; try { ws.close(); } catch { /* */ } alFin(motivo); };
  transporte.alRecibir((d) => { if (vivo) { try { ws.send(JSON.stringify({ t: 'rx', d })); } catch { /* */ } } });
  transporte.alDesconectarse?.(() => { if (vivo) { try { ws.send(JSON.stringify({ t: 'fin', motivo: 'El adaptador del cliente se ha desconectado.' })); } catch { /* */ } fin('Se ha perdido la conexión con el adaptador.'); } });
  ws.onmessage = (e) => {
    const m = JSONseguro(e.data);
    if (!m || !vivo) return;
    if (m.t === 'tx' && typeof m.d === 'string' && m.d.length < 200) {
      alComando(m.d);
      try { transporte.escribir(m.d); } catch (err) { fin(err.message); }
    } else if (m.t === 'taller') alTaller(m.usuario || 'el taller');
    else if (m.t === 'fin') fin(m.motivo || 'El taller ha terminado la sesión.');
    else if (m.t === 'error') fin(m.error || 'Error en la sesión remota.');
  };
  ws.onclose = () => fin('Se ha cortado la conexión con el taller.');
  return {
    cerrar(motivo = 'El cliente ha terminado la sesión.') {
      if (!vivo) return;
      try { ws.send(JSON.stringify({ t: 'fin', motivo })); } catch { /* */ }
      fin(motivo);
    },
    get vivo() { return vivo; },
  };
}

/** Qué está haciendo el taller, en palabras del cliente (para enseñarlo en la app mientras dura la sesión). */
export function describirComando(cmd) {
  const c = String(cmd || '').replace(/\s/g, '').toUpperCase();
  if (/^AT/.test(c)) return null; // configuración del adaptador
  if (/^04$/.test(c) || /^14/.test(c)) return 'Borrando averías';
  if (/^0[37A]$/.test(c) || /^19/.test(c)) return 'Leyendo averías';
  if (/^09/.test(c) || /^22F1/.test(c)) return 'Identificando el coche';
  if (/^01/.test(c) || /^22/.test(c)) return 'Leyendo datos del motor';
  if (/^02/.test(c)) return 'Leyendo datos del momento del fallo';
  if (/^06/.test(c)) return 'Revisando pruebas de los sistemas';
  return 'Comunicando con el coche';
}
