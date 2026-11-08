// Reyman Diag · Cliente de la API del servidor
// En modo demostración (sin servidor) usa un servidor simulado en memoria con datos de ejemplo.

export function crearApi({ demo = false } = {}) {
  return demo ? apiDemo() : apiReal();
}

function apiReal() {
  async function pedir(metodo, url, cuerpo) {
    const r = await fetch(url, {
      method: metodo,
      credentials: 'include',
      headers: cuerpo ? { 'content-type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(datos.error || `Error ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return datos;
  }
  return {
    demo: false,
    yo: () => pedir('GET', '/api/yo'),
    buscarOt: (q) => pedir('GET', `/api/ots/buscar?${new URLSearchParams(q)}`),
    guardarLectura: (l) => pedir('POST', '/api/lecturas', l),
    historial: (matricula) => pedir('GET', `/api/lecturas?${new URLSearchParams({ matricula })}`),
    pedirBorrado: (b) => pedir('POST', '/api/borrados', b),
    resultadoBorrado: (id, r) => pedir('PATCH', `/api/borrados/${id}`, r),
    guardarSesion: (s) => pedir('POST', '/api/sesiones', s),
    enviarInforme: (d) => pedir('POST', '/api/informes/enviar', d),
    diagnosticoIa: (d) => pedir('POST', '/api/ia/diagnostico', d),
    urlInforme: (id) => `/api/lecturas/${id}/informe.pdf`,
  };
}

function apiDemo() {
  const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const mem = { lecturas: [], borrados: [], sesiones: [], iaGastado: 1.84 };
  const OTS = [
    { ot: '261402', matricula: '4521KLM', vin: 'WVWZZZAUZHW512345', cliente: 'Cliente de ejemplo 1', vehiculo: 'Volkswagen Golf 2.0 TDI', situacion: 'En taller', mecanico: 'Bryhan' },
    { ot: '261415', matricula: '7788LKD', vin: 'VSSZZZKLZMR024680', cliente: 'Cliente de ejemplo 2', vehiculo: 'SEAT León 1.5 TSI', situacion: 'Pendiente de diagnosis', mecanico: 'Alex' },
    { ot: '261420', matricula: '1234MNB', vin: 'NMTBZ3BE20R123456', cliente: 'Flota de ejemplo', vehiculo: 'Toyota Corolla Hybrid', situacion: 'Pre-ITV', mecanico: 'Bryhan' },
  ];
  const id = () => Math.random().toString(36).slice(2, 10);
  return {
    demo: true,
    async yo() {
      await espera(100);
      return {
        usuario: { id: 'demo', nombre: 'Mecánico (demo)', rol: 'mecanico' },
        permisos: ['diag.ver', 'diag.leer', 'diag.borrar', 'diag.ia', 'diag.enviar_cliente'],
        taller: { nombre: 'Talleres Reyman', email: 'talleresreyman@gmail.com' },
        ia: { gastadoMes: mem.iaGastado, topeMes: 15 },
      };
    },
    async buscarOt({ vin, matricula }) {
      await espera();
      const q = (matricula || '').replace(/[\s-]/g, '').toUpperCase();
      return { coincidencias: OTS.filter((o) => (vin && o.vin === vin) || (q && o.matricula === q)), abiertas: OTS };
    },
    async guardarLectura(l) { await espera(); const r = { ...l, id: id(), creada: new Date().toISOString() }; mem.lecturas.unshift(r); return { id: r.id }; },
    async historial(matricula) { await espera(); return { lecturas: mem.lecturas.filter((l) => l.matricula === matricula) }; },
    async pedirBorrado(b) { await espera(); const r = { ...b, id: id(), permitido: true }; mem.borrados.push(r); return r; },
    async resultadoBorrado(i, r) { await espera(100); Object.assign(mem.borrados.find((b) => b.id === i) || {}, r); return { ok: true }; },
    async guardarSesion(s) { await espera(); mem.sesiones.push(s); return { id: id(), destino: `OneDrive · DIAGNOSIS OBD/${new Date().getFullYear()}/${s.ot || 'sin OT'} ${s.matricula || ''}` }; },
    async enviarInforme(d) { await espera(600); return { ok: true, enviadoA: d.email, desde: 'talleresreyman@gmail.com', demo: true }; },
    async diagnosticoIa({ lectura }) {
      await espera(1200);
      mem.iaGastado += 0.03;
      return { texto: diagnosticoDemo(lectura), coste: 0.03, gastadoMes: mem.iaGastado, topeMes: 15, demo: true };
    },
    urlInforme: () => null,
  };
}

function diagnosticoDemo(l) {
  const codigos = [...new Set((l?.averias || []).map((a) => a.codigo))];
  if (!codigos.length) return 'Sin averías registradas. El vehículo no muestra códigos en las centralitas OBD consultadas.';
  const partes = [`Análisis de ejemplo (modo demostración, sin IA real) para ${codigos.join(', ')}.`];
  if (codigos.includes('P0401') && codigos.includes('P2463')) {
    partes.push(
      '',
      'Relación probable: el caudal EGR insuficiente (P0401) y la acumulación de hollín en el DPF (P2463) suelen ir juntos en diésel con uso urbano. La EGR obstruida eleva el hollín y el filtro se satura.',
      '',
      'Comprobaciones por orden:',
      '1. Leer en datos en vivo la EGR comandada frente al caudal de aire (MAF) a ralentí y a 2.000 rpm.',
      '2. Inspección visual de la válvula EGR y del enfriador: carbonilla.',
      '3. Presión diferencial del DPF y nivel de hollín con el equipo de marca (Autel).',
      '4. Si el DPF admite regeneración: forzarla tras corregir la EGR, no antes.',
      '',
      'P0299 pendiente (sobrealimentación insuficiente): revisar fugas en manguitos del intercooler antes de sospechar del turbo.',
    );
  } else {
    partes.push('', 'Revisa el freeze frame para ver en qué condiciones apareció cada avería y sigue el flujo de diagnóstico del taller.');
  }
  return partes.join('\n');
}
