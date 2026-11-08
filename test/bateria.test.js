import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import {
  evaluarReposo, evaluarCarga, evaluarTension, porcentajeCarga, analizarArranque, medirArranque,
  HistorialBateria, avisosBateria, detectarSituacion,
} from '@reyman/obd-core/bateria.js';

test('Reposo: estados según la tensión (con compensación de la toma OBD)', () => {
  assert.equal(evaluarReposo(12.6).estado, 'bien');
  assert.equal(evaluarReposo(12.3).estado, 'aceptable');
  assert.equal(evaluarReposo(12.0).estado, 'baja');
  assert.equal(evaluarReposo(11.7).estado, 'descargada');
  assert.equal(evaluarReposo(12.45, { compensacionV: 0 }).estado, 'aceptable');
  // AGM: umbrales 0,1 V más altos
  assert.equal(evaluarReposo(12.45, { tipo: 'agm' }).estado, 'aceptable');
});

test('Porcentaje de carga aproximado', () => {
  assert.equal(porcentajeCarga(12.73), 100);
  assert.equal(porcentajeCarga(12.1), 50);
  assert.equal(porcentajeCarga(11.0), 0);
  const p = porcentajeCarga(12.44);
  assert.ok(p > 70 && p < 80);
});

test('Carga del alternador', () => {
  assert.equal(evaluarCarga(14.0).estado, 'correcta');
  assert.equal(evaluarCarga(12.8).estado, 'baja');
  assert.equal(evaluarCarga(15.3).estado, 'alta');
  assert.equal(detectarSituacion(14.1), 'motor');
  assert.equal(detectarSituacion(12.6), 'reposo');
  assert.equal(detectarSituacion(13.0, 0), 'reposo');
  assert.equal(detectarSituacion(13.5, 0), 'motor'); // motor parado pero cargando (híbrido READY, cargador)
  assert.equal(evaluarTension(14.0).situacion, 'motor');
});

test('Análisis de la curva de arranque: evalúa la meseta, no el pico inicial', () => {
  // Pico de 0,1 s y luego la meseta mientras gira el motor de arranque
  const curva = (meseta, pico = meseta - 1.2) => [12.5, 12.5, 12.48, pico, meseta - 0.2, meseta, meseta + 0.1, meseta, meseta + 0.1, 12.2, 13.8, 14.1].map((v, i) => ({ t: i * 80, v }));
  assert.equal(analizarArranque(curva(10.6)).estado, 'buena');
  assert.equal(analizarArranque(curva(9.7)).estado, 'justa');
  assert.equal(analizarArranque(curva(9.0)).estado, 'debil');
  const a = analizarArranque(curva(10.6, 8.9));
  assert.equal(a.pico, 9);
  assert.equal(a.estado, 'buena');
  assert.equal(analizarArranque(curva(10.6, 7.0)).avisos.length, 1);
  assert.equal(analizarArranque([12.5, 12.5, 12.45, 12.5].map((v, i) => ({ t: i, v }))).detectado, false);
});

test('Arranques reales (PSA gasolina, 08/11/2026): pico 9,2–9,3 V pero meseta ~11 V → batería buena', async () => {
  const fs = await import('node:fs');
  const datos = JSON.parse(fs.readFileSync(new URL('./datos/arranques-reales.json', import.meta.url)));
  for (const [nombre, d] of Object.entries(datos)) {
    const a = analizarArranque(d.muestras);
    assert.equal(a.detectado, true, nombre);
    assert.ok(a.pico < 9.6, `${nombre}: pico ${a.pico}`);
    assert.ok(a.meseta >= 10.5 && a.meseta <= 11.3, `${nombre}: meseta ${a.meseta}`);
    assert.equal(a.estado, 'buena', nombre);
    assert.equal(a.carga, 'correcta', nombre);
  }
});

async function elmSim(opciones) {
  const sim = crearSimulador({ latenciaMs: 1, ...opciones });
  await sim.conectar();
  const elm = new Elm327(sim, { timeoutMs: 2000 });
  await elm.iniciar();
  return { sim, elm };
}

test('Simulador: tensión en reposo y con el motor en marcha', async () => {
  const { sim, elm } = await elmSim({ motor: 'parado', bateria: { reposo: 12.0 } });
  assert.equal(evaluarReposo(await elm.tension()).estado, 'baja');
  sim._arrancar();
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(evaluarCarga(await elm.tension()).estado, 'correcta');
});

test('Medición real de un arranque con el simulador (batería buena y débil)', async () => {
  for (const [min, esperado] of [[10.4, 'buena'], [8.8, 'debil']]) {
    const { sim, elm } = await elmSim({ motor: 'parado', bateria: { reposo: 12.6, arranqueMin: min } });
    setTimeout(() => sim._arrancar(), 250);
    const { muestras, analisis } = await medirArranque(elm, { duracionMs: 5000, intervaloMs: 5 });
    assert.ok(muestras.length > 20, `pocas muestras: ${muestras.length}`);
    assert.equal(analisis.detectado, true);
    assert.equal(analisis.estado, esperado, `mínimo ${analisis.minimo}`);
    assert.equal(analisis.carga, 'correcta');
  }
});

test('Historial: tendencia semanal y avisos', () => {
  const h = new HistorialBateria();
  const base = new Date('2026-10-01T08:00:00Z').getTime();
  for (let i = 0; i < 6; i++) h.agregar({ fecha: new Date(base + i * 7 * 86400000).toISOString(), tension: 12.65 - i * 0.07, situacion: 'reposo' });
  h.agregar({ fecha: new Date(base + 2 * 86400000).toISOString(), tension: 14.1, situacion: 'motor' });
  const t = h.tendencia({ dias: 60, ahora: new Date(base + 36 * 86400000) });
  assert.ok(Math.abs(t + 0.07) < 0.01, `tendencia ${t}`);
  assert.equal(h.ultima('reposo').tension.toFixed(2), '12.30');
  const avisos = avisosBateria({ reposo: evaluarReposo(12.05), arranque: { estado: 'justa' }, tendencia: t, mes: 11 });
  assert.deepEqual(avisos.map((a) => a.nivel), ['aviso', 'aviso', 'aviso', 'info']);
  assert.equal(avisosBateria({ reposo: evaluarReposo(12.6), carga: evaluarCarga(14.1), mes: 6 }).length, 0);
  assert.equal(new HistorialBateria([{ fecha: '2026-01-01', tension: 12, situacion: 'reposo' }]).tendencia(), null);
});

import { evaluarAlternador, resumenMuestras, muestrearTension } from '@reyman/obd-core/bateria.js';

test('Alternador: correcto, justo, no carga y sobrecarga', () => {
  const n = (v, k = 10) => Array.from({ length: k }, (_, i) => v + (i % 2 ? 0.05 : -0.05));
  assert.equal(evaluarAlternador({ ralenti: n(14.1), conCarga: n(13.8), rpmCarga: 2000 }).estado, 'correcto');
  assert.equal(evaluarAlternador({ ralenti: n(14.1), conCarga: n(12.9), rpmCarga: 2000 }).estado, 'justo');
  assert.equal(evaluarAlternador({ ralenti: n(13.0), conCarga: n(12.4), rpmCarga: 2000 }).estado, 'no-carga');
  assert.equal(evaluarAlternador({ ralenti: n(15.3) }).estado, 'sobrecarga');
  // Carga inteligente: ralentí bajo pero con consumo carga → correcto con aviso
  const smart = evaluarAlternador({ ralenti: n(12.9), conCarga: n(14.0), rpmCarga: 1900 });
  assert.equal(smart.estado, 'correcto');
  assert.match(smart.avisos[0], /carga inteligente/);
  assert.match(evaluarAlternador({ ralenti: n(14.0), conCarga: n(13.9), rpmCarga: 900 }).avisos.join(' '), /1\.200 rpm/);
  assert.equal(evaluarAlternador({ ralenti: n(14.0) }).conCarga, null);
  assert.equal(evaluarAlternador({}), null);
  assert.deepEqual(resumenMuestras([13, 14, 15]), { media: 14, min: 13, max: 15, variacion: 2, n: 3 });
});

test('Muestreo de tensión con el motor en marcha (simulador)', async () => {
  const { obd } = { obd: null };
  const sim = crearSimulador({ latenciaMs: 1, motor: 'marcha' });
  await sim.conectar();
  const elm = new Elm327(sim, { timeoutMs: 2000 });
  await elm.iniciar();
  const { Obd } = await import('@reyman/obd-core/obd/obd.js');
  const r = await muestrearTension(elm, { obd: new Obd(elm), duracionMs: 300, intervaloMs: 20 });
  assert.ok(r.tensiones.length >= 3);
  assert.ok(r.rpm.every((x) => x > 300));
  assert.equal(evaluarAlternador({ ralenti: r.tensiones }).estado, 'correcto');
});

test('Híbrido en READY (Ford Kuga real): 15,0 V con motor parado es carga del DC-DC, no reposo ni «alta»', async () => {
  const { evaluarTension } = await import('@reyman/obd-core/bateria.js');
  const r = evaluarTension(15.0, { rpm: 0 });
  assert.equal(r.situacion, 'motor');
  assert.equal(r.estado, 'correcta');
  assert.match(r.mensaje, /DC-DC/);
  assert.equal(evaluarTension(12.6, { rpm: 0 }).situacion, 'reposo');
});
