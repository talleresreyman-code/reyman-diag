import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { decodificarIpt, decodificarCvn } from '@reyman/obd-core/obd/modo09.js';

async function abrir(opciones) {
  const elm = new Elm327(crearSimulador({ latenciaMs: 1, ...opciones }), { timeoutMs: 2000 });
  await elm.iniciar();
  return new Obd(elm);
}

test('OBD sobre UDS (J1979-2): se detecta solo y lee lo mismo que el OBD clásico', async () => {
  const obd = await abrir({ coche: 'diesel', obdUds: true });
  const l = await obd.lecturaCompleta();
  assert.equal(obd.protocolo, 'uds');
  assert.match(l.protocoloObd, /J1979-2/);
  assert.equal(l.vehiculo.vin, 'WVWZZZAUZHW512345');
  assert.equal(l.readiness.motor, 'diesel');
  const conf = l.averias.filter((a) => a.tipo === 'confirmada').map((a) => a.codigo).sort();
  assert.deepEqual(conf, ['P0401', 'P2463']);
  assert.ok(l.averias.some((a) => a.tipo === 'pendiente' && a.codigo === 'P0299'));
  assert.ok(l.averias.some((a) => a.tipo === 'permanente' && a.codigo === 'P0401'));
  assert.equal(l.datos.find((d) => d.pid === 0xa6).valor, 148230);
  const b = await obd.borrarAverias();
  assert.equal(b.ok, true);
  assert.equal((await obd.averias()).averias.filter((a) => a.tipo === 'confirmada').length, 0);
});

test('El OBD clásico sigue igual', async () => {
  const obd = await abrir({ coche: 'gasolina' });
  await obd.lecturaCompleta();
  assert.equal(obd.protocolo, 'clasico');
});

test('Servicio 09: calibración con CVN y contadores de uso (gasolina y diésel)', async () => {
  for (const [coche, tipo, id] of [['gasolina', 'gasolina', 'cat1'], ['diesel', 'diesel', 'pm']]) {
    const obd = await abrir({ coche });
    const r = await obd.modo09();
    const m = r.ecus.find((e) => e.ecu === '7E8');
    assert.equal(m.calibraciones[0].cvn, '5A3C91E2');
    assert.equal(m.ipt.tipo, tipo);
    assert.ok(m.ipt.monitores.find((x) => x.id === id).ratio > 0);
  }
});

test('Decodificadores del servicio 09', () => {
  assert.deepEqual(decodificarCvn([0x12, 0x34, 0x56, 0x78, 0xab, 0xcd, 0xef, 0x01]), ['12345678', 'ABCDEF01']);
  const w = (a) => a.flatMap((x) => [x >> 8, x & 0xff]);
  const r = decodificarIpt(0x08, w([10, 20, 3, 10, 0, 0]));
  assert.equal(r.ciclosObd, 10);
  assert.equal(r.monitores[0].ratio, 0.3);
  assert.equal(r.monitores[1].ratio, null);
});
