// Reyman Diag · Transporte Bluetooth LE (Web Bluetooth) — Chrome en Android y Chrome/Edge en Windows
// El vLinker MC+ anuncia un canal BLE ("vLinker MC-IOS"). No se empareja desde Ajustes: se elige aquí.
// Como cada fabricante usa UUID distintos, pedimos los servicios conocidos y buscamos una
// característica de escritura y otra de notificación.

const SERVICIOS = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Vgate vLinker / iCar
  0xfee0, // WiCAN / WiCAN Pro
  0xfff0, // ELM327 BLE genéricos
  0xffe0, // módulos tipo HM-10
  0x18f0, // OBDLink / otros
  '0000fff0-0000-1000-8000-00805f9b34fb',
];

export function bleDisponible() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export function crearTransporteBle() {
  let dispositivo = null;
  let escritura = null;
  let notificacion = null;
  let cb = () => {};
  let alDesconectar = () => {};
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  return {
    tipo: 'ble',
    nombre: 'Bluetooth',
    async conectar() {
      if (!bleDisponible()) throw new Error('Este navegador no permite Bluetooth. Usa Chrome en Android o Chrome/Edge en el portátil.');
      dispositivo = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'vLinker' }, { namePrefix: 'OBD' }, { namePrefix: 'V-LINK' }, { namePrefix: 'IOS-Vlink' }, { namePrefix: 'Android-Vlink' }],
        optionalServices: SERVICIOS,
      }).catch(async (e) => {
        if (e.name === 'NotFoundError' && /cancel/i.test(e.message)) throw e;
        // Si no aparece con filtros, dejamos elegir cualquier dispositivo
        return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS });
      });
      this.nombre = dispositivo.name || 'Adaptador BLE';
      dispositivo.addEventListener('gattserverdisconnected', () => alDesconectar());
      const servidor = await dispositivo.gatt.connect();
      const servicios = await servidor.getPrimaryServices();
      for (const s of servicios) {
        const chars = await s.getCharacteristics();
        for (const c of chars) {
          if (!escritura && (c.properties.write || c.properties.writeWithoutResponse)) escritura = c;
          if (!notificacion && (c.properties.notify || c.properties.indicate)) notificacion = c;
        }
        if (escritura && notificacion) break;
      }
      if (!escritura || !notificacion) throw new Error('El adaptador no expone un canal de datos compatible (ELM327).');
      notificacion.addEventListener('characteristicvaluechanged', (ev) => cb(dec.decode(ev.target.value)));
      await notificacion.startNotifications();
    },
    async escribir(texto) {
      const datos = enc.encode(texto);
      // Algunos adaptadores aceptan como máximo 20 bytes por escritura
      for (let i = 0; i < datos.length; i += 20) {
        const trozo = datos.slice(i, i + 20);
        if (escritura.properties.writeWithoutResponse) await escritura.writeValueWithoutResponse(trozo);
        else await escritura.writeValue(trozo);
      }
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      try { await notificacion?.stopNotifications(); } catch { /* */ }
      try { dispositivo?.gatt?.disconnect(); } catch { /* */ }
    },
  };
}
