// Reyman Diag · Gráfica del visor de grabaciones (canvas, sin librerías)
// Una pista por dato, con el mismo eje de tiempo; cursor que enseña todos los valores en ese instante;
// zoom con la rueda, arrastrando una zona (ratón) o con dos dedos (pantalla táctil); mapa de toda la grabación abajo.

import { reducir, valorEn, duracion, textoTiempo } from '@reyman/obd-core/visor.js';
import { formatear } from './grafica.js';

export const COLORES = ['#1d57a5', '#c0392b', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
const IZQ = 54; // margen para la escala
const DER = 10;

export function crearVisor(raiz, modelo, { seleccion = [], alCambiar = () => {} } = {}) {
  const css = getComputedStyle(document.documentElement);
  const cLinea = css.getPropertyValue('--linea').trim() || '#d8dde5';
  const cGris = css.getPropertyValue('--gris').trim() || '#666';
  const cTexto = css.getPropertyValue('--asfalto').trim() || '#232a33';
  const fuente = 'Barlow, system-ui, sans-serif';
  const total = Math.max(duracion(modelo), 1);
  const st = {
    sel: seleccion.length ? seleccion.slice() : modelo.canales.slice(0, 4).map((c) => c.clave),
    t0: 0, t1: total, cursor: null, banda: null, punteros: new Map(), pinza: null,
  };

  raiz.innerHTML = `<div class="vg">
    <div class="vg-barra">
      <span class="vg-tiempo" aria-live="polite">—</span>
      <span class="vg-botones">
        <button type="button" class="btn fantasma" data-a="izq" title="Atrás" aria-label="Atrás">◀</button>
        <button type="button" class="btn fantasma" data-a="menos" title="Alejar" aria-label="Alejar">−</button>
        <button type="button" class="btn fantasma" data-a="mas" title="Acercar" aria-label="Acercar">+</button>
        <button type="button" class="btn fantasma" data-a="der" title="Adelante" aria-label="Adelante">▶</button>
        <button type="button" class="btn fantasma" data-a="todo">Todo</button>
      </span>
    </div>
    <canvas class="vg-pistas" tabindex="0" aria-label="Gráfica de los datos grabados. Flechas: mover el cursor; + y −: zoom."></canvas>
    <canvas class="vg-mapa" aria-hidden="true"></canvas>
    <p class="peq suave vg-ayuda">Ratón: mueve para ver los valores, arrastra para ampliar una zona, rueda para zoom, doble clic para verlo todo. Táctil: toca o desliza para el cursor, dos dedos para zoom. Abajo, toca el mapa para ir a otra zona.</p>
  </div>`;
  const cv = raiz.querySelector('.vg-pistas');
  const mapa = raiz.querySelector('.vg-mapa');
  const lblT = raiz.querySelector('.vg-tiempo');
  const movil = () => (cv.clientWidth || 600) < 560;
  const altoPista = () => (movil() ? 92 : 108);
  const EJE = 22;

  const canal = (k) => modelo.canales.find((c) => c.clave === k);
  const color = (k) => COLORES[modelo.canales.findIndex((c) => c.clave === k) % COLORES.length];

  function preparar(c, w, h) {
    const dpr = window.devicePixelRatio || 1;
    c.style.height = `${h}px`;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  const ancho = () => cv.clientWidth || raiz.clientWidth || 600;
  const X = (t, w = ancho()) => IZQ + ((t - st.t0) / (st.t1 - st.t0)) * (w - IZQ - DER);
  const T = (x, w = ancho()) => st.t0 + ((x - IZQ) / (w - IZQ - DER)) * (st.t1 - st.t0);

  function marcas(t0, t1, n) {
    const paso0 = (t1 - t0) / n;
    const pasos = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000];
    const paso = pasos.find((p) => p >= paso0) || pasos[pasos.length - 1];
    const out = [];
    for (let t = Math.ceil(t0 / paso) * paso; t <= t1; t += paso) out.push(t);
    return { out, paso };
  }

  function pintar() {
    const w = ancho();
    const hp = altoPista();
    const n = st.sel.length;
    const h = Math.max(n, 1) * hp + EJE;
    const ctx = preparar(cv, w, h);
    ctx.font = `12px ${fuente}`;
    const px = Math.max(50, Math.round(w - IZQ - DER));
    const { out: ticks } = marcas(st.t0, st.t1, Math.max(3, Math.floor((w - IZQ) / 90)));
    if (!n) {
      ctx.fillStyle = cGris; ctx.font = `15px ${fuente}`;
      ctx.fillText('Elige arriba los datos que quieres ver.', IZQ, hp / 2);
    }
    st.sel.forEach((k, i) => {
      const c = canal(k);
      if (!c) return;
      const y0 = i * hp;
      const arriba = y0 + 22;
      const abajo = y0 + hp - 8;
      const pts = reducir(modelo, k, st.t0, st.t1, px);
      let lo = Infinity; let hi = -Infinity;
      for (const p of pts) if (p) { if (p[1] < lo) lo = p[1]; if (p[2] > hi) hi = p[2]; }
      if (lo === Infinity) { lo = 0; hi = 1; }
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const marg = (hi - lo) * 0.08;
      lo -= marg; hi += marg;
      const Y = (v) => abajo - ((v - lo) / (hi - lo)) * (abajo - arriba);
      // Fondo, rejilla y escala
      ctx.strokeStyle = cLinea; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0 + hp - 0.5); ctx.lineTo(w, y0 + hp - 0.5); ctx.stroke();
      ctx.setLineDash([2, 4]);
      for (const t of ticks) { const x = Math.round(X(t, w)) + 0.5; ctx.beginPath(); ctx.moveTo(x, arriba); ctx.lineTo(x, abajo); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.fillStyle = cGris; ctx.font = `11px ${fuente}`;
      for (const v of [hi - marg, (hi + lo) / 2, lo + marg]) {
        const y = Y(v);
        ctx.beginPath(); ctx.strokeStyle = cLinea; ctx.moveTo(IZQ - 4, y); ctx.lineTo(IZQ, y); ctx.stroke();
        ctx.fillText(formatear(v), 2, y + 4);
      }
      // Línea (con mín./máx. por columna para no perder picos), recortada a su pista
      ctx.save();
      ctx.beginPath(); ctx.rect(IZQ, y0, w - IZQ, hp); ctx.clip();
      ctx.strokeStyle = color(k); ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      ctx.beginPath();
      let dentro = false;
      for (const p of pts) {
        if (!p) { dentro = false; continue; }
        const x = X(p[0], w);
        if (!dentro) { ctx.moveTo(x, Y(p[1])); dentro = true; } else ctx.lineTo(x, Y(p[1]));
        if (p[2] !== p[1]) ctx.lineTo(x, Y(p[2]));
      }
      ctx.stroke();
      ctx.restore();
      // Nombre y valor en el cursor
      ctx.font = `600 13px ${fuente}`; ctx.fillStyle = color(k);
      ctx.fillRect(IZQ, y0 + 7, 10, 3);
      ctx.fillStyle = cTexto;
      const val = st.cursor !== null ? valorEn(modelo, k, st.cursor) : null;
      const textoVal = st.cursor !== null ? `${formatear(val)} ${c.unidad || ''}`.trim() : c.unidad || '';
      ctx.fillText(recortarTexto(ctx, c.nombre, w - IZQ - 150), IZQ + 16, y0 + 14);
      ctx.font = `700 14px ${fuente}`;
      const tw = ctx.measureText(textoVal).width;
      ctx.fillText(textoVal, w - DER - tw, y0 + 15);
      if (st.cursor !== null && val !== null) {
        ctx.fillStyle = color(k);
        ctx.beginPath(); ctx.arc(X(st.cursor, w), Y(val), 3.5, 0, Math.PI * 2); ctx.fill();
      }
    });
    // Marcas de eventos
    for (const e of modelo.eventos) {
      if (e.t < st.t0 || e.t > st.t1) continue;
      const x = Math.round(X(e.t, w)) + 0.5;
      ctx.strokeStyle = '#d35400'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - EJE); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#d35400'; ctx.font = `600 11px ${fuente}`;
      const txt = recortarTexto(ctx, e.detalle || e.tipo, 160);
      ctx.fillText(txt, Math.min(x + 4, w - ctx.measureText(txt).width - 2), h - EJE - 4);
    }
    // Eje de tiempo
    ctx.fillStyle = cGris; ctx.font = `11px ${fuente}`;
    for (const t of ticks) {
      const x = X(t, w);
      const txt = textoTiempo(t, { decimas: st.t1 - st.t0 < 20000 });
      ctx.fillText(txt, Math.max(IZQ, Math.min(x - ctx.measureText(txt).width / 2, w - ctx.measureText(txt).width)), h - 6);
    }
    // Cursor y banda de selección
    if (st.cursor !== null && st.cursor >= st.t0 && st.cursor <= st.t1) {
      const x = Math.round(X(st.cursor, w)) + 0.5;
      ctx.strokeStyle = cTexto; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - EJE); ctx.stroke();
    }
    if (st.banda) {
      const [a, b] = [Math.min(...st.banda), Math.max(...st.banda)];
      ctx.fillStyle = 'rgba(29, 87, 165, .12)'; ctx.fillRect(a, 0, b - a, h - EJE);
    }
    lblT.textContent = st.cursor !== null
      ? `${textoTiempo(st.cursor)}${hora(st.cursor)} · viendo ${textoTiempo(st.t1 - st.t0)} de ${textoTiempo(total)}`
      : `Viendo ${textoTiempo(st.t1 - st.t0)} de ${textoTiempo(total)}`;
    pintarMapa();
    alCambiar({ t0: st.t0, t1: st.t1, cursor: st.cursor, sel: st.sel.slice() });
  }

  function hora(t) {
    if (!modelo.inicio) return '';
    const d = new Date(new Date(modelo.inicio).getTime() + t);
    return Number.isNaN(d.getTime()) ? '' : ` (${d.toLocaleTimeString('es-ES')})`;
  }

  function pintarMapa() {
    const w = mapa.clientWidth || ancho();
    const h = 40;
    const ctx = preparar(mapa, w, h);
    const k = st.sel[0] || modelo.canales[0]?.clave;
    const Xm = (t) => IZQ + (t / total) * (w - IZQ - DER);
    ctx.fillStyle = 'rgba(0,0,0,.035)'; ctx.fillRect(IZQ, 0, w - IZQ - DER, h);
    if (k) {
      const pts = reducir(modelo, k, 0, total, Math.round(w - IZQ - DER));
      let lo = Infinity; let hi = -Infinity;
      for (const p of pts) if (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[2]); }
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const Y = (v) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
      ctx.strokeStyle = cGris; ctx.lineWidth = 1; ctx.beginPath();
      let dentro = false;
      for (const p of pts) { if (!p) { dentro = false; continue; } const x = Xm(p[0]); if (!dentro) { ctx.moveTo(x, Y(p[1])); dentro = true; } else ctx.lineTo(x, Y(p[1])); if (p[2] !== p[1]) ctx.lineTo(x, Y(p[2])); }
      ctx.stroke();
    }
    for (const e of modelo.eventos) { ctx.fillStyle = '#d35400'; ctx.fillRect(Xm(e.t) - 1, 0, 2, h); }
    ctx.fillStyle = 'rgba(29, 87, 165, .18)'; ctx.strokeStyle = '#1d57a5'; ctx.lineWidth = 1.5;
    const a = Xm(st.t0); const b = Math.max(Xm(st.t1), a + 3);
    ctx.fillRect(a, 1, b - a, h - 2); ctx.strokeRect(a + 0.5, 1.5, b - a - 1, h - 3);
    ctx.fillStyle = cGris; ctx.font = `11px ${fuente}`; ctx.fillText('Mapa', 4, h / 2 + 4);
  }

  function recortarTexto(ctx, s, max) {
    if (ctx.measureText(s).width <= max) return s;
    let r = s;
    while (r.length > 3 && ctx.measureText(`${r}…`).width > max) r = r.slice(0, -1);
    return `${r}…`;
  }

  // --- zoom y desplazamiento ---
  const MIN_VENTANA = 300;
  function fijarVentana(t0, t1) {
    let a = t0; let b = t1;
    if (b - a < MIN_VENTANA) { const c = (a + b) / 2; a = c - MIN_VENTANA / 2; b = c + MIN_VENTANA / 2; }
    if (b - a > total) { a = 0; b = total; }
    if (a < 0) { b -= a; a = 0; }
    if (b > total) { a -= b - total; b = total; }
    st.t0 = Math.max(0, a); st.t1 = Math.min(total, b);
    pintar();
  }
  function zoom(factor, centro = st.cursor ?? (st.t0 + st.t1) / 2) {
    const c = Math.max(st.t0, Math.min(st.t1, centro));
    fijarVentana(c - (c - st.t0) * factor, c + (st.t1 - c) * factor);
  }
  const mover = (frac) => { const d = (st.t1 - st.t0) * frac; fijarVentana(st.t0 + d, st.t1 + d); };

  raiz.querySelector('.vg-botones').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'mas') zoom(0.5); else if (a === 'menos') zoom(2); else if (a === 'izq') mover(-0.5); else if (a === 'der') mover(0.5); else if (a === 'todo') fijarVentana(0, total);
  });

  // --- ratón y táctil sobre las pistas ---
  const xDe = (e) => e.clientX - cv.getBoundingClientRect().left;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    st.punteros.set(e.pointerId, { x: xDe(e) });
    if (st.punteros.size === 2) {
      const [p1, p2] = [...st.punteros.values()];
      st.pinza = { d: Math.abs(p1.x - p2.x) || 1, t0: st.t0, t1: st.t1, centro: T((p1.x + p2.x) / 2) };
      st.banda = null;
    } else if (e.pointerType === 'mouse' && e.button === 0) {
      st.banda = [xDe(e), xDe(e)];
    } else {
      st.cursor = Math.max(st.t0, Math.min(st.t1, T(xDe(e)))); pintar();
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const x = xDe(e);
    if (st.punteros.has(e.pointerId)) st.punteros.get(e.pointerId).x = x;
    if (st.pinza && st.punteros.size === 2) {
      const [p1, p2] = [...st.punteros.values()];
      const d = Math.abs(p1.x - p2.x) || 1;
      const f = st.pinza.d / d;
      const c = st.pinza.centro;
      const t0 = c - (c - st.pinza.t0) * f;
      const t1 = c + (st.pinza.t1 - c) * f;
      // Además del zoom, los dos dedos arrastran: el punto que estaba bajo ellos sigue bajo ellos
      const nuevoMedio = t0 + (((p1.x + p2.x) / 2 - IZQ) / (ancho() - IZQ - DER)) * (t1 - t0);
      const corr = c - nuevoMedio;
      fijarVentana(t0 + corr, t1 + corr);
      return;
    }
    if (st.banda) { st.banda[1] = x; st.cursor = Math.max(st.t0, Math.min(st.t1, T(x))); pintar(); return; }
    if (e.pointerType === 'mouse' || st.punteros.has(e.pointerId)) { st.cursor = Math.max(st.t0, Math.min(st.t1, T(x))); pintar(); }
  });
  const soltar = (e) => {
    st.punteros.delete(e.pointerId);
    if (st.punteros.size < 2) st.pinza = null;
    if (st.banda) {
      const [a, b] = [Math.min(...st.banda), Math.max(...st.banda)];
      st.banda = null;
      if (b - a > 8) fijarVentana(T(a), T(b)); else pintar();
    }
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('dblclick', () => fijarVentana(0, total));
  cv.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); mover(e.deltaX / 600); return; }
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.25 : 0.8, T(xDe(e)));
  }, { passive: false });
  cv.addEventListener('keydown', (e) => {
    const paso = (st.t1 - st.t0) / 100;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      st.cursor = Math.max(0, Math.min(total, (st.cursor ?? (st.t0 + st.t1) / 2) + (e.key === 'ArrowLeft' ? -paso : paso)));
      if (st.cursor < st.t0 || st.cursor > st.t1) mover(e.key === 'ArrowLeft' ? -0.25 : 0.25); else pintar();
    } else if (e.key === '+') zoom(0.5); else if (e.key === '-') zoom(2); else if (e.key === 'Home' || e.key === '0') fijarVentana(0, total);
  });
  // El mapa mueve la ventana
  const irMapa = (e) => {
    const w = mapa.clientWidth;
    const t = ((e.clientX - mapa.getBoundingClientRect().left - IZQ) / (w - IZQ - DER)) * total;
    const v = st.t1 - st.t0;
    fijarVentana(t - v / 2, t + v / 2);
  };
  mapa.addEventListener('pointerdown', (e) => { mapa.setPointerCapture(e.pointerId); irMapa(e); });
  mapa.addEventListener('pointermove', (e) => { if (mapa.hasPointerCapture(e.pointerId)) irMapa(e); });

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => pintar()) : null;
  ro?.observe(raiz);
  pintar();

  return {
    pintar,
    fijarSeleccion(claves) { st.sel = claves.slice(); pintar(); },
    seleccion: () => st.sel.slice(),
    ventana: () => ({ t0: st.t0, t1: st.t1 }),
    cursor: () => st.cursor,
    irA(t0, t1) { fijarVentana(t0, t1); },
    color,
    destruir() { ro?.disconnect(); raiz.innerHTML = ''; },
  };
}
