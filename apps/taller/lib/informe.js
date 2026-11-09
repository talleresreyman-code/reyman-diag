// Reyman Diag · Informe de diagnosis en HTML imprimible (Guardar como PDF desde el navegador)
// Dos versiones: interna (todo el detalle técnico) y cliente (lenguaje claro, sin datos de centralitas).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });

const TIPO = { confirmada: 'Confirmada', pendiente: 'Pendiente (aún no confirmada)', permanente: 'Permanente (se borra sola tras reparar y circular)' };
const SEMAFORO = { verde: 'Preparado para ITV (emisiones)', amarillo: 'Pendiente de completar autodiagnóstico', rojo: 'No apto: avería de emisiones activa' };

export function htmlInforme(l, { version = 'interno', taller = {}, logo = '' } = {}) {
  const cliente = version === 'cliente';
  const av = l.averias || [];
  const rd = l.readiness || {};
  const v = l.vehiculo || {};
  const filasAv = av.length
    ? av.map((a) => `<tr><td class="cod">${esc(a.codigo)}</td><td>${esc(a.descripcion)}${a.fabricante ? '<br><small>Código del fabricante</small>' : ''}</td><td>${esc(TIPO[a.tipo] || a.tipo)}</td>${cliente ? '' : `<td>${esc(a.modulo || '')}</td>`}</tr>`).join('')
    : `<tr><td colspan="${cliente ? 3 : 4}">No se han encontrado averías en las centralitas consultadas.</td></tr>`;
  // Todas las centralitas (UDS), si se escanearon
  const uds = l.uds?.centralitas || [];
  const estadoUds = (e) => [e.activa ? 'activa' : '', e.confirmada ? 'confirmada' : '', e.pendiente && !e.confirmada ? 'pendiente' : ''].filter(Boolean).join(', ') || 'memorizada';
  const filasUds = uds.flatMap((c) => (c.averias.length
    ? c.averias.map((a) => `<tr><td class="cod">${esc(a.completo)}</td><td>${esc(a.descripcion)}${a.fabricante ? '<br><small>Código del fabricante</small>' : ''}</td><td>${esc(estadoUds(a.estado))}</td><td>${esc(c.nombre)}</td></tr>`)
    : (cliente ? [] : [`<tr><td class="cod">—</td><td>Sin averías</td><td></td><td>${esc(c.nombre)}</td></tr>`]))).join('');
  const seccionUds = uds.length ? `<h2>Resto de centralitas (${uds.length} consultadas)</h2>${filasUds ? `<table><thead><tr><th>Código</th><th>Descripción</th><th>Estado</th><th>Centralita</th></tr></thead><tbody>${filasUds}</tbody></table>` : '<p>Ninguna centralita tiene averías.</p>'}` : '';
  // Batería de alta tensión (híbridos Ford)
  const hv = l.bateriaHv && !l.bateriaHv.error ? l.bateriaHv : null;
  const seccionHv = hv ? `<h2>Batería de alta tensión</h2><table><tbody>${hv.valores.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.valor)} ${esc(x.unidad)}</td></tr>`).join('')}${hv.difCeldasMv !== undefined ? `<tr><td>Diferencia entre celdas</td><td>${esc(hv.difCeldasMv)} mV</td></tr>` : ''}</tbody></table>${hv.avisos.map((a) => `<p><b>${esc(a)}</b></p>`).join('')}` : '';
  // Modo 06 (solo informe del taller): lo que está fuera o cerca del límite
  const m06 = !cliente && l.modo06?.total ? l.modo06 : null;
  const m06Malas = m06 ? m06.ecus.flatMap((e) => e.pruebas.filter((x) => !x.ok).map((x) => ({ ...x, ecu: e.nombre || e.ecu }))) : [];
  const seccion06 = m06 ? `<h2>Pruebas internas de los monitores (modo 06)</h2>${m06Malas.length
    ? `<table><thead><tr><th>Monitor</th><th>Prueba</th><th>Valor</th><th>Límites</th></tr></thead><tbody>${m06Malas.map((x) => `<tr><td>${esc(x.monitor)}</td><td>${esc(x.prueba)}</td><td>${esc(x.valor)} ${esc(x.unidad)}</td><td>${esc(x.min)} – ${esc(x.max)}</td></tr>`).join('')}</tbody></table>`
    : `<p>${m06.total} pruebas, todas dentro de límites.</p>`}` : '';
  // Servicio 09 (solo informe del taller): calibraciones con CVN y monitores que casi nunca terminan
  const m09 = !cliente && l.modo09?.ecus?.length ? l.modo09 : null;
  const seccion09 = m09 ? (() => {
    const TXT = { ok: 'No modificado', mal: 'MODIFICADO', dudoso: 'Dudoso', sin_ref: 'Sin referencia' };
    const COL = { ok: '#1e8a4c', mal: '#c4302a', dudoso: '#b97f00', sin_ref: '#66717f' };
    const cal = m09.ecus.flatMap((e) => (e.calibraciones || []).map((c) => `<tr><td>${esc(e.nombre || e.modulo)}</td><td>${esc(c.id || '—')}</td><td>${esc(c.cvn || '—')}</td><td>${c.verif ? `<b style="color:${COL[c.verif.estado]}">${TXT[c.verif.estado]}</b>` : '—'}</td></tr>`)).join('');
    const bajos = m09.ecus.flatMap((e) => (e.ipt?.monitores || []).filter((x) => x.condiciones && x.ratio < 0.336).map((x) => `<li>${esc(x.nombre)}: ${x.completado} de ${x.condiciones} (${esc(x.ratio)})</li>`)).join('');
    if (!cal && !bajos) return '';
    return `<h2>Calibraciones y uso de los monitores</h2>${cal ? `<table><thead><tr><th>Centralita</th><th>Calibración</th><th>CVN</th><th>Software</th></tr></thead><tbody>${cal}</tbody></table>` : ''}${bajos ? `<p>Monitores que terminan poco:</p><ul>${bajos}</ul>` : ''}`;
  })() : '';
  const monitores = (rd.monitores || []).map((m) => `<li>${esc(m.nombre)}: <b>${m.estado === 'ok' ? 'completado' : 'pendiente'}</b></li>`).join('');
  const ff = l.freezeFrame?.dtc && !cliente
    ? `<h2>Condiciones al aparecer ${esc(l.freezeFrame.dtc.codigo)} (freeze frame)</h2><table><tbody>${l.freezeFrame.valores.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.valor)} ${esc(x.unidad)}</td></tr>`).join('')}</tbody></table>`
    : '';
  const foto = !cliente && l.foto?.grupos?.length
    ? `<h2>Foto de todos los datos OBD</h2>${l.foto.grupos.map((g) => `<h3>${esc(GRUPOS_FOTO[g.id] || g.id)}</h3><table><tbody>${g.datos.filter((d) => d.valor !== null).map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.texto || x.valor)} ${x.texto ? '' : esc(x.unidad)}</td></tr>`).join('')}</tbody></table>`).join('')}<p class="peq">Definiciones de los PID: base abierta OBDb (CC BY-SA 4.0).</p>`
    : '';
  // Un PID puede traer varios datos (p. ej. tensión y corriente de la batería híbrida): se muestran todos
  const filasDatos = (l.datos || []).flatMap((d) => (d.senales?.length > 1 ? d.senales : [d])).filter((d) => d.valor !== null && d.valor !== undefined);
  const datos = !cliente && filasDatos.length
    ? `<h2>Datos del motor</h2><table><tbody>${filasDatos.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.texto || x.valor)} ${x.texto ? '' : esc(x.unidad)}</td></tr>`).join('')}</tbody></table>`
    : '';
  const ia = l.ia?.texto ? `<h2>${cliente ? 'Valoración del taller' : 'Diagnóstico asistido (IA)'}</h2><p class="pre">${esc(l.ia.texto)}</p>` : '';
  const explicacion = cliente
    ? `<p class="nota">Este informe recoge lo que el vehículo tiene registrado en su sistema de autodiagnóstico (OBD). Un código indica qué sistema ha detectado un problema; la causa exacta se confirma con las comprobaciones del taller.</p>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de diagnosis ${esc(l.matricula || v.vin || '')}</title>
<style>
@page{size:A4;margin:16mm 14mm}
body{font-family:Barlow,Arial,sans-serif;color:#232a33;font-size:12pt;line-height:1.4;margin:0}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1d57a5;padding-bottom:10px;margin-bottom:14px}
header img{height:54px}
h1{font-size:20pt;margin:0;color:#143f7a}
h2{font-size:13pt;margin:18px 0 6px;color:#143f7a}
table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px solid #c9d0d8;padding:6px 4px;text-align:left;vertical-align:top}
th{font-size:10pt;color:#66717f}
.cod{font-weight:700;font-size:13pt;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px}
.grid div small{display:block;color:#66717f;font-size:9.5pt}
.sem{padding:8px 12px;border-radius:6px;font-weight:700;display:inline-block}
.verde{background:#e3f4ea;color:#1e8a4c}.amarillo{background:#fff3d1;color:#8a5f00}.rojo{background:#fde8e6;color:#c4302a}
.nota{font-size:10.5pt;color:#454f5b;background:#f2f4f7;padding:8px 10px;border-radius:6px}
.pre{white-space:pre-wrap}
footer{margin-top:24px;font-size:9.5pt;color:#66717f;border-top:1px solid #c9d0d8;padding-top:8px}
small{color:#66717f}
@media screen{body{padding:16px;word-break:break-word}}
@media screen and (max-width:560px){header{flex-wrap:wrap;gap:8px}header>div{text-align:left!important}h1{font-size:17pt}.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<header>${logo ? `<img src="${logo}" alt="${esc(taller.nombre || 'Talleres Reyman')}">` : `<strong>${esc(taller.nombre || 'Talleres Reyman')}</strong>`}<div style="text-align:right"><h1>Informe de diagnosis</h1><small>${fmtFecha(l.fecha)}</small></div></header>
<div class="grid">
<div><small>Matrícula</small>${esc(l.matricula || '—')}</div>
<div><small>Vehículo</small>${esc(l.descripcionVehiculo || v.marca || '—')}${v.año ? ` (${v.año})` : ''}</div>
<div><small>Bastidor</small>${esc(v.vin || (l.vehiculo && !l.vehiculo.valido ? 'No lo da por OBD' : '—'))}</div>
<div><small>Orden de trabajo</small>${esc(l.ot || '—')}</div>
<div><small>Kilómetros</small>${esc(l.datos?.find((d) => d.pid === 0xa6)?.valor ?? l.km ?? '—')}</div>
${cliente ? '' : `<div><small>Realizado por</small>${esc(l.usuario || '—')}</div>`}
</div>
${explicacion}
<h2>Averías registradas</h2>
<table><thead><tr><th>Código</th><th>Descripción</th><th>Estado</th>${cliente ? '' : '<th>Centralita</th>'}</tr></thead><tbody>${filasAv}</tbody></table>
${seccionUds}
${seccionHv}
${seccion06}${seccion09}
<h2>Estado para la ITV (emisiones)</h2>
${rd.semaforo ? `<p><span class="sem ${rd.semaforo}">${esc(SEMAFORO[rd.semaforo])}</span></p><p>${esc(rd.motivo || '')}</p>${cliente ? '' : `<ul>${monitores}</ul>`}` : '<p>No disponible.</p>'}
${ff}${datos}${foto}${ia}
${l.borrado ? `<h2>Borrado de averías</h2><p>Averías borradas el ${fmtFecha(l.borrado.fecha)}${cliente ? '' : ` por ${esc(l.borrado.usuario || '')}`}.</p>` : ''}
<footer>${esc(taller.nombre || 'Talleres Reyman, S.L.')} · Arganda del Rey (Madrid) · talleresreyman.com${cliente ? '' : ` · Adaptador: ${esc(l.adaptador?.version || '')} · Protocolo: ${esc(l.adaptador?.protocolo?.nombre || '')}`}</footer>
</body></html>`;
}

const GRUPOS_FOTO = { basico: 'Básico', hibrido: 'Híbrido / eléctrico', adblue: 'AdBlue / SCR', escape: 'Escape / DPF', turbo: 'Turbo', diesel: 'Inyección y EGR', lambda: 'Sondas lambda', mezcla: 'Mezcla y aire', transmision: 'Par y cambio', contadores: 'Contadores', otros: 'Otros' };
