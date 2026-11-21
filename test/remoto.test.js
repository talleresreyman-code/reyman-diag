// Diagnóstico remoto: la app del cliente (con el adaptador) y Reyman Diag (taller) por el servidor, de punta a punta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor, leerConfig } from '../server/index.js';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { crearTransporteRemoto, crearPuenteRemoto, describirComando } from '@reyman/obd-core/transport/remoto.js';

let app, store, base;
before(async () => {
  const cfg = { ...leerConfig({}), modo: 'dev', devRol: 'mecanico' };
  ({ app, store } = await crearServidor(cfg, { logger: false, remoto: { caducaMs: 1500, inactivoMs: 60000 } }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${app.server.address().port}`;
});
after(() => app.close());

const abrirCodigo = async (extra = {}) => (await fetch(`http://${base}/api/connect/remoto/abrir`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ codigoTaller: 'REYMAN', consentimiento: true, nombre: 'José', matricula: '1234 abc', adaptador: 'vLinker', ...extra }),
})).json();

async function clienteConectado(r, eventos = {}) {
  const t = crearSimulador({ coche: 'diesel', latenciaMs: 1 });
  await t.conectar();
  const ws = new WebSocket(`ws://${base}/api/connect/remoto/ws?codigo=${r.codigo}&clave=${r.clave}`);
  await new Promise((ok) => { ws.onopen = ok; });
  return { t, ws, puente: crearPuenteRemoto({ transporte: t, ws, ...eventos }) };
}

test('sin permiso del cliente no hay código', async () => {
  const r = await abrirCodigo({ consentimiento: false });
  assert.match(r.error, /permiso/);
});

test('el taller lee el coche del cliente a distancia y la sesión queda en la auditoría', async () => {
  const r = await abrirCodigo();
  assert.match(r.codigo, /^\d{6}$/);
  const vistos = []; let tallerEntro = null; let finCliente = null;
  const c = await clienteConectado(r, { alTaller: (u) => { tallerEntro = u; }, alComando: (d) => vistos.push(describirComando(d)), alFin: (m) => { finCliente = m; } });

  const tr = crearTransporteRemoto({ url: `ws://${base}/api/remoto/ws?codigo=${r.codigo}` });
  const elm = new Elm327(tr, { timeoutMs: 5000 });
  await tr.conectar();
  assert.equal(tr.cliente.matricula, '1234ABC');
  await elm.iniciar();
  const obd = new Obd(elm);
  const v = await obd.vin();
  assert.equal(v.vin, 'WVWZZZAUZHW512345');
  const av = await obd.averias();
  assert.ok(Array.isArray(av.averias));
  assert.ok(tallerEntro);
  assert.ok(vistos.includes('Leyendo averías'));

  await tr.desconectar();
  await new Promise((ok) => setTimeout(ok, 150));
  assert.match(finCliente, /taller/i);
  assert.equal(app.remoto.salas.size, 0);
  await c.t.desconectar?.();
});

test('código equivocado: el taller no entra', async () => {
  const tr = crearTransporteRemoto({ url: `ws://${base}/api/remoto/ws?codigo=000000`, esperaMs: 3000 });
  await assert.rejects(tr.conectar(), /no existe|caducado/);
});

test('el código caduca si el taller no entra a tiempo', async () => {
  const r = await abrirCodigo();
  let fin = null;
  await clienteConectado(r, { alFin: (m) => { fin = m; } });
  await new Promise((ok) => setTimeout(ok, 6000));
  assert.match(fin || '', /caducado/);
  assert.ok(!app.remoto.salas.has(r.codigo));
});

test('describirComando: lo que ve el cliente', () => {
  assert.equal(describirComando('ATZ'), null);
  assert.equal(describirComando('04'), 'Borrando averías');
  assert.equal(describirComando('0902'), 'Identificando el coche');
  assert.equal(describirComando('010C'), 'Leyendo datos del motor');
});
