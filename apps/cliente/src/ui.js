// Reyman Connect · utilidades de pantalla (formato, iconos, avisos y diálogos)

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtFechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtKm = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString('es-ES')} km` : '—');
export const fmtV = (v) => (Number.isFinite(v) ? `${v.toFixed(1).replace('.', ',')} V` : '—');
export const nombreCorto = (n) => String(n || '').split(/\s+/)[0] || '';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const I = {
  inicio: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  coche: svg('<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z"/>'),
  docs: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  diag: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  averias: svg('<path d="M5 12a7 7 0 0 1 14 0v3H5z"/><path d="M3 18h18M12 8v3"/>'),
  bateria: svg('<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V5h3v2M14 7V5h3v2M7 13h3M15.5 11.5v3M14 13h3"/>'),
  mant: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  alerta: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  euro: svg('<path d="M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9"/>'),
  charla: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.3 2-2.3 3.1M12 17h.01"/>'),
  factura: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  bt: svg('<path d="M7 7l10 10-5 5V2l5 5L7 17"/>'),
  tel: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  wa: svg('<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>'),
  mapa: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  atras: svg('<path d="M15 18l-6-6 6-6"/>'),
  flecha: svg('<path d="M9 18l6-6-6-6"/>'),
};

export function toast(txt) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = txt;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function dialogo(html) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" class="dlg">${html}</form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}

export function nivelColor(n) {
  return { parar: 'rojo', urgente: 'rojo', vencida: 'rojo', descargada: 'rojo', debil: 'rojo', baja: 'ambar', taller: 'ambar', aviso: 'ambar', pronto: 'ambar', justa: 'ambar', aceptable: 'ambar', vigilar: 'amarillo', info: 'azul' }[n] || 'verde';
}

export function avisoLista(avisos) {
  if (!avisos.length) return '';
  return `<ul class="avisos">${avisos.map((a) => `<li class="aviso ${nivelColor(a.nivel)}">${esc(a.texto)}</li>`).join('')}</ul>`;
}

/** Abre WhatsApp, el teléfono o el mapa fuera de la app (igual que un enlace normal). */
export function abrirFuera(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Grupo de botones de elección (uno o varios). */
export function chips(nombre, lista, elegidos, { multiple = false } = {}) {
  const sel = new Set([].concat(elegidos ?? []));
  return `<div class="chips" role="group" data-chips="${esc(nombre)}" data-multiple="${multiple ? 1 : 0}">${lista.map(([k, t]) => `<button type="button" class="chip" data-valor="${esc(k)}" aria-pressed="${sel.has(k)}">${esc(t)}</button>`).join('')}</div>`;
}

// Iconos rellenos de los cinco motivos (formas de Material Icons / Material Design Icons, licencia Apache 2.0)
const relleno = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
export const IM = {
  mant: relleno('M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z'),
  averia: relleno('M7 4v2h3v2H7l-2 2v3H3v-3H1v8h2v-3h2v3h3l2 2h8v-4h2v3h3V9h-3v3h-2V8h-6V6h3V4z'),
  presupuesto: relleno('M15 18.5c-2.51 0-4.68-1.42-5.76-3.5H15l1-2H8.58c-.05-.33-.08-.66-.08-1s.03-.67.08-1H15l1-2H9.24C10.32 6.92 12.5 5.5 15 5.5c1.61 0 3.09.59 4.23 1.57L21 5.3C19.41 3.87 17.3 3 15 3c-3.92 0-7.24 2.51-8.48 6H3l-1 2h4.06c-.04.33-.06.66-.06 1s.02.67.06 1H3l-1 2h4.52c1.24 3.49 4.56 6 8.48 6 2.31 0 4.41-.87 6-2.3l-1.78-1.77c-1.13.98-2.6 1.57-4.22 1.57z'),
  consulta: relleno('M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-3.5h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z'),
  admin: relleno('M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z'),
};
