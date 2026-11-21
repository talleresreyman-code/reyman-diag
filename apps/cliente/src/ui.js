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
