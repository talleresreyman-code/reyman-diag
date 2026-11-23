import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faltaConsentimiento, bloquearAlVolver, fichaCaducada, accesoRevocado, VERSION_CONDICIONES, BLOQUEO_TRAS_MS, proteccionDisponible, verificar } from '../apps/cliente/src/seguridad.js';
import { separar, completar, PRIVADAS } from '../apps/cliente/src/almacen.js';
import { pedirDatos } from '../apps/cliente/src/cliente.js';

test('Connect · condiciones: la primera vez y cuando cambian', () => {
  assert.equal(faltaConsentimiento({}), true);
  assert.equal(faltaConsentimiento({ consentimiento: { version: '2020-01-01' } }), true);
  assert.equal(faltaConsentimiento({ consentimiento: { version: VERSION_CONDICIONES } }), false);
});

test('Connect · vuelve a bloquear tras 1 minuto fuera', () => {
  const t = 1_000_000;
  assert.equal(bloquearAlVolver(null, t), false);
  assert.equal(bloquearAlVolver(t - 30_000, t), false);
  assert.equal(bloquearAlVolver(t - BLOQUEO_TRAS_MS, t), true);
});

test('Connect · la ficha caduca a los 90 días sin usarla', () => {
  const ahora = Date.parse('2026-11-21T10:00:00Z');
  assert.equal(fichaCaducada(null, ahora), false);
  assert.equal(fichaCaducada({ desde: '2026-10-01T10:00:00Z' }, ahora), false);
  assert.equal(fichaCaducada({ desde: '2026-01-01T10:00:00Z', ultimoUso: '2026-11-01T10:00:00Z' }, ahora), false);
  assert.equal(fichaCaducada({ desde: '2026-01-01T10:00:00Z', ultimoUso: '2026-08-01T10:00:00Z' }, ahora), true);
});

test('Connect · lo privado va aparte (llavero) y nunca con las lecturas', () => {
  const d = completar({ cliente: { token: 'x' }, clienteDatos: { vehiculos: [] }, contacto: { telefono: '600000000' }, solicitudes: [{ ref: 'RC' }], lecturas: [{ km: 1 }] });
  const { publico, privado } = separar(d);
  for (const k of PRIVADAS) assert.equal(k in publico, false, `${k} no debe ir en Preferences`);
  assert.deepEqual(Object.keys(privado).sort(), [...PRIVADAS].sort());
  assert.equal(privado.contacto.telefono, '600000000');
  assert.deepEqual(publico.lecturas, [{ km: 1 }]);
});

test('Connect · en el navegador no hay bloqueo (demostración)', async () => {
  assert.equal((await proteccionDisponible()).disponible, true);
  assert.equal((await verificar()).ok, true);
});

test('Connect · enlace desactivado por el taller = borrar la ficha; sin conexión = no', async () => {
  const T = 'AbCdEf0123456789AbCdEf0123';
  const antes = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ json: async () => ({ ok: false, error: 'Este acceso está desactivado. Escríbenos por WhatsApp al 665 942 470.' }) });
    await assert.rejects(pedirDatos(T), (e) => accesoRevocado(e));
    globalThis.fetch = async () => ({ json: async () => ({ ok: false, error: 'Este enlace no es válido. Escríbenos…' }) });
    await assert.rejects(pedirDatos(T), (e) => accesoRevocado(e));
    globalThis.fetch = async () => { throw new Error('sin red'); };
    await assert.rejects(pedirDatos(T), (e) => !accesoRevocado(e));
  } finally { globalThis.fetch = antes; }
});

test('Connect · la clave del móvil va en cabecera, nunca en la dirección', async () => {
  const { credDe, urlDocumento: urlDoc, vincularMovil, nombreDispositivo } = await import('../apps/cliente/src/cliente.js');
  const K = 'a'.repeat(48);
  const antes = globalThis.fetch;
  try {
    let visto;
    globalThis.fetch = async (url, op) => { visto = { url, op }; return { json: async () => ({ ok: true, vehiculos: [] }) }; };
    await pedirDatos({ clave: K });
    assert.ok(!visto.url.includes(K));
    assert.equal(visto.op.headers['x-reyman-clave'], K);
    globalThis.fetch = async (url, op) => { visto = { url, op }; return { json: async () => ({ ok: true, clave: K }) }; };
    assert.equal(await vincularMovil('AbCdEf0123456789AbCdEf0123'), K);
    assert.ok(visto.url.endsWith('/reyman-connect-vincular'));
    globalThis.fetch = async () => ({ json: async () => ({ ok: false, error: 'Este enlace ha caducado. Pide uno nuevo.' }) });
    await assert.rejects(vincularMovil('AbCdEf0123456789AbCdEf0123'), (e) => accesoRevocado(e));
    await assert.rejects(pedirDatos({ clave: 'corta' }), (e) => accesoRevocado(e));
  } finally { globalThis.fetch = antes; }
  assert.deepEqual(credDe({ clave: K, token: 'x' }), { clave: K });
  assert.ok(urlDoc({ clave: K }, 7).includes(`k=${K}`));
  assert.equal(nombreDispositivo('Mozilla (iPhone; CPU iPhone OS 18)'), 'iPhone');
  assert.equal(nombreDispositivo('Linux; Android 15'), 'Android');
});

test('Connect · huella del enlace: igual para el mismo enlace, distinta para otro, sin guardar el enlace', async () => {
  const { huellaEnlace } = await import('../apps/cliente/src/cliente.js');
  const a = await huellaEnlace('AbCdEf0123456789AbCdEf0123');
  assert.equal(a, await huellaEnlace('AbCdEf0123456789AbCdEf0123'));
  assert.notEqual(a, await huellaEnlace('ZbCdEf0123456789AbCdEf0123'));
  assert.ok(!a.includes('AbCdEf0123456789'));
  assert.equal(a.length, 64);
});
