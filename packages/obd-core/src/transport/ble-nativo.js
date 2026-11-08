// Reyman Diag / Reyman Connect · Transporte Bluetooth LE nativo (app Capacitor en iPhone y Android)
// En iPhone no existe Bluetooth web: la app de cliente usa el plugin @capacitor-community/bluetooth-le.
// El núcleo no depende del plugin: la app le pasa el objeto BleClient (así se puede probar con uno falso).
// El adaptador tiene que ser BLE (vLinker MC+/MS, WiCAN Pro, ELM327 BLE de calidad).

const uuid16 = (n) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

// Servicios conocidos de adaptadores ELM327 BLE. Ampliar con el del WiCAN Pro cuando se compruebe en el aparato.
export const SERVICIOS_BLE = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Vgate vLinker / iCar
  uuid16(0xfff0), // ELM327 BLE genéricos
  uuid16(0xffe0), // módulos tipo HM-10
  uuid16(0x18f0), // OBDLink / otros
];

export const PREFIJOS_NOMBRE = ['vLinker', 'OBD', 'V-LINK', 'IOS-Vlink', 'Android-Vlink', 'WiCAN', 'Reyman'];

/**
 * @param {object} op { BleClient (obligatorio), deviceId (para reconectar sin preguntar), tamTrozo, alElegir(dispositivo) }
 */
export function crearTransporteBleNativo(op = {}) {
  const ble = op.BleClient;
  const tamTrozo = op.tamTrozo || 20;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let dispositivo = null;
  let canal = null; // { servicio, escritura, notificacion, sinRespuesta }
  let cb = () => {};
  let alDesconectar = () => {};

  async function elegirCanal(id) {
    const servicios = await ble.getServices(id);
    // Preferimos escritura y notificación del MISMO servicio, y los servicios conocidos primero
    const orden = [...servicios].sort((a, b) => (SERVICIOS_BLE.includes(b.uuid) ? 1 : 0) - (SERVICIOS_BLE.includes(a.uuid) ? 1 : 0));
    for (const s of orden) {
      const esc = s.characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      const not = s.characteristics.find((c) => c.properties.notify || c.properties.indicate);
      if (esc && not) return { servicio: s.uuid, escritura: esc.uuid, notificacion: not.uuid, sinRespuesta: !esc.properties.write && !!esc.properties.writeWithoutResponse };
    }
    return null;
  }

  return {
    tipo: 'ble-nativo',
    nombre: 'Bluetooth',
    get deviceId() { return dispositivo?.deviceId || null; },
    async conectar() {
      if (!ble) throw new Error('Falta el módulo Bluetooth de la app.');
      await ble.initialize({ androidNeverForLocation: true });
      if (op.deviceId) {
        dispositivo = { deviceId: op.deviceId, name: op.nombre || 'Adaptador BLE' };
      } else {
        dispositivo = await ble.requestDevice({ optionalServices: SERVICIOS_BLE }).catch((e) => {
          throw Object.assign(new Error(/cancel/i.test(e?.message || '') ? 'Búsqueda cancelada.' : 'No se ha encontrado ningún adaptador. Enchúfalo, pon el contacto y acerca el móvil.'), { code: 'SIN_ADAPTADOR' });
        });
      }
      this.nombre = dispositivo.name || 'Adaptador BLE';
      op.alElegir?.(dispositivo);
      await ble.connect(dispositivo.deviceId, () => alDesconectar());
      canal = await elegirCanal(dispositivo.deviceId);
      if (!canal) {
        await ble.disconnect(dispositivo.deviceId).catch(() => {});
        throw Object.assign(new Error('El adaptador no expone un canal de datos compatible (ELM327).'), { code: 'INCOMPATIBLE' });
      }
      await ble.startNotifications(dispositivo.deviceId, canal.servicio, canal.notificacion, (valor) => {
        const bytes = valor instanceof DataView ? new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength) : new Uint8Array(valor);
        cb(dec.decode(bytes));
      });
    },
    async escribir(texto) {
      if (!canal) throw new Error('El adaptador Bluetooth no está conectado.');
      const datos = enc.encode(texto);
      for (let i = 0; i < datos.length; i += tamTrozo) {
        const trozo = datos.slice(i, i + tamTrozo);
        const dv = new DataView(trozo.buffer, trozo.byteOffset, trozo.byteLength);
        if (canal.sinRespuesta) await ble.writeWithoutResponse(dispositivo.deviceId, canal.servicio, canal.escritura, dv);
        else await ble.write(dispositivo.deviceId, canal.servicio, canal.escritura, dv);
      }
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      if (!dispositivo) return;
      try { if (canal) await ble.stopNotifications(dispositivo.deviceId, canal.servicio, canal.notificacion); } catch { /* */ }
      try { await ble.disconnect(dispositivo.deviceId); } catch { /* */ }
      canal = null;
    },
  };
}
