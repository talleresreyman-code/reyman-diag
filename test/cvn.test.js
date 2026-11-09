import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarCvn } from '@reyman/obd-core/cvn.js';

const x = { calid: '5G0259N 0003BECD', cvn: 'BCDF02EB', vin: 'WVWZZZ00000000001' };

test('CVN: referencia de fábrica manda', () => {
  assert.equal(evaluarCvn(x, { ref: { cvn: 'bcdf02eb' } }).estado, 'ok');
  assert.equal(evaluarCvn(x, { ref: { cvn: 'AAAA0000' } }).estado, 'mal');
});

test('CVN: el mismo coche con otro CVN antes = reprogramado', () => {
  const r = evaluarCvn(x, { propias: [{ cvn: '11112222', primera: '2026-10-01' }, { cvn: 'BCDF02EB', primera: '2026-11-09' }] });
  assert.equal(r.estado, 'mal');
  assert.match(r.motivo, /Ha cambiado/);
});

test('CVN: comparación con otros coches con el mismo software', () => {
  assert.equal(evaluarCvn(x, {}).estado, 'sin_ref');
  assert.equal(evaluarCvn(x, { otros: [{ cvn: 'BCDF02EB', coches: 2 }] }).estado, 'ok');
  assert.equal(evaluarCvn(x, { otros: [{ cvn: '99999999', coches: 3 }] }).estado, 'mal');
  assert.equal(evaluarCvn(x, { otros: [{ cvn: '99999999', coches: 1 }] }).estado, 'dudoso');
  assert.equal(evaluarCvn(x, { otros: [{ cvn: 'BCDF02EB', coches: 1 }, { cvn: '99999999', coches: 4 }] }).estado, 'dudoso');
});
