// Reyman Diag · Cliente de la API del servidor
// En modo demostración (sin servidor) usa un servidor simulado en memoria con datos de ejemplo.

import { evaluarCvn, norm as normCvn, normCalid } from '@reyman/obd-core/cvn.js';

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
    listarSesiones: (q = {}) => pedir('GET', `/api/sesiones?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`),
    obtenerSesion: (id) => pedir('GET', `/api/sesiones/${encodeURIComponent(id)}`),
    comprobarCvn: (d) => pedir('POST', '/api/cvn/comprobar', d),
    referenciaCvn: (d) => pedir('POST', '/api/cvn/referencia', d),
    enviarInforme: (d) => pedir('POST', '/api/informes/enviar', d),
    diagnosticoIa: (d) => pedir('POST', '/api/ia/diagnostico', d),
    urlInforme: (id) => `/api/lecturas/${id}/informe.pdf`,
  };
}

function apiDemo() {
  const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const mem = { lecturas: [], borrados: [], sesiones: [sesionDemo()], iaGastado: 1.84, cvnRef: {},
    cvn: [{ calid: '04L906056KT 452', cvn: '5A3C91E2', vin: 'WVWZZZAUZJW000001', primera: new Date('2026-10-02') }, { calid: '04L906056KT 452', cvn: '5A3C91E2', vin: 'WVWZZZAUZKW000002', primera: new Date('2026-10-20') }] };
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
    async listarSesiones({ matricula, ot } = {}) {
      await espera(150);
      const q = (matricula || '').replace(/[\s-]/g, '').toUpperCase();
      const lista = mem.sesiones.filter((s) => (!q || s.matricula === q) && (!ot || s.ot === ot));
      return { sesiones: lista.map(({ muestras, pids, ...x }) => ({ ...x, num_muestras: muestras.length, datos: pids.map((p) => p.nombre), con_datos: true })) };
    },
    // CVN: misma lógica que el servidor, en memoria (con un coche de ejemplo con el mismo software que el simulador)
    async comprobarCvn({ vin, items }) {
      await espera(150);
      return { resultados: (items || []).map((x0) => {
        const x = { ecu: x0.ecu, calid: normCalid(x0.calid), cvn: normCvn(x0.cvn) };
        const filas = mem.cvn.filter((r) => r.calid === x.calid);
        const por = new Map();
        for (const r of filas.filter((r) => r.vin !== vin)) por.set(r.cvn, (por.get(r.cvn) || new Set()).add(r.vin));
        const r = { ...x, ...evaluarCvn(x, { ref: mem.cvnRef[x.calid], propias: filas.filter((f) => f.vin === vin), otros: [...por].map(([cvn, v]) => ({ cvn, coches: v.size })) }) };
        if (!filas.some((f) => f.vin === vin && f.cvn === x.cvn)) mem.cvn.push({ ...x, vin, primera: new Date() });
        return r;
      }) };
    },
    async referenciaCvn({ calid, cvn }) { await espera(100); mem.cvnRef[normCalid(calid)] = { cvn: normCvn(cvn), creada: new Date() }; return { ok: true }; },
    async obtenerSesion(i) { await espera(150); const s = mem.sesiones.find((x) => x.id === i); if (!s) throw new Error('Grabación no encontrada.'); return s; },
    async guardarSesion(s) { await espera(); const nuevo = id(); mem.sesiones.unshift({ ...s, id: nuevo, usuario: 'Mecánico (demo)', num_muestras: s.muestras.length, creada: new Date().toISOString() }); return { id: nuevo, destino: `se ve en «Datos grabados» y esta noche se copia a OneDrive (DIAGNOSIS OBD/${new Date().getFullYear()}/${s.ot ? `1-A-${s.ot}` : 'SIN OT'} ${s.matricula || ''})` }; },
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

// Prueba de carretera de ejemplo para el visor (modo demostración): 3 minutos a 5 muestras por segundo,
// con un tirón a los 95 s (cae la presión de turbo y sube el régimen sin ganar velocidad).
function sesionDemo() {
  const pids = [
    { pid: '0C.RPM', nombre: 'Régimen del motor', unidad: 'rpm' }, { pid: '0D.VSS', nombre: 'Velocidad', unidad: 'km/h' },
    { pid: '70.BP_A_CMD', nombre: 'Presión de turbo ordenada A', unidad: 'kPa' }, { pid: '70.BP_A_ACT', nombre: 'Presión de turbo A', unidad: 'kPa' },
    { pid: '10.MAF', nombre: 'Caudal de aire (caudalímetro)', unidad: 'g/s' }, { pid: '05.ECT', nombre: 'Temperatura del refrigerante', unidad: '°C' },
    { pid: '42.VPWR', nombre: 'Tensión de la centralita', unidad: 'V' },
  ];
  const muestras = [];
  for (let t = 0; t <= 180000; t += 200) {
    const s = t / 1000;
    const acel = Math.max(0, Math.sin(s / 14)) ** 1.5;
    const tiron = s > 94 && s < 99 ? 1 : 0;
    const rpm = 850 + 2600 * acel + (tiron ? 500 * Math.sin(s * 9) : 0) + 20 * Math.sin(s * 3);
    const ordenada = 100 + 120 * acel;
    muestras.push({ t, v: {
      '0C.RPM': Math.round(rpm), '0D.VSS': Math.round(Math.min(120, s * 0.4 + 60 * acel)),
      '70.BP_A_CMD': Math.round(ordenada), '70.BP_A_ACT': Math.round(tiron ? 105 : ordenada - 3 + 2 * Math.sin(s * 2)),
      '10.MAF': Math.round((8 + 90 * acel * (tiron ? 0.5 : 1)) * 10) / 10, '05.ECT': Math.round(Math.min(90, 62 + s * 0.2)),
      '42.VPWR': Math.round((14.1 + 0.05 * Math.sin(s)) * 100) / 100,
    } });
  }
  return {
    id: 'demo-sesion-1', ot: '261402', matricula: '4521KLM', vin: 'WVWZZZAUZHW512345', usuario: 'Bryhan', inicio: new Date(Date.now() - 86400000).toISOString(),
    duracion_s: 180, creada: new Date(Date.now() - 86400000).toISOString(), pids, muestras, eventos: [{ t: 95000, tipo: 'marca', detalle: 'Tirón al acelerar' }],
  };
}
