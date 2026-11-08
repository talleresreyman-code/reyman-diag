// Reyman Diag · Transporte por puerto serie (Web Serial) — Chrome/Edge en Windows
// Sirve para el vLinker emparejado por Bluetooth clásico ("vLinker MC-Android", código 1234),
// que Windows publica como puerto COM, y para adaptadores USB (vLinker FS USB).

export function serieDisponible() {
  return typeof navigator !== 'undefined' && !!navigator.serial;
}

export function crearTransporteSerie() {
  let puerto = null;
  let lector = null;
  let escritor = null;
  let cb = () => {};
  let alDesconectar = () => {};
  let leyendo = false;

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
        alDesconectar();
        break;
      } finally {
        lector.releaseLock();
      }
    }
  }

  return {
    tipo: 'serie',
    nombre: 'Puerto COM',
    async conectar() {
      if (!serieDisponible()) throw new Error('Este navegador no permite puertos serie. Usa Chrome o Edge en Windows.');
      puerto = await navigator.serial.requestPort();
      await puerto.open({ baudRate: 38400 });
      const info = puerto.getInfo?.() || {};
      this.nombre = info.usbVendorId ? `USB ${info.usbVendorId.toString(16)}` : 'Puerto COM (Bluetooth)';
      escritor = puerto.writable.getWriter();
      bucle();
    },
    async escribir(texto) { await escritor.write(new TextEncoder().encode(texto)); },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      leyendo = false;
      try { await lector?.cancel(); } catch { /* */ }
      try { escritor?.releaseLock(); } catch { /* */ }
      try { await puerto?.close(); } catch { /* */ }
    },
  };
}
