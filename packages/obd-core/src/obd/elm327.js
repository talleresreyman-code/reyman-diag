// Reyman Diag · Controlador del ELM327 (vLinker MC+ y compatibles)
// Envía comandos de texto por un transporte (BLE, puerto serie o simulador) y espera el prompt ">".

export const PROTOCOLOS = {
  '0': 'Automático',
  '1': 'SAE J1850 PWM (41,6 kbaud)',
  '2': 'SAE J1850 VPW (10,4 kbaud)',
  '3': 'ISO 9141-2 (5 baud init)',
  '4': 'ISO 14230-4 KWP2000 (5 baud init)',
  '5': 'ISO 14230-4 KWP2000 (init rápido)',
  '6': 'ISO 15765-4 CAN (11 bits, 500 kbaud)',
  '7': 'ISO 15765-4 CAN (29 bits, 500 kbaud)',
  '8': 'ISO 15765-4 CAN (11 bits, 250 kbaud)',
  '9': 'ISO 15765-4 CAN (29 bits, 250 kbaud)',
  A: 'SAE J1939 CAN (29 bits, 250 kbaud)',
};

export class Elm327 {
  /**
   * @param {object} transporte { conectar(), desconectar(), escribir(texto), alRecibir(cb), nombre }
   * @param {object} opciones { log(dir, texto), timeoutMs }
   */
  constructor(transporte, opciones = {}) {
    this.t = transporte;
    this.log = opciones.log || (() => {});
    this.timeoutMs = opciones.timeoutMs || 6000;
    this.buffer = '';
    this.pendiente = null;
    this.cola = Promise.resolve();
    this.info = { version: null, protocolo: null, tension: null };
    this.t.alRecibir((txt) => this._recibir(txt));
  }

  _recibir(txt) {
    this.buffer += txt;
    if (this.buffer.includes('>') && this.pendiente) {
      const resp = this.buffer.slice(0, this.buffer.lastIndexOf('>'));
      this.buffer = '';
      const p = this.pendiente;
      this.pendiente = null;
      clearTimeout(p.timer);
      this.log('rx', resp.trim());
      p.resolve(resp);
    }
  }

  /** Envía un comando y devuelve la respuesta en texto (sin el prompt). Los comandos van en cola. */
  enviar(cmd, timeoutMs) {
    const tarea = () => new Promise((resolve, reject) => {
      this.buffer = '';
      const timer = setTimeout(() => {
        this.pendiente = null;
        reject(Object.assign(new Error(`Sin respuesta del adaptador a "${cmd}"`), { code: 'TIMEOUT' }));
      }, timeoutMs || this.timeoutMs);
      this.pendiente = { resolve, reject, timer };
      this.log('tx', cmd);
      Promise.resolve(this.t.escribir(cmd + '\r')).catch((e) => {
        clearTimeout(timer);
        this.pendiente = null;
        reject(e);
      });
    });
    const p = this.cola.then(tarea, tarea);
    this.cola = p.catch(() => {});
    return p;
  }

  /** Secuencia de arranque estándar. Devuelve info del adaptador y del protocolo detectado. */
  async iniciar() {
    await this.enviar('ATZ', 8000).catch(() => this.enviar('ATZ', 8000));
    const ati = await this.enviar('ATI');
    this.info.version = (ati.match(/ELM327\s*v?[\d.]+\w*/i) || [ati.trim()])[0];
    for (const c of ['ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATAT1', 'ATSP0']) await this.enviar(c);
    // Primera petición: fuerza la búsqueda de protocolo (puede tardar en protocolos antiguos)
    let r = await this.enviar('0100', 20000);
    if (/UNABLE TO CONNECT|NO DATA|ERROR/i.test(r)) {
      // Coches con OBD sobre UDS (SAE J1979-2): no contestan al 01 00 pero sí al 22 F400 (CAN 11 bits 500k)
      let u = await this.enviar('22F400', 5000).catch(() => '');
      if (!/62\s*F4/i.test(u)) { await this.enviar('ATSP6'); u = await this.enviar('22F400', 5000).catch(() => ''); }
      if (/62\s*F4/i.test(u)) { r = u; this.info.obdUds = true; }
    }
    if (/UNABLE TO CONNECT|NO DATA|ERROR/i.test(r)) {
      const e = new Error(/UNABLE/i.test(r)
        ? 'El adaptador no consigue comunicar con el coche. Pon el contacto (o arranca) y vuelve a intentarlo.'
        : 'El coche no responde a las peticiones OBD estándar.');
      e.code = 'SIN_VEHICULO';
      throw e;
    }
    const dpn = (await this.enviar('ATDPN')).trim().replace(/^A/, '');
    this.info.protocolo = { codigo: dpn, nombre: PROTOCOLOS[dpn] || `Protocolo ${dpn}` };
    this.info.tension = await this.tension();
    return { ...this.info, primeraRespuesta: r };
  }

  async tension() {
    const r = await this.enviar('ATRV');
    const m = r.match(/(\d+(?:\.\d+)?)\s*V/i);
    return m ? Number(m[1]) : null;
  }

  /** Fija la cabecera de petición (para centralitas concretas o datos de marca, modo 22). */
  async cabecera(h) { return this.enviar(`ATSH${h}`); }

  async cerrar() {
    try { await this.enviar('ATPC', 1500); } catch { /* da igual */ }
    await this.t.desconectar();
  }
}
