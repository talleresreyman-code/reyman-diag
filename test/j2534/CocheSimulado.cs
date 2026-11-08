// Coche simulado para probar el enlace J2534 sin Windows ni V200 (solo pruebas; no se envía al portátil).
// Imita lo visto en el PSA de José: el motor contesta OBD por la petición general (7DF -> 7E8) pero no a 7E0,
// y el diagnóstico de fabricante va por otras direcciones (6A8/688...). Hay tráfico propio en el bus (6F0, 7A0).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;

public class EcuSim {
  public string Nombre; public uint Tx; public uint Rx; public uint RxObd; public bool Obd;
  public string Vin; public string Ref;
  public List<byte[]> Dtcs = new List<byte[]>(); // 4 bytes: 3 de código + estado
  public bool BorrarNecesitaSesion; public byte Sesion = 1;
}

public class CocheSimulado : IPassThru {
  public uint BitsBus = 11; public uint Baudios = 500000; public double Tension = 12.4;
  public List<EcuSim> Ecus = new List<EcuSim>();
  public uint[] Ocupados = { 0x6F0, 0x7A0 };
  class Canal { public uint Proto; public uint Baud; public bool Bits29; public Dictionary<uint, uint> Fc = new Dictionary<uint, uint>(); public Dictionary<uint, uint> FcPorFiltro = new Dictionary<uint, uint>(); public List<KeyValuePair<uint, uint>> Pasa = new List<KeyValuePair<uint, uint>>(); public List<KeyValuePair<long, PASSTHRU_MSG>> Cola = new List<KeyValuePair<long, PASSTHRU_MSG>>(); public long ProxTrafico; public Dictionary<uint, KeyValuePair<uint, byte[]>> EsperandoFc = new Dictionary<uint, KeyValuePair<uint, byte[]>>(); }
  public int FcCortos; // controles de flujo de menos de 8 bytes recibidos (la centralita los ignora)
  Dictionary<uint, Canal> canales = new Dictionary<uint, Canal>();
  uint sig = 1; uint sigFiltro = 1; bool abierto;
  public List<string> Enviados = new List<string>();
  static long Ahora() { return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond; }

  public CocheSimulado() {
    var motor = new EcuSim { Nombre = "MOTOR", Tx = 0x6A8, Rx = 0x688, RxObd = 0x7E8, Obd = true, Vin = "VF3LCYHZPKS123456", Ref = "9805263499" };
    var abs = new EcuSim { Nombre = "ABS ESP", Tx = 0x6AD, Rx = 0x68D, Ref = "9812345680" };
    abs.Dtcs.Add(new byte[] { 0x40, 0x35, 0x1F, 0x09 }); // C0035-1F confirmada y activa
    abs.Dtcs.Add(new byte[] { 0x40, 0x40, 0x00, 0x40 }); // historial sin estado relevante: no se muestra
    var airbag = new EcuSim { Nombre = "AIRBAG", Tx = 0x772, Rx = 0x672, Ref = "9800000001", BorrarNecesitaSesion = true };
    airbag.Dtcs.Add(new byte[] { 0x90, 0x01, 0x13, 0x28 }); // B1001-13 confirmada (no activa)
    var bsi = new EcuSim { Nombre = "BSI", Tx = 0x752, Rx = 0x652, Vin = "VF3LCYHZPKS123456" };
    bsi.Dtcs.Add(new byte[] { 0xC1, 0x00, 0x00, 0x04 }); // U0100-00 pendiente
    Ecus.AddRange(new[] { motor, abs, airbag, bsi });
  }

  public int Open(out uint dev) { dev = 1; abierto = true; return 0; }
  public int Close(uint dev) { abierto = false; return 0; }
  public int Connect(uint dev, uint proto, uint flags, uint baud, out uint ch) {
    ch = sig++;
    canales[ch] = new Canal { Proto = proto, Baud = baud, Bits29 = (flags & 0x100) != 0 };
    return 0;
  }
  public int Disconnect(uint ch) { return canales.Remove(ch) ? 0 : 0x02; }
  public int ReadVersion(uint dev, StringBuilder fw, StringBuilder dll, StringBuilder api) { fw.Append("SIM 1.0"); dll.Append("SIM DLL"); api.Append("04.04"); return 0; }
  public string LastError() { return ""; }
  public int ReadVbatt(uint dev, out uint mv) { mv = (uint)(Tension * 1000); return 0; }
  public int ClearRx(uint ch) { canales[ch].Cola.Clear(); return 0; }
  public int SetConfig(uint ch, uint param, uint valor) { return 0; }
  static uint Id(byte[] d) { return (uint)(d[0] << 24 | d[1] << 16 | d[2] << 8 | d[3]); }
  static byte[] Datos(PASSTHRU_MSG m) { var b = new byte[m.DataSize]; Array.Copy(m.Data, b, m.DataSize); return b; }
  public int StartFilter(uint ch, uint type, PASSTHRU_MSG mask, PASSTHRU_MSG pat, PASSTHRU_MSG fc, bool conFc, out uint id) {
    id = sigFiltro++;
    var c = canales[ch];
    if (type == 3) {
      if (c.Proto != 6 || !conFc || mask.DataSize != 4 || pat.DataSize != 4 || fc.DataSize != 4) return 0x0A;
      if (fc.TxFlags != 0 && (fc.TxFlags & ~0x140u) != 0) return 0x0A;
      if (c.Fc.Count >= 10) return 0x0C; // ERR_EXCEEDED_LIMIT
      c.Fc[Id(Datos(pat))] = Id(Datos(fc)); c.FcPorFiltro[id] = Id(Datos(pat));
    } else c.Pasa.Add(new KeyValuePair<uint, uint>(Id(Datos(mask)), Id(Datos(pat))));
    return 0;
  }
  public int StopFilter(uint ch, uint id) {
    var c = canales[ch]; uint rx;
    if (!c.FcPorFiltro.TryGetValue(id, out rx)) return 0x0B; // ERR_INVALID_FILTER_ID
    c.FcPorFiltro.Remove(id); c.Fc.Remove(rx); return 0;
  }

  bool BusOk(Canal c) { return c.Baud == Baudios && (c.Bits29 ? 29u : 11u) == BitsBus; }

  void Encolar(Canal c, uint id, byte[] payload, uint status, int retrasoMs) {
    var d = new byte[4 + payload.Length];
    d[0] = (byte)(id >> 24); d[1] = (byte)(id >> 16); d[2] = (byte)(id >> 8); d[3] = (byte)id;
    Array.Copy(payload, 0, d, 4, payload.Length);
    var m = Puente.Msg(c.Proto, d, 0); m.RxStatus = status; m.Timestamp = (uint)(Ahora() & 0xFFFFFFF);
    c.Cola.Add(new KeyValuePair<long, PASSTHRU_MSG>(Ahora() + retrasoMs, m));
  }

  public int Write(uint ch, PASSTHRU_MSG msg, uint timeout) {
    var c = canales[ch];
    var d = Datos(msg);
    uint id = Id(d);
    var p = d.Skip(4).ToArray();
    Enviados.Add(id.ToString("X") + ":" + Puente.Hex(p, p.Length));
    if (Ocupados.Contains(id)) throw new Exception("PRUEBA FALLIDA: se ha enviado una trama con un ID que usa el coche (" + id.ToString("X") + ")");
    Encolar(c, id, p, 0x09, 0); // eco + fin de envío, como la V200
    if (!BusOk(c)) return 0;
    if (c.Proto != 5) return 0; // el enlace trabaja siempre sobre CAN crudo
    if (p.Length < 8) { if (p.Length >= 1 && (p[0] >> 4) == 3) FcCortos++; return 0; } // tramas sin relleno: las centralitas las ignoran
    int tipo = p[0] >> 4;
    if (tipo == 3) {
      // Control de flujo del equipo: la centralita envía el resto de tramas
      KeyValuePair<uint, byte[]> pend;
      if (c.EsperandoFc.TryGetValue(id, out pend)) {
        c.EsperandoFc.Remove(id);
        var r = pend.Value; int sn = 1;
        for (int i = 6; i < r.Length; i += 7, sn++) {
          var t = new byte[8]; t[0] = (byte)(0x20 | (sn & 0x0F));
          for (int k = 0; k < 7; k++) t[1 + k] = i + k < r.Length ? r[i + k] : (byte)0xAA;
          Encolar(c, pend.Key, t, 0, 1 + sn);
        }
      }
      return 0;
    }
    if (tipo != 0) return 0;
    int l = p[0] & 0x0F;
    var req = p.Skip(1).Take(l).ToArray();
    uint funcional = BitsBus == 29 ? 0x18DB33F1u : 0x7DFu;
    if (id == funcional) {
      foreach (var e in Ecus.Where(x => x.Obd)) {
        uint rx = BitsBus == 29 ? 0x18DAF110u : e.RxObd;
        uint fcDe = BitsBus == 29 ? 0x18DA10F1u : e.RxObd - 8;
        Responder(c, e, req, rx, fcDe, true);
      }
    } else {
      var e = Ecus.FirstOrDefault(x => x.Tx == id);
      if (e != null) Responder(c, e, req, e.Rx, e.Tx, false);
    }
    return 0;
  }

  // Envía una respuesta ISO-TP: una trama, o la primera y el resto cuando llegue el control de flujo
  void EnviarIsoTp(Canal c, uint rx, uint fcDe, byte[] r, int retraso) {
    if (r.Length <= 7) {
      var t = new byte[8]; t[0] = (byte)r.Length;
      for (int k = 0; k < 7; k++) t[1 + k] = k < r.Length ? r[k] : (byte)0xAA;
      Encolar(c, rx, t, 0, retraso);
      return;
    }
    var ff = new byte[8]; ff[0] = (byte)(0x10 | (r.Length >> 8)); ff[1] = (byte)r.Length;
    Array.Copy(r, 0, ff, 2, 6);
    Encolar(c, rx, ff, 0, retraso);
    c.EsperandoFc[fcDe] = new KeyValuePair<uint, byte[]>(rx, r);
  }

  void Responder(Canal c, EcuSim e, byte[] p, uint rx, uint fcDe, bool obd) {
    byte[] r = null;
    byte s = p[0];
    if (obd) {
      if (s == 0x01 && p[1] == 0x00) r = new byte[] { 0x41, 0x00, 0xBE, 0x3E, 0xB8, 0x11 };
      else if (s == 0x01 && p[1] == 0x01) r = new byte[] { 0x41, 0x01, 0x00, 0x07, 0x61, 0x00 };
      else if (s == 0x01 && p[1] == 0x0C) r = new byte[] { 0x41, 0x0C, 0x0B, 0x40 };
      else if (s == 0x03) r = new byte[] { 0x43, 0x00 };
      else if (s == 0x07) r = new byte[] { 0x47, 0x00 };
      else if (s == 0x09 && p[1] == 0x04) r = new byte[] { 0x49, 0x04, 0x01 }.Concat(Encoding.ASCII.GetBytes("9805263499")).Concat(new byte[6]).ToArray();
      else return; // 0902, 0A...: sin respuesta (como el PSA real)
    } else {
      if (s == 0x3E) r = new byte[] { 0x7E, 0x00 };
      else if (s == 0x10) { e.Sesion = p[1]; r = new byte[] { 0x50, p[1], 0x00, 0x32, 0x01, 0xF4 }; }
      else if (s == 0x22 && p[1] == 0xF1 && p[2] == 0x90 && e.Vin != null) r = new byte[] { 0x62, 0xF1, 0x90 }.Concat(Encoding.ASCII.GetBytes(e.Vin)).ToArray();
      else if (s == 0x22 && p[1] == 0xF1 && p[2] == 0x87 && e.Ref != null) r = new byte[] { 0x62, 0xF1, 0x87 }.Concat(Encoding.ASCII.GetBytes(e.Ref)).ToArray();
      else if (s == 0x22 && p[1] == 0xF1 && p[2] == 0x97) r = new byte[] { 0x62, 0xF1, 0x97 }.Concat(Encoding.ASCII.GetBytes(e.Nombre)).ToArray();
      else if (s == 0x22) r = new byte[] { 0x7F, 0x22, 0x31 };
      else if (s == 0x19 && p[1] == 0x02) {
        EnviarIsoTp(c, rx, fcDe, new byte[] { 0x7F, 0x19, 0x78 }, 5); // «respuesta pendiente» antes de contestar
        r = new byte[] { 0x59, 0x02, 0xFF }.Concat(e.Dtcs.SelectMany(x => x)).ToArray();
        EnviarIsoTp(c, rx, fcDe, r, 120);
        return;
      } else if (s == 0x14) {
        if (e.BorrarNecesitaSesion && e.Sesion != 3) r = new byte[] { 0x7F, 0x14, 0x22 };
        else { e.Dtcs.Clear(); r = new byte[] { 0x54 }; }
      } else r = new byte[] { 0x7F, s, 0x11 };
    }
    EnviarIsoTp(c, rx, fcDe, r, 8);
  }

  public int Read(uint ch, out PASSTHRU_MSG msg, uint timeout, out uint num) {
    var c = canales[ch];
    long fin = Ahora() + timeout;
    do {
      if (c.Proto == 5 && BusOk(c) && Ahora() >= c.ProxTrafico) {
        // Tráfico propio del coche en el bus (el escaneo no debe enviar con estos ID)
        foreach (var o in Ocupados) Encolar(c, o, new byte[] { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 }, 0, 0);
        c.ProxTrafico = Ahora() + 100;
      }
      var listo = c.Cola.Where(k => k.Key <= Ahora()).OrderBy(k => k.Key).FirstOrDefault();
      if (listo.Value.Data != null) {
        c.Cola.Remove(listo);
        var m = listo.Value;
        uint id = Id(m.Data);
        bool pasa = (m.RxStatus & 0x01) != 0 || c.Pasa.Any(f => (id & f.Key) == f.Value);
        if (!pasa) continue;
        msg = m; num = 1; return 0;
      }
      Thread.Sleep(1);
    } while (Ahora() < fin);
    msg = Puente.Msg(0, new byte[0], 0); num = 0; return 0x10;
  }
}
