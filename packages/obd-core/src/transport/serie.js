// Reyman Diag · Transporte por puerto serie (Web Serial) — Chrome/Edge en Windows
// Sirve para el vLinker emparejado por Bluetooth clásico ("vLinker MC-Android", código 1234),
// que Windows publica como puerto COM, para adaptadores USB (vLinker FS USB) y para el WiCAN Pro
// por su cable USB-C (Windows ve dos puertos COM: uno es la consola del WiCAN y el otro el canal ELM327).
//
// Cada adaptador va a una velocidad distinta, así que se prueba: se abre el puerto, se manda «ATI» y,
// si no contesta como un ELM327, se cierra y se prueba la siguiente velocidad.

export const BAUDIOS_POR_DEFECTO = [38400, 115200, 2000000, 500000, 9600];

export function serieDisponible(nav = globalThis.navigator) {
  return typeof nav !== 'undefined' && !!nav?.serial;
}

/**
 * @param {object} op { baudios: [..], esperaMs, serial (navigator.serial o uno falso) }
 */
export function crearTransporteSerie(op = {}) {
  const serial = op.serial || globalThis.navigator?.serial;
  const baudios = op.baudios || BAUDIOS_POR_DEFECTO;
  const esperaMs = op.esperaMs ?? 1500;
  let puerto = null;
  let lector = null;
  let escritor = null;
  let cb = () => {};
  let alDesconectar = () => {};
  let leyendo = false;
  let cerrando = false;

  async function bucle() {
    const dec = new TextDecoder();
    leyendo = true;
    while (puerto?.readable && leyendo) {
      lector = puerto.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          if (value) cb(dec.decode(value));
        }
      } catch {
        if (!cerrando) alDesconectar();
        break;
      } finally {
        try { lector.releaseLock(); } catch { /* */ }
      }
    }
  }

  async function cerrar() {
    cerrando = true;
    leyendo = false;
    try { await lector?.cancel(); } catch { /* */ }
    try { escritor?.releaseLock(); } catch { /* */ }
    try { await puerto?.close(); } catch { /* */ }
    lector = null; escritor = null;
    cerrando = false;
  }

  // ¿Contesta como un ELM327 a esta velocidad?
  async function probar(baud) {
    await puerto.open({ baudRate: baud });
    escritor = puerto.writable.getWriter();
    let recibido = '';
    cb = (t) => { recibido += t; };
    bucle();
    const enc = new TextEncoder();
    await escritor.write(enc.encode('\r'));
    await new Promise((r) => setTimeout(r, 150));
    recibido = '';
    await escritor.write(enc.encode('ATI\r'));
    const fin = Date.now() + esperaMs;
    while (Date.now() < fin) {
      if (/ELM|STN|OBD|v\d\.\d|>/i.test(recibido)) {
        await new Promise((r) => setTimeout(r, 120)); // lo que quede de la respuesta no llega a la app
        return true;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return false;
  }

  return {
    tipo: 'serie',
    nombre: 'Puerto COM',
    baudios: null,
    async conectar() {
      if (!serial) throw new Error('Este navegador no permite puertos serie. Usa Chrome o Edge en Windows.');
      puerto = await serial.requestPort();
      const info = puerto.getInfo?.() || {};
      const usb = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}` : 'Puerto COM (Bluetooth)';
      const cbFinal = cb;
      for (const baud of baudios) {
        let ok = false;
        try { ok = await probar(baud); } catch { ok = false; }
        if (ok) {
          this.baudios = baud;
          this.nombre = `${usb} · ${baud >= 1000000 ? `${baud / 1000000} Mbaud` : `${baud} baud`}`;
          cb = cbFinal;
          return;
        }
        await cerrar();
      }
      cb = cbFinal;
      throw Object.assign(new Error('Ese puerto no contesta como un adaptador OBD. Si es un WiCAN Pro por USB, Windows le da dos puertos COM: prueba con el otro.'), { code: 'SIN_ADAPTADOR' });
    },
    async escribir(texto) { await escritor.write(new TextEncoder().encode(texto)); },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() { await cerrar(); },
  };
}
