// Reyman Diag · enlace J2534 (MaxiVCI V200 y otras interfaces PassThru)
// La app (navegador) habla con este enlace por WebSocket con un protocolo de texto muy simple, una línea por petición:
//   "<n> <orden> <argumentos...>"  ->  "<n> OK <...>"  o  "<n> ERR <código> <mensaje>"
// Toda la lógica de diagnosis (ELM327, OBD, UDS, escaneo) está en la app; aquí solo se pasan mensajes a la DLL J2534.
// C# 5 (lo compila PowerShell 5.1 con Add-Type). Debe cargarse en PowerShell de 32 bits: las DLL J2534 son de 32 bits.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct PASSTHRU_MSG {
  public uint ProtocolID; public uint RxStatus; public uint TxFlags; public uint Timestamp; public uint DataSize; public uint ExtraDataIndex;
  [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4128)] public byte[] Data;
}

public interface IPassThru {
  int Open(out uint dev);
  int Close(uint dev);
  int Connect(uint dev, uint proto, uint flags, uint baud, out uint ch);
  int Disconnect(uint ch);
  int ReadVersion(uint dev, StringBuilder fw, StringBuilder dll, StringBuilder api);
  string LastError();
  int ReadVbatt(uint dev, out uint mv);
  int ClearRx(uint ch);
  int SetConfig(uint ch, uint param, uint valor);
  int StartFilter(uint ch, uint type, PASSTHRU_MSG mask, PASSTHRU_MSG pat, PASSTHRU_MSG fc, bool conFc, out uint id);
  int StopFilter(uint ch, uint id);
  int Write(uint ch, PASSTHRU_MSG msg, uint timeout);
  int Read(uint ch, out PASSTHRU_MSG msg, uint timeout, out uint num);
}

/// <summary>Acceso real a la DLL J2534 (SAE J2534-1 v04.04).</summary>
public class PassThruDll : IPassThru {
  [DllImport("kernel32", SetLastError = true, CharSet = CharSet.Ansi)] static extern IntPtr LoadLibrary(string f);
  [DllImport("kernel32", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr h, string n);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dOpen(IntPtr name, out uint id);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dU(uint id);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dConnect(uint dev, uint proto, uint flags, uint baud, out uint ch);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)] delegate int dVersion(uint dev, StringBuilder fw, StringBuilder dll, StringBuilder api);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Ansi)] delegate int dLastError(StringBuilder s);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dIoctl(uint id, uint ioctl, IntPtr inp, IntPtr outp);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dFilterFc(uint ch, uint type, ref PASSTHRU_MSG mask, ref PASSTHRU_MSG pat, ref PASSTHRU_MSG fc, out uint fid);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dFilterSinFc(uint ch, uint type, ref PASSTHRU_MSG mask, ref PASSTHRU_MSG pat, IntPtr fc, out uint fid);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dStopFilter(uint ch, uint fid);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dWrite(uint ch, ref PASSTHRU_MSG msg, ref uint num, uint timeout);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int dRead(uint ch, ref PASSTHRU_MSG msg, ref uint num, uint timeout);

  dOpen open; dU close; dConnect connect; dU disconnect; dVersion version; dLastError lastError; dIoctl ioctl;
  dFilterFc filterFc; dFilterSinFc filterSinFc; dStopFilter stopFilter; dWrite write; dRead read;

  static T F<T>(IntPtr h, string n) where T : class {
    IntPtr p = GetProcAddress(h, n);
    if (p == IntPtr.Zero) throw new Exception("La DLL no tiene " + n);
    return Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
  }

  public PassThruDll(string dll) {
    IntPtr h = LoadLibrary(dll);
    if (h == IntPtr.Zero) throw new Exception("No se puede cargar " + dll + " (error " + Marshal.GetLastWin32Error() + ")");
    open = F<dOpen>(h, "PassThruOpen"); close = F<dU>(h, "PassThruClose"); connect = F<dConnect>(h, "PassThruConnect");
    disconnect = F<dU>(h, "PassThruDisconnect"); version = F<dVersion>(h, "PassThruReadVersion"); lastError = F<dLastError>(h, "PassThruGetLastError");
    ioctl = F<dIoctl>(h, "PassThruIoctl"); filterFc = F<dFilterFc>(h, "PassThruStartMsgFilter"); filterSinFc = F<dFilterSinFc>(h, "PassThruStartMsgFilter");
    stopFilter = F<dStopFilter>(h, "PassThruStopMsgFilter"); write = F<dWrite>(h, "PassThruWriteMsgs"); read = F<dRead>(h, "PassThruReadMsgs");
  }

  public int Open(out uint dev) { return open(IntPtr.Zero, out dev); }
  public int Close(uint dev) { return close(dev); }
  public int Connect(uint dev, uint proto, uint flags, uint baud, out uint ch) { return connect(dev, proto, flags, baud, out ch); }
  public int Disconnect(uint ch) { return disconnect(ch); }
  public int ReadVersion(uint dev, StringBuilder fw, StringBuilder dll, StringBuilder api) { return version(dev, fw, dll, api); }
  public string LastError() { var s = new StringBuilder(256); lastError(s); return s.ToString(); }
  public int ReadVbatt(uint dev, out uint mv) {
    IntPtr p = Marshal.AllocHGlobal(4);
    try { int r = ioctl(dev, 0x03, IntPtr.Zero, p); mv = (uint)Marshal.ReadInt32(p); return r; } finally { Marshal.FreeHGlobal(p); }
  }
  public int ClearRx(uint ch) { return ioctl(ch, 0x08, IntPtr.Zero, IntPtr.Zero); }
  // SET_CONFIG con un solo parámetro (p. ej. J1962_PINS = 0x8001: pines del conector OBD que usa el canal)
  public int SetConfig(uint ch, uint param, uint valor) {
    IntPtr cfg = Marshal.AllocHGlobal(8); IntPtr lista = Marshal.AllocHGlobal(8);
    try {
      Marshal.WriteInt32(cfg, 0, (int)param); Marshal.WriteInt32(cfg, 4, (int)valor);
      Marshal.WriteInt32(lista, 0, 1); Marshal.WriteIntPtr(lista, 4, cfg);
      return ioctl(ch, 0x02, lista, IntPtr.Zero);
    } finally { Marshal.FreeHGlobal(cfg); Marshal.FreeHGlobal(lista); }
  }
  public int StartFilter(uint ch, uint type, PASSTHRU_MSG mask, PASSTHRU_MSG pat, PASSTHRU_MSG fc, bool conFc, out uint id) {
    if (conFc) return filterFc(ch, type, ref mask, ref pat, ref fc, out id);
    return filterSinFc(ch, type, ref mask, ref pat, IntPtr.Zero, out id);
  }
  public int StopFilter(uint ch, uint id) { return stopFilter(ch, id); }
  public int Write(uint ch, PASSTHRU_MSG msg, uint timeout) { uint n = 1; return write(ch, ref msg, ref n, timeout); }
  public int Read(uint ch, out PASSTHRU_MSG msg, uint timeout, out uint num) {
    msg = Puente.Msg(0, new byte[0], 0); uint n = 1; int r = read(ch, ref msg, ref n, timeout); num = n; return r;
  }
}

/// <summary>Atiende las órdenes de texto de la app.</summary>
public class Puente {
  readonly IPassThru pt;
  readonly Func<long> ahora;
  uint dev;
  bool abierto;

  public Puente(IPassThru passThru) : this(passThru, null) { }
  public Puente(IPassThru passThru, Func<long> reloj) {
    pt = passThru;
    ahora = reloj ?? (() => DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond);
  }

  public static PASSTHRU_MSG Msg(uint proto, byte[] d, uint txFlags) {
    var m = new PASSTHRU_MSG(); m.ProtocolID = proto; m.TxFlags = txFlags; m.Data = new byte[4128];
    Array.Copy(d, m.Data, d.Length); m.DataSize = (uint)d.Length; return m;
  }

  public static byte[] Hex(string h) {
    if (h == "-" || h.Length == 0) return new byte[0];
    if (h.Length % 2 != 0) throw new FormatException("Hex impar: " + h);
    var b = new byte[h.Length / 2];
    for (int i = 0; i < b.Length; i++) b[i] = byte.Parse(h.Substring(i * 2, 2), NumberStyles.HexNumber);
    return b;
  }

  public static string Hex(byte[] d, int n) {
    var sb = new StringBuilder(n * 2);
    for (int i = 0; i < n; i++) sb.Append(d[i].ToString("X2"));
    return sb.ToString();
  }

  static uint U(string s) { return s.StartsWith("0x") ? uint.Parse(s.Substring(2), NumberStyles.HexNumber) : uint.Parse(s, CultureInfo.InvariantCulture); }

  string Err(string seq, int codigo, string texto) {
    string ultimo = "";
    try { ultimo = pt.LastError(); } catch { }
    return seq + " ERR " + codigo + " " + (texto + (ultimo.Length > 0 ? " · " + ultimo : "")).Replace('\r', ' ').Replace('\n', ' ');
  }

  public void Cerrar() {
    if (abierto) { try { pt.Close(dev); } catch { } abierto = false; }
  }

  /// <summary>Procesa una línea y devuelve la respuesta (sin salto de línea).</summary>
  public string Atender(string linea) {
    string[] a = linea.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
    if (a.Length < 2) return "0 ERR 1 Orden vacía";
    string seq = a[0], orden = a[1].ToLowerInvariant();
    try {
      int r;
      switch (orden) {
        case "abrir": {
          if (abierto) return seq + " OK " + dev;
          r = pt.Open(out dev);
          if (r != 0) return Err(seq, r, "No se puede abrir la interfaz (¿conectada por USB, luz verde, sin la tablet ni Maxi PC Suite usándola?)");
          abierto = true;
          return seq + " OK " + dev;
        }
        case "version": {
          var fw = new StringBuilder(80); var dl = new StringBuilder(80); var api = new StringBuilder(80);
          r = pt.ReadVersion(dev, fw, dl, api);
          if (r != 0) return Err(seq, r, "ReadVersion");
          return seq + " OK " + fw + "|" + dl + "|" + api;
        }
        case "tension": {
          uint mv; r = pt.ReadVbatt(dev, out mv);
          if (r != 0) return Err(seq, r, "ReadVbatt");
          return seq + " OK " + mv;
        }
        case "conectar": {
          uint ch; r = pt.Connect(dev, U(a[2]), U(a[3]), U(a[4]), out ch);
          if (r != 0) return Err(seq, r, "Connect");
          return seq + " OK " + ch;
        }
        case "desconectar": {
          r = pt.Disconnect(U(a[2]));
          return r == 0 ? seq + " OK" : Err(seq, r, "Disconnect");
        }
        case "filtro": {
          // filtro <canal> <tipo> <proto> <txflags> <mascara> <patron> <fc|->
          uint proto = U(a[4]), txf = U(a[5]);
          bool conFc = a[8] != "-";
          uint id;
          r = pt.StartFilter(U(a[2]), U(a[3]), Msg(proto, Hex(a[6]), txf), Msg(proto, Hex(a[7]), txf), Msg(proto, Hex(conFc ? a[8] : "-"), txf), conFc, out id);
          if (r != 0) return Err(seq, r, "StartMsgFilter");
          return seq + " OK " + id;
        }
        case "quitarfiltro": {
          r = pt.StopFilter(U(a[2]), U(a[3]));
          return r == 0 ? seq + " OK" : Err(seq, r, "StopMsgFilter");
        }
        case "limpiar": {
          r = pt.ClearRx(U(a[2]));
          return r == 0 ? seq + " OK" : Err(seq, r, "ClearRx");
        }
        case "enviar": {
          // enviar <canal> <proto> <txflags> <timeout> <hex> [<hex>...]
          uint ch = U(a[2]), proto = U(a[3]), txf = U(a[4]), to = U(a[5]);
          for (int i = 6; i < a.Length; i++) {
            r = pt.Write(ch, Msg(proto, Hex(a[i]), txf), to);
            if (r != 0) return Err(seq, r, "WriteMsgs");
          }
          return seq + " OK " + (a.Length - 6);
        }
        case "leer": {
          // leer <canal> <max> <esperaPrimeroMs> <esperaSiguientesMs>
          return seq + " OK" + Leer(U(a[2]), (int)U(a[3]), (int)U(a[4]), (int)U(a[5]));
        }
        case "enviarleer": {
          // enviarleer <canal> <proto> <txflags> <max> <esperaPrimeroMs> <esperaSiguientesMs> <hex>
          uint ch = U(a[2]), proto = U(a[3]), txf = U(a[4]);
          r = pt.Write(ch, Msg(proto, Hex(a[8]), txf), 200);
          if (r != 0) return Err(seq, r, "WriteMsgs");
          return seq + " OK" + Leer(ch, (int)U(a[5]), (int)U(a[6]), (int)U(a[7]));
        }
        case "isotp": {
          // isotp <canal> <bits29 0|1> <tx (8 hex)> <rx (8 hex) | obd> <max> <esperaPrimeroMs> <esperaSiguientesMs> <carga hex>
          // ISO-TP hecho aquí sobre CAN «crudo»: control de flujo siempre de 8 bytes (la V200 lo enviaba corto
          // y las centralitas no mandaban las respuestas largas: bastidor, calibración, listas de averías).
          bool b29 = a[3] == "1";
          uint tx = U("0x" + a[4]);
          uint rx = a[5] == "obd" ? 0u : U("0x" + a[5]);
          return seq + IsoTp(U(a[2]), b29, tx, rx, Hex(a[9]), (int)U(a[6]), (int)U(a[7]), (int)U(a[8]));
        }
        case "cerrar": {
          Cerrar();
          return seq + " OK";
        }
        default:
          return seq + " ERR 1 Orden desconocida: " + orden;
      }
    } catch (Exception e) {
      return seq + " ERR 99 " + e.Message.Replace('\r', ' ').Replace('\n', ' ');
    }
  }

  class Sesion { public byte[] Buf; public int Len; public int Got; public int Sn; }

  static byte[] Trama(uint id, byte[] cuerpo) {
    var d = new byte[12];
    d[0] = (byte)(id >> 24); d[1] = (byte)(id >> 16); d[2] = (byte)(id >> 8); d[3] = (byte)id;
    for (int i = 0; i < 8; i++) d[4 + i] = i < cuerpo.Length ? cuerpo[i] : (byte)0x55;
    return d;
  }

  // Dirección a la que hay que mandar el control de flujo de una respuesta
  static uint DestinoFc(bool b29, uint tx, uint rx, bool funcional) {
    if (!funcional) return tx;
    if (!b29) return rx - 8;
    return 0x18DA00F1u | ((rx & 0xFF) << 8);
  }

  static bool EsRespuestaObd(bool b29, uint id) {
    return b29 ? (id >> 8) == 0x18DAF1u : (id >= 0x7E8 && id <= 0x7EF);
  }

  string IsoTp(uint ch, bool b29, uint tx, uint rxFijo, byte[] carga, int max, int esperaPrimero, int esperaSiguientes) {
    const uint CAN = 5;
    uint flags = b29 ? 0x100u : 0u;
    if (carga.Length < 1 || carga.Length > 7) return " ERR 99 Peticion de 1 a 7 bytes";
    bool funcional = rxFijo == 0;
    try { pt.ClearRx(ch); } catch { }
    var sf = new byte[carga.Length + 1]; sf[0] = (byte)carga.Length; Array.Copy(carga, 0, sf, 1, carga.Length);
    int r = pt.Write(ch, Msg(CAN, Trama(tx, sf), flags), 200);
    if (r != 0) return Err("", r, "WriteMsgs");
    var sb = new StringBuilder();
    var ses = new Dictionary<uint, Sesion>();
    int reales = 0;
    long limite = ahora() + esperaPrimero;
    uint mascara = b29 ? 0x1FFFFFFFu : 0x7FFu;
    while (reales < max) {
      long resta = limite - ahora();
      if (resta <= 0) break;
      PASSTHRU_MSG m; uint n;
      r = pt.Read(ch, out m, (uint)Math.Min(resta, 20), out n);
      if (n < 1) {
        if (r != 0 && r != 0x09 && r != 0x10) return " OK ERRLEER " + r;
        continue;
      }
      if ((m.RxStatus & 0x0B) != 0 || m.DataSize < 5) continue; // ecos e indicaciones
      uint id = (uint)(m.Data[0] << 24 | m.Data[1] << 16 | m.Data[2] << 8 | m.Data[3]) & mascara;
      if (id == tx) continue;
      if (funcional ? !EsRespuestaObd(b29, id) : id != rxFijo) continue;
      int dl = (int)m.DataSize - 4;
      byte pci = m.Data[4];
      byte[] completo = null;
      switch (pci >> 4) {
        case 0: {
          int l = pci & 0x0F;
          if (l == 0 || l > dl - 1) continue;
          completo = new byte[l]; Array.Copy(m.Data, 5, completo, 0, l);
          break;
        }
        case 1: {
          if (dl < 8) continue;
          int l = ((pci & 0x0F) << 8) | m.Data[5];
          var s = new Sesion { Buf = new byte[l], Len = l, Got = Math.Min(6, l), Sn = 1 };
          Array.Copy(m.Data, 6, s.Buf, 0, s.Got);
          ses[id] = s;
          // Control de flujo: seguir sin pausas ni bloques, relleno a 8 bytes
          r = pt.Write(ch, Msg(CAN, Trama(DestinoFc(b29, tx, id, funcional), new byte[] { 0x30, 0x00, 0x00 }), flags), 200);
          if (r != 0) return Err("", r, "WriteMsgs FC");
          limite = Math.Max(limite, ahora() + 1000);
          continue;
        }
        case 2: {
          Sesion s;
          if (!ses.TryGetValue(id, out s) || (pci & 0x0F) != (s.Sn & 0x0F)) continue;
          int l = Math.Min(7, Math.Min(dl - 1, s.Len - s.Got));
          Array.Copy(m.Data, 5, s.Buf, s.Got, l);
          s.Got += l; s.Sn++;
          if (s.Got < s.Len) { limite = Math.Max(limite, ahora() + 1000); continue; }
          ses.Remove(id);
          completo = s.Buf;
          break;
        }
        default: continue;
      }
      var salida = new byte[4 + completo.Length];
      salida[0] = (byte)(id >> 24); salida[1] = (byte)(id >> 16); salida[2] = (byte)(id >> 8); salida[3] = (byte)id;
      Array.Copy(completo, 0, salida, 4, completo.Length);
      sb.Append(" 0,").Append(m.Timestamp).Append(',').Append(Hex(salida, salida.Length));
      bool pendiente = completo.Length >= 3 && completo[0] == 0x7F && completo[2] == 0x78;
      if (!pendiente) reales++;
      if (pendiente) limite = Math.Max(limite, ahora() + 5000);
      else if (ses.Count == 0) limite = Math.Min(limite, ahora() + esperaSiguientes);
    }
    return " OK" + sb.ToString();
  }

  // Lee mensajes reales (sin ecos ni indicaciones de envío) hasta `max` o hasta que pase el plazo.
  // El plazo empieza en esperaPrimero; con cada mensaje real se acorta a esperaSiguientes (sin pasar del plazo inicial),
  // y con «respuesta pendiente» (7F xx 78) se alarga hasta 5 s. Devuelve " estado,marca,hex estado,marca,hex ..."
  string Leer(uint ch, int max, int esperaPrimero, int esperaSiguientes) {
    var sb = new StringBuilder();
    int reales = 0;
    long limite = ahora() + esperaPrimero;
    while (reales < max) {
      long resta = limite - ahora();
      if (resta <= 0) break;
      PASSTHRU_MSG m; uint n;
      int r = pt.Read(ch, out m, (uint)Math.Min(resta, 50), out n);
      if (n < 1) {
        if (r != 0 && r != 0x09 && r != 0x10) return " ERRLEER " + r;
        continue;
      }
      if ((m.RxStatus & 0x0B) != 0) continue; // eco, inicio de mensaje o fin de envío: no son respuestas
      int len = (int)Math.Min(m.DataSize, 4128);
      sb.Append(' ').Append(m.RxStatus.ToString("X")).Append(',').Append(m.Timestamp).Append(',').Append(Hex(m.Data, len));
      bool pendiente = len >= 7 && m.Data[4] == 0x7F && m.Data[6] == 0x78;
      if (!pendiente) reales++; // «respuesta pendiente» no cuenta: hay que esperar la respuesta de verdad
      // Nunca se alarga la ventana (el tráfico propio del coche la haría infinita), salvo «respuesta pendiente»
      limite = pendiente ? Math.Max(limite, ahora() + 5000) : Math.Min(limite, ahora() + esperaSiguientes);
    }
    return sb.ToString();
  }
}
