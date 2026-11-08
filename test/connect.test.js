import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor, leerConfig } from '../server/index.js';
import { gravedad, peorGravedad } from '@reyman/obd-core/obd/gravedad.js';
import { estadoMantenimiento, kmActuales } from '@reyman/obd-core/mantenimiento.js';

test('Gravedad para el conductor', () => {
  assert.equal(gravedad('P0217').nivel, 'parar');
  assert.equal(gravedad('P0521').nivel, 'parar');
  assert.equal(gravedad('P0301').nivel, 'taller');
  assert.match(gravedad('P0301').nota, /parpadea/);
  assert.equal(gravedad('P0420').nivel, 'vigilar');
  assert.equal(gravedad('P2463').nivel, 'taller');
  assert.equal(gravedad('P0A80').nivel, 'taller'); // por defecto
  assert.equal(gravedad('C0035').nivel, 'taller');
  assert.equal(gravedad('B1000').nivel, 'vigilar');
  assert.equal(gravedad('xx').nivel, 'taller');
  assert.equal(peorGravedad(['P0420', 'P0301']), 'taller');
  assert.equal(peorGravedad(['P0420', 'P0520']), 'parar');
  assert.equal(peorGravedad([]), null);
});

test('Mantenimiento: revisión por km y por fecha, ITV', () => {
  const hoy = '2026-11-07';
  const ok = estadoMantenimiento({ hoy, ultimaRevision: { fecha: '2026-06-01', km: 140000 }, km: 146000, itv: { fecha: '2027-05-01' } });
  assert.equal(ok.revision.estado, 'ok');
  assert.equal(ok.revision.kmRestantes, 9000);
  assert.equal(ok.itv.estado, 'ok');
  assert.equal(ok.avisos.length, 0);
  const pronto = estadoMantenimiento({ hoy, ultimaRevision: { fecha: '2026-06-01', km: 140000 }, km: 154000 });
  assert.equal(pronto.revision.estado, 'pronto');
  const vencida = estadoMantenimiento({ hoy, ultimaRevision: { fecha: '2025-10-01', km: 120000 }, km: 130000, itv: { fecha: '2026-10-30' } });
  assert.equal(vencida.revision.estado, 'vencida');
  assert.equal(vencida.itv.estado, 'vencida');
  assert.deepEqual(vencida.avisos.map((a) => a.nivel), ['aviso', 'urgente']);
  const itvPronto = estadoMantenimiento({ hoy, itv: { fecha: '2026-11-20' } });
  assert.equal(itvPronto.itv.estado, 'pronto');
  assert.match(itvPronto.avisos[0].texto, /pre-ITV/);
});

test('Km actuales: del OBD o estimados por ritmo', () => {
  assert.equal(kmActuales([]), null);
  const l = [{ fecha: '2026-10-01', km: 10000 }, { fecha: '2026-10-31', km: 11500 }];
  assert.deepEqual(kmActuales(l, new Date('2026-10-31')), { km: 11500, estimado: false, kmDia: 50, fecha: '2026-10-31' });
  const e = kmActuales(l, new Date('2026-11-10'));
  assert.equal(e.km, 12000);
  assert.equal(e.estimado, true);
});

// --- Servidor: avisos «Mi taller» ---
let app, store;
before(async () => {
  const cfg = { ...leerConfig({}), modo: 'dev' };
  ({ app, store } = await crearServidor(cfg, { logger: false }));
});
after(() => app.close());

const aviso = (extra = {}) => ({
  codigoTaller: 'reyman', tipo: 'estado', matricula: '1234 abc', vin: 'WVWZZZAUZHW512345', km: 148230,
  averias: [{ codigo: 'P0401', tipo: 'confirmada', descripcion: 'EGR', gravedad: 'vigilar' }, { codigo: 'MAL', tipo: 'x' }],
  bateria: { tension: 12.4, estado: 'aceptable', situacion: 'reposo' },
  consentimiento: { aceptado: true, version: '2026-11', fecha: '2026-11-07T19:00:00Z' }, ...extra,
});

test('Ficha pública del taller por código', async () => {
  const r = await app.inject({ url: '/api/connect/talleres/reyman' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().taller.nombre, 'Talleres Reyman');
  assert.equal(r.json().taller.tenant, undefined);
  assert.equal((await app.inject({ url: '/api/connect/talleres/NOEXISTE' })).statusCode, 404);
});

test('Aviso de estado: sin sesión, con consentimiento, datos limpios y CORS para la app', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/connect/avisos', headers: { origin: 'capacitor://localhost' }, payload: aviso() });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['access-control-allow-origin'], 'capacitor://localhost');
  const guardado = store._db.connect.at(-1);
  assert.equal(guardado.tenant_id, 'reyman');
  assert.equal(guardado.matricula, '1234ABC');
  assert.deepEqual(guardado.averias.map((a) => a.codigo), ['P0401']);
  // Un origen desconocido no recibe cabeceras CORS
  const r2 = await app.inject({ method: 'POST', url: '/api/connect/avisos', headers: { origin: 'https://malo.example' }, payload: aviso() });
  assert.equal(r2.headers['access-control-allow-origin'], undefined);
});

test('Sin consentimiento o cita sin teléfono: rechazado', async () => {
  const sin = await app.inject({ method: 'POST', url: '/api/connect/avisos', payload: aviso({ consentimiento: { aceptado: false } }) });
  assert.equal(sin.statusCode, 400);
  const cita = await app.inject({ method: 'POST', url: '/api/connect/avisos', payload: aviso({ tipo: 'cita', contacto: { nombre: 'Ana' } }) });
  assert.equal(cita.statusCode, 400);
  const ok = await app.inject({ method: 'POST', url: '/api/connect/avisos', payload: aviso({ tipo: 'cita', contacto: { nombre: 'Ana', telefono: '600000000' }, mensaje: 'Me sale el testigo' }) });
  assert.equal(ok.statusCode, 200);
});

test('La oficina ve y atiende los avisos con su sesión; sin acceso no', async () => {
  assert.equal((await app.inject({ url: '/api/connect/avisos/lista', headers: { 'x-diag-rol': 'invitado' } })).statusCode, 403);
  const H = { 'x-diag-rol': 'oficina', 'x-diag-taller': 'reyman' };
  const l = await app.inject({ url: '/api/connect/avisos/lista?pendientes=1', headers: H });
  assert.equal(l.statusCode, 200);
  const id = l.json().avisos[0].id;
  assert.equal((await app.inject({ method: 'POST', url: `/api/connect/avisos/${id}/atendido`, headers: H })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: `/api/connect/avisos/${id}/atendido`, headers: H })).statusCode, 404);
  const otro = await app.inject({ url: '/api/connect/avisos/lista', headers: { 'x-diag-rol': 'oficina', 'x-diag-taller': 'otro' } });
  assert.equal(otro.json().avisos.length, 0);
});

test('Límite de avisos por IP', async () => {
  let ultimo;
  for (let i = 0; i < 12; i++) ultimo = await app.inject({ method: 'POST', url: '/api/connect/avisos', remoteAddress: '10.9.9.9', payload: aviso() });
  assert.equal(ultimo.statusCode, 429);
});
