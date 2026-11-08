// Ford híbrido: batería de alta tensión (BECM 7E4) con los valores reales del Kuga 2023
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { esFord, leerBateriaHibridaFord } from '@reyman/obd-core/marcas/ford.js';
import { escanearCentralitas, leerTodasLasCentralitas } from '@reyman/obd-core/obd/uds.js';

test('Kuga híbrido simulado: batería de alta tensión y nombres Ford', async () => {
  const t = crearSimulador({ coche: 'kuga', escaneo: true }); await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 3000 }); await elm.iniciar();
  const obd = new Obd(elm);
  const lectura = { vehiculo: await obd.vin() };
  assert.equal(esFord(lectura), true);
  const b = await leerBateriaHibridaFord(elm);
  assert.equal(b.carga, 55.8);
  assert.equal(b.tension, 223.5);
  assert.equal(b.celdaA, 3.727);
  assert.equal(b.difCeldasMv, 4);
  assert.equal(b.km, 47252);
  assert.equal(b.avisos.length, 0);
  // Tras leer el BECM se vuelve al OBD general
  assert.ok((await obd.pidsSoportados()).length > 5);
  const pares = await escanearCentralitas(elm);
  const todas = await leerTodasLasCentralitas(elm, pares);
  assert.equal(todas.find((c) => c.tx === '7E4').nombre, 'BECM (batería alta tensión)');
  assert.equal(todas.find((c) => c.tx === '7D0').averias[0].codigo, 'U0140');
  await elm.cerrar();
});

test('Ford no híbrido / otra marca: no se muestra o el BECM no contesta', async () => {
  assert.equal(esFord({ vehiculo: { valido: true, vin: 'WVWZZZAUZHW512345' } }), false);
  const t = crearSimulador({ coche: 'diesel' }); await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 3000 }); await elm.iniciar();
  const b = await leerBateriaHibridaFord(elm);
  assert.ok(b.error);
  await elm.cerrar();
});
