// Reyman Diag · diagnóstico remoto: el servidor empareja la app del cliente (Reyman Connect, con el adaptador en su coche)
// y Reyman Diag (el taller) con un código de 6 cifras, y pasa los mensajes de una a otra. No guarda nada del coche:
// solo apunta en la auditoría cuándo empieza y acaba cada sesión (quién, coche, IP, duración).
//
// Cliente (sin sesión, desde la app):  POST /api/connect/remoto/abrir   → { codigo, clave, caduca }
//                                       WS   /api/connect/remoto/ws?codigo=…&clave=…
// Taller (con sesión de la App Reyman): WS   /api/remoto/ws?codigo=…
//
// Límites: el código caduca a los 10 min si el taller no entra; la sesión dura como mucho 30 min y se corta
// tras 5 min sin comunicación. 5 códigos equivocados por usuario en 10 min → espera.

import crypto from 'node:crypto';

export const REMOTO = { caducaMs: 10 * 60000, maxMs: 30 * 60000, inactivoMs: 5 * 60000, maxMensaje: 8000 };

const enviar = (ws, m) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } catch { /* */ } };
const texto = (x, max) => (x === undefined || x === null ? null : String(x).slice(0, max).trim() || null);

export function registrarRemoto(app, { store, buscarTaller, talleresConnect, dentroDeLimite, ip, opciones = {} }) {
  const L = { ...REMOTO, ...opciones };
  const salas = new Map(); // codigo → sala

  function nuevoCodigo() {
    for (let i = 0; i < 50; i++) {
      const c = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      if (!salas.has(c)) return c;
    }
    throw new Error('No hay códigos libres; inténtalo dentro de un momento.');
  }

  async function cerrar(sala, motivo) {
    if (!salas.has(sala.codigo)) return;
    salas.delete(sala.codigo);
    clearInterval(sala.reloj);
    enviar(sala.cliente, { t: 'fin', motivo });
    enviar(sala.taller, { t: 'fin', motivo });
    try { sala.cliente?.close(); } catch { /* */ }
    try { sala.taller?.close(); } catch { /* */ }
    if (sala.inicio) {
      await store.auditar(sala.tenant, {
        usuario: sala.usuario || 'taller', accion: 'remoto_fin',
        detalle: JSON.stringify({ codigo: sala.codigo, matricula: sala.info.matricula, vin: sala.info.vin, cliente: sala.info.nombre, motivo, duracionS: Math.round((Date.now() - sala.inicio) / 1000), comandos: sala.comandos, borrados: sala.borrados }),
        ip: sala.ipTaller,
      }).catch(() => {});
    }
  }

  // Vigilancia de tiempos (cada sala tiene su reloj)
  function vigilar(sala) {
    sala.reloj = setInterval(() => {
      const ahora = Date.now();
      if (!sala.inicio && ahora - sala.creada > L.caducaMs) cerrar(sala, 'El código ha caducado: el taller no ha entrado a tiempo.');
      else if (sala.inicio && ahora - sala.inicio > L.maxMs) cerrar(sala, 'Se ha llegado al tiempo máximo de la sesión remota (30 minutos).');
      else if (ahora - sala.ultimo > L.inactivoMs) cerrar(sala, 'Sesión remota cerrada por inactividad.');
    }, Math.min(5000, L.inactivoMs / 2));
    sala.reloj.unref?.();
  }

  // --- cliente: pide código ---
  app.options('/api/connect/remoto/abrir', async (req, rep) => rep.code(204).send());
  app.post('/api/connect/remoto/abrir', async (req, rep) => {
    const b = req.body || {};
    const t = buscarTaller(b.codigoTaller, talleresConnect);
    if (!t) return rep.code(404).send({ error: 'No hay ningún taller con ese código.' });
    if (b.consentimiento !== true) return rep.code(400).send({ error: 'Falta tu permiso para que el taller se conecte a tu coche.' });
    if (!dentroDeLimite(`remoto:${ip(req)}`, 6)) return rep.code(429).send({ error: 'Has pedido muchos códigos seguidos. Espera unos minutos.' });
    const codigo = nuevoCodigo();
    const sala = {
      codigo, clave: crypto.randomBytes(24).toString('hex'), tenant: t.tenant, taller: null, cliente: null,
      creada: Date.now(), ultimo: Date.now(), inicio: null, comandos: 0, borrados: 0, ipCliente: ip(req),
      info: { nombre: texto(b.nombre, 80), matricula: texto(b.matricula, 12)?.replace(/[\s-]/g, '').toUpperCase() || null, vin: texto(b.vin, 17), adaptador: texto(b.adaptador, 60) },
    };
    salas.set(codigo, sala);
    vigilar(sala);
    return { codigo, clave: sala.clave, caduca: new Date(sala.creada + L.caducaMs).toISOString(), taller: t.nombre };
  });

  // --- cliente: WebSocket (con el adaptador ya conectado en su móvil) ---
  app.get('/api/connect/remoto/ws', { websocket: true }, (socket, req) => {
    const sala = salas.get(String(req.query.codigo || ''));
    if (!sala || !req.query.clave || req.query.clave !== sala.clave || sala.cliente) {
      enviar(socket, { t: 'error', error: 'Código no válido o caducado.' });
      return socket.close();
    }
    sala.cliente = socket;
    sala.ultimo = Date.now();
    socket.on('message', (raw) => {
      if (raw.length > L.maxMensaje) return;
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      sala.ultimo = Date.now();
      if (m.t === 'rx' && typeof m.d === 'string') enviar(sala.taller, { t: 'rx', d: m.d });
      else if (m.t === 'fin') cerrar(sala, texto(m.motivo, 200) || 'El cliente ha terminado la sesión.');
    });
    socket.on('close', () => cerrar(sala, 'El cliente ha cerrado la app o se ha quedado sin conexión.'));
  });

  // --- taller: WebSocket con el código que le da el cliente ---
  app.get('/api/remoto/ws', { websocket: true }, async (socket, req) => {
    const usuario = req.s?.usuario?.nombre || 'Taller';
    const sala = salas.get(String(req.query.codigo || '').replace(/\D/g, ''));
    const fallo = (error) => { enviar(socket, { t: 'error', error }); socket.close(); };
    if (!dentroDeLimite(`remoto-taller:${req.s?.usuario?.id || ip(req)}`, 5)) return fallo('Demasiados intentos. Espera unos minutos.');
    if (!sala || sala.tenant !== req.s?.tenant) return fallo('Ese código no existe o ha caducado. Pide al cliente que vuelva a pulsar «Permitir».');
    if (sala.taller) return fallo('Otra persona del taller ya está conectada a ese coche.');
    if (!sala.cliente) return fallo('El cliente todavía no ha conectado el adaptador. Espera a que vea el código en su móvil.');
    sala.taller = socket; sala.usuario = usuario; sala.ipTaller = ip(req); sala.inicio = Date.now(); sala.ultimo = Date.now();
    await store.auditar(sala.tenant, {
      usuario, accion: 'remoto_inicio', ip: sala.ipTaller,
      detalle: JSON.stringify({ codigo: sala.codigo, matricula: sala.info.matricula, vin: sala.info.vin, cliente: sala.info.nombre, adaptador: sala.info.adaptador, ipCliente: sala.ipCliente }),
    }).catch(() => {});
    enviar(sala.cliente, { t: 'taller', usuario });
    enviar(socket, { t: 'listo', cliente: sala.info });
    socket.on('message', (raw) => {
      if (raw.length > L.maxMensaje) return;
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      sala.ultimo = Date.now();
      if (m.t === 'tx' && typeof m.d === 'string') {
        sala.comandos++;
        if (/^\s*(04|14)/.test(m.d)) sala.borrados++;
        enviar(sala.cliente, { t: 'tx', d: m.d });
      } else if (m.t === 'fin') cerrar(sala, texto(m.motivo, 200) || 'El taller ha terminado la sesión.');
    });
    socket.on('close', () => cerrar(sala, 'El taller ha terminado la sesión.'));
  });

  return { salas, cerrar };
}
