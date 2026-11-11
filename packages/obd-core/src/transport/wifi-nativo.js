// Reyman Diag / Reyman Connect · Transporte Wi-Fi nativo (app Capacitor en iPhone, iPad y Android)
// La app instalada sí puede abrir un socket TCP directo con el adaptador (WiCAN Pro: 192.168.0.10:35000),
// sin el programa de enlace del portátil. Usa el plugin capacitor-tcp-socket; el núcleo no depende de él:
// la app le pasa el objeto TcpSocket (así se puede probar con uno falso).

export const WIFI_NATIVO_POR_DEFECTO = { host: '192.168.0.10', puerto: 35000 };

/**
 * @param {object} op { TcpSocket (obligatorio), host, puerto, timeoutS }
 */
export function crearTransporteWifiNativo(op = {}) {
  const tcp = op.TcpSocket;
  const host = op.host || WIFI_NATIVO_POR_DEFECTO.host;
  const puerto = Number(op.puerto || WIFI_NATIVO_POR_DEFECTO.puerto);
  let cliente = null;
  let abierto = false;
  let cb = () => {};
  let alDesconectar = () => {};

  // Bucle de lectura: el plugin devuelve trozos sueltos; el ELM327 ya junta hasta el «>»
  async function leer() {
    while (abierto) {
      try {
        const r = await tcp.read({ client: cliente, expectLen: 4096, timeout: 2, encoding: 'utf8' });
        if (r?.result) cb(r.encoding === 'base64' ? atob(r.result) : r.result);
      } catch (e) {
        if (!abierto) return;
        if (e?.code === 'TIMEOUT') continue;
        abierto = false;
        alDesconectar();
        return;
      }
    }
  }

  return {
    tipo: 'wifi-nativo',
    nombre: `Wi-Fi ${host}:${puerto}`,
    async conectar() {
      if (!tcp) throw new Error('Falta el módulo Wi-Fi de la app.');
      try {
        const r = await tcp.connect({ ipAddress: host, port: puerto, timeout: op.timeoutS ?? 8 });
        cliente = r.client;
      } catch (e) {
        throw Object.assign(new Error(`No se puede conectar con el adaptador Wi-Fi (${host}:${puerto}). Conecta el móvil o la tablet a la red Wi-Fi del adaptador (WiCAN_…) y vuelve a intentarlo.`), { code: 'SIN_ADAPTADOR', causa: e?.code });
      }
      abierto = true;
      leer();
    },
    escribir(texto) {
      if (!abierto) throw new Error('La conexión Wi-Fi está cerrada.');
      tcp.send({ client: cliente, data: texto, encoding: 'utf8' }).catch(() => { if (abierto) { abierto = false; alDesconectar(); } });
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() {
      abierto = false;
      try { if (cliente !== null) await tcp.disconnect({ client: cliente }); } catch { /* */ }
    },
  };
}
