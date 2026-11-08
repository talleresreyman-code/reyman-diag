// Modo 06: pruebas internas de los monitores
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { extraerPruebas, escalar } from '@reyman/obd-core/obd/modo06.js';

test('Modo 06: escalas y límites', () => {
  assert.deepEqual(escalar(0x0a, 3690), { valor: 450.18, unidad: 'mV', escalaConocida: true });
  assert.equal(escalar(0x96, 0xff9c).valor, -10); // con signo: -100 × 0,1 °C
  assert.equal(escalar(0x16, 1400).valor, 100); // 1400 × 0,1 - 40
  const [p] = extraerPruebas([0x21, 0x80, 0x20, 0x00, 0xec, 0x00, 0x00, 0x00, 0xe6]);
  assert.equal(p.monitor, 'Catalizador banco 1');
  assert.equal(p.ok, false);
});

test('Modo 06 con el simulador: catalizador fuera de límites y fallos de encendido por cilindro', async () => {
  const t = crearSimulador({ coche: 'gasolina' }); await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 3000 }); await elm.iniciar();
  const r = await new Obd(elm).modo06();
  assert.equal(r.ecus.length, 1);
  assert.equal(r.ecus[0].ecu, '7E8');
  const p = r.ecus[0].pruebas;
  assert.equal(p.length, 13);
  assert.equal(r.fuera, 1);
  assert.equal(p.find((x) => !x.ok).monitor, 'Catalizador banco 1');
  const cil2 = p.find((x) => x.mid === 0xa3 && x.tid === 0x0c);
  assert.equal(cil2.monitor, 'Fallos de encendido cilindro 2');
  assert.equal(cil2.valor, 5);
  assert.equal(p.find((x) => x.mid === 0x01 && x.tid === 0x01).unidad, 'mV');
  await elm.cerrar();
});

test('Modo 06: «cerca del límite» solo frente al límite que importa (datos reales del Kuga)', () => {
  const w = (n) => [(n >> 8) & 0xff, n & 0xff];
  const p = (mid, tid, uas, v, mn, mx) => extraerPruebas([mid, tid, uas, ...w(v), ...w(mn), ...w(mx)])[0];
  assert.equal(p(0xa1, 0x80, 0x30, 0, 0, 15073).margen, 100); // 0 % de fallos con límite 23 %: perfecto, no «cerca»
  assert.equal(p(0xa2, 0x0b, 0x24, 0, 0, 0xffff).margen, 100);
  assert.ok(p(0x21, 0x81, 0x20, 101, 0, 194).margen > 40); // catalizador 0,39 de 0,76
  assert.ok(p(0x21, 0x81, 0x20, 190, 0, 194).margen < 10); // catalizador casi en el límite
});
