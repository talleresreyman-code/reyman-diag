import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { crearTransporteWifi } from '@reyman/obd-core/transport/wifi.js';
import { crearTransporteBleNativo, SERVICIOS_BLE } from '@reyman/obd-core/transport/ble-nativo.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';

// --- WebSocket falso que hace de programa de enlace + adaptador (el simulador) ---
function wsFalso({ responder = 'ok', binario = true } = {}) {
  const urls = [];
  class WS {
    constructor(url) {
      urls.push(url);
      this.readyState = 0;
      this.sim = crearSimulador({ coche: 'diesel', latenciaMs: 1 });
      this.sim.alRecibir((txt) => {
        const data = binario ? new TextEncoder().encode(txt).buffer : txt;
        this.onmessage?.({ data });
      });
      setTimeout(() => {
        if (responder === 'sin-puente') { this.onerror?.(); return; }
        this.readyState = 1;
        this.onopen?.();
        if (responder === 'ok') this.onmessage?.({ data: 'PUENTE_OK' });
        if (responder === 'error') this.onmessage?.({ data: 'PUENTE_ERROR: No responde el adaptador en 192.168.0.10:35000.' });
      }, 2);
    }
    send(bytes) { this.sim.escribir(new TextDecoder().decode(bytes)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  return { WS, urls };
}

test('Wi-Fi: lectura completa a través del programa de enlace', async () => {
  const { WS, urls } = wsFalso();
  const t = crearTransporteWifi({ host: '192.168.0.10', puerto: 35000, WebSocketImpl: WS });
  await t.conectar();
  assert.equal(urls[0], 'ws://localhost:35001/ws?host=192.168.0.10&port=35000');
  const elm = new Elm327(t, { timeoutMs: 2000 });
  await elm.iniciar();
  const r = await new Obd(elm).lecturaCompleta();
  assert.equal(r.vehiculo.vin, 'WVWZZZAUZHW512345');
  await t.desconectar();
});

test('Wi-Fi: el enlace avisa de que no llega al adaptador', async () => {
  const { WS } = wsFalso({ responder: 'error' });
  const t = crearTransporteWifi({ WebSocketImpl: WS });
  await assert.rejects(t.conectar(), /No responde el adaptador/);
});

test('Wi-Fi: programa de enlace cerrado', async () => {
  const { WS } = wsFalso({ responder: 'sin-puente' });
  const t = crearTransporteWifi({ WebSocketImpl: WS });
  await assert.rejects(t.conectar(), (e) => e.code === 'SIN_PUENTE');
});

test('Wi-Fi: sin respuesta del enlace da tiempo agotado', async () => {
  const { WS } = wsFalso({ responder: 'nada' });
  const t = crearTransporteWifi({ WebSocketImpl: WS, timeoutMs: 50 });
  await assert.rejects(t.conectar(), (e) => e.code === 'TIMEOUT');
});

// --- BleClient falso (misma forma que @capacitor-community/bluetooth-le) ---
function bleFalso({ servicios } = {}) {
  const sim = crearSimulador({ coche: 'gasolina', latenciaMs: 1 });
  const escritos = [];
  let notif = null;
  sim.alRecibir((txt) => { const b = new TextEncoder().encode(txt); notif?.(new DataView(b.buffer)); });
  const BleClient = {
    async initialize() {},
    async requestDevice() { return { deviceId: 'AA:BB', name: 'vLinker MC-IOS' }; },
    async connect() {},
    async getServices() {
      return servicios || [
        { uuid: '00001800-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: 'x', properties: { read: true } }] },
        { uuid: SERVICIOS_BLE[0], characteristics: [
          { uuid: 'notif', properties: { notify: true } },
          { uuid: 'esc', properties: { writeWithoutResponse: true } },
        ] },
      ];
    },
    async startNotifications(id, s, c, f) { notif = f; },
    async stopNotifications() {},
    async writeWithoutResponse(id, s, c, dv) {
      const txt = new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
      escritos.push(txt);
      sim.escribir(txt);
    },
    async write() { throw new Error('no debería usar write con respuesta'); },
    async disconnect() {},
  };
  return { BleClient, escritos };
}

test('BLE nativo: elige el canal del servicio conocido y lee el coche', async () => {
  const { BleClient } = bleFalso();
  const t = crearTransporteBleNativo({ BleClient });
  await t.conectar();
  assert.equal(t.nombre, 'vLinker MC-IOS');
  assert.equal(t.deviceId, 'AA:BB');
  const elm = new Elm327(t, { timeoutMs: 2000 });
  await elm.iniciar();
  const r = await new Obd(elm).lecturaCompleta();
  assert.equal(r.vehiculo.marca, 'SEAT');
  await t.desconectar();
});

test('BLE nativo: trocea en 20 bytes', async () => {
  const { BleClient, escritos } = bleFalso();
  const t = crearTransporteBleNativo({ BleClient });
  await t.conectar();
  await t.escribir('0123456789012345678901234567890123456789XX\r');
  assert.ok(escritos.every((e) => new TextEncoder().encode(e).length <= 20));
  assert.equal(escritos.join(''), '0123456789012345678901234567890123456789XX\r');
});

test('BLE nativo: adaptador sin canal compatible', async () => {
  const { BleClient } = bleFalso({ servicios: [{ uuid: 'abc', characteristics: [{ uuid: 'r', properties: { read: true } }] }] });
  const t = crearTransporteBleNativo({ BleClient });
  await assert.rejects(t.conectar(), (e) => e.code === 'INCOMPATIBLE');
});
