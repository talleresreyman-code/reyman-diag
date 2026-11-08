// UDS (todas las centralitas) con el simulador ELM: lo que usa la demo y la pantalla Averías.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { escanearCentralitas, leerTodasLasCentralitas, borrarCentralita, leerCentralita } from '@reyman/obd-core/obd/uds.js';

async function abrir(op) {
  const t = crearSimulador(op); await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 3000 }); await elm.iniciar();
  return elm;
}

test('Simulador con escaneo: centralitas, averías UDS, bastidor y borrado del airbag', async () => {
  const elm = await abrir({ coche: 'diesel', escaneo: true });
  const pares = await escanearCentralitas(elm);
  assert.equal(pares.length, 5);
  const todas = await leerTodasLasCentralitas(elm, pares);
  assert.equal(todas.find((c) => c.rx === '77D').averias[0].completo, 'C0035-1F');
  assert.ok(todas.find((c) => c.rx === '7E8').vin);
  const airbag = todas.find((c) => c.rx === '77F');
  const b = await borrarCentralita(elm, airbag);
  assert.equal(b.ok, true); assert.equal(b.sesionExtendida, true);
  assert.equal((await leerCentralita(elm, airbag)).averias.length, 0);
  assert.ok((await new Obd(elm).pidsSoportados()).length > 5);
  await elm.cerrar();
});

test('Simulador sin escaneo (ELM normal): solo direcciones OBD 7E0–7E7', async () => {
  const elm = await abrir({ coche: 'diesel' });
  const pares = await escanearCentralitas(elm);
  assert.deepEqual(pares.map((p) => p.tx), ['7E0', '7E1']);
  await elm.cerrar();
});

test('Nombres Ford por dirección y readiness juntando centralitas (Kuga híbrido real)', async () => {
  const { nombrarPorMarca } = await import('@reyman/obd-core/obd/uds.js');
  const c = nombrarPorMarca([{ tx: '7E4', nombre: 'Centralita 7E4' }, { tx: '746', nombre: 'Centralita 746' }, { tx: '999', nombre: 'Centralita 999' }], 'WF0FXXWPMFPA12345');
  assert.deepEqual(c.map((x) => x.nombre), ['BECM (batería alta tensión)', 'DCDC (convertidor 12 V)', 'Centralita 999']);
  const { Obd } = await import('@reyman/obd-core/obd/obd.js');
  // Respuestas reales del Kuga: 7EE (híbrido) contesta antes que el motor
  const falso = { pedir: async () => ({ respuestas: [{ ecu: '7EE', datos: [0x01, 0x00, 0x04, 0x00, 0x00] }, { ecu: '7E8', datos: [0x01, 0x00, 0x07, 0xE1, 0x00] }] }) };
  const r = await Obd.prototype.readiness.call(falso);
  assert.equal(r.ecu, '7E8');
  assert.equal(r.monitores.length, 7);
  assert.equal(r.semaforo, 'verde');
});
