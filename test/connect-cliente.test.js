import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenDeTexto, estadoCorto, urlDocumento } from '../apps/cliente/src/cliente.js';

const T = 'AbCdEf0123456789AbCdEf0123';

test('Connect · saca el código del enlace de Mi taller', () => {
  assert.equal(tokenDeTexto(`Hola, aquí tienes tu área de cliente: https://talleresreyman.com/mi-taller/?t=${T} 👋`), T);
  assert.equal(tokenDeTexto(`reymanconnect://mitaller?t=${T}`), T);
  assert.equal(tokenDeTexto(`https://n8n.talleresreyman.es/webhook/reyman-connect?t=${T}&x=1`), T);
  assert.equal(tokenDeTexto(T), T);
  assert.equal(tokenDeTexto('https://talleresreyman.com/mi-taller/?t=corto'), null);
  assert.equal(tokenDeTexto(''), null);
  assert.equal(tokenDeTexto(null), null);
});

test('Connect · estado corto del coche en el taller', () => {
  assert.equal(estadoCorto({ estado: null }), null);
  assert.equal(estadoCorto({ estado: { texto: 'Terminado: puedes pasar a recogerlo', terminado: true } }).color, 'verde');
  assert.equal(estadoCorto({ estado: { texto: 'Presupuesto enviado, pendiente de tu respuesta' } }).color, 'ambar');
  assert.equal(estadoCorto({ estado: { texto: 'En reparación' } }).color, 'azul');
});

test('Connect · enlace del PDF', () => {
  assert.equal(urlDocumento(T, 'a b'), `https://n8n.talleresreyman.es/webhook/reyman-mitaller-doc?t=${T}&d=a%20b`);
});

test('libro de mantenimiento: próxima revisión, color y aviso en Inicio', async () => {
  const { resumenRevision, textoRevision } = await import('../apps/cliente/src/libro.js');
  const { pendientes } = await import('../apps/cliente/src/solicitudes.js');
  const hoy = new Date(2026, 10, 22, 12);
  const libro = (prevista, km = 60000, ultima = '2025-12-20') => ({ kmHoy: km, revision: { ultima: { fecha: ultima, km: 50000 }, plazoMeses: 12, plazoKm: 15000, prevista, motivo: 'tiempo' }, proximo: { fecha: prevista, km: 65000, items: ['Líquido de frenos'] } });
  let r = resumenRevision(libro('2026-12-20'), { hoy });
  assert.equal(r.color, 'ambar'); assert.equal(r.kmObjetivo, 65000); assert.equal(r.kmFaltan, 5000); assert.equal(r.kmEstimados, true);
  assert.match(textoRevision(r), /^Le toca en 28 días/);
  r = resumenRevision(libro('2027-06-20'), { hoy, kmActuales: 66000 });
  assert.equal(r.vencida, true, 'por km ya toca aunque la fecha quede lejos'); assert.equal(r.kmEstimados, false); assert.equal(r.color, 'rojo');
  assert.equal(textoRevision(r), 'Ya le toca por kilómetros');
  r = resumenRevision(libro('2027-10-20', 52000, '2026-10-20'), { hoy });
  assert.equal(r.color, 'verde'); assert.match(textoRevision(r), /^Le toca en 11 meses/);
  assert.equal(resumenRevision(null), null);
  assert.equal(resumenRevision({ visitas: 1 }), null, 'sin revisiones no hay próxima');
  // Inicio: aviso de los coches a los que les toca, no si está en el taller ni si venció hace mucho
  const datos = (v) => ({ clienteDatos: { vehiculos: [Object.assign({ matricula: '1234 KLM', marca: 'Seat', modelo: 'León' }, v)] } });
  assert.ok(pendientes(datos({ libro: libro('2026-12-01') }), { hoy }).some((p) => p.id === 'rev-1234KLM' && p.accion.sel[0] === 'revision'));
  assert.ok(!pendientes(datos({ libro: libro('2026-12-01'), en_taller: true }), { hoy }).some((p) => p.id === 'rev-1234KLM'));
  assert.ok(!pendientes(datos({ libro: libro('2027-08-01', 52000, '2026-08-01') }), { hoy }).some((p) => p.id === 'rev-1234KLM'));
  assert.ok(!pendientes(datos({ libro: libro('2025-01-01', 52000) }), { hoy }).some((p) => p.id === 'rev-1234KLM'), 'vencida hace más de 6 meses: no se insiste');
});
