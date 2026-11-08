import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desdeSesion, abrirTexto, estadisticas, valorEn, reducir, aCsv, aJson, duracion, textoTiempo, infoCanal } from '@reyman/obd-core/visor.js';
import { nuevaGrabacion, aCsv as grabCsv } from '@reyman/obd-core/grabacion.js';

const sesion = {
  ot: '261402', matricula: '4521KLM', inicio: '2026-11-08T10:00:00Z',
  pids: [{ pid: '0C.RPM', nombre: 'Régimen del motor', unidad: 'rpm' }, { pid: '0D.VSS', nombre: 'Velocidad', unidad: 'km/h' }],
  muestras: [0, 200, 400, 600, 800].map((t, i) => ({ t: t + 5000, v: { '0C.RPM': 800 + i * 100, '0D.VSS': i === 2 ? null : i * 10 } })),
  eventos: [{ t: 5400, tipo: 'marca', detalle: 'Ruido' }],
};

test('Sesión de «En vivo»: tiempo desde 0, canales y marcas', () => {
  const m = desdeSesion(sesion);
  assert.deepEqual(m.t, [0, 200, 400, 600, 800]);
  assert.equal(m.canales.length, 2);
  assert.equal(m.eventos[0].t, 400);
  assert.equal(m.titulo, 'OT 261402 · 4521KLM');
  assert.equal(duracion(m), 800);
});

test('Valores en el cursor, estadísticas y huecos', () => {
  const m = desdeSesion(sesion);
  assert.equal(valorEn(m, '0C.RPM', 390), 1000);
  assert.equal(valorEn(m, '0D.VSS', 400), 10); // hueco: el último válido
  const e = estadisticas(m, '0C.RPM', 200, 600);
  assert.deepEqual([e.min, e.max, e.media, e.tMax], [900, 1100, 1000, 600]);
});

test('Reducir para dibujar sin perder picos', () => {
  const t = []; const v = [];
  for (let i = 0; i < 10000; i++) { t.push(i * 10); v.push(i === 5000 ? 999 : 1); }
  const m = { t, valores: { a: v }, canales: [{ clave: 'a' }], eventos: [] };
  const p = reducir(m, 'a', 0, 99990, 100);
  assert.ok(p.length <= 102);
  assert.ok(p.some((x) => x && x[2] === 999));
});

test('CSV del servidor, de Excel (coma decimal) y con hora', () => {
  const a = abrirTexto('t_s;Régimen del motor (rpm);Velocidad (km/h)\n0.00;800;0\n0.20;850;1\n', 'sesion.csv');
  assert.deepEqual(a.canales.map((c) => [c.nombre, c.unidad]), [['Régimen del motor', 'rpm'], ['Velocidad', 'km/h']]);
  assert.equal(a.t[1], 200);
  const b = abrirTexto('Tiempo;Tensión [V];Nota\n0,0;12,45;\n0,5;12,40;arranque\n', 'x.csv');
  assert.equal(b.valores['Tensión'][1], 12.4);
  assert.equal(b.t[1], 500);
  const c = abrirTexto('Time,RPM,Boost (kPa)\n12:00:01.000,800,101\n12:00:01.500,820,102\n');
  assert.equal(c.t[1], 500);
  assert.equal(c.canales[1].unidad, 'kPa');
});

test('Formato del grabador (CSV y JSON) y vuelta a abrir lo exportado', () => {
  const g = nuevaGrabacion({ pids: [0x0c, 0x05] });
  g.muestras = [{ t: 0, v: { 12: 800, 5: 80 }, tension: 14.1 }, { t: 100, v: { 12: 900, 5: 81 }, tension: 14.0 }];
  g.eventos = [{ t: 100, tipo: 'dtc', detalle: 'P0301' }];
  const deCsv = abrirTexto(grabCsv(g));
  assert.equal(deCsv.canales.length, 3);
  assert.equal(deCsv.valores.tension[1], 14);
  const deJson = abrirTexto(JSON.stringify(g));
  assert.equal(deJson.canales[0].nombre, 'Régimen motor');
  const m = desdeSesion(sesion);
  const otra = abrirTexto(aJson(m));
  assert.deepEqual(otra.valores['0C.RPM'], m.valores['0C.RPM']);
  assert.equal(otra.eventos[0].detalle, 'Ruido');
  const csv = aCsv(m, { t0: 200, t1: 600 });
  assert.equal(csv.trim().split('\r\n').length, 4);
  assert.match(csv, /0,4;1000;;Ruido/);
});

test('Errores claros y textos', () => {
  assert.throws(() => abrirTexto('{"hola":1}'), /no es una grabación/);
  assert.throws(() => abrirTexto('solo una línea'), /no tiene datos/);
  assert.equal(textoTiempo(12400), '12,4 s');
  assert.equal(textoTiempo(125000), '2:05');
  assert.equal(infoCanal('0C.RPM').unidad, 'rpm');
});
