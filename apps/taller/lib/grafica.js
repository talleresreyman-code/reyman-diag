// Reyman Diag · Gráficas de línea en canvas (sin librerías)

export function dibujarLinea(canvas, valores, { min, max, color, rejilla = false, etiquetas = false, unidad = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 60;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const col = color || css.getPropertyValue('--azul').trim() || '#1d57a5';
  const lineaCol = css.getPropertyValue('--linea').trim() || '#ccc';
  const grisCol = css.getPropertyValue('--gris').trim() || '#666';
  const datos = valores.filter((v) => typeof v === 'number' && isFinite(v));
  if (datos.length < 2) return;
  let lo = min ?? Math.min(...datos);
  let hi = max ?? Math.max(...datos);
  if (min === undefined || max === undefined) {
    const margen = (hi - lo) * 0.15 || 1;
    lo -= margen; hi += margen;
  }
  const izq = etiquetas ? 44 : 0;
  const pad = etiquetas ? 8 : 2;
  const X = (i) => izq + (i / (valores.length - 1)) * (w - izq - 2);
  const Y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2);
  if (rejilla) {
    ctx.strokeStyle = lineaCol; ctx.lineWidth = 1; ctx.fillStyle = grisCol; ctx.font = '12px Barlow, system-ui, sans-serif';
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4;
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(izq, y); ctx.lineTo(w, y); ctx.stroke();
      if (etiquetas) ctx.fillText(formatear(v) + (k === 4 ? ` ${unidad}` : ''), 2, y + 4);
    }
  }
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath();
  let empezado = false;
  valores.forEach((v, i) => {
    if (typeof v !== 'number') { empezado = false; return; }
    if (!empezado) { ctx.moveTo(X(i), Y(v)); empezado = true; } else ctx.lineTo(X(i), Y(v));
  });
  ctx.stroke();
}

export function formatear(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
