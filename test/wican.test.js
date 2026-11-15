import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteWican, revisarAjustes, compararVersion, pedirPorEnlace, pedirNativo, normalizarAverias6, textoWican } from '@reyman/obd-core/wican.js';
import { crearTransporteSerie } from '@reyman/obd-core/transport/serie.js';
import { crearTransporteBleNativo } from '@reyman/obd-core/transport/ble-nativo.js';

// --- WiCAN falsos (respuestas reales recortadas de los firmware 4.50 y 6.0.0-beta) ---
const ESTADO_4 = {
  wifi_mode: 'APStation', sta_ssid: 'TALLER', sta_pass: 'secreta', sta_status: 'Connected', sta_connected: true, sta_ip: '192.168.1.40',
  ble_status: 'disable', protocol: 'elm327', port_type: 'tcp', port: '35000', fw_version: '4.50', hw_version: 'WiCAN-OBD-PRO',
  git_version: 'v4.50p', sleep_status: 'enable', sleep_volt: '13.1', wakeup_volt: '13.5', batt_voltage: '12.6V', uptime: '0d 00:12:03',
  mqtt_en: 'disable', device_id: '68ee8f5a653d', ecu_status: 'online',
};
function wican4(cambios = {}) {
  const pedidas = [];
  const pedir = async (metodo, ruta) => {
    pedidas.push(`${metodo} ${ruta}`);
    if (ruta === '/check_status') return { status: 200, datos: JSON.stringify({ ...ESTADO_4, ...cambios }) };
    return { status: 404, datos: 'Not found' };
  };
  return { pedir, pedidas };
}
function wican6({ dtcActivo = true, borradoActivo = false } = {}) {
  const pedidas = [];
  let escaneos = 0;
  let informe = { valid: false, ts: 0 };
  let leyendo = 0;
  const pedir = async (metodo, ruta, cuerpo) => {
    pedidas.push(`${metodo} ${ruta}${cuerpo ? ` ${JSON.stringify(cuerpo)}` : ''}`);
    switch (`${metodo} ${ruta}`) {
      case 'GET /api/info': return { status: 200, datos: { device_type: 'wican', model: 'WiCAN PRO', hw_version: 'WiCAN-OBD-PRO', fw_version: '6.0.0-beta.11', fw_build: 'v6.0.0-beta.11-3-g53ff082', device_id: '68ee8f5a653d', api_level: 3 } };
      case 'GET /api/status': return { status: 200, datos: { bits: { sta_connected: false, ble_enabled: true, ble_connected: false, sdcard_mounted: true }, uptime: '0d 00:01:10', temp_c: 41.2, sd: { state: 'mounted', reason: '', capacity_bytes: 31914983424 }, vehicle: { name: 'Peugeot 308', vin: 'VF3LBHNYHGS000000' } } };
      case 'GET /api/battery': return { status: 200, datos: { voltage: 12.47 } };
      case 'GET /api/ble': return { status: 200, datos: { enabled: true, connected: false, secured: false } };
      case 'GET /api/wifi/status': return { status: 200, datos: { sta_connected: false, ip: '' } };
      case 'GET /api/autopid/dtc':
        if (leyendo > 0) { leyendo--; return { status: 200, datos: { enabled: dtcActivo, allow_clear: borradoActivo, scanning: true, report: { valid: false, ts: 0 } } }; }
        return { status: 200, datos: { enabled: dtcActivo, allow_clear: borradoActivo, scanning: false, path: 'obd', report: informe } };
      case 'POST /api/autopid/dtc/scan':
        if (!dtcActivo) return { status: 403, datos: { error: 'dtc disabled' } };
        escaneos++;
        leyendo = 2;
        informe = { valid: true, ts: 1763200000 + escaneos, mil: true, mil_count: 1, protocol: 'obd', stored: ['P0420'], pending: ['P0171'], permanent: [], new: ['P0420'],
          sources: [{ ecu: '7E8', mil: true, count: 1 }], items: [{ code: 'P0420', kind: 'stored', ecu: '7E8' }], desc: { P0420: 'Catalyst efficiency below threshold' } };
        return { status: 202, datos: { started: true } };
      case 'POST /api/autopid/dtc/clear':
        if (!borradoActivo) return { status: 403, datos: { error: 'clear not allowed' } };
        return { status: 200, datos: { ok: true, cleared: true, before: 2, after: 0 } };
      case 'POST /api/uds/request':
        return { status: 200, datos: { ok: true, response: '62 F1 90 56 46 33', length: 6, positive: true, sid: 98, elapsed_ms: 31 } };
      default: return { status: 404, datos: { error: 'no such route' } };
    }
  };
  return { pedir, pedidas };
}
const rapido = { esperar: () => Promise.resolve() };

test('WiCAN 4.x: se reconoce por /check_status y no guarda la contraseña de la Wi-Fi', async () => {
  const w = wican4();
  const c = crearClienteWican({ pedir: w.pedir });
  const info = await c.identificar();
  assert.deepEqual([info.modelo, info.generacion, info.firmware, info.id], ['WiCAN Pro', 4, '4.50', '68ee8f5a653d']);
  const est = await c.estado();
  assert.equal(est.tension, 12.6);
  assert.equal(est.protocolo, 'elm327');
  assert.equal(est.puerto, 35000);
  assert.equal(est.wifi.conectadoRed, true);
  assert.equal(est.reposo.tensionDormir, 13.1);
  assert.ok(!JSON.stringify({ info, est }).includes('secreta'));
  // La primera respuesta se reutiliza: no se pide /check_status otra vez
  assert.equal(w.pedidas.filter((p) => p === 'GET /check_status').length, 1);
  assert.equal(textoWican(info), 'WiCAN Pro · firmware 4.50');
});

test('WiCAN 4.x: avisos de ajustes (protocolo, puerto, Bluetooth, firmware viejo)', async () => {
  const c = crearClienteWican({ pedir: wican4({ protocol: 'realdash66', ble_status: 'enable', fw_version: '4.11', port: '3333' }).pedir });
  const info = await c.identificar();
  const av = revisarAjustes(info, await c.estado(), { conexion: 'wifi', puerto: 35000 });
  const textos = av.map((a) => `${a.nivel}: ${a.texto}`).join('\n');
  assert.match(textos, /^error: .*realdash66.*ELM327/m);
  assert.match(textos, /aviso: .*puerto 3333/);
  assert.match(textos, /aviso: .*Bluetooth/);
  assert.match(textos, /aviso: Firmware 4\.11/);
  // Bien configurado: ningún error ni aviso
  const c2 = crearClienteWican({ pedir: wican4().pedir });
  const av2 = revisarAjustes(await c2.identificar(), await c2.estado(), { conexion: 'wifi', puerto: 35000 });
  assert.deepEqual(av2.filter((a) => a.nivel !== 'info'), []);
});

test('WiCAN 6: ficha, estado (tensión, SD, vehículo, Bluetooth) y averías del propio WiCAN', async () => {
  const w = wican6();
  const c = crearClienteWican({ pedir: w.pedir, ...rapido });
  const info = await c.identificar();
  assert.deepEqual([info.modelo, info.generacion, info.firmware, info.apiLevel], ['WiCAN Pro', 6, '6.0.0-beta.11', 3]);
  const est = await c.estado();
  assert.equal(est.tension, 12.47);
  assert.equal(est.sd.estado, 'mounted');
  assert.equal(est.sd.capacidadGB, 31.9);
  assert.equal(est.vehiculo.vin, 'VF3LBHNYHGS000000');
  assert.equal(est.ble.activo, true);
  assert.equal(est.averias.activo, true);
  assert.equal(await c.tension(), 12.47);
  const r = await c.leerAverias();
  assert.equal(r.mil, true);
  assert.deepEqual(r.almacenadas, [{ codigo: 'P0420', descripcionWican: 'Catalyst efficiency below threshold' }]);
  assert.deepEqual(r.pendientes.map((x) => x.codigo), ['P0171']);
  assert.deepEqual(r.centralitas, [{ id: '7E8', mil: true, cantidad: 1 }]);
  assert.ok(w.pedidas.includes('POST /api/autopid/dtc/scan {}'));
  const av = revisarAjustes(info, est, { conexion: 'wifi' });
  assert.ok(av.some((a) => /versión de pruebas/.test(a.texto)));
});

test('WiCAN 6: lectura desactivada, borrado bloqueado por el WiCAN y petición UDS', async () => {
  const c = crearClienteWican({ pedir: wican6({ dtcActivo: false }).pedir, ...rapido });
  await assert.rejects(c.leerAverias(), (e) => e.code === 'DTC_DESACTIVADO');
  await assert.rejects(c.borrarAverias(), (e) => e.code === 'BORRADO_DESACTIVADO');
  const u = await c.uds({ tx: '7E0', rx: '7E8', datos: '22 F1 90' });
  assert.deepEqual([u.positiva, u.respuesta, u.ms], [true, '62 F1 90 56 46 33', 31]);
  const w2 = wican6({ borradoActivo: true });
  const c2 = crearClienteWican({ pedir: w2.pedir, ...rapido });
  const b = await c2.borrarAverias({ codigos: ['P0420'] });
  assert.deepEqual(b, { ok: true, borrado: true, antes: 2, despues: 0 });
  assert.ok(w2.pedidas.some((p) => p.includes('"mode":"if_only"') && p.includes('"codes":["P0420"]')));
});

test('WiCAN 4.x: las funciones del firmware 6 avisan en vez de fallar raro', async () => {
  const c = crearClienteWican({ pedir: wican4().pedir });
  await assert.rejects(c.leerAverias(), (e) => e.code === 'SIN_FUNCION');
  await assert.rejects(c.uds({ tx: '7E0', rx: '7E8', datos: '22F190' }), (e) => e.code === 'SIN_FUNCION');
});

test('WiCAN: un ELM327 Wi-Fi corriente no es un WiCAN, y solo se piden rutas permitidas', async () => {
  const c = crearClienteWican({ pedir: async () => ({ status: 404, datos: '' }) });
  await assert.rejects(c.identificar(), (e) => e.code === 'NO_WICAN');
  const c2 = crearClienteWican({ pedir: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(c2.identificar(), (e) => e.code === 'NO_WICAN');
  // Todo lo que pide el cliente cumple la lista de rutas del programa de enlace
  const w = wican6();
  const c3 = crearClienteWican({ pedir: w.pedir, ...rapido });
  await c3.identificar(); await c3.estado(); await c3.leerAverias(); await c3.uds({ tx: '7E0', rx: '7E8', datos: '22F190' });
  const RUTA_ENLACE = /^\/(api\/[A-Za-z0-9_./:%-]*|check_status)(\?[A-Za-z0-9_=&%.,:-]*)?$/; // la misma que puente.ps1
  assert.ok(w.pedidas.every((p) => RUTA_ENLACE.test(p.split(' ')[1])));
});

test('WiCAN: comparar versiones y normalizar un informe vacío', () => {
  assert.ok(compararVersion('4.11', '4.50') < 0);
  assert.ok(compararVersion('6.0.0-beta.11', '4.50') > 0);
  assert.equal(compararVersion('v4.50p', '4.50'), 0);
  const n = normalizarAverias6({});
  assert.equal(n.valido, false);
  assert.deepEqual(n.almacenadas, []);
});

test('WiCAN por el programa de enlace: URL, método y errores', async () => {
  const llamadas = [];
  const fetchImpl = async (url, op) => {
    llamadas.push({ url, op });
    if (url.includes('check_status')) return { status: 504, text: async () => 'El WiCAN no contesta en 192.168.0.10.' };
    return { status: 200, text: async () => '{"voltage":12.5}' };
  };
  const pedir = pedirPorEnlace({ host: '192.168.0.10', fetchImpl });
  const r = await pedir('GET', '/api/battery');
  assert.deepEqual(r, { status: 200, datos: { voltage: 12.5 } });
  assert.equal(llamadas[0].url, 'http://localhost:35001/wican?host=192.168.0.10&ruta=%2Fapi%2Fbattery');
  await pedir('PUT', '/api/led', { r: 1 });
  assert.equal(llamadas[1].op.method, 'POST');
  assert.equal(llamadas[1].op.headers['x-metodo'], 'PUT');
  await assert.rejects(pedir('GET', '/check_status'), (e) => e.code === 'NO_WICAN' && /no contesta/.test(e.message));
  const sinEnlace = pedirPorEnlace({ host: '192.168.0.10', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(sinEnlace('GET', '/api/info'), (e) => e.code === 'SIN_ENLACE');
});

test('WiCAN desde la app instalada (HTTP nativo)', async () => {
  const pedidas = [];
  const Http = { request: async (o) => { pedidas.push(o); return { status: 200, data: { voltage: 12.1 } }; } };
  const r = await pedirNativo({ host: '192.168.0.10', Http })('GET', '/api/battery');
  assert.deepEqual(r, { status: 200, datos: { voltage: 12.1 } });
  assert.equal(pedidas[0].url, 'http://192.168.0.10/api/battery');
  const malo = pedirNativo({ host: '192.168.0.10', Http: { request: async () => { throw new Error('timeout'); } } });
  await assert.rejects(malo('GET', '/api/info'), (e) => e.code === 'NO_WICAN');
});

// --- Puerto serie falso: solo contesta a la velocidad buena (WiCAN Pro por USB-C) ---
function serialFalso(bueno) {
  const abiertos = [];
  const puerto = {
    getInfo: () => ({ usbVendorId: 0x1a86 }),
    async open({ baudRate }) {
      abiertos.push(baudRate);
      this.baud = baudRate;
      let ctrl;
      this.readable = new ReadableStream({ start: (c) => { ctrl = c; } });
      this.ctrl = ctrl;
      const self = this;
      this.writable = new WritableStream({
        write(chunk) {
          const t = new TextDecoder().decode(chunk);
          if (self.baud !== bueno) { if (/ATI/.test(t)) self.ctrl.enqueue(new Uint8Array([0xff, 0x00, 0x13])); return; }
          if (/ATI/.test(t)) self.ctrl.enqueue(new TextEncoder().encode('ATI\rELM327 v2.3\r\r>'));
          else if (/ATZ/.test(t)) self.ctrl.enqueue(new TextEncoder().encode('ATZ\r\rELM327 v2.3\r\r>'));
        },
      });
    },
    async close() { try { this.ctrl.close(); } catch { /* */ } },
  };
  return { serial: { requestPort: async () => puerto }, abiertos };
}

test('Puerto serie: busca sola la velocidad (WiCAN Pro por USB-C a 2 Mbaud)', async () => {
  const s = serialFalso(2000000);
  const t = crearTransporteSerie({ serial: s.serial, esperaMs: 200 });
  const recibido = [];
  t.alRecibir((x) => recibido.push(x));
  await t.conectar();
  assert.deepEqual(s.abiertos, [38400, 115200, 2000000]);
  assert.equal(t.baudios, 2000000);
  assert.match(t.nombre, /2 Mbaud/);
  // La respuesta de la prueba no llega a la app; lo siguiente sí
  assert.deepEqual(recibido, []);
  await t.escribir('ATZ\r');
  await new Promise((r) => setTimeout(r, 30));
  assert.match(recibido.join(''), /ELM327/);
  await t.desconectar();
});

test('Puerto serie: si ningún baudio contesta, avisa de probar el otro puerto del WiCAN', async () => {
  const s = serialFalso(-1);
  const t = crearTransporteSerie({ serial: s.serial, esperaMs: 50, baudios: [38400, 115200] });
  await assert.rejects(t.conectar(), /otro/);
});

test('Bluetooth: con el WiCAN Pro (firmware 6) se coge el canal ELM327 FFF1/FFF2 y no la API (FFF3/FFF4)', async () => {
  const u = (n) => `0000${n}-0000-1000-8000-00805f9b34fb`;
  const usados = {};
  const BleClient = {
    initialize: async () => {},
    requestDevice: async () => ({ deviceId: 'AA', name: 'WiCAN_68ee8f5a653d' }),
    connect: async () => {},
    getServices: async () => [{ uuid: u('fff0'), characteristics: [
      { uuid: u('fff3'), properties: { write: true } },
      { uuid: u('fff4'), properties: { notify: true } },
      { uuid: u('fff1'), properties: { notify: true } },
      { uuid: u('fff2'), properties: { writeWithoutResponse: true } },
      { uuid: u('fff5'), properties: { write: true, notify: true } },
    ] }],
    startNotifications: async (id, s, c) => { usados.notif = c; },
    writeWithoutResponse: async (id, s, c) => { usados.esc = c; },
    write: async (id, s, c) => { usados.esc = c; },
    disconnect: async () => {},
    stopNotifications: async () => {},
  };
  const t = crearTransporteBleNativo({ BleClient });
  await t.conectar();
  await t.escribir('ATZ\r');
  assert.equal(usados.notif, u('fff1'));
  assert.equal(usados.esc, u('fff2'));
});
