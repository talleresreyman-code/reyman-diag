import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearTransporteWifiNativo } from '@reyman/obd-core/transport/wifi-nativo.js';
import { crearSimulador } from '@reyman/obd-core/transport/simulador.js';
import { Elm327 } from '@reyman/obd-core/obd/elm327.js';
import { Obd } from '@reyman/obd-core/obd/obd.js';

// TcpSocket falso (como capacitor-tcp-socket) con el simulador de coche detrás
function tcpFalso({ fallaConectar = false } = {}) {
  const sim = crearSimulador({ coche: 'diesel', latenciaMs: 1 });
  const cola = [];
  let esperando = null;
  sim.alRecibir((t) => { if (esperando) { const r = esperando; esperando = null; r(t); } else cola.push(t); });
  return {
    async connect({ ipAddress, port }) { if (fallaConectar) throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }); this.destino = `${ipAddress}:${port}`; await sim.conectar(); return { client: 1 }; },
    async send({ data }) { sim.escribir(data); },
    read({ timeout }) {
      if (cola.length) return Promise.resolve({ result: cola.shift(), encoding: 'utf8' });
      return new Promise((res, rej) => {
        esperando = (t) => res({ result: t, encoding: 'utf8' });
        setTimeout(() => { if (esperando) { esperando = null; rej(Object.assign(new Error('t'), { code: 'TIMEOUT' })); } }, Math.min(timeout * 1000, 50));
      });
    },
    async disconnect() { return { client: 1 }; },
  };
}

test('Wi-Fi nativo (WiCAN Pro en la app): lee el coche por TCP directo', async () => {
  const TcpSocket = tcpFalso();
  const t = crearTransporteWifiNativo({ TcpSocket });
  const elm = new Elm327(t, { timeoutMs: 3000 });
  await t.conectar();
  assert.equal(TcpSocket.destino, '192.168.0.10:35000');
  await elm.iniciar();
  const obd = new Obd(elm);
  assert.equal((await obd.vin()).vin, 'WVWZZZAUZHW512345');
  await t.desconectar();
});

test('Wi-Fi nativo: mensaje claro si el móvil no está en la red del adaptador', async () => {
  const t = crearTransporteWifiNativo({ TcpSocket: tcpFalso({ fallaConectar: true }), host: '192.168.0.10', puerto: 35000 });
  await assert.rejects(t.conectar(), /red Wi-Fi del adaptador/);
});
