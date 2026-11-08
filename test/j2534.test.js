// Pruebas del enlace J2534 de punta a punta SIN Windows: el enlace real (deploy/pruebas-wifi/j2534puente.cs)
// compilado con Mono, conectado a un coche simulado (test/j2534/CocheSimulado.cs), y la app hablando con él.
// Si no hay Mono (mcs/mono) en la máquina, estas pruebas se saltan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTransporteJ2534 } from '@reyman/obd-core/transport/j2534.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import { escanearCentralitas, leerCentralita, borrarCentralita, leerTodasLasCentralitas } from '@reyman/obd-core/obd/uds.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let exe = null;
try {
  execFileSync('which', ['mcs']); execFileSync('which', ['mono']);
  exe = path.join(os.tmpdir(), 'reyman-j2534-host.exe');
  execFileSync('mcs', ['-langversion:5', '-nowarn:414', `-out:${exe}`, path.join(RAIZ, 'deploy/pruebas-wifi/j2534puente.cs'), path.join(RAIZ, 'test/j2534/CocheSimulado.cs'), path.join(RAIZ, 'test/j2534/Host.cs')]);
} catch { exe = null; }
const opciones = { skip: exe ? false : 'sin Mono (mcs/mono) no se puede compilar el enlace J2534' };

/** Canal de líneas sobre el proceso host (en vez del WebSocket del portátil). */
function canalProceso(arg) {
  let p; let alLinea = () => {}; let alCerrar = () => {};
  return {
    abrir: () => new Promise((resolve, reject) => {
      p = spawn('mono', [exe, ...(arg ? [arg] : [])]);
      let buf = ''; let listo = false;
      p.stdout.on('data', (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!listo && l === 'LISTO') { listo = true; resolve('V200 SIM'); continue; }
          if (l) alLinea(l);
        }
      });
      p.stderr.on('data', (d) => process.stderr.write(d));
      p.on('exit', () => alCerrar());
      p.on('error', reject);
    }),
    enviar: (l) => p.stdin.write(`${l}\n`),
    alLinea: (f) => { alLinea = f; },
    alCerrar: (f) => { alCerrar = f; },
    cerrar: () => { try { p.stdin.end(); p.kill(); } catch { /* */ } },
  };
}

async function conectar(arg) {
  const t = crearTransporteJ2534({ canal: canalProceso(arg) });
  await t.conectar();
  const elm = new Elm327(t, { timeoutMs: 20000 });
  try {
    const info = await elm.iniciar();
    return { t, elm, obd: new Obd(elm), info };
  } catch (e) { await t.desconectar(); throw e; }
}

test('J2534: arranque como ELM, protocolo CAN 11/500 y lectura OBD completa (como el PSA real)', opciones, async () => {
  const { t, elm, obd, info } = await conectar();
  try {
    assert.match(info.version, /ELM327/);
    assert.equal(info.protocolo.codigo, '6');
    assert.equal(info.tension, 12.4);
    assert.equal(t.nombre, 'V200 SIM (J2534)');
    const r = await obd.lecturaCompleta();
    assert.equal(r.vehiculo.valido, false); // el PSA no da el bastidor por 09 02
    assert.equal(r.readiness.mil, false);
    assert.equal(r.averias.length, 0);
    assert.equal(r.centralitas[0].calibracion, '9805263499');
    assert.ok(r.soportados.includes(0x0c));
    assert.equal((await obd.leerPid(0x0c)).valor, 720);
  } finally { await elm.cerrar(); }
});

test('J2534: detecta un coche a 250 kbaud y otro a 29 bits', opciones, async () => {
  for (const [arg, cod] of [['250', '8'], ['29', '7']]) {
    const { elm, info } = await conectar(arg);
    try { assert.equal(info.protocolo.codigo, cod, `bus ${arg}`); } finally { await elm.cerrar(); }
  }
});

test('J2534 + UDS: escaneo seguro, averías de todas las centralitas, bastidor y borrado', opciones, async () => {
  const { elm } = await conectar();
  try {
    const pares = await escanearCentralitas(elm);
    assert.deepEqual(pares.map((p) => `${p.tx}>${p.rx}`).sort(), ['6A8>688', '6AD>68D', '752>652', '772>672']);
    const todas = await leerTodasLasCentralitas(elm, pares);
    const abs = todas.find((c) => c.rx === '68D');
    assert.equal(abs.nombre, 'ABS ESP');
    assert.deepEqual(abs.averias.map((a) => a.completo), ['C0035-1F']); // el de historial sin estado no aparece
    assert.equal(abs.averias[0].estado.confirmada, true);
    assert.equal(abs.averias[0].estado.activa, true);
    const bsi = todas.find((c) => c.rx === '652');
    assert.equal(bsi.averias[0].codigo, 'U0100');
    assert.equal(bsi.averias[0].estado.pendiente, true);
    assert.equal(todas.find((c) => c.rx === '688').vin, 'VF3LCYHZPKS123456');
    // Borrado: el airbag exige sesión extendida (lo reintenta solo)
    const airbag = todas.find((c) => c.rx === '672');
    assert.equal(airbag.averias.length, 1);
    const b = await borrarCentralita(elm, airbag);
    assert.equal(b.ok, true);
    assert.equal(b.sesionExtendida, true);
    const despues = await leerCentralita(elm, airbag);
    assert.equal(despues.averias.length, 0);
    // Tras UDS la app vuelve a la petición general y el OBD sigue funcionando
    const obd = new Obd(elm);
    assert.ok((await obd.pidsSoportados()).length > 5);
  } finally { await elm.cerrar(); }
});
