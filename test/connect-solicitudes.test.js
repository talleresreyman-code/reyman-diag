import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nuevaSolicitud, cochesDisponibles, validar, construirMensaje, urlWhatsApp, pendientes, referencia, esDiaCerrado, diasHasta, resumen, pideCita,
} from '../apps/cliente/src/solicitudes.js';

const DATOS = {
  vehiculo: { matricula: '1234 klm', marca: 'Seat', alias: 'Seat León' },
  mantenimiento: { itv: null },
  clienteDatos: {
    vehiculos: [
      { matricula: '1234KLM', marca: 'Seat', modelo: 'León 1.5 Tsi', km: '84320', proxima_itv: '15/12/2026' },
      { matricula: '5678BCD', marca: 'Volkswagen', modelo: 'Golf', km: '', proxima_itv: '' },
    ],
    presupuestos: [{ token: 'abc', num: '26/0915', matricula: '5678BCD', vehiculo: 'Volkswagen Golf' }],
  },
};
const FECHA = new Date(2026, 10, 21, 10, 43);

test('Connect · coches del cliente sin repetir (ficha del taller + coche de la app)', () => {
  const c = cochesDisponibles(DATOS);
  assert.deepEqual(c.map((x) => x.id), ['1234KLM', '5678BCD']);
  assert.equal(c[0].km, 84320);
  assert.equal(c[1].km, null);
  const solo = cochesDisponibles({ vehiculo: { matricula: '9999ZZZ', marca: 'Ford', anio: 2023 }, mantenimiento: { itv: { fecha: '2027-01-10' } } });
  assert.deepEqual(solo.map((x) => [x.id, x.nombre, x.itv]), [['9999ZZZ', 'Ford 2023', '10/01/2027']]);
  assert.deepEqual(cochesDisponibles({}), []);
});

test('Connect · mantenimiento: valida y escribe el mensaje de WhatsApp', () => {
  const coches = cochesDisponibles(DATOS);
  const s = nuevaSolicitud('mant');
  assert.equal(validar(s, coches), 'Elige el coche.');
  s.coche = '1234KLM';
  assert.equal(validar(s, coches), 'Marca qué necesitas.');
  s.sel = ['revision', 'neumaticos'];
  s.neumaticos = { medida: '205/55 R16 91V', cantidad: '2', gama: 'calidad' };
  s.cuando = 'dia'; s.dia = '2026-11-28';
  assert.match(validar(s, coches), /cerrados/); // sábado
  s.dia = '2026-11-27';
  s.sustitucion = true;
  assert.equal(validar(s, coches), null);
  const m = construirMensaje(s, { coches, cliente: 'José', fecha: FECHA });
  assert.match(m, /^Hola, soy José\. Os escribo desde la app Reyman Connect\./);
  assert.match(m, /\*Pedir cita · Mantenimiento\*/);
  assert.match(m, /Seat León 1\.5 Tsi · 1234KLM · 84\.320 km en la última visita/);
  assert.match(m, /Revisión \/ cambio de aceite, Neumáticos/);
  assert.match(m, /Neumáticos: medida 205\/55 R16 91V · 2 ruedas · gama calidad/);
  assert.match(m, /El viernes 27\/11\/2026 · dejo el coche/);
  assert.match(m, /coche de sustitución/);
  assert.match(m, /Ref\. RC-261121-1043$/);
  assert.ok(urlWhatsApp(m).startsWith('https://wa.me/34665942470?text=Hola%2C%20soy'));
});

test('Connect · avería con testigo, códigos del adaptador y sin poder circular', () => {
  const coches = cochesDisponibles(DATOS);
  const s = nuevaSolicitud('averia', { coche: '1234KLM' });
  assert.equal(validar(s, coches), 'Marca qué notas o cuéntanoslo.');
  s.sel = ['testigo', 'potencia']; s.testigos = ['motor']; s.pasa = ['acelerar', 'caliente']; s.desde = 'dias'; s.circular = 'no'; s.km = '84.900';
  s.texto = 'Al subir cuestas';
  assert.equal(validar(s, coches), null);
  const m = construirMensaje(s, { coches, codigos: ['P0299'], fecha: FECHA });
  assert.match(m, /^Hola, os escribo/);
  assert.match(m, /84\.900 km/);
  assert.match(m, /Testigo encendido, Pierde fuerza/);
  assert.match(m, /Testigo: Motor/);
  assert.match(m, /Pasa: al acelerar, en caliente/);
  assert.match(m, /No puedo circular/);
  assert.match(m, /P0299/);
  assert.match(m, /📝 Al subir cuestas/);
  s.codigos = false;
  assert.doesNotMatch(construirMensaje(s, { coches, codigos: ['P0299'] }), /P0299/);
});

test('Connect · presupuesto: pide km actuales y si lo quiere hacer', () => {
  const coches = cochesDisponibles(DATOS);
  const s = nuevaSolicitud('presupuesto', { coche: 'otro' });
  s.sel = ['frenos'];
  assert.match(validar(s, coches), /marca, el modelo y la matrícula/);
  s.otro = { marca: 'Renault', modelo: 'Clio', matricula: '4321-JJJ', km: '' };
  assert.match(validar(s, coches), /kilómetros/);
  s.otro.km = '120000';
  assert.match(validar(s, coches), /saber el precio/);
  s.plazo = 'informar';
  assert.equal(pideCita(s), false);
  assert.equal(validar(s, coches), null);
  const m = construirMensaje(s, { coches, fecha: FECHA });
  assert.match(m, /Renault Clio · 4321JJJ · 120\.000 km/);
  assert.match(m, /Solo quiero saber el precio/);
  assert.doesNotMatch(m, /📅/);
  s.plazo = 'hacer'; s.cuando = 'pronto';
  assert.match(construirMensaje(s, { coches }), /📅 Lo antes posible/);
});

test('Connect · consulta y facturas no necesitan coche', () => {
  const c = nuevaSolicitud('consulta');
  assert.match(validar(c), /tu coche, de otro/);
  c.sobre = 'general'; c.texto = '¿Cada cuánto se cambia el líquido de frenos?';
  assert.equal(validar(c), null);
  assert.match(construirMensaje(c), /Sobre: una duda general/);
  const a = nuevaSolicitud('admin');
  assert.equal(validar(a), 'Marca de qué se trata.');
  a.sel = ['copia'];
  assert.equal(validar(a), null);
  assert.match(construirMensaje(a), /Necesito una factura o una copia/);
  assert.equal(resumen(a), 'Facturas y pagos · Necesito una factura o una copia');
});

test('Connect · pendientes: presupuesto, ITV cercana y revisión', () => {
  const hoy = new Date(2026, 10, 21);
  const p = pendientes(DATOS, { hoy, revision: { estado: 'pronto' } });
  assert.deepEqual(p.map((x) => x.id), ['presu-abc', 'itv-1234KLM', 'revision']);
  assert.equal(p[1].titulo, 'La ITV del 1234KLM caduca en 24 días');
  assert.deepEqual(p[1].accion, { tipo: 'solicitud', sol: 'mant', coche: '1234KLM', sel: ['preitv', 'itv'] });
  assert.deepEqual(pendientes({}, { hoy }), []);
});

test('Connect · fechas', () => {
  assert.equal(referencia(FECHA), 'RC-261121-1043');
  assert.equal(esDiaCerrado('2026-11-29'), true);
  assert.equal(esDiaCerrado('2026-11-30'), false);
  assert.equal(diasHasta('15/12/2026', new Date(2026, 10, 21, 23)), 24);
  assert.equal(diasHasta('', new Date()), null);
});

test('Connect · solo cuenta como «en el taller» si el coche está físicamente', async () => {
  const { enTaller } = await import('../apps/cliente/src/solicitudes.js');
  assert.equal(enTaller({ en_taller: true }), true);
  assert.equal(enTaller({ estado: { texto: 'Terminado', en_taller: true } }), true);
  assert.equal(enTaller({ estado: { texto: 'Presupuesto enviado, pendiente de tu respuesta', en_taller: false } }), false);
  assert.equal(enTaller({}), false);
});

test('Connect · avería → prediagnóstico de Reyman Online con los datos de la ficha', async () => {
  const { validarPrediagnostico, cuerpoReymanOnline, sintomaPrincipal } = await import('../apps/cliente/src/solicitudes.js');
  const coches = cochesDisponibles(DATOS);
  const s = nuevaSolicitud('averia', { coche: '1234KLM' });
  s.sel = ['potencia', 'frenos']; s.pasa = ['frenar']; s.desde = 'hoy'; s.circular = 'dudas'; s.texto = 'Chirría';
  assert.equal(sintomaPrincipal(s), 'Frenos');
  assert.match(validarPrediagnostico(s, coches, { nombre: 'José', telefono: '91 871 11 64' }), /móvil válido/);
  assert.match(validarPrediagnostico(s, coches, { nombre: 'José', telefono: '+34 605 659 940' }), /dos casillas/);
  s.rgpd = true; s.acepto = true;
  assert.equal(validarPrediagnostico(s, coches, { nombre: 'José', telefono: '+34 605 659 940' }), null);
  const b = cuerpoReymanOnline(s, { coches, nombre: 'José', telefono: '+34 605 659 940', codigos: ['P0299'] });
  assert.equal(b.telefono, '605659940');
  assert.equal(b.matricula, '1234KLM');
  assert.equal(b.marca, 'Seat');
  assert.equal(b.modelo, 'León 1.5 Tsi');
  assert.equal(b.km, '84320');
  assert.equal(b.sintoma, 'Frenos');
  assert.match(b.guiadas, /Pierde fuerza; Frena raro; Circulo, pero me preocupa/);
  assert.equal(b.cuando, 'Al frenar');
  assert.equal(b.codigos, 'P0299');
  assert.equal(b.web, '');
  assert.ok(b.rgpd && b.acepto);
  s.pre = { ok: true, titulo: 'Desgaste de frenos', gravedad: 'rojo' };
  assert.match(construirMensaje(s, { coches }), /Prediagnóstico Reyman Online: Desgaste de frenos \(no circular\)/);
});
