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
