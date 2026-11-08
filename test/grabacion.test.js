import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';
import {
  Grabador, MemoriaCircular, aCsv, desdeCsv, desdeSesion, validar, serie, resumen, recortar, duracionS, nuevaGrabacion,
} from '@reyman/obd-core/grabacion.js';

async function conectar(op = {}) {
  const sim = crearSimulador({ coche: 'diesel', latenciaMs: 1, ...op });
  await sim.conectar();
  const elm = new Elm327(sim, { timeoutMs: 2000 });
  await elm.iniciar();
  return { sim, elm, obd: new Obd(elm) };
}

test('Memoria circular: solo guarda los últimos segundos', () => {
  const m = new MemoriaCircular(2);
  for (let t = 0; t <= 5000; t += 500) m.agregar({ t, v: {} });
  assert.equal(m.muestras[0].t, 3000);
  assert.deepEqual(m.desde(4000).map((x) => x.t), [4000, 4500, 5000]);
});

test('Grabador: una avería intermitente nueva dispara la grabación con antes y después', async () => {
  const { sim, elm, obd } = await conectar();
  const grabaciones = [];
  const g = new Grabador(obd, { elm, pids: [0x0c, 0x0d], intervaloMs: 40, antesS: 1, despuesS: 1, averiasCadaS: 0.4, tensionCadaN: 3, vehiculo: { vin: 'WVWZZZAUZHW512345' }, alGrabacion: (x) => grabaciones.push(x) });
  const fin = g.iniciar();
  await new Promise((r) => setTimeout(r, 1500));
  sim._inyectarFallo({ codigo: 'P0300', duracionS: 1.5 });
  await new Promise((r) => setTimeout(r, 2600));
  g.parar();
  await fin;
  assert.equal(grabaciones.length, 1);
  const gr = grabaciones[0];
  assert.ok(validar(gr).ok);
  const ev = gr.eventos.find((e) => e.tipo === 'dtc');
  assert.equal(ev.detalle, 'P0300');
  assert.ok(gr.muestras[0].t <= ev.t - 600, 'debe incluir muestras de antes del fallo');
  assert.ok(gr.muestras[gr.muestras.length - 1].t >= ev.t + 900, 'debe incluir muestras de después del fallo');
  assert.ok(gr.muestras.some((m) => m.tension !== undefined));
  assert.equal(gr.vehiculo.vin, 'WVWZZZAUZHW512345');
  assert.ok(!gr.incompleta);
  // La avería ya conocida (P0299 pendiente) no dispara
  assert.ok(!gr.eventos.some((e) => e.detalle === 'P0299'));
});

test('Grabador: botón del conductor y disparos seguidos se juntan', async () => {
  const { obd, elm } = await conectar();
  const g = new Grabador(obd, { elm, pids: [0x0c], intervaloMs: 30, antesS: 0.5, despuesS: 0.6, averiasCadaS: 60 });
  const fin = g.iniciar();
  await new Promise((r) => setTimeout(r, 700));
  g.marcar('Tirón al acelerar');
  await new Promise((r) => setTimeout(r, 300));
  g.marcar('Otra vez');
  await new Promise((r) => setTimeout(r, 1200));
  g.parar();
  await fin;
  assert.equal(g.grabaciones.length, 1);
  assert.deepEqual(g.grabaciones[0].eventos.map((e) => e.detalle), ['Tirón al acelerar', 'Otra vez']);
});

test('Grabador: la caída brusca de tensión (arranque) también dispara', async () => {
  const { sim, obd, elm } = await conectar({ motor: 'parado', bateria: { reposo: 12.5, arranqueMin: 9.0 } });
  const g = new Grabador(obd, { elm, pids: [0x0c], intervaloMs: 20, antesS: 0.5, despuesS: 0.5, averiasCadaS: 60, tensionCadaN: 1, caidaTensionV: 1.5 });
  const fin = g.iniciar();
  await new Promise((r) => setTimeout(r, 500));
  sim._arrancar();
  await new Promise((r) => setTimeout(r, 1500));
  g.parar();
  await fin;
  assert.ok(g.grabaciones.some((x) => x.eventos.some((e) => e.tipo === 'tension')));
});

test('CSV: ida y vuelta (formato Excel español) con eventos y tensión', () => {
  const g = nuevaGrabacion({ origen: 'grabador', inicio: '2026-11-07T10:00:00.000Z', vehiculo: { vin: 'VIN123', matricula: '1234ABC' }, pids: [0x0c, 0x0d] });
  g.muestras = [
    { t: 0, v: { 12: 820.25, 13: 0 }, tension: 14.1 },
    { t: 200, v: { 12: 1500, 13: 12 } },
    { t: 400, v: { 12: null, 13: 15 }, tension: 13.9 },
  ];
  g.eventos = [{ t: 210, tipo: 'dtc', detalle: 'P0300' }];
  const csv = aCsv(g);
  assert.match(csv, /t_ms;0C;0D;tension_v;evento/);
  assert.match(csv, /0;820,25;0;14,1;/);
  const v = desdeCsv(csv);
  assert.equal(v.vehiculo.matricula, '1234ABC');
  assert.equal(v.origen, 'grabador');
  assert.deepEqual(v.pids, [0x0c, 0x0d]);
  assert.equal(v.muestras[0].v[12], 820.25);
  assert.equal(v.muestras[2].v[12], null);
  assert.equal(v.muestras[1].tension, null);
  assert.deepEqual(v.eventos, [{ t: 200, tipo: 'dtc', detalle: 'P0300' }]);
});

test('CSV con comas (inglés) y sin cabecera de metadatos', () => {
  const g = desdeCsv('t,0C,tension\n0,800.5,12.6\n100,810,12.5\n');
  assert.equal(g.muestras[0].v[12], 800.5);
  assert.equal(g.muestras[1].tension, 12.5);
  assert.throws(() => desdeCsv('a;b\n1;2'), /tiempo/);
});

test('Sesión de la app de taller → formato común, series y resumen', () => {
  const s = { inicio: Date.parse('2026-11-07T10:00:00Z'), pids: [0x0c, 0x05], muestras: [{ t: 0, v: { 12: 800, 5: 80 } }, { t: 1000, v: { 12: 1200, 5: 82 } }, { t: 2000, v: { 12: 1000, 5: null } }] };
  const g = desdeSesion(s, { vehiculo: { matricula: '1234ABC' } });
  assert.ok(validar(g).ok);
  assert.equal(duracionS(g), 2);
  assert.deepEqual(serie(g, 5).map((x) => x.valor), [80, 82]);
  const r = resumen(g).find((x) => x.clave === 0x0c);
  assert.equal(r.max, 1200);
  assert.equal(r.media, 1000);
  assert.equal(recortar(g, 500, 2000).muestras.length, 2);
  assert.equal(validar({ formato: 'otro' }).ok, false);
});
