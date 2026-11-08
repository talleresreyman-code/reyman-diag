import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodificarSenales, extraerBits, bytesDePid, SAE_PIDS } from '../packages/obd-core/src/obd/senales.js';
import { decodificarPid, gruposEnVivo, infoPid, longitudPid } from '../packages/obd-core/src/obd/pids.js';

const val = (pid, bytes, id) => decodificarSenales(pid, bytes).find((s) => s.id === id);

test('Base OBDb: 205 PID y nada sin nombre en español', () => {
  assert.equal(Object.keys(SAE_PIDS).length, 205);
  for (const def of Object.values(SAE_PIDS)) for (const s of def.s) assert.ok(s.n && !/ supported\??$/i.test(s.n), s.id);
});

test('Extracción de bits desde el bit alto del byte A', () => {
  assert.equal(extraerBits([0x80], 0, 1), 1);
  assert.equal(extraerBits([0x12, 0x34], 0, 16), 0x1234);
  assert.equal(extraerBits([0x0f, 0xf0], 4, 8), 0xff);
  assert.equal(extraerBits([0x01], 0, 16), null);
});

test('Régimen, temperatura y correcciones con la escala del estándar', () => {
  assert.equal(val(0x0c, [0x1a, 0xf8], 'RPM').valor, 1726);
  assert.equal(val(0x05, [0x7b], 'ECT').valor, 83);
  assert.equal(val(0x06, [0x80], 'SHRTFT1').valor, 0);
  assert.equal(val(0x23, [0x27, 0x10], 'FRP').unidad, 'bar');
  assert.equal(val(0x23, [0x27, 0x10], 'FRP').valor, 1000); // 10000 × 10 kPa = 1000 bar
});

test('Sonda lambda: FF en la corrección = no la usa (dato no disponible)', () => {
  const s = decodificarSenales(0x14, [0x5a, 0xff]);
  assert.equal(s.find((x) => x.id === 'O2S11').valor, 0.45);
  assert.equal(s.find((x) => x.id === 'SHRTFT11').valor, null);
});

test('Sistema de combustible (PID 03) como texto', () => {
  assert.equal(val(0x03, [0x02, 0x00], 'FUELSYS1').texto, 'Lazo cerrado');
});

test('Híbrido (PID 9A): tensión, corriente con signo y solo lo que el coche dice que tiene', () => {
  // A = soportados: V (bit 1) y A (bit 2); B = modo; C-D tensión ×1/64; E-F corriente ×0,1 con signo
  const bytes = [0x06, 0x00, 0x37, 0xe0, 0xff, 0x9c];
  const s = decodificarSenales(0x9a, bytes);
  assert.equal(s.find((x) => x.id === 'HEV_BATT_V').valor, 223.5);
  assert.equal(s.find((x) => x.id === 'HEV_BATT_A').valor, -10);
  assert.equal(s.find((x) => x.id === 'HEV_MODE'), undefined); // bit de soportado a 0
  assert.equal(bytesDePid(0x9a), 6);
});

test('decodificarPid conserva la lista corta y añade todas las señales', () => {
  const r = decodificarPid(0x0c, [0x0f, 0xa0]);
  assert.equal(r.nombre, 'Régimen motor');
  assert.equal(r.valor, 1000);
  assert.equal(r.senales[0].id, 'RPM');
  const t = decodificarPid(0x74, [0x01, 0x03, 0xe8, 0x00, 0x00]); // régimen del turbo A (×10)
  assert.equal(t.valor, 10000);
  assert.equal(t.unidad, 'rpm');
  assert.equal(infoPid(0x9b).nombre, 'Concentración de AdBlue');
  assert.equal(longitudPid(0x0c), 2);
});

test('Grupos en vivo solo con lo soportado y en el grupo que toca', () => {
  const g = gruposEnVivo([0x0c, 0x0d, 0x05, 0x70, 0x7a, 0x9a, 0x9b, 0x20, 0x01]);
  const ids = (id) => g.find((x) => x.id === id)?.canales.map((c) => c.id) || [];
  assert.deepEqual(ids('basico'), ['RPM', 'VSS', 'ECT']);
  assert.ok(ids('turbo').includes('BP_A_ACT'));
  assert.ok(ids('escape').includes('DPF1_DP'));
  assert.ok(ids('hibrido').includes('HEV_BATT_V'));
  assert.ok(ids('adblue').includes('DEF_LVL'));
  assert.equal(g.find((x) => x.id === 'basico').canales[0].clave, '0C.RPM');
});
