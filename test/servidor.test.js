import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor, leerConfig } from '../server/index.js';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';

let app, store, lectura;
const H = (rol, taller = 'reyman') => ({ 'x-diag-rol': rol, 'x-diag-taller': taller });

before(async () => {
  const cfg = { ...leerConfig({}), modo: 'dev', apiKeyIngest: 'k', iaTopeMes: 1 };
  ({ app, store } = await crearServidor(cfg, { logger: false }));
  const t = crearSimulador({ coche: 'diesel', latenciaMs: 1 });
  const elm = new Elm327(t);
  await elm.iniciar();
  lectura = await new Obd(elm).lecturaCompleta();
});
after(() => app.close());

test('yo devuelve permisos por rol', async () => {
  const r = await app.inject({ url: '/api/yo', headers: H('mecánico') });
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().permisos.includes('diag.borrar'));
  const o = await app.inject({ url: '/api/yo', headers: H('oficina') });
  assert.ok(!o.json().permisos.includes('diag.borrar'));
});

test('rol sin acceso recibe 403', async () => {
  const r = await app.inject({ url: '/api/yo', headers: H('invitado') });
  assert.equal(r.statusCode, 403);
});

test('guardar lectura, historial por matrícula y aislamiento entre talleres', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/lecturas', headers: H('mecanico'), payload: { ot: '261402', matricula: '4521 klm', lectura } });
  assert.equal(r.statusCode, 200);
  const h = await app.inject({ url: '/api/lecturas?matricula=4521KLM', headers: H('oficina') });
  assert.equal(h.json().lecturas.length, 1);
  assert.equal(h.json().lecturas[0].ot, '261402');
  const otro = await app.inject({ url: '/api/lecturas?matricula=4521KLM', headers: H('oficina', 'otro-taller') });
  assert.equal(otro.json().lecturas.length, 0);
});

test('borrado: oficina no puede, mecánico sí, resultado una sola vez', async () => {
  const no = await app.inject({ method: 'POST', url: '/api/borrados', headers: H('oficina'), payload: { codigos: ['P0401'] } });
  assert.equal(no.statusCode, 403);
  const si = await app.inject({ method: 'POST', url: '/api/borrados', headers: H('mecanico'), payload: { codigos: ['P0401', 'P2463'], motivo: 'Reparación terminada' } });
  assert.equal(si.statusCode, 200);
  const id = si.json().id;
  const r1 = await app.inject({ method: 'PATCH', url: `/api/borrados/${id}`, headers: H('mecanico'), payload: { ok: true } });
  assert.equal(r1.statusCode, 200);
  const r2 = await app.inject({ method: 'PATCH', url: `/api/borrados/${id}`, headers: H('mecanico'), payload: { ok: false } });
  assert.equal(r2.statusCode, 409);
  const lista = await app.inject({ url: '/api/borrados', headers: H('admin') });
  assert.equal(lista.json().borrados[0].usuario, 'Prueba (mecanico)');
  assert.deepEqual(lista.json().borrados[0].codigos, ['P0401', 'P2463']);
});

test('informe PDF', async () => {
  const h = await app.inject({ url: '/api/lecturas?matricula=4521KLM', headers: H('oficina') });
  const id = h.json().lecturas[0].id;
  const r = await app.inject({ url: `/api/lecturas/${id}/informe.pdf`, headers: H('oficina') });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.ok(r.rawPayload.subarray(0, 4).toString() === '%PDF');
});

test('IA: sin clave da error claro; con tope alcanzado da 429', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/ia/diagnostico', headers: H('mecanico'), payload: { lectura } });
  assert.equal(r.statusCode, 500);
  await store.registrarIa('reyman', { coste_eur: 2, modelo: 'x' });
  const t = await app.inject({ method: 'POST', url: '/api/ia/diagnostico', headers: H('mecanico'), payload: { lectura } });
  assert.equal(t.statusCode, 429);
});

test('sesiones: guardar y n8n las recoge en CSV con clave', async () => {
  const s = await app.inject({ method: 'POST', url: '/api/sesiones', headers: H('mecanico'), payload: { ot: '261402', matricula: '4521KLM', pids: [{ pid: 12, nombre: 'Régimen motor', unidad: 'rpm' }], muestras: [{ t: 0, v: { 12: 800 } }, { t: 500, v: { 12: 1200 } }] } });
  assert.equal(s.statusCode, 200);
  const sin = await app.inject({ url: '/api/ingest/sesiones' });
  assert.equal(sin.statusCode, 401);
  const con = await app.inject({ url: '/api/ingest/sesiones', headers: { 'x-api-key': 'k' } });
  const ses = con.json().sesiones[0];
  assert.match(ses.csv, /Régimen motor \(rpm\)\n0.00;800\n0.50;1200/);
  const m = await app.inject({ method: 'POST', url: `/api/ingest/sesiones/${ses.id}/subida`, headers: { 'x-api-key': 'k' }, payload: { destino: 'x' } });
  assert.equal(m.statusCode, 200);
  const otra = await app.inject({ url: '/api/ingest/sesiones', headers: { 'x-api-key': 'k' } });
  assert.equal(otra.json().sesiones.length, 0);
  // Visor: sigue en la base después de copiarla a OneDrive
  const lista = await app.inject({ url: '/api/sesiones?matricula=4521 KLM', headers: H('mecanico') });
  assert.equal(lista.statusCode, 200);
  const fila = lista.json().sesiones[0];
  assert.equal(fila.id, ses.id);
  assert.deepEqual(fila.datos, ['Régimen motor']);
  assert.equal(fila.muestras, undefined);
  const una = await app.inject({ url: `/api/sesiones/${ses.id}`, headers: H('mecanico') });
  assert.equal(una.json().muestras.length, 2);
  assert.equal((await app.inject({ url: '/api/sesiones/no-existe', headers: H('mecanico') })).statusCode, 404);
});

test('enviar informe sin n8n configurado devuelve error sin romper', async () => {
  const h = await app.inject({ url: '/api/lecturas?matricula=4521KLM', headers: H('oficina') });
  const r = await app.inject({ method: 'POST', url: '/api/informes/enviar', headers: H('oficina'), payload: { lectura_id: h.json().lecturas[0].id, email: 'cliente@ejemplo.es' } });
  assert.equal(r.statusCode, 500);
  assert.match(r.json().message || r.json().error, /no está configurado/);
});

test('sirve la interfaz', async () => {
  const r = await app.inject({ url: '/' });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Reyman Diag/);
});
