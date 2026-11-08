import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarRespuesta, datosDeServicio, reensamblarIsoTp, ObdError } from '@reyman/obd-core/obd/parser.js';
import { extraerDtcs, decodificarDtc, describirDtc } from '@reyman/obd-core/obd/dtc.js';
import { decodificarPid, decodificarSoportados } from '@reyman/obd-core/obd/pids.js';
import { decodificarReadiness } from '@reyman/obd-core/obd/readiness.js';
import { decodificarVin, vinDesdeBytes } from '@reyman/obd-core/obd/vin.js';

test('CAN 11 bits trama única con dos centralitas', () => {
  const raw = '7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 98 18 00 01\r\r';
  const { tipo, mensajes } = analizarRespuesta(raw);
  assert.equal(tipo, 'can11');
  assert.equal(mensajes.length, 2);
  assert.deepEqual(mensajes[0].bytes, [0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13]);
});

test('ISO-TP multi-trama: VIN', () => {
  const raw = [
    '7E8 10 14 49 02 01 57 56 57',
    '7E8 21 5A 5A 5A 41 55 5A 48',
    '7E8 22 57 35 31 32 33 34 35',
  ].join('\r');
  const r = datosDeServicio(raw, 0x09);
  const vin = vinDesdeBytes([0x02, ...r.respuestas[0].datos.slice(1)]);
  assert.equal(vin, 'WVWZZZAUZHW512345');
  assert.equal(decodificarVin(vin).marca, 'Volkswagen');
});

test('VIN sin cabeceras (ATH0) con números de línea', () => {
  const raw = '014\r0: 49 02 01 57 56 57\r1: 5A 5A 5A 41 55 5A 48\r2: 57 35 31 32 33 34 35\r';
  const r = datosDeServicio(raw, 0x09);
  assert.equal(vinDesdeBytes([0x02, ...r.respuestas[0].datos.slice(1)]), 'WVWZZZAUZHW512345');
});

test('Modo 03 CAN con recuento y varias averías', () => {
  const raw = '7E8 10 08 43 03 01 33 01 71\r7E8 21 04 20 55 55 55 55 55\r7E9 02 43 00';
  const r = datosDeServicio(raw, 0x03);
  const motor = r.respuestas.find((x) => x.ecu === '7E8');
  assert.deepEqual(extraerDtcs(motor.datos, true), ['P0133', 'P0171', 'P0420']);
  const cambio = r.respuestas.find((x) => x.ecu === '7E9');
  assert.deepEqual(extraerDtcs(cambio.datos, true), []);
});

test('Modo 03 protocolo antiguo (ISO 9141) con cabecera y checksum', () => {
  const raw = '48 6B 10 43 01 33 03 00 00 00 9F';
  const r = datosDeServicio(raw, 0x03);
  assert.deepEqual(extraerDtcs(r.respuestas[0].datos, false), ['P0133', 'P0300']);
});

test('Decodificación de letras de DTC', () => {
  assert.equal(decodificarDtc(0x41, 0x23), 'C0123');
  assert.equal(decodificarDtc(0x81, 0x00), 'B0100');
  assert.equal(decodificarDtc(0xc1, 0x00), 'U0100');
  assert.equal(decodificarDtc(0x24, 0x63), 'P2463');
});

test('Descripciones', () => {
  assert.match(describirDtc('P0304').descripcion, /cilindro 4/);
  assert.match(describirDtc('P0420').descripcion, /catalizador/i);
  assert.equal(describirDtc('P1234').fabricante, true);
});

test('Respuesta NO DATA lanza error', () => {
  assert.throws(() => datosDeServicio('NO DATA\r', 0x01), (e) => e instanceof ObdError && e.code === 'NO DATA');
});

test('Respuesta negativa 7F', () => {
  assert.throws(() => datosDeServicio('7E8 03 7F 04 22', 0x04), /Condiciones no correctas/);
});

test('SEARCHING y eco se ignoran', () => {
  const r = datosDeServicio('010C\rSEARCHING...\r7E8 04 41 0C 1A F8\r', 0x01, '010C');
  assert.equal(decodificarPid(0x0c, r.respuestas[0].datos.slice(1)).valor, 1726);
});

test('Sin espacios (ATS0)', () => {
  const r = datosDeServicio('7E804410C1AF8', 0x01);
  assert.equal(decodificarPid(0x0c, r.respuestas[0].datos.slice(1)).valor, 1726);
});

test('PIDs: temperatura, velocidad, tensión', () => {
  assert.equal(decodificarPid(0x05, [0x7b]).valor, 83);
  assert.equal(decodificarPid(0x0d, [0x3c]).valor, 60);
  assert.equal(decodificarPid(0x42, [0x36, 0xb0]).valor, 14);
});

test('PIDs soportados', () => {
  const l = decodificarSoportados(0, [0xbe, 0x1f, 0xa8, 0x13]);
  assert.ok(l.includes(0x01) && l.includes(0x0c) && l.includes(0x20));
  assert.ok(!l.includes(0x02));
});

test('Readiness diésel con MIL y DPF pendiente', () => {
  const r = decodificarReadiness([0x82, 0x0f, 0xe9, 0x40]);
  assert.equal(r.mil, true);
  assert.equal(r.numAverias, 2);
  assert.equal(r.motor, 'diesel');
  assert.equal(r.semaforo, 'rojo');
  assert.equal(r.monitores.find((m) => /partículas/.test(m.nombre)).estado, 'pendiente');
});

test('Readiness gasolina lista para ITV', () => {
  const r = decodificarReadiness([0x00, 0x07, 0xe5, 0x00]);
  assert.equal(r.semaforo, 'verde');
});

test('ISO-TP reensamblado con vuelta del número de secuencia', () => {
  const tramas = [[0x10, 0x0e, 1, 2, 3, 4, 5, 6], [0x21, 7, 8, 9, 10, 11, 12, 13], [0x22, 14, 0, 0, 0, 0, 0, 0]];
  assert.deepEqual(reensamblarIsoTp(tramas), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('Año del VIN', () => {
  assert.equal(decodificarVin('WVWZZZAUZHW512345').año, 2017);
  assert.equal(decodificarVin('VSSZZZKLZMR024680').año, 2021);
});
