// Reyman Diag · servidor (Node + Fastify)
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearStore } from './store.js';
import { crearAuth, tiene, PERMISOS } from './auth.js';
import { buscarOts, enviarCorreo, diagnosticoIa } from './integraciones.js';
import { pdfInforme } from './pdf.js';
import { buscarTaller, fichaPublica, TALLERES_CONNECT } from './connect-talleres.js';
import { desdeSesion, aCsv as visorCsv } from '../packages/obd-core/src/visor.js';
import { evaluarCvn, norm as normCvn, normCalid } from '../packages/obd-core/src/cvn.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function leerConfig(env = process.env) {
  return {
    puerto: Number(env.PORT || 3020),
    actualizadorDir: env.ACTUALIZADOR_DIR || '/data/actualizador',
    host: env.HOST || '127.0.0.1',
    store: env.DATABASE_URL ? 'pg' : 'memoria',
    databaseUrl: env.DATABASE_URL,
    modo: env.AUTH_MODE || (env.DATABASE_URL ? 'app-reyman' : 'dev'),
    devRol: env.DEV_ROL,
    tenantPorDefecto: env.DEFAULT_TENANT || 'reyman',
    appReymanUrl: env.APP_REYMAN_URL || 'http://127.0.0.1:3010',
    appReymanPublica: env.APP_REYMAN_PUBLIC_URL || 'https://app.talleresreyman.es',
    appReymanYo: env.APP_REYMAN_YO || '/api/yo',
    appReymanOts: env.APP_REYMAN_OTS || '/api/diag/ots',
    appReymanApiKey: env.APP_REYMAN_API_KEY,
    apiKeyIngest: env.DIAG_INGEST_KEY, // clave para que n8n lea y marque las sesiones
    n8nCorreoUrl: env.N8N_CORREO_URL,
    n8nClave: env.N8N_CLAVE,
    correoCopia: env.CORREO_COPIA || 'talleresreyman@gmail.com',
    iaClave: env.ANTHROPIC_API_KEY,
    iaModelo: env.IA_MODELO || 'claude-sonnet-5-5',
    iaPrecioEntrada: Number(env.IA_PRECIO_ENTRADA_USD_MTOK || 3),
    iaPrecioSalida: Number(env.IA_PRECIO_SALIDA_USD_MTOK || 15),
    usdAEur: Number(env.USD_A_EUR || 0.92),
    iaTopeMes: Number(env.IA_TOPE_MES_EUR || 15),
    // Reyman Connect (app de cliente)
    connectOrigenes: (env.CONNECT_ORIGENES || 'capacitor://localhost,https://localhost,http://localhost').split(',').map((x) => x.trim()).filter(Boolean),
    n8nConnectUrl: env.N8N_CONNECT_URL, // webhook de n8n para avisar por Telegram de los avisos nuevos
  };
}

export async function crearServidor(cfg = leerConfig(), opciones = {}) {
  const app = Fastify({ logger: opciones.logger ?? { level: 'info' }, bodyLimit: 12 * 1024 * 1024, trustProxy: true });
  const store = opciones.store || await crearStore(cfg.store, { url: cfg.databaseUrl });
  await store.migrar();
  const sesionDe = opciones.auth || crearAuth(cfg);

  // --- autenticación ---
  app.decorateRequest('s', null);
  app.addHook('preHandler', async (req, rep) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/ingest/') || req.url === '/api/salud' || esPublicaConnect(req)) return;
    let s;
    try { s = await sesionDe(req); } catch (e) {
      req.log.error(e);
      return rep.code(502).send({ error: 'No se ha podido comprobar la sesión con la App Reyman.' });
    }
    if (!s) return rep.code(401).send({ error: 'Inicia sesión en la App Reyman.' });
    if (!tiene(s.permisos, 'diag.ver')) return rep.code(403).send({ error: 'Tu usuario no tiene acceso a Reyman Diag.' });
    req.s = s;
  });
  const exigir = (p) => async (req, rep) => { if (!tiene(req.s.permisos, p)) return rep.code(403).send({ error: `No tienes permiso: ${PERMISOS[p]}.` }); };
  const ip = (req) => req.ip;
  const disp = (req) => String(req.headers['user-agent'] || '').slice(0, 200);
  const limpiarMat = (m) => (m ? String(m).replace(/[\s-]/g, '').toUpperCase() : null);

  app.setErrorHandler((err, req, rep) => {
    req.log.error(err);
    const codigo = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    rep.code(codigo).send({ error: err.message || 'Error interno' });
  });

  // --- Reyman Connect: rutas públicas para la app de cliente ---
  // Solo dos rutas sin sesión: ficha del taller y envío de avisos (con consentimiento y límite por IP).
  function esPublicaConnect(req) {
    const u = req.url.split('?')[0];
    return (u === '/api/connect/avisos' && (req.method === 'POST' || req.method === 'OPTIONS')) || u.startsWith('/api/connect/talleres/');
  }
  const talleresConnect = opciones.talleresConnect || TALLERES_CONNECT;
  app.addHook('onSend', async (req, rep, payload) => {
    if (req.url.startsWith('/api/connect/')) {
      const origen = req.headers.origin;
      if (origen && cfg.connectOrigenes.includes(origen)) {
        rep.header('Access-Control-Allow-Origin', origen);
        rep.header('Vary', 'Origin');
        rep.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        rep.header('Access-Control-Allow-Headers', 'content-type');
      }
    }
    return payload;
  });
  const limites = new Map(); // ip → [marcas de tiempo]
  const dentroDeLimite = (clave, max = 10, ventanaMs = 10 * 60000) => {
    const ahora = Date.now();
    const l = (limites.get(clave) || []).filter((t) => ahora - t < ventanaMs);
    if (l.length >= max) { limites.set(clave, l); return false; }
    l.push(ahora); limites.set(clave, l);
    if (limites.size > 5000) limites.clear();
    return true;
  };
  const texto = (x, max) => (x === undefined || x === null ? null : String(x).slice(0, max).trim() || null);

  app.options('/api/connect/avisos', async (req, rep) => rep.code(204).send());
  app.get('/api/connect/talleres/:codigo', async (req, rep) => {
    const t = buscarTaller(req.params.codigo, talleresConnect);
    if (!t) return rep.code(404).send({ error: 'No hay ningún taller con ese código.' });
    return { codigo: t.codigo, taller: fichaPublica(t) };
  });
  app.post('/api/connect/avisos', async (req, rep) => {
    const b = req.body || {};
    const t = buscarTaller(b.codigoTaller, talleresConnect);
    if (!t) return rep.code(404).send({ error: 'No hay ningún taller con ese código.' });
    if (b.consentimiento?.aceptado !== true || !b.consentimiento?.version) return rep.code(400).send({ error: 'Falta tu consentimiento para enviar los datos al taller.' });
    const tipo = b.tipo === 'cita' ? 'cita' : 'estado';
    const contacto = b.contacto ? { nombre: texto(b.contacto.nombre, 80), telefono: texto(b.contacto.telefono, 30) } : null;
    if (tipo === 'cita' && (!contacto?.nombre || !contacto?.telefono)) return rep.code(400).send({ error: 'Para pedir cita necesitamos tu nombre y tu teléfono.' });
    if (!dentroDeLimite(`connect:${ip(req)}`)) return rep.code(429).send({ error: 'Has enviado muchos avisos seguidos. Espera unos minutos.' });
    const averias = (Array.isArray(b.averias) ? b.averias : []).slice(0, 40).map((a) => ({
      codigo: texto(a.codigo, 8), tipo: texto(a.tipo, 20), descripcion: texto(a.descripcion, 200), gravedad: texto(a.gravedad, 20),
    })).filter((a) => a.codigo && /^[PCBU][0-9A-F]{4}$/i.test(a.codigo));
    const km = Number.isFinite(Number(b.km)) && Number(b.km) > 0 && Number(b.km) < 3000000 ? Math.round(Number(b.km)) : null;
    const bateria = b.bateria && typeof b.bateria === 'object' ? {
      tension: Number(b.bateria.tension) || null, estado: texto(b.bateria.estado, 20), situacion: texto(b.bateria.situacion, 20), minimoArranque: Number(b.bateria.minimoArranque) || null,
    } : null;
    const vehiculo = b.vehiculo && typeof b.vehiculo === 'object' ? { marca: texto(b.vehiculo.marca, 40), modelo: texto(b.vehiculo.modelo, 60), anio: Number(b.vehiculo.anio) || null } : null;
    const r = await store.crearAvisoConnect(t.tenant, {
      codigo_taller: t.codigo, tipo, matricula: limpiarMat(texto(b.matricula, 12)), vin: texto(b.vin, 17), km, vehiculo, averias, bateria, contacto,
      mensaje: texto(b.mensaje, 1000), consentimiento: { aceptado: true, version: texto(b.consentimiento.version, 20), fecha: texto(b.consentimiento.fecha, 30) }, ip: ip(req),
    });
    if (cfg.n8nConnectUrl) {
      // Aviso a n8n (Telegram del taller). Si falla, el aviso ya está guardado.
      fetch(cfg.n8nConnectUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...(cfg.n8nClave ? { 'x-reyman-clave': cfg.n8nClave } : {}) },
        body: JSON.stringify({ id: r.id, tenant: t.tenant, tipo, matricula: limpiarMat(b.matricula), km, averias: averias.map((a) => a.codigo), bateria, contacto, mensaje: texto(b.mensaje, 300) }) })
        .catch((e) => req.log.warn(e));
    }
    return { ok: true, id: r.id, taller: t.nombre };
  });
  // Para la oficina del taller (con sesión de la App Reyman)
  app.get('/api/connect/avisos/lista', async (req) => ({ avisos: await store.listarAvisosConnect(req.s.tenant, { pendientes: req.query.pendientes === '1' }) }));
  app.post('/api/connect/avisos/:id/atendido', async (req, rep) => {
    const ok = await store.atenderAvisoConnect(req.s.tenant, req.params.id, req.s.usuario.nombre);
    return ok ? { ok } : rep.code(404).send({ error: 'Aviso no encontrado o ya atendido.' });
  });

  app.get('/api/salud', async () => ({ ok: true, store: store.tipo }));

  // --- versión y actualización desde la app (como la App Reyman) ---
  // La app solo deja un aviso («pedido») en la carpeta compartida; el vigilante del servidor (cron) actualiza desde GitHub.
  const act = (f) => path.join(cfg.actualizadorDir, f);
  const leerTxt = (f) => { try { return fs.readFileSync(act(f), 'utf8'); } catch { return ''; } };
  const claves = (t) => Object.fromEntries(t.split('\n').filter((l) => l.includes('=') && !l.startsWith('cambio=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  app.get('/api/version', async (req) => {
    const instalada = claves(leerTxt('instalada.txt'));
    const disp = leerTxt('disponible.txt');
    const disponible = claves(disp);
    const cambios = disp.split('\n').filter((l) => l.startsWith('cambio=')).map((l) => { const [commit, fecha, ...m] = l.slice(7).split('|'); return { commit, fecha, mensaje: m.join('|') }; });
    return {
      instalada, disponible, cambios, resultado: claves(leerTxt('resultado.txt')),
      pedido: fs.existsSync(act('pedido')),
      hayNueva: !!(disponible.commit && instalada.commit && disponible.commit !== instalada.commit),
      puede: tiene(req.s.permisos, 'diag.actualizar'),
    };
  });
  app.post('/api/version/actualizar', { preHandler: exigir('diag.actualizar') }, async (req, rep) => {
    if (claves(leerTxt('resultado.txt')).estado === 'actualizando') return rep.code(409).send({ error: 'Ya se está actualizando.' });
    try { fs.writeFileSync(act('pedido'), `${req.s.usuario.nombre}\n`); } catch { return rep.code(500).send({ error: 'No se pudo avisar al servidor (falta la carpeta compartida).' }); }
    return { ok: true };
  });
  app.post('/api/version/comprobar', { preHandler: exigir('diag.actualizar') }, async (req, rep) => {
    try { fs.writeFileSync(act('comprobar'), '1'); } catch { return rep.code(500).send({ error: 'El servidor no tiene preparada la carpeta de actualizaciones: ejecuta una vez «deploy/actualizar.sh» en el VPS.' }); }
    return { ok: true };
  });

  app.get('/api/yo', async (req) => ({
    usuario: req.s.usuario,
    permisos: req.s.permisos,
    taller: req.s.taller,
    ia: tiene(req.s.permisos, 'diag.ia') ? { gastadoMes: await store.gastoIaMes(req.s.tenant), topeMes: cfg.iaTopeMes, activa: !!cfg.iaClave } : null,
  }));

  app.get('/api/ots/buscar', async (req, rep) => {
    const { vin, matricula } = req.query;
    try {
      return await buscarOts(cfg, req.s.tenant, { vin, matricula: limpiarMat(matricula) });
    } catch (e) {
      req.log.warn(e);
      return rep.code(200).send({ coincidencias: [], abiertas: [], aviso: 'No se han podido consultar las OT abiertas.' });
    }
  });

  // --- lecturas ---
  app.post('/api/lecturas', { preHandler: exigir('diag.leer') }, async (req, rep) => {
    const b = req.body || {};
    if (!b.lectura || typeof b.lectura !== 'object') return rep.code(400).send({ error: 'Falta la lectura.' });
    const r = await store.crearLectura(req.s.tenant, {
      ot: b.ot ? String(b.ot) : null, matricula: limpiarMat(b.matricula), vin: b.vin || b.lectura.vehiculo?.vin || null,
      usuario_id: req.s.usuario.id, usuario: req.s.usuario.nombre, lectura: b.lectura,
    });
    return { id: r.id };
  });

  app.get('/api/lecturas', async (req, rep) => {
    const { matricula, vin, ot } = req.query;
    if (!matricula && !vin && !ot) return rep.code(400).send({ error: 'Indica matrícula, bastidor u OT.' });
    const filas = await store.listarLecturas(req.s.tenant, { matricula: limpiarMat(matricula), vin, ot });
    return { lecturas: filas.map((f) => ({ id: f.id, ot: f.ot, matricula: f.matricula, vin: f.vin, usuario: f.usuario, creada: f.creada, lectura: { ...f.lectura, ia: f.ia || f.lectura?.ia } })) };
  });

  app.get('/api/lecturas/:id/informe.pdf', async (req, rep) => {
    const f = await store.obtenerLectura(req.s.tenant, req.params.id);
    if (!f) return rep.code(404).send({ error: 'Lectura no encontrada.' });
    const version = req.query.version === 'interno' ? 'interno' : 'cliente';
    const pdf = await pdfInforme(f, { version, iaTexto: f.ia?.texto });
    return rep.type('application/pdf').header('content-disposition', `inline; filename="diagnosis-${f.matricula || f.id}.pdf"`).send(pdf);
  });

  // --- borrado de averías: registro antes de tocar el coche ---
  app.post('/api/borrados', { preHandler: exigir('diag.borrar') }, async (req, rep) => {
    const b = req.body || {};
    if (!Array.isArray(b.codigos) || !b.codigos.length) return rep.code(400).send({ error: 'Faltan los códigos que se van a borrar.' });
    const r = await store.crearBorrado(req.s.tenant, {
      lectura_id: b.lectura_id || null, ot: b.ot || null, matricula: limpiarMat(b.matricula), vin: b.vin || null,
      codigos: b.codigos.map(String).slice(0, 100), motivo: String(b.motivo || '').slice(0, 200),
      usuario_id: req.s.usuario.id, usuario: req.s.usuario.nombre, ip: ip(req), dispositivo: disp(req),
    });
    return { id: r.id, permitido: true };
  });

  app.patch('/api/borrados/:id', { preHandler: exigir('diag.borrar') }, async (req, rep) => {
    const ok = await store.resolverBorrado(req.s.tenant, req.params.id, req.s.usuario.id, req.body || {});
    if (!ok) return rep.code(409).send({ error: 'Ese borrado no existe o ya tiene resultado.' });
    return { ok: true };
  });

  app.get('/api/borrados', { preHandler: exigir('diag.historial') }, async (req) => ({ borrados: await store.listarBorrados(req.s.tenant) }));

  // --- sesiones de datos en vivo ---
  app.post('/api/sesiones', { preHandler: exigir('diag.leer') }, async (req, rep) => {
    const b = req.body || {};
    if (!Array.isArray(b.muestras) || !Array.isArray(b.pids)) return rep.code(400).send({ error: 'Sesión vacía.' });
    const r = await store.crearSesion(req.s.tenant, {
      lectura_id: b.lectura_id || null, ot: b.ot || null, matricula: limpiarMat(b.matricula), vin: b.vin || null, usuario: req.s.usuario.nombre,
      inicio: b.inicio || new Date().toISOString(), duracion_s: Number(b.duracion_s) || 0, pids: b.pids, muestras: b.muestras.slice(0, 20000),
      eventos: Array.isArray(b.eventos) ? b.eventos.slice(0, 500).map((e) => ({ t: Number(e.t) || 0, tipo: String(e.tipo || 'marca').slice(0, 20), detalle: e.detalle ? String(e.detalle).slice(0, 200) : null })) : [],
    });
    const ruta = rutaOneDrive({ ot: b.ot, matricula: limpiarMat(b.matricula), vin: b.vin, inicio: b.inicio || new Date() });
    return { id: r.id, destino: `se ve en «Datos grabados» y esta noche se copia a OneDrive (${ruta.carpeta.replace(/^01_TALLERES REYMAN\//, '')})` };
  });

  // --- grabación automática de cada sesión de diagnóstico ---
  app.post('/api/registros', { preHandler: exigir('diag.leer'), bodyLimit: 60 * 1024 * 1024 }, async (req, rep) => {
    const b = req.body || {};
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(b.id || '')) || typeof b.datos !== 'object' || !b.datos) return rep.code(400).send({ error: 'Sesión no válida.' });
    const r = await store.guardarRegistro(req.s.tenant, {
      id: b.id, ot: b.ot || null, matricula: limpiarMat(b.matricula), vin: b.vin || null, usuario: req.s.usuario.nombre,
      inicio: b.inicio || null, terminada: !!b.terminada, datos: b.datos,
      informe_taller: typeof b.informes?.taller === 'string' ? b.informes.taller : null,
      informe_cliente: typeof b.informes?.cliente === 'string' ? b.informes.cliente : null,
    });
    return { ok: true, actualizado: r.actualizado };
  });

  // --- CVN: ¿software original? (servicio 09) ---
  app.post('/api/cvn/comprobar', { preHandler: exigir('diag.leer') }, async (req, rep) => {
    const b = req.body || {};
    const vin = String(b.vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (vin.length !== 17) return rep.code(400).send({ error: 'Hace falta el bastidor (VIN) para comparar el CVN.' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40)
      .map((x) => ({ ecu: String(x.ecu || '').slice(0, 20), calid: normCalid(x.calid), cvn: normCvn(x.cvn) }))
      .filter((x) => x.calid && x.cvn);
    const out = [];
    for (const x of items) {
      const datos = await store.cvnDatos(req.s.tenant, x.calid, vin);
      out.push({ ...x, ...evaluarCvn({ ...x, vin }, datos) });
      await store.cvnApuntar(req.s.tenant, { ...x, vin, matricula: limpiarMat(b.matricula) });
    }
    return { resultados: out };
  });
  app.post('/api/cvn/referencia', { preHandler: exigir('diag.actualizar') }, async (req, rep) => {
    const b = req.body || {};
    const calid = normCalid(b.calid);
    const cvn = normCvn(b.cvn);
    if (!calid || !cvn) return rep.code(400).send({ error: 'Faltan la calibración o el CVN.' });
    await store.cvnReferencia(req.s.tenant, { calid, cvn, usuario: req.s.usuario.nombre, vin: b.vin || null });
    await store.auditar(req.s.tenant, { usuario: req.s.usuario.nombre, accion: 'cvn_referencia', detalle: { calid, cvn, vin: b.vin || null }, ip: ip(req) });
    return { ok: true };
  });

  // --- visor de grabaciones ---
  app.get('/api/sesiones', { preHandler: exigir('diag.ver') }, async (req) => {
    const { matricula, ot, vin } = req.query;
    const filas = await store.listarSesiones(req.s.tenant, { matricula: limpiarMat(matricula) || null, ot: ot || null, vin: vin || null, limite: Math.min(Number(req.query.limite) || 50, 200) });
    return { sesiones: filas.map(({ pids, ...s }) => ({ ...s, datos: (pids || []).map((p) => p.nombre).slice(0, 12) })) };
  });
  app.get('/api/sesiones/:id', { preHandler: exigir('diag.ver') }, async (req, rep) => {
    const s = await store.obtenerSesion(req.s.tenant, req.params.id);
    if (!s) return rep.code(404).send({ error: 'Grabación no encontrada.' });
    if (!s.muestras) return rep.code(410).send({ error: `Esta grabación solo está en OneDrive${s.onedrive ? ` (${s.onedrive})` : ''}. Descárgala de allí y ábrela con «Abrir archivo».` });
    const { tenant_id: _t, ...resto } = s;
    return resto;
  });

  // --- informe al cliente ---
  app.post('/api/informes/enviar', { preHandler: exigir('diag.enviar_cliente') }, async (req, rep) => {
    const b = req.body || {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return rep.code(400).send({ error: 'Correo no válido.' });
    const f = await store.obtenerLectura(req.s.tenant, b.lectura_id);
    if (!f) return rep.code(404).send({ error: 'Guarda la lectura antes de enviarla.' });
    const iaTexto = b.incluirIa ? (f.ia?.texto || b.ia?.texto || null) : null;
    const pdf = await pdfInforme(f, { version: 'cliente', iaTexto });
    const mat = f.matricula || '';
    await enviarCorreo(cfg, {
      para: b.email,
      cc: cfg.correoCopia,
      asunto: `Informe de diagnosis ${mat}`.trim(),
      html: `<p>Hola,</p><p>Te enviamos el informe de diagnosis de tu vehículo${mat ? ` ${esc(mat)}` : ''}. Si tienes cualquier duda, llámanos o contesta a este correo.</p><p>Un saludo,<br>Talleres Reyman</p>`,
      adjuntos: [{ nombre: `Diagnosis_${mat || 'vehiculo'}.pdf`, tipo: 'application/pdf', base64: pdf.toString('base64') }],
    });
    await store.auditar(req.s.tenant, { usuario: req.s.usuario.nombre, accion: 'informe_enviado', detalle: { lectura: f.id, email: b.email, ia: !!iaTexto }, ip: ip(req) });
    return { ok: true, enviadoA: b.email };
  });

  // --- IA con tope mensual ---
  app.post('/api/ia/diagnostico', { preHandler: exigir('diag.ia') }, async (req, rep) => {
    const b = req.body || {};
    let lectura = b.lectura;
    if (b.lectura_id) {
      const f = await store.obtenerLectura(req.s.tenant, b.lectura_id);
      if (f) lectura = f.lectura;
    }
    if (!lectura) return rep.code(400).send({ error: 'Falta la lectura.' });
    const gastado = await store.gastoIaMes(req.s.tenant);
    if (gastado >= cfg.iaTopeMes) return rep.code(429).send({ error: `Se ha alcanzado el tope mensual de IA (${cfg.iaTopeMes} €). Administración puede subirlo.` });
    const r = await diagnosticoIa(cfg, lectura, b.vehiculo);
    await store.registrarIa(req.s.tenant, { lectura_id: b.lectura_id || null, usuario: req.s.usuario.nombre, modelo: cfg.iaModelo, tokens_in: r.tokens_in, tokens_out: r.tokens_out, coste_eur: r.coste_eur });
    if (b.lectura_id) await store.guardarIaLectura(req.s.tenant, b.lectura_id, { texto: r.texto, fecha: new Date().toISOString(), modelo: cfg.iaModelo });
    return { texto: r.texto, coste: r.coste_eur, gastadoMes: gastado + r.coste_eur, topeMes: cfg.iaTopeMes };
  });

  // --- n8n: sesiones pendientes de copiar a OneDrive ---
  const ingest = async (req, rep) => {
    if (!cfg.apiKeyIngest || req.headers['x-api-key'] !== cfg.apiKeyIngest) return rep.code(401).send({ error: 'Clave no válida.' });
  };
  app.get('/api/ingest/sesiones', { preHandler: ingest }, async (req) => {
    const t = req.query.taller || cfg.tenantPorDefecto;
    const filas = await store.sesionesPendientes(t, 50);
    return { sesiones: filas.map((s) => ({ id: s.id, ot: s.ot, matricula: s.matricula, vin: s.vin, inicio: s.inicio, duracion_s: s.duracion_s, num_muestras: s.num_muestras, ...rutaOneDrive(s), csv: sesionCsv(s) })) };
  });
  // Sesiones de diagnóstico grabadas: carpeta de la OT en OneDrive + subcarpeta «Sesión <id>» con registro e informes
  app.get('/api/ingest/registros', { preHandler: ingest }, async (req) => {
    const t = req.query.taller || cfg.tenantPorDefecto;
    const filas = await store.registrosPendientes(t, 10);
    return {
      registros: filas.map((r) => {
        const { carpeta } = rutaOneDrive({ ot: r.ot, matricula: r.matricula, vin: r.vin, inicio: r.inicio || r.actualizado });
        const dir = `${carpeta}/Sesión ${r.id}`;
        const archivos = [
          ...(r.informe_taller ? [{ ruta: `${dir}/Informe taller.html`, tipo: 'text/html; charset=utf-8', contenido: r.informe_taller }] : []),
          ...(r.informe_cliente ? [{ ruta: `${dir}/Informe cliente.html`, tipo: 'text/html; charset=utf-8', contenido: r.informe_cliente }] : []),
          { ruta: `${dir}/Registro completo.json`, tipo: 'application/json; charset=utf-8', contenido: JSON.stringify(r.datos, null, 1) },
        ];
        return { id: r.id, actualizado: new Date(r.actualizado).toISOString(), carpeta: dir, archivos };
      }),
    };
  });
  app.post('/api/ingest/registros/:id/subido', { preHandler: ingest }, async (req, rep) => {
    const ok = await store.marcarRegistroSubido(req.query.taller || cfg.tenantPorDefecto, req.params.id, req.body?.actualizado || new Date().toISOString(), String(req.body?.destino || ''));
    return ok ? { ok: true } : rep.code(404).send({ error: 'Sesión no encontrada.' });
  });
  app.post('/api/ingest/sesiones/:id/subida', { preHandler: ingest }, async (req, rep) => {
    const ok = await store.marcarSesionSubida(req.query.taller || cfg.tenantPorDefecto, req.params.id, String(req.body?.destino || ''));
    return ok ? { ok: true } : rep.code(404).send({ error: 'Sesión no encontrada.' });
  });

  // --- interfaz ---
  app.get('/config.js', async (req, rep) => rep.type('application/javascript').send(`window.REYMAN_APP_URL=${JSON.stringify(cfg.appReymanPublica)};`));
  // Núcleo OBD común (packages/obd-core) en /core/: la app lo importa por el import map de index.html
  await app.register(fastifyStatic, { root: path.join(RAIZ, 'packages', 'obd-core', 'src'), prefix: '/core/', decorateReply: false });
  await app.register(fastifyStatic, { root: path.join(RAIZ, 'apps', 'taller'), index: ['index.html'] });

  app.addHook('onClose', async () => store.cerrar());
  return { app, store };
}

// CSV para Excel (separador «;», coma decimal y marcas), el mismo que descarga el visor
function sesionCsv(s) {
  return visorCsv(desdeSesion(s));
}

// Carpeta y nombre en OneDrive: 01_TALLERES REYMAN/DIAGNOSIS OBD/<año>/1-A-<OT> <matrícula>/ (como INFORMES AUTEL)
export function rutaOneDrive(s) {
  const f = new Date(s.inicio || s.creada || Date.now());
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(f).map((x) => [x.type, x.value]));
  const limpio = (x) => String(x || '').replace(/[\\/:*?"<>|#%]+/g, '').trim();
  const mat = limpio(s.matricula);
  const ot = limpio(s.ot);
  const sub = ot ? `1-A-${ot}${mat ? ` ${mat}` : ''}` : `SIN OT/${mat || limpio(s.vin) || 'SIN MATRICULA'}`;
  return {
    carpeta: `01_TALLERES REYMAN/DIAGNOSIS OBD/${p.year}/${sub}`,
    nombre: `${p.year}${p.month}${p.day}_${p.hour}${p.minute}_Prueba de carretera${mat ? `_${mat}` : ''}.csv`,
  };
}
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = leerConfig();
  const { app } = await crearServidor(cfg);
  await app.listen({ port: cfg.puerto, host: cfg.host });
}
