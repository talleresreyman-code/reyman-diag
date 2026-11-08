// Reyman Diag · Transporte Wi-Fi (adaptadores ELM327 Wi-Fi y WiCAN Pro en modo Wi-Fi)
// El navegador no puede abrir sockets TCP, así que habla por WebSocket con el programa de enlace
// del portátil (puente.ps1), que a su vez abre el TCP con el adaptador (normalmente 192.168.0.10:35000).
// Protocolo del enlace: tras abrir, el enlace responde "PUENTE_OK" o "PUENTE_ERROR: motivo";
// después todo lo que llega son bytes del adaptador (texto o binario).

export const WIFI_POR_DEFECTO = { host: '192.168.0.10', puerto: 35000, puente: 'ws://localhost:35001/ws' };

export function wifiDisponible(WebSocketImpl = globalThis.WebSocket) {
  return typeof WebSocketImpl === 'function';
}

/**
 * @param {object} op { host, puerto, puente, WebSocketImpl, timeoutMs }
 */
export function crearTransporteWifi(op = {}) {
  const host = op.host || WIFI_POR_DEFECTO.host;
  const puerto = Number(op.puerto || WIFI_POR_DEFECTO.puerto);
  const puente = op.puente || WIFI_POR_DEFECTO.puente;
  const WS = op.WebSocketImpl || globalThis.WebSocket;
  const timeoutMs = op.timeoutMs ?? 9000;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let ws = null;
  let cb = () => {};
  let alDesconectar = () => {};

  return {
    tipo: 'wifi',
    nombre: `Wi-Fi ${host}:${puerto}`,
    async conectar() {
      if (!wifiDisponible(WS)) throw new Error('Este navegador no permite la conexión Wi-Fi.');
      await new Promise((resolve, reject) => {
        let abierto = false;
        let listo = false;
        const url = `${puente}?host=${encodeURIComponent(host)}&port=${puerto}`;
        try { ws = new WS(url); } catch (e) { reject(e); return; }
        ws.binaryType = 'arraybuffer';
        const timer = setTimeout(() => {
          if (listo) return;
          try { ws.close(); } catch { /* */ }
          reject(Object.assign(new Error('El adaptador Wi-Fi no responde. ¿Está el portátil conectado a la red Wi-Fi del adaptador?'), { code: 'TIMEOUT' }));
        }, timeoutMs);
        ws.onopen = () => { abierto = true; };
        ws.onmessage = (ev) => {
          const txt = typeof ev.data === 'string' ? ev.data : dec.decode(new Uint8Array(ev.data));
          if (!listo) {
            if (txt.startsWith('PUENTE_OK')) { listo = true; clearTimeout(timer); resolve(); return; }
            if (txt.startsWith('PUENTE_ERROR')) {
              clearTimeout(timer);
              reject(Object.assign(new Error(txt.replace(/^PUENTE_ERROR:?\s*/, '')), { code: 'PUENTE' }));
              return;
            }
          }
          cb(txt);
        };
        ws.onerror = () => {
          if (abierto) return;
          clearTimeout(timer);
          reject(Object.assign(new Error('No está abierto el programa de enlace Wi-Fi. Ábrelo en el portátil («Iniciar Reyman Diag Wi-Fi») y vuelve a intentarlo.'), { code: 'SIN_PUENTE' }));
        };
        ws.onclose = () => { if (listo) alDesconectar(); };
      });
    },
    escribir(texto) {
      if (!ws || ws.readyState !== 1) throw new Error('El enlace Wi-Fi está cerrado.');
      ws.send(enc.encode(texto));
    },
    alRecibir(f) { cb = f; },
    alDesconectarse(f) { alDesconectar = f; },
    async desconectar() { try { ws?.close(); } catch { /* */ } },
  };
}
