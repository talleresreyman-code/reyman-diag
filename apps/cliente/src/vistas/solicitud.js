// Reyman Connect · formulario de solicitud al taller (los cinco motivos de contacto)
// Una sola pantalla por motivo, con botones en vez de escribir. Al final se abre WhatsApp con el mensaje ya escrito.

import { st, DEMO, TALLER, persistir, pintar, ir } from '../estado.js';
import { $, esc, I, toast, abrirFuera, chips } from '../ui.js';
import {
  TIPOS, MANT, GAMAS, SINTOMAS, TESTIGOS, CUANDO_PASA, DESDE, CIRCULAR, PRESUPUESTO, PLAZO, SOBRE, ADMIN, CUANDO, ESPERA,
  nuevaSolicitud, cochesDisponibles, validar, construirMensaje, urlWhatsApp, pideCita, necesitaCoche, resumen, referencia,
  validarPrediagnostico, cuerpoReymanOnline, limpiaMovil,
} from '../solicitudes.js';
import { prediagnostico, fotoReducida, abrir } from '../cliente.js';
import { codigosRecientes } from './diagnostico.js';

/** Abre el formulario de un motivo (con el coche y las opciones ya marcadas, si se saben). */
export function abrirSolicitud(tipo, { coche = null, sel = [] } = {}) {
  const coches = cochesDisponibles(st.datos);
  const c = coche && coches.some((x) => x.id === coche) ? coche : coches.length === 1 ? coches[0].id : null;
  st.sol = nuevaSolicitud(tipo, { coche: c, sel });
  if (tipo === 'averia') st.sol.codigosAdaptador = codigosRecientes();
  if (tipo === 'consulta' && sel.includes('adaptador')) { st.sol.sel = []; st.sol.sobre = 'general'; st.sol.texto = 'Quiero el adaptador OBD para usarlo con Reyman Connect. ¿Cuándo puedo pasar a recogerlo?'; }
  ir('solicitud');
}

const INTRO = {
  mant: 'Marca lo que necesitas y cuándo te viene bien. Te confirmamos el día por WhatsApp.',
  averia: 'Cuéntanos qué notas con unos toques. Cuanto más sepamos, antes lo encontramos.',
  presupuesto: 'Dinos qué trabajo quieres presupuestar. Para darte un precio necesitamos marca, modelo, matrícula y km.',
  consulta: 'Pregúntanos lo que quieras, aunque sea de otro coche.',
  admin: 'Dinos de qué se trata y te respondemos por WhatsApp.',
};

const NOTAS = {
  mant: 'Algo más que debamos saber (opcional)',
  averia: '¿Algo más? Por ejemplo: «hace un ruido al girar a la derecha» (opcional)',
  presupuesto: '¿Qué trabajo quieres presupuestar?',
  consulta: 'Tu consulta',
  admin: 'Cuéntanos (nº de factura, importe…)',
};

const manana = () => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); };

function bloqueCoche(s, coches) {
  if (s.tipo === 'consulta') {
    if (s.sobre === 'mio') return seleccionCoche(s, coches, false);
    if (s.sobre === 'otro') {
      return `<section class="panel"><h2>¿Qué coche?</h2><div class="dos">
        <label class="campo"><span>Marca</span><input data-campo="otro.marca" value="${esc(s.otro.marca)}" autocapitalize="words"></label>
        <label class="campo"><span>Modelo</span><input data-campo="otro.modelo" value="${esc(s.otro.modelo)}" autocapitalize="words"></label>
        <label class="campo"><span>Km (si los sabes)</span><input data-campo="otro.km" value="${esc(s.otro.km)}" inputmode="numeric"></label>
      </div></section>`;
    }
    return '';
  }
  return necesitaCoche(s) ? seleccionCoche(s, coches, true) : '';
}

function seleccionCoche(s, coches, conOtro) {
  const lista = [...coches.map((c) => [c.id, `${c.nombre || 'Coche'}${c.matricula ? ` · ${c.matricula}` : ''}`]), ...(conOtro ? [['otro', coches.length ? 'Otro coche' : 'Escribir los datos del coche']] : [])];
  const c = coches.find((x) => x.id === s.coche);
  const kmObligatorio = s.tipo === 'presupuesto';
  return `<section class="panel"><h2>¿Qué coche?</h2>
    ${lista.length > 1 || !coches.length ? chips('coche', lista, s.coche) : `<p><strong>${esc(lista[0][1])}</strong></p>`}
    ${s.coche === 'otro' ? `<div class="dos">
      <label class="campo"><span>Marca</span><input data-campo="otro.marca" value="${esc(s.otro.marca)}" autocapitalize="words" placeholder="Seat"></label>
      <label class="campo"><span>Modelo</span><input data-campo="otro.modelo" value="${esc(s.otro.modelo)}" autocapitalize="words" placeholder="León 1.5 TSI"></label>
      <label class="campo"><span>Matrícula</span><input data-campo="otro.matricula" value="${esc(s.otro.matricula)}" autocapitalize="characters" maxlength="10" placeholder="1234ABC"></label>
      <label class="campo"><span>Km actuales${kmObligatorio ? '' : ' (si los sabes)'}</span><input data-campo="otro.km" value="${esc(s.otro.km)}" inputmode="numeric"></label>
      ${s.tipo === 'averia' ? `<label class="campo"><span>Año (si lo sabes)</span><input data-campo="otro.anio" value="${esc(s.otro.anio)}" inputmode="numeric" maxlength="4"></label>` : ''}
    </div>` : ''}
    ${s.coche && s.coche !== 'otro' ? `<label class="campo"><span>Km actuales${kmObligatorio ? '' : ' (si los sabes)'}</span><input data-campo="km" value="${esc(s.km)}" inputmode="numeric" placeholder="${c?.km ? `En la última visita: ${c.km.toLocaleString('es-ES')}` : ''}"></label>` : ''}
  </section>`;
}

function bloqueTipo(s) {
  if (s.tipo === 'mant') {
    return `<section class="panel"><h2>¿Qué necesitas?</h2><p class="peq suave">Puedes marcar varias cosas.</p>${chips('sel', MANT, s.sel, { multiple: true })}
      ${s.sel.includes('neumaticos') ? `<div class="sub-bloque"><p class="etq">Neumáticos</p>
        <label class="campo"><span>Medida (si la sabes, está en el lateral de la rueda)</span><input data-campo="neumaticos.medida" value="${esc(s.neumaticos.medida)}" placeholder="205/55 R16 91V" autocapitalize="characters"></label>
        <p class="peq">¿Cuántas?</p>${chips('cantidad', [['2', '2'], ['4', '4'], ['1', '1']], s.neumaticos.cantidad)}
        <p class="peq">Gama</p>${chips('gama', GAMAS, s.neumaticos.gama)}
        <p class="peq suave">Los pedimos para el día siguiente: te damos cita en cuanto lleguen.</p></div>` : ''}
    </section>`;
  }
  if (s.tipo === 'averia') {
    return `<section class="panel"><h2>¿Qué notas?</h2>${chips('sel', SINTOMAS, s.sel, { multiple: true })}
      ${s.sel.includes('testigo') ? `<div class="sub-bloque"><p class="etq">¿Qué testigo?</p>${chips('testigos', TESTIGOS, s.testigos, { multiple: true })}</div>` : ''}
    </section>
    <section class="panel"><h2>¿Cuándo pasa?</h2>${chips('pasa', CUANDO_PASA, s.pasa, { multiple: true })}
      <p class="peq" style="margin-top:10px">¿Desde cuándo?</p>${chips('desde', DESDE, s.desde)}</section>
    <section class="panel"><h2>¿Puedes circular con él?</h2>${chips('circular', CIRCULAR, s.circular)}
      ${s.circular === 'no' ? '<div class="aviso ambar" style="margin-top:10px">Si tiene que venir en grúa, <strong>háblalo antes con nosotros</strong>. Mientras tanto, que la asistencia lo guarde hasta poder entregarlo en el taller.</div>' : ''}
      ${s.sel.includes('testigo') && s.testigos.some((t) => ['aceite', 'temperatura', 'frenos'].includes(t)) ? '<div class="aviso rojo" style="margin-top:10px">Con el testigo de aceite, temperatura o frenos en rojo, <strong>para en cuanto puedas</strong> y no sigas circulando.</div>' : ''}
    </section>`;
  }
  if (s.tipo === 'presupuesto') {
    return `<section class="panel"><h2>¿Qué quieres presupuestar?</h2>${chips('sel', PRESUPUESTO, s.sel, { multiple: true })}</section>
      <section class="panel"><h2>¿Para qué lo quieres?</h2>${chips('plazo', PLAZO, s.plazo)}</section>`;
  }
  if (s.tipo === 'consulta') return `<section class="panel"><h2>¿Sobre qué es?</h2>${chips('sobre', SOBRE, s.sobre)}</section>`;
  if (s.tipo === 'admin') {
    return `${st.datos.cliente ? `<button class="panel aviso-taller azul" data-ir="docs"><strong>${I.factura} Tus facturas y presupuestos</strong><span class="peq">Desde 2024 los tienes en Documentos, listos para descargar.</span></button>` : ''}
      <section class="panel"><h2>¿De qué se trata?</h2>${chips('sel', ADMIN, s.sel, { multiple: true })}
      ${s.sel.includes('financiar') ? '<p class="peq suave" style="margin-top:8px">Podemos financiar la reparación. Te explicamos las condiciones por WhatsApp.</p>' : ''}</section>`;
  }
  return '';
}

function bloqueCuando(s) {
  if (!pideCita(s)) return '';
  return `<section class="panel"><h2>¿Cuándo te viene bien?</h2>${chips('cuando', CUANDO, s.cuando)}
    ${s.cuando === 'dia' ? `<label class="campo" style="margin-top:10px"><span>Día</span><input type="date" data-campo="dia" data-repintar="1" min="${manana()}" value="${esc(s.dia)}"></label>` : ''}
    ${s.tipo === 'mant' ? `<p class="peq" style="margin-top:10px">¿Dejas el coche o esperas?</p>${chips('espera', ESPERA, s.espera)}` : ''}
    <label class="check" style="margin-top:10px"><input type="checkbox" data-campo="sustitucion" ${s.sustitucion ? 'checked' : ''}> <span>Necesitaría coche de sustitución <span class="peq suave">(según disponibilidad)</span></span></label>
    <p class="peq suave">Los coches se reciben de 8:00 a 9:30. Te confirmamos el día por WhatsApp.</p>
  </section>`;
}

const SEMAFORO = { rojo: ['rojo', 'No circules'], amarillo: ['ambar', 'Revísalo pronto'], verde: ['verde', 'Sin urgencia'] };

/** Prediagnóstico gratis con Reyman Online, con los datos del cliente y del coche ya puestos. */
function bloquePrediagnostico(s) {
  const c = st.datos.contacto || {};
  if (s.pre) {
    const p = s.pre;
    const [color, txt] = SEMAFORO[p.gravedad] || ['azul', ''];
    return `<section class="panel prediag ${color}">
      <p class="etq">Prediagnóstico Reyman Online</p>
      ${p.fuera_de_ambito ? '' : `<span class="insignia ${color}">${esc(txt)}</span>`}
      ${p.aviso ? `<div class="aviso rojo" style="margin-top:10px"><strong>${esc(p.aviso)}</strong></div><a class="btn ancho" style="margin-top:10px" href="tel:${esc(TALLER.telefono.replace(/\s/g, ''))}">${I.tel} Llamar al taller</a>` : ''}
      ${p.titulo ? `<h2 style="margin-top:10px">${esc(p.titulo)}</h2>` : ''}
      ${p.explicacion ? `<p>${esc(p.explicacion)}</p>` : ''}
      ${p.causas?.length ? `<p class="peq"><strong>Causas más habituales</strong></p><ul class="peq">${p.causas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${p.consejo ? `<p class="peq"><strong>Mientras tanto:</strong> ${esc(p.consejo)}</p>` : ''}
      ${p.precio ? `<p class="peq"><strong>${esc(p.precio)}</strong></p>` : ''}
      ${p.diagnosis ? `<p class="peq">${esc(p.diagnosis)}</p>` : ''}
      ${p.legal ? `<p class="peq suave">${esc(p.legal)}</p>` : ''}
      <p class="peq">¿Lo traes? Elige el día y pide cita aquí abajo.</p>
    </section>`;
  }
  return `<section class="panel prediag">
    <h2>¿Qué puede ser? · Prediagnóstico gratis</h2>
    <p class="peq suave">Te orientamos sobre la avería y lo urgente que es en unos 20 segundos. Lo hace Reyman Online, nuestra IA, y nos llega también al taller.</p>
    <div class="dos">
      <label class="campo"><span>Tu nombre</span><input data-campo="contacto.nombre" autocomplete="name" value="${esc(c.nombre || '')}"></label>
      <label class="campo"><span>Tu móvil</span><input data-campo="contacto.telefono" type="tel" autocomplete="tel" inputmode="tel" value="${esc(c.telefono || '')}"></label>
    </div>
    <label class="check"><input type="checkbox" data-campo="rgpd" ${s.rgpd ? 'checked' : ''}> <span class="peq">He leído y acepto la <button type="button" class="enlace" id="ver-privacidad">política de privacidad</button>. Talleres Reyman usa estos datos solo para atender tu consulta.</span></label>
    <label class="check"><input type="checkbox" data-campo="acepto" ${s.acepto ? 'checked' : ''}> <span class="peq">Entiendo que es un prediagnóstico orientativo hecho con inteligencia artificial: el presupuesto en firme se hace en el taller.</span></label>
    <div id="pre-error" role="alert"></div>
    ${s.cargandoPre ? '<div class="progreso" role="status"><span class="giro"></span>Analizando tu consulta… (unos 20 segundos)</div>' : '<button class="btn ancho" id="pre-pedir">Ver qué puede ser</button>'}
  </section>`;
}

export function vSolicitud() {
  const s = st.sol;
  if (!s) return '';
  if (s.enviada) return vEnviada(s);
  const t = TIPOS[s.tipo];
  const coches = cochesDisponibles(st.datos);
  const pideNombre = !st.datos.cliente && !st.datos.contacto?.nombre;
  const codigos = s.tipo === 'averia' ? s.codigosAdaptador || [] : [];
  return `<h1>${esc(t.titulo)}</h1>
    <p class="suave">${esc(INTRO[s.tipo])}</p>
    ${bloqueCoche(s, coches)}
    ${bloqueTipo(s)}
    ${codigos.length ? `<label class="check panel"><input type="checkbox" data-campo="codigos" ${s.codigos ? 'checked' : ''}> <span>Enviar también los códigos que ha leído el adaptador: <strong>${esc(codigos.join(', '))}</strong></span></label>` : ''}
    <section class="panel">
      ${pideNombre && s.tipo !== 'averia' ? `<label class="campo"><span>Tu nombre</span><input data-campo="nombre" autocomplete="name" value="${esc(s.nombre || '')}"></label>` : ''}
      <label class="campo"><span>${esc(NOTAS[s.tipo])}</span><textarea data-campo="texto" rows="3" maxlength="1000">${esc(s.texto)}</textarea></label>
      ${s.tipo === 'averia' ? `<p class="etq" style="margin-top:6px">Foto del cuadro o de la avería (opcional)</p>
        ${s.foto ? `<div class="foto-prev"><img src="${esc(s.foto)}" alt="Foto adjunta"><button type="button" class="enlace" id="foto-quitar">Quitar</button></div>` : '<label class="btn fantasma ancho foto-btn"><input type="file" accept="image/*" capture="environment" id="foto" hidden> Hacer o subir una foto</label>'}` : ''}
    </section>
    ${s.tipo === 'averia' ? bloquePrediagnostico(s) : ''}
    ${bloqueCuando(s)}
    ${s.tipo === 'averia' ? '<p class="peq suave">En WhatsApp puedes añadir un vídeo o una nota de voz con el ruido: nos ayuda mucho. La diagnosis con máquina tiene coste (orientativo, unos 60 €) y te lo confirmamos antes de hacer nada.</p>' : ''}
    <div id="sol-error" role="alert"></div>
    <button class="btn grande wa" id="sol-enviar">${I.wa} ${s.tipo === 'averia' || s.tipo === 'mant' ? 'Pedir cita por WhatsApp' : 'Enviar por WhatsApp'}</button>
    <p class="peq suave centrado" style="margin-top:8px">Se abre WhatsApp con el mensaje escrito. Solo tienes que pulsar «Enviar».</p>
    ${DEMO ? '<details class="peq"><summary>Ver el mensaje</summary><pre class="previa" id="sol-previa"></pre></details>' : ''}`;
}

function mensaje(s) {
  return construirMensaje(s, {
    coches: cochesDisponibles(st.datos),
    cliente: st.datos.contacto?.nombre || s.nombre || '',
    codigos: s.codigosAdaptador || [],
  });
}

function vEnviada(s) {
  return `<section class="panel enviado">
    <div class="ok-icono" aria-hidden="true">✓</div>
    <h1>Ya casi está</h1>
    <p>Pulsa <strong>«Enviar»</strong> en WhatsApp. Te contestamos lo antes posible en horario de taller.</p>
    <p class="peq suave">${esc(TALLER.horario)}</p>
    <div class="fila-btn col">
      <button class="btn" id="sol-inicio">Volver al inicio</button>
      <button class="btn fantasma" id="sol-otra">No se ha abierto WhatsApp</button>
    </div>
    <div id="sol-plan-b" hidden>
      <p class="peq">Copia el mensaje y pégalo en WhatsApp, o llámanos:</p>
      <pre class="previa">${esc(s.texto_enviado)}</pre>
      <div class="fila-btn"><button class="btn sec" id="sol-copiar">Copiar el mensaje</button><a class="btn sec" href="tel:${esc(TALLER.telefono.replace(/\s/g, ''))}">${I.tel} Llamar</a></div>
    </div>
  </section>`;
}

function poner(obj, ruta, valor) {
  const p = ruta.split('.');
  let o = obj;
  for (const k of p.slice(0, -1)) o = o[k];
  o[p.at(-1)] = valor;
}

export function eSolicitud(el) {
  const s = st.sol;
  if (!s) return;
  if (s.enviada) {
    $('#sol-inicio', el)?.addEventListener('click', () => { st.sol = null; ir('inicio'); });
    $('#sol-otra', el)?.addEventListener('click', () => { $('#sol-plan-b', el).hidden = false; });
    $('#sol-copiar', el)?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(s.texto_enviado); toast('Mensaje copiado.'); } catch { toast('No se ha podido copiar.'); }
    });
    return;
  }
  const previa = () => { const p = $('#sol-previa', el); if (p) p.textContent = mensaje(s); };
  previa();
  el.querySelectorAll('[data-chips]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const nombre = g.dataset.chips; const v = b.dataset.valor; const multiple = g.dataset.multiple === '1';
    const ruta = { cantidad: 'neumaticos.cantidad', gama: 'neumaticos.gama' }[nombre] || nombre;
    if (multiple) { const arr = s[ruta]; const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); } else {
      const actual = ruta.split('.').reduce((o, k) => o[k], s);
      poner(s, ruta, actual === v && !['coche', 'sobre', 'plazo', 'cuando', 'espera'].includes(nombre) ? null : v);
    }
    if (nombre === 'sobre') s.coche = v === 'otro' ? 'otro' : v === 'mio' ? (cochesDisponibles(st.datos).length === 1 ? cochesDisponibles(st.datos)[0].id : null) : null;
    pintar();
  }));
  el.querySelectorAll('[data-campo]').forEach((i) => {
    const ev = i.type === 'checkbox' || i.type === 'date' ? 'change' : 'input';
    i.addEventListener(ev, () => {
      const ruta = i.dataset.campo;
      if (ruta.startsWith('contacto.')) { st.datos.contacto = { ...(st.datos.contacto || {}), [ruta.slice(9)]: i.value }; persistir(); } else poner(s, ruta, i.type === 'checkbox' ? i.checked : i.value);
      if (i.dataset.repintar) pintar(); else previa();
    });
  });
  $('#ver-privacidad', el)?.addEventListener('click', () => abrir('https://talleresreyman.com/politica-de-privacidad'));
  $('#foto', el)?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { s.foto = await fotoReducida(f); pintar(); } catch (err) { toast(err.message); }
  });
  $('#foto-quitar', el)?.addEventListener('click', () => { s.foto = null; pintar(); });
  $('#pre-pedir', el)?.addEventListener('click', async () => {
    const coches = cochesDisponibles(st.datos);
    const c = st.datos.contacto || {};
    const err = validarPrediagnostico(s, coches, c);
    if (err) { const caja = $('#pre-error', el); caja.innerHTML = `<div class="aviso rojo" style="margin-bottom:10px">${esc(err)}</div>`; caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    st.datos.contacto = { ...c, telefono: limpiaMovil(c.telefono) };
    await persistir();
    s.cargandoPre = true; pintar();
    try {
      s.pre = await prediagnostico(cuerpoReymanOnline(s, { coches, nombre: c.nombre, telefono: c.telefono, codigos: s.codigosAdaptador || [], foto: s.foto }), { demo: DEMO });
    } catch (e2) { toast(e2.message); }
    s.cargandoPre = false; pintar();
    $('.prediag', document)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#sol-enviar', el)?.addEventListener('click', async () => {
    const coches = cochesDisponibles(st.datos);
    const err = validar(s, coches) || (s.tipo === 'admin' && s.sel.includes('otro') && !s.texto.trim() ? 'Cuéntanos de qué se trata.' : null);
    if (err) {
      const caja = $('#sol-error', el);
      caja.innerHTML = `<div class="aviso rojo">${esc(err)}</div>`;
      caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (s.nombre && !st.datos.contacto?.nombre) st.datos.contacto = { ...(st.datos.contacto || {}), nombre: s.nombre.trim() };
    const texto = mensaje(s);
    st.datos.solicitudes = [{ fecha: new Date().toISOString(), tipo: s.tipo, resumen: resumen(s, coches), ref: referencia() }, ...(st.datos.solicitudes || [])].slice(0, 20);
    await persistir();
    s.enviada = true;
    s.texto_enviado = texto;
    if (DEMO) toast('Demostración: aquí se abriría WhatsApp.'); else abrirFuera(urlWhatsApp(texto, TALLER.whatsapp));
    pintar();
    window.scrollTo(0, 0);
  });
}
