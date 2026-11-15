// Reyman Diag / Reyman Connect · WiCAN Pro (MeatPi): su API HTTP, además del canal ELM327.
// El canal de datos del coche sigue siendo el ELM327 (Wi-Fi TCP 35000, Bluetooth o USB). La API HTTP
// sirve para saber qué aparato es, su firmware, la tensión que mide, la tarjeta SD, el Bluetooth,
// si está bien configurado y, con el firmware 6, para leer averías y hacer peticiones UDS desde el propio WiCAN.
//
// El núcleo no hace peticiones por sí mismo: la app le pasa `pedir(metodo, ruta, cuerpo)` y así funciona
// con el programa de enlace del portátil (ruta /wican), con la app instalada (CapacitorHttp) o con un falso en las pruebas.
//
// Dos familias de firmware:
//  - 4.x (estable hasta 2026): GET /check_status (todo en un JSON plano; trae contraseñas: no se guarda entero).
//  - 6.x: todo bajo /api/ (GET /api/info, /api/status, /api/battery, /api/autopid/dtc, /api/uds/request…).

// Rutas que la app puede pedir al WiCAN (el enlace del portátil aplica la misma lista)
export const RUTA_WICAN_PERMITIDA = /^\/(api\/[A-Za-z0-9_./:%-]*|check_status)(\?[A-Za-z0-9_=&%.,:-]*)?$/;

export const FIRMWARE_RECOMENDADO_4 = '4.50';

const num = (x) => {
  const n = Number.parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Compara versiones tipo "4.50", "6.0.0-beta.11": devuelve <0, 0 o >0
export function compararVersion(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split(/[-+]/)[0].split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split(/[-+]/)[0].split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function errorWican(texto, code, extra = {}) {
  return Object.assign(new Error(texto), { code, ...extra });
}

// Nombre del modelo a partir de lo que cuenta el aparato
function modeloDe(...textos) {
  const t = textos.filter(Boolean).join(' ');
  if (/pro/i.test(t)) return 'WiCAN Pro';
  if (/usb/i.test(t)) return 'WiCAN USB';
  return 'WiCAN';
}

/**
 * Normaliza la ficha del aparato (sin contraseñas).
 * @returns {{ modelo, generacion: 4|6, firmware, compilacion, hardware, id, apiLevel }}
 */
export function normalizarInfo(datos, generacion) {
  if (generacion === 6) {
    return {
      modelo: modeloDe(datos.model, datos.device_type, datos.hw_version),
      generacion: 6,
      firmware: String(datos.fw_version || ''),
      compilacion: String(datos.fw_build || ''),
      hardware: String(datos.hw_version || datos.model || ''),
      id: String(datos.device_id || datos.mac || ''),
      apiLevel: datos.api_level ?? null,
    };
  }
  return {
    modelo: modeloDe(datos.hw_version, datos.git_version),
    generacion: 4,
    firmware: String(datos.fw_version || ''),
    compilacion: String(datos.git_version || ''),
    hardware: String(datos.hw_version || ''),
    id: String(datos.device_id || ''),
    apiLevel: null,
  };
}

/**
 * Estado del aparato en un formato común (4.x o 6.x). Nunca lleva contraseñas.
 */
export function normalizarEstado4(d) {
  return {
    tension: num(d.batt_voltage),
    protocolo: String(d.protocol || ''), // elm327, slcan, realdash66, savvycan, auto_pid…
    puerto: num(d.port),
    tipoPuerto: String(d.port_type || ''), // tcp / udp
    wifi: {
      modo: String(d.wifi_mode || ''), // AP, APStation, BLE…
      conectadoRed: d.sta_connected === true || d.sta_status === 'Connected',
      ip: String(d.sta_ip || ''),
    },
    ble: { activo: /enable/i.test(String(d.ble_status || '')) },
    coche: { responde: d.ecu_status === 'online' },
    reposo: {
      activo: /enable/i.test(String(d.sleep_status || '')),
      tensionDormir: num(d.sleep_volt),
      tensionDespertar: num(d.wakeup_volt),
    },
    mqtt: /enable/i.test(String(d.mqtt_en || '')),
    encendido: String(d.uptime || ''),
    sd: null,
    vehiculo: null,
    averias: null,
  };
}

export function normalizarEstado6({ status = {}, battery = {}, dtc = null, ble = null, wifi = null } = {}) {
  const bits = status.bits || {};
  const sd = status.sd ? {
    estado: String(status.sd.state || ''), // mounted / unreadable / failed / formatting
    motivo: String(status.sd.reason || ''),
    capacidadGB: status.sd.capacity_bytes ? Math.round(status.sd.capacity_bytes / 1e8) / 10 : null,
  } : (bits.sdcard_mounted ? { estado: 'mounted', motivo: '', capacidadGB: null } : null);
  return {
    tension: num(battery.voltage),
    protocolo: 'elm327', // en la 6 el ELM327 por TCP 35000, USB y WebSocket viene activado de fábrica
    puerto: 35000,
    tipoPuerto: 'tcp',
    wifi: {
      modo: wifi ? (wifi.sta_connected ? 'APStation' : 'AP') : (bits.sta_connected ? 'APStation' : 'AP'),
      conectadoRed: !!(wifi?.sta_connected ?? bits.sta_connected),
      ip: String(wifi?.ip || ''),
    },
    ble: { activo: !!(ble?.enabled ?? bits.ble_enabled), conectado: !!(ble?.connected ?? bits.ble_connected), emparejado: !!ble?.secured },
    coche: { responde: null },
    reposo: { activo: null, tensionDormir: null, tensionDespertar: null },
    mqtt: !!bits.mqtt_connected,
    encendido: String(status.uptime || ''),
    temperatura: num(status.temp_c),
    sd,
    vehiculo: status.vehicle ? { nombre: String(status.vehicle.name || ''), vin: String(status.vehicle.vin || '') } : null,
    averias: dtc ? { activo: !!dtc.enabled, permiteBorrar: !!dtc.allow_clear } : null,
  };
}

/**
 * Qué conviene cambiar o saber del WiCAN, en frases para el mecánico.
 * @param {object} info  normalizarInfo
 * @param {object} est   normalizarEstado4/6
 * @param {object} op    { conexion: 'wifi' | 'ble' | 'usb', puerto }
 * @returns {{ nivel: 'error'|'aviso'|'info', texto: string }[]}
 */
export function revisarAjustes(info, est, op = {}) {
  const r = [];
  if (!info) return r;
  if (info.generacion === 4) {
    if (est?.protocolo && est.protocolo !== 'elm327') {
      r.push({ nivel: 'error', texto: `El WiCAN está en modo «${est.protocolo}». Para Reyman Diag hay que ponerlo en ELM327: página del WiCAN (192.168.0.10) → Protocol: elm327 → Submit Changes.` });
    }
    if (op.conexion === 'wifi' && est?.puerto && op.puerto && Number(op.puerto) !== est.puerto) {
      r.push({ nivel: 'aviso', texto: `El WiCAN da los datos por el puerto ${est.puerto} y la app usa el ${op.puerto}. Cambia el puerto en «Adaptador Wi-Fi».` });
    }
    if (op.conexion === 'wifi' && est?.ble?.activo) {
      r.push({ nivel: 'aviso', texto: 'El Bluetooth del WiCAN está activado. Por Wi-Fi va mejor con el Bluetooth desactivado.' });
    }
    if (info.firmware && compararVersion(info.firmware, FIRMWARE_RECOMENDADO_4) < 0) {
      r.push({ nivel: 'aviso', texto: `Firmware ${info.firmware}: conviene actualizarlo (mínimo ${FIRMWARE_RECOMENDADO_4}) desde la página del WiCAN → System → Firmware update.` });
    }
    r.push({ nivel: 'info', texto: 'Con el firmware 6 el WiCAN también lee averías por su cuenta, hace peticiones UDS y graba en la SD con hora. Está en pruebas (beta): lo activaremos cuando salga la versión estable.' });
  } else if (info.generacion === 6) {
    if (/beta|alpha|alfa|rc/i.test(info.firmware)) {
      r.push({ nivel: 'info', texto: `Firmware ${info.firmware} (versión de pruebas de MeatPi).` });
    }
    if (est?.averias && !est.averias.activo) {
      r.push({ nivel: 'info', texto: 'La lectura de averías del propio WiCAN está desactivada (Automate → Trouble codes). La app las lee igual por ELM327.' });
    }
    if (op.conexion === 'wifi' && est?.ble?.conectado) {
      r.push({ nivel: 'aviso', texto: 'Hay un móvil conectado al WiCAN por Bluetooth: puede quitar velocidad al Wi-Fi.' });
    }
  }
  if (est?.tension !== null && est?.tension !== undefined) {
    if (est.tension < 11.8) r.push({ nivel: 'aviso', texto: `El WiCAN mide ${est.tension.toFixed(1)} V: batería baja.` });
  }
  if (est?.sd && est.sd.estado && est.sd.estado !== 'mounted') {
    r.push({ nivel: 'aviso', texto: est.sd.estado === 'unreadable' ? 'La tarjeta SD no se puede leer (formato exFAT o NTFS). Hay que formatearla en FAT32 desde la página del WiCAN.' : `La tarjeta SD da un problema (${est.sd.estado}${est.sd.motivo ? `: ${est.sd.motivo}` : ''}).` });
  }
  return r;
}

// Informe de averías del firmware 6 (GET /api/autopid/dtc) → formato de Reyman Diag
export function normalizarAverias6(d = {}) {
  const rep = d.report || {};
  const desc = rep.desc || {};
  const lista = (arr) => (Array.isArray(arr) ? arr : []).map((codigo) => ({ codigo, descripcionWican: desc[codigo] || '' }));
  return {
    valido: !!rep.valid,
    fecha: rep.ts ? new Date(rep.ts * 1000).toISOString() : null,
    via: String(rep.protocol || d.path || ''), // obd / wwh / uds
    mil: !!rep.mil,
    almacenadas: lista(rep.stored),
    pendientes: lista(rep.pending),
    permanentes: lista(rep.permanent),
    nuevas: Array.isArray(rep.new) ? rep.new : [],
    centralitas: (Array.isArray(rep.sources) ? rep.sources : []).map((s) => ({ id: String(s.ecu || ''), mil: !!s.mil, cantidad: s.count ?? null })),
    detalle: (Array.isArray(rep.items) ? rep.items : []).map((i) => ({ codigo: i.code, tipo: i.kind, centralita: i.ecu ?? null, estado: i.status ?? null, gravedad: i.severity ?? null })),
    error: rep.error || null,
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente del WiCAN.
 * @param {object} op { pedir: async (metodo, ruta, cuerpo) => ({ status, datos }), esperar? }
 */
export function crearClienteWican(op = {}) {
  const pedir = op.pedir;
  const dormir = op.esperar || esperar;
  if (typeof pedir !== 'function') throw new Error('crearClienteWican necesita pedir()');
  let info = null;

  async function json(metodo, ruta, cuerpo) {
    if (!RUTA_WICAN_PERMITIDA.test(ruta)) throw errorWican(`Ruta no permitida: ${ruta}`, 'RUTA');
    const r = await pedir(metodo, ruta, cuerpo);
    let datos = r?.datos;
    if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch { /* texto */ } }
    return { status: r?.status ?? 0, datos };
  }

  const cliente = {
    get info() { return info; },

    /** Qué aparato es (prueba primero el firmware 6 y luego el 4). */
    async identificar() {
      try {
        const r = await json('GET', '/api/info');
        if (r.status === 200 && r.datos && typeof r.datos === 'object' && (r.datos.fw_version || r.datos.device_type)) {
          info = normalizarInfo(r.datos, 6);
          return info;
        }
      } catch (e) { if (e.code === 'SIN_ENLACE') throw e; }
      let r;
      try { r = await json('GET', '/check_status'); } catch (e) {
        if (e.code === 'SIN_ENLACE') throw e;
        throw errorWican('No contesta ningún WiCAN en esa dirección.', 'NO_WICAN', { causa: e.message });
      }
      if (r.status === 200 && r.datos && typeof r.datos === 'object' && (r.datos.fw_version || r.datos.hw_version)) {
        info = normalizarInfo(r.datos, 4);
        info._estado4 = normalizarEstado4(r.datos); // ya viene en la misma respuesta
        return info;
      }
      throw errorWican('El adaptador contesta, pero no es un WiCAN (o no deja leer su estado).', 'NO_WICAN');
    },

    /** Estado normalizado (tensión, SD, Bluetooth, Wi-Fi, averías del propio WiCAN…). */
    async estado() {
      if (!info) await cliente.identificar();
      if (info.generacion === 4) {
        if (info._estado4) { const e = info._estado4; delete info._estado4; return e; }
        const r = await json('GET', '/check_status');
        return normalizarEstado4(r.datos || {});
      }
      const [status, battery, dtc, ble, wifi] = await Promise.allSettled([
        json('GET', '/api/status'), json('GET', '/api/battery'), json('GET', '/api/autopid/dtc'), json('GET', '/api/ble'), json('GET', '/api/wifi/status'),
      ]);
      const ok = (x) => (x.status === 'fulfilled' && x.value.status === 200 ? x.value.datos : null);
      return normalizarEstado6({ status: ok(status) || {}, battery: ok(battery) || {}, dtc: ok(dtc), ble: ok(ble), wifi: ok(wifi) });
    },

    /** Tensión que mide el propio WiCAN (V). */
    async tension() {
      if (!info) await cliente.identificar();
      if (info.generacion === 6) {
        const r = await json('GET', '/api/battery');
        return num(r.datos?.voltage);
      }
      const r = await json('GET', '/check_status');
      return num(r.datos?.batt_voltage);
    },

    /** Firmware 6: lectura de averías hecha por el propio WiCAN (todas las centralitas OBD que contestan). */
    async leerAverias({ esperaMaxMs = 30000, cadaMs = 800 } = {}) {
      if (!info) await cliente.identificar();
      if (info.generacion !== 6) throw errorWican('Este WiCAN no tiene lectura de averías propia (necesita el firmware 6).', 'SIN_FUNCION');
      const antes = await json('GET', '/api/autopid/dtc');
      const tsAntes = antes.datos?.report?.ts || 0;
      const r = await json('POST', '/api/autopid/dtc/scan', {});
      if (r.status === 403) throw errorWican('La lectura de averías del WiCAN está desactivada (página del WiCAN → Automate → Trouble codes).', 'DTC_DESACTIVADO');
      if (r.status === 409) throw errorWican('El WiCAN está ocupado con otra lectura. Prueba en unos segundos.', 'OCUPADO');
      if (r.status !== 202 && r.status !== 200) throw errorWican(`El WiCAN no ha empezado la lectura (${r.status}).`, 'WICAN');
      const fin = Date.now() + esperaMaxMs;
      for (;;) {
        await dormir(cadaMs);
        const g = await json('GET', '/api/autopid/dtc');
        const d = g.datos || {};
        if (!d.scanning && d.report && (d.report.ts || 0) >= tsAntes && (d.report.valid || d.report.error)) {
          const n = normalizarAverias6(d);
          if (n.error && !n.valido) throw errorWican(`El WiCAN no ha podido leer las averías: ${n.error}`, 'WICAN');
          return n;
        }
        if (Date.now() > fin) throw errorWican('El WiCAN tarda demasiado en leer las averías.', 'TIMEOUT');
      }
    },

    /**
     * Firmware 6: borrado de averías (modo 04) hecho por el WiCAN. OJO: la app tiene que registrar el borrado
     * ANTES de llamar aquí (regla del taller: todo borrado queda registrado).
     */
    async borrarAverias({ codigos = null } = {}) {
      if (!info) await cliente.identificar();
      if (info.generacion !== 6) throw errorWican('Este WiCAN no borra averías por su cuenta (necesita el firmware 6).', 'SIN_FUNCION');
      const cuerpo = { confirm: true, mode: codigos?.length ? 'if_only' : 'always', ...(codigos?.length ? { codes: codigos } : {}) };
      const r = await json('POST', '/api/autopid/dtc/clear', cuerpo);
      if (r.status === 403) throw errorWican('El borrado desde el WiCAN está desactivado en su página (Trouble codes → Allow clear).', 'BORRADO_DESACTIVADO');
      if (r.status === 409) throw errorWican('El WiCAN está ocupado. Prueba en unos segundos.', 'OCUPADO');
      if (r.status !== 200) throw errorWican(r.datos?.error || `El WiCAN no ha borrado (${r.status}).`, 'WICAN');
      return { ok: !!r.datos?.ok, borrado: !!r.datos?.cleared, antes: r.datos?.before ?? null, despues: r.datos?.after ?? null };
    },

    /** Firmware 6: una petición UDS (ISO 14229) hecha por el WiCAN. datos en hex: "22 F1 90". */
    async uds({ tx, rx, datos, ext = false, timeoutMs } = {}) {
      if (!info) await cliente.identificar();
      if (info.generacion !== 6) throw errorWican('Este WiCAN no tiene la herramienta UDS (necesita el firmware 6).', 'SIN_FUNCION');
      const cuerpo = { tx_id: String(tx), rx_id: String(rx), ext: !!ext, data: String(datos) };
      if (timeoutMs) cuerpo.p2star_ms = timeoutMs;
      const r = await json('POST', '/api/uds/request', cuerpo);
      if (r.status === 409) throw errorWican('El WiCAN está ocupado con otra petición UDS.', 'OCUPADO');
      if (r.status !== 200) throw errorWican(r.datos?.error || `Petición UDS fallida (${r.status}).`, 'WICAN');
      const d = r.datos || {};
      return { ok: !!d.ok, positiva: !!d.positive, respuesta: String(d.response || ''), nrc: d.nrc ?? null, nrcNombre: d.nrc_name || null, ms: d.elapsed_ms ?? null };
    },
  };
  return cliente;
}

/** Texto corto para la barra de estado y los informes: «WiCAN Pro · firmware 4.50». */
export function textoWican(info) {
  if (!info) return '';
  return `${info.modelo}${info.firmware ? ` · firmware ${info.firmware}` : ''}`;
}

// --- Formas de llegar a la API del WiCAN ---------------------------------------------------------

/**
 * Desde el navegador del portátil, a través del programa de enlace (ruta /wican del puente.ps1).
 * El enlace solo atiende una cosa a la vez: mientras hay un coche conectado por Wi-Fi o J2534 no contesta,
 * así que esto se usa antes de conectar y después de desconectar.
 */
export function pedirPorEnlace({ host, enlace = 'http://localhost:35001', fetchImpl = globalThis.fetch, timeoutMs = 7000 } = {}) {
  return async (metodo, ruta, cuerpo) => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const url = `${enlace}/wican?host=${encodeURIComponent(host)}&ruta=${encodeURIComponent(ruta)}`;
      const r = await fetchImpl(url, {
        method: metodo === 'GET' ? 'GET' : 'POST',
        headers: metodo === 'GET' ? {} : { 'content-type': 'application/json', 'x-metodo': metodo },
        body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
        signal: ctl?.signal,
      });
      if (r.status === 502 || r.status === 504) {
        const txt = await r.text().catch(() => '');
        throw errorWican(txt || 'El WiCAN no contesta. ¿Está el portátil conectado a su red Wi-Fi (WiCAN_…)?', 'NO_WICAN');
      }
      const texto = await r.text();
      let datos = texto;
      try { datos = JSON.parse(texto); } catch { /* texto */ }
      return { status: r.status, datos };
    } catch (e) {
      if (e.code) throw e;
      throw errorWican('No contesta el programa de enlace. Ábrelo en el portátil («Iniciar Reyman Diag»).', 'SIN_ENLACE');
    } finally { if (t) clearTimeout(t); }
  };
}

/**
 * Desde la app instalada (iPhone, iPad, Android): petición HTTP nativa (CapacitorHttp),
 * que no tiene las limitaciones del navegador con las direcciones http:// de la red local.
 */
export function pedirNativo({ host, Http, timeoutMs = 7000 } = {}) {
  return async (metodo, ruta, cuerpo) => {
    if (!Http) throw errorWican('Falta el módulo HTTP de la app.', 'SIN_ENLACE');
    try {
      const r = await Http.request({
        url: `http://${host}${ruta}`,
        method: metodo,
        headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json' },
        data: metodo === 'GET' ? undefined : (cuerpo ?? {}),
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        responseType: 'json',
      });
      return { status: r.status, datos: r.data };
    } catch (e) {
      throw errorWican(`El WiCAN no contesta en ${host}. Conecta este dispositivo a su red Wi-Fi (WiCAN_…).`, 'NO_WICAN', { causa: e?.message });
    }
  };
}
