// Reyman Connect · condiciones de la primera vez y pantalla de bloqueo (Face ID / huella / código)

import { st, persistir, pintar, TALLER } from '../estado.js';
import { $, esc, I, toast } from '../ui.js';
import { abrir } from '../cliente.js';
import { borrarFicha } from '../almacen.js';
import { VERSION_CONDICIONES, verificar, proteccionDisponible } from '../seguridad.js';

export const URL_PRIVACIDAD = 'https://talleresreyman.com/politica-de-privacidad';

// ---------------------------------------------------------------------------
// Primera vez: condiciones de uso, privacidad e inteligencia artificial
// ---------------------------------------------------------------------------
export function pintarCondiciones(raiz) {
  const c = st.condiciones || (st.condiciones = { privacidad: false, ia: false });
  const cambio = !!st.datos.consentimiento; // ya las aceptó antes: han cambiado
  raiz.innerHTML = `<div class="bienvenida condiciones">
    <img class="logo-b" src="${esc(globalThis.REYMAN_LOGO || 'logo.png')}" alt="Talleres Reyman">
    <h1>${cambio ? 'Hemos actualizado las condiciones' : 'Antes de empezar'}</h1>
    <p class="sub">Léelo con calma: son tres cosas.</p>
    <div class="panel">
      <h2>🔒 Tus datos</h2>
      <p class="peq">Reyman Connect es la app de ${esc(TALLER.nombre)}, S.L. (Arganda del Rey). Si añades tu ficha del taller, tus datos (nombre, móvil, coches y documentos) se usan solo para atenderte y gestionar tus reparaciones.</p>
      <p class="peq">En este móvil se guardan <strong>cifrados y protegidos con Face ID, huella o el código del móvil</strong>. Puedes quitarlos cuando quieras.</p>
      <button class="enlace" id="c-politica" type="button">Leer la política de privacidad</button>
    </div>
    <div class="panel">
      <h2>🤖 Inteligencia artificial</h2>
      <p class="peq">El prediagnóstico de averías y el asistente de WhatsApp del taller usan inteligencia artificial. Sus respuestas son <strong>orientativas</strong>: el diagnóstico y el presupuesto en firme los hace siempre el taller, viendo el coche.</p>
    </div>
    <div class="panel">
      <h2>📱 Cómo funciona</h2>
      <p class="peq">La app es gratis. Lo que nos pidas se envía por WhatsApp desde tu móvil. El adaptador para el coche es opcional.</p>
    </div>
    <div class="panel">
      <label class="check"><input type="checkbox" id="c-priv" ${c.privacidad ? 'checked' : ''}> <span>He leído y acepto la política de privacidad</span></label>
      <label class="check"><input type="checkbox" id="c-ia" ${c.ia ? 'checked' : ''}> <span>Entiendo y acepto el uso de la inteligencia artificial en estas funciones</span></label>
      <button class="btn grande" id="c-aceptar" ${c.privacidad && c.ia ? '' : 'disabled'}>Aceptar y continuar</button>
    </div>
  </div>`;
  $('#c-politica', raiz).addEventListener('click', () => abrir(URL_PRIVACIDAD));
  $('#c-priv', raiz).addEventListener('change', (e) => { c.privacidad = e.target.checked; $('#c-aceptar', raiz).disabled = !(c.privacidad && c.ia); });
  $('#c-ia', raiz).addEventListener('change', (e) => { c.ia = e.target.checked; $('#c-aceptar', raiz).disabled = !(c.privacidad && c.ia); });
  $('#c-aceptar', raiz).addEventListener('click', async () => {
    if (!(c.privacidad && c.ia)) return;
    st.datos.consentimiento = { version: VERSION_CONDICIONES, fecha: new Date().toISOString(), privacidad: true, ia: true };
    st.condiciones = null;
    await persistir();
    pintar();
  });
}

// ---------------------------------------------------------------------------
// Bloqueo
// ---------------------------------------------------------------------------
let desbloqueando = false;

/** Pide Face ID / huella / código. Si va bien, abre la app y avisa con alAbrir(). */
export async function desbloquear(alAbrir = () => {}) {
  if (desbloqueando) return;
  desbloqueando = true;
  st.errorBloqueo = null;
  try {
    const p = await proteccionDisponible();
    if (!p.disponible) {
      // Han quitado el código o la huella del móvil: la ficha ya no se puede proteger, se borra
      await borrarFicha(st.datos);
      st.bloqueada = false;
      toast('Tu móvil ya no tiene Face ID, huella ni código: hemos quitado tu ficha de la app por seguridad.');
      pintar();
      return;
    }
    const r = await verificar('Para abrir tu ficha de Talleres Reyman');
    if (r.ok) {
      st.bloqueada = false;
      if (st.datos.cliente) st.datos.cliente.ultimoUso = new Date().toISOString();
      await persistir();
      pintar();
      alAbrir();
    } else {
      st.errorBloqueo = r.cancelado ? null : r.bloqueado ? 'Demasiados intentos. Desbloquea primero el móvil y vuelve a probar.' : 'No se ha podido comprobar que eres tú.';
      pintar();
    }
  } finally { desbloqueando = false; }
}

export function pintarBloqueo(raiz, alAbrir) {
  raiz.innerHTML = `<div class="bienvenida bloqueo">
    <img class="logo-b" src="${esc(globalThis.REYMAN_LOGO || 'logo.png')}" alt="Talleres Reyman">
    <h1>Tu ficha está protegida</h1>
    <p class="sub">Para verla, confirma que eres tú.</p>
    <div class="panel">
      ${st.errorBloqueo ? `<div class="aviso rojo" role="alert" style="margin-bottom:12px">${esc(st.errorBloqueo)}</div>` : ''}
      <button class="btn grande" id="k-abrir">🔓 Desbloquear</button>
      <p class="peq suave centrado" style="margin-top:10px">Con Face ID, huella o el código de tu móvil.</p>
    </div>
    <div class="panel">
      <a class="btn sec ancho" href="https://wa.me/${esc(TALLER.whatsapp)}" target="_blank" rel="noopener">${I.wa} Escribir al taller por WhatsApp</a>
      <button class="enlace centrado" id="k-quitar" style="margin-top:10px">Quitar mi ficha de este móvil</button>
    </div>
  </div>`;
  $('#k-abrir', raiz).addEventListener('click', () => desbloquear(alAbrir));
  $('#k-quitar', raiz).addEventListener('click', async () => {
    if (!confirm('¿Quitar tu ficha de este móvil? La app seguirá funcionando y podrás volver a añadirla con tu enlace de WhatsApp.')) return;
    await borrarFicha(st.datos);
    st.bloqueada = false;
    toast('Ficha quitada de este móvil.');
    pintar();
  });
}
