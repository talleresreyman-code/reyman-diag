// Botón «Actualizar» de Reyman Diag: la app solo deja avisos en la carpeta compartida con el vigilante del servidor
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearServidor, leerConfig } from '../server/index.js';

test('Versión instalada, versión nueva y petición de actualizar (solo administración)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-act-'));
  fs.writeFileSync(path.join(dir, 'instalada.txt'), 'commit=aaa1111\nfecha=2026-11-08T19:00:00+01:00\nmensaje=v0.4.4\n');
  fs.writeFileSync(path.join(dir, 'disponible.txt'), 'commit=bbb2222\nmensaje=Conexión VCMI\ncambio=bbb2222|2026-11-08T19:30:00+01:00|Conexión VCMI\n');
  const { app } = await crearServidor({ ...leerConfig({}), modo: 'dev', actualizadorDir: dir }, { logger: false });
  try {
    const H = (rol) => ({ 'x-diag-rol': rol });
    const v = (await app.inject({ url: '/api/version', headers: H('admin') })).json();
    assert.equal(v.hayNueva, true);
    assert.equal(v.puede, true);
    assert.equal(v.cambios[0].mensaje, 'Conexión VCMI');
    assert.equal((await app.inject({ url: '/api/version', headers: H('mecanico') })).json().puede, false);
    assert.equal((await app.inject({ method: 'POST', url: '/api/version/actualizar', headers: H('mecanico') })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/version/actualizar', headers: H('admin') })).statusCode, 200);
    assert.ok(fs.readFileSync(path.join(dir, 'pedido'), 'utf8').includes('Prueba'));
    assert.equal((await app.inject({ url: '/api/version', headers: H('admin') })).json().pedido, true);
  } finally { await app.close(); }
});
