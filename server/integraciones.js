// Reyman Diag · integraciones externas
// - OT abiertas: App Reyman (que ya recibe de n8n el dataset ots_abiertas de GemiCar)
// - Correo: n8n «App Reyman · enviar correo» (Gmail talleresreyman@gmail.com)
// - IA: API de Claude (Anthropic) con tope mensual de coste

/** Busca OT abiertas por bastidor o matrícula en la App Reyman. */
export async function buscarOts(cfg, tenant, { vin, matricula }) {
  if (!cfg.appReymanUrl || !cfg.appReymanApiKey) return { coincidencias: [], abiertas: [], aviso: 'Sin conexión con la App Reyman configurada' };
  const url = new URL(cfg.appReymanOts, cfg.appReymanUrl);
  if (vin) url.searchParams.set('vin', vin);
  if (matricula) url.searchParams.set('matricula', matricula);
  url.searchParams.set('taller', tenant);
  const r = await fetch(url, { headers: { 'x-api-key': cfg.appReymanApiKey, accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`App Reyman (OT) respondió ${r.status}`);
  const d = await r.json();
  const norm = (o) => ({
    ot: String(o.ot ?? o.numero ?? o.NumOT ?? ''),
    matricula: String(o.matricula ?? o.Matricula ?? '').replace(/[\s-]/g, '').toUpperCase(),
    vin: o.vin ?? o.bastidor ?? null,
    cliente: o.cliente ?? o.nombre_cliente ?? '',
    vehiculo: o.vehiculo ?? [o.marca, o.modelo].filter(Boolean).join(' '),
    situacion: o.situacion ?? '',
    email: o.email ?? null,
    telefono: o.telefono ?? o.movil ?? null,
  });
  return { coincidencias: (d.coincidencias || []).map(norm), abiertas: (d.abiertas || []).map(norm) };
}

/** Envía un correo a través del webhook de n8n (sale del Gmail del taller). */
export async function enviarCorreo(cfg, { para, cc, asunto, html, adjuntos }) {
  if (!cfg.n8nCorreoUrl) throw new Error('El envío de correo no está configurado (N8N_CORREO_URL).');
  const r = await fetch(cfg.n8nCorreoUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reyman-app': cfg.n8nClave || '' },
    body: JSON.stringify({ tipo: 'correo', origen: 'reyman-diag', para, cc, asunto, html, adjuntos }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.msg || `n8n respondió ${r.status}`);
  return d;
}

const SISTEMA_IA = `Eres el jefe de taller de Talleres Reyman (Arganda del Rey, Madrid), mecánico con 30 años de experiencia en todas las marcas.
Recibes una lectura OBD (averías, freeze frame, monitores y datos del motor) y escribes un diagnóstico para el mecánico, en español de España, claro y directo, tuteando.
Estructura:
1. Qué está pasando (2-4 frases): relaciona las averías entre sí y con el freeze frame.
2. Causas probables ordenadas de más a menos frecuente para ese motor, si se conoce.
3. Comprobaciones por orden, empezando por las más rápidas y baratas, con valores esperados cuando los sepas.
4. Qué NO hacer todavía (p. ej. no cambiar piezas caras sin comprobar antes X).
Reglas: no inventes datos que no estén en la lectura. Si un código es de fabricante, dilo y no supongas su significado. Si algo requiere el equipo de marca (Autel), indícalo. Sin saludos ni despedidas. Máximo 350 palabras.`;

/** Resumen compacto de la lectura para la IA (ahorra tokens). */
export function promptLectura(l, vehiculo) {
  const v = l.vehiculo || {};
  const lineas = [
    `Vehículo: ${vehiculo || v.marca || 'desconocido'}${v.año ? `, año modelo ${v.año}` : ''}${v.vin ? `, VIN ${v.vin}` : ''}.`,
    `Combustible: ${l.datos?.find((d) => d.pid === 0x51)?.texto || l.readiness?.motor || 'no indicado'}. Km: ${l.datos?.find((d) => d.pid === 0xa6)?.valor ?? 'no disponible'}.`,
    'Averías:',
    ...(l.averias || []).map((a) => `- ${a.codigo} (${a.tipo}, ${a.modulo}): ${a.descripcion}`),
  ];
  if (!(l.averias || []).length) lineas.push('- ninguna');
  if (l.freezeFrame?.dtc) lineas.push(`Freeze frame de ${l.freezeFrame.dtc.codigo}: ${l.freezeFrame.valores.map((x) => `${x.nombre} ${x.valor} ${x.unidad}`).join('; ')}.`);
  if (l.readiness?.semaforo) lineas.push(`Monitores: MIL ${l.readiness.mil ? 'encendido' : 'apagado'}; pendientes: ${l.readiness.monitores.filter((m) => m.estado !== 'ok').map((m) => m.nombre).join(', ') || 'ninguno'}.`);
  const dist = l.datos?.find((d) => d.pid === 0x31)?.valor;
  if (dist !== undefined) lineas.push(`Km desde el último borrado de averías: ${dist}.`);
  return lineas.join('\n');
}

/** Llama a la API de Claude. Devuelve { texto, tokens_in, tokens_out, coste_eur }. */
export async function diagnosticoIa(cfg, lectura, vehiculo) {
  if (!cfg.iaClave) throw new Error('La IA no está configurada (ANTHROPIC_API_KEY).');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.iaClave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.iaModelo,
      max_tokens: 900,
      system: SISTEMA_IA,
      messages: [{ role: 'user', content: promptLectura(lectura, vehiculo) }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`La IA no ha respondido (${r.status}${d.error?.message ? `: ${d.error.message}` : ''}).`);
  const texto = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const tin = d.usage?.input_tokens || 0;
  const tout = d.usage?.output_tokens || 0;
  const usd = (tin * cfg.iaPrecioEntrada + tout * cfg.iaPrecioSalida) / 1e6;
  return { texto, tokens_in: tin, tokens_out: tout, coste_eur: Math.round(usd * cfg.usdAEur * 10000) / 10000 };
}
