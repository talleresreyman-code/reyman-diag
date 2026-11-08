import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTransporte, conectar, comprobarCoche } from '../apps/cliente/src/comprobacion.js';

test('Reyman Connect: comprobación rápida con el coche parado (simulador)', async () => {
  const t = await crearTransporte({ simulador: 'diesel', bateria: { reposo: 12.2 } });
  const s = await conectar(t);
  const r = await comprobarCoche(s);
  assert.equal(r.vehiculo.marca, 'Volkswagen');
  assert.deepEqual(r.averias.map((a) => a.codigo).sort(), ['P0299', 'P0401', 'P2463']);
  assert.equal(r.averias.find((a) => a.codigo === 'P2463').gravedad.nivel, 'taller');
  assert.equal(r.situacion, 'reposo');
  assert.equal(r.bateria.estado, 'aceptable');
  assert.equal(r.km, 148230);
});

test('Reyman Connect: con el motor en marcha evalúa la carga', async () => {
  const t = await crearTransporte({ simulador: 'gasolina', motor: 'marcha' });
  const r = await comprobarCoche(await conectar(t));
  assert.equal(r.situacion, 'motor');
  assert.equal(r.bateria.estado, 'correcta');
});

test('Sin Bluetooth ni app nativa avisa claramente', async () => {
  await assert.rejects(crearTransporte({}), (e) => e.code === 'SIN_BLUETOOTH');
});
