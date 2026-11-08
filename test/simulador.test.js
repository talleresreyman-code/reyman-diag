import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';

async function conectar(coche) {
  const t = crearSimulador({ coche, latenciaMs: 1 });
  await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 2000 });
  const info = await elm.iniciar();
  return { t, elm, obd: new Obd(elm), info };
}

test('Lectura completa del coche diésel simulado', async () => {
  const { obd, info } = await conectar('diesel');
  assert.match(info.version, /ELM327/);
  assert.equal(info.protocolo.codigo, '6');
  const r = await obd.lecturaCompleta();
  assert.equal(r.vehiculo.vin, 'WVWZZZAUZHW512345');
  assert.equal(r.vehiculo.marca, 'Volkswagen');
  assert.equal(r.readiness.semaforo, 'rojo');
  const conf = r.averias.filter((a) => a.tipo === 'confirmada').map((a) => a.codigo);
  assert.deepEqual(conf.sort(), ['P0401', 'P2463']);
  assert.ok(r.averias.some((a) => a.tipo === 'pendiente' && a.codigo === 'P0299'));
  assert.ok(r.averias.some((a) => a.tipo === 'permanente' && a.codigo === 'P0401'));
  assert.equal(r.freezeFrame.dtc.codigo, 'P0401');
  assert.ok(r.freezeFrame.valores.find((v) => v.pid === 0x0c).valor === 2150);
  assert.ok(r.centralitas.length >= 2);
  assert.ok(r.soportados.includes(0xa6));
  assert.equal(r.datos.find((d) => d.pid === 0xa6).valor, 148230);
});

test('Gasolina: 3 averías en multi-trama', async () => {
  const { obd } = await conectar('gasolina');
  const { averias } = await obd.averias();
  assert.deepEqual(averias.filter((a) => a.tipo === 'confirmada').map((a) => a.codigo), ['P0301', 'P0171', 'P0420']);
});

test('Borrado de averías deja las permanentes y monitores pendientes', async () => {
  const { obd } = await conectar('diesel');
  await obd.borrarAverias();
  const { averias } = await obd.averias();
  assert.deepEqual(averias.map((a) => `${a.tipo}:${a.codigo}`), ['permanente:P0401']);
  const rd = await obd.readiness();
  assert.equal(rd.mil, false);
  assert.equal(rd.semaforo, 'amarillo');
});

test('Datos en vivo', async () => {
  const { obd } = await conectar('diesel');
  const v = await obd.leerPids([0x0c, 0x0d, 0x05, 0x42]);
  assert.equal(v.length, 4);
  assert.ok(v.every((x) => typeof x.valor === 'number'));
  assert.ok(v[0].valor > 500 && v[0].valor < 3000);
});

test('Sin cabeceras también funciona (ATH0)', async () => {
  const t = crearSimulador({ coche: 'gasolina', latenciaMs: 1 });
  const elm = new Elm327(t, { timeoutMs: 2000 });
  await elm.iniciar();
  await elm.enviar('ATH0');
  const obd = new Obd(elm);
  const v = await obd.vin();
  assert.equal(v.vin, 'VSSZZZKLZMR024680');
  assert.equal(v.marca, 'SEAT');
});
