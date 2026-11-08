// Reyman Diag · Grabador del bus CAN con una interfaz J2534 (solo escucha: no envía ninguna trama).
// Se usa con un cable en Y: la tablet Autel diagnostica el coche y esta interfaz graba todo lo que pasa por la toma OBD.
using System;
using System.IO;
using System.Text;

public static class GrabadorCan {
  /// <summary>Graba hasta que se pulse una tecla o pasen maxSeg. Devuelve el número de tramas.</summary>
  public static int Grabar(IPassThru pt, uint baud, bool bits29, uint pines, string ruta, int maxSeg, Func<bool> parar) {
    uint dev; int r = pt.Open(out dev);
    if (r != 0) throw new Exception("No se puede abrir la interfaz (error " + r + "). ¿Está enchufada por USB y sin otro programa usándola?");
    uint ch = 0; int n = 0;
    try {
      var fw = new StringBuilder(80); var dl = new StringBuilder(80); var api = new StringBuilder(80);
      if (pt.ReadVersion(dev, fw, dl, api) == 0) Console.WriteLine("  Interfaz: " + fw + " | " + dl + " | API " + api);
      uint mv; r = pt.ReadVbatt(dev, out mv);
      Console.WriteLine(r == 0 ? "  Tensión en la toma OBD vista por la interfaz: " + (mv / 1000.0).ToString("0.00") + " V" : "  No da la tensión (error " + r + ")");
      if (r == 0 && mv < 9000) Console.WriteLine("  ¡OJO! Casi sin tensión: la interfaz no está bien conectada al cable en Y.");
      // CAN_ID_BOTH (0x800): recibir 11 y 29 bits
      r = pt.Connect(dev, 5, (bits29 ? 0x100u : 0u) | 0x800u, baud, out ch);
      if (r != 0) r = pt.Connect(dev, 5, bits29 ? 0x100u : 0u, baud, out ch);
      if (r != 0) throw new Exception("Connect CAN error " + r + " " + pt.LastError());
      // Pines del conector (J1962_PINS): 0x060E = 6 y 14 (CAN de diagnosis normal)
      r = pt.SetConfig(ch, 0x8001, pines);
      Console.WriteLine(r == 0 ? "  Pines " + (pines >> 8) + " y " + (pines & 0xFF) + " seleccionados." : "  La interfaz no acepta elegir pines (error " + r + "): usa los de por defecto.");
      uint fid;
      // Filtro que deja pasar todo (máscara 0)
      var cero = Puente.Msg(5, new byte[4], bits29 ? 0x100u : 0u);
      r = pt.StartFilter(ch, 1, cero, cero, cero, false, out fid);
      if (r != 0) throw new Exception("Filtro error " + r + " " + pt.LastError());
      int ecos = 0, errores = 0, ultimoError = 0;
      using (var w = new StreamWriter(ruta, false, new UTF8Encoding(false))) {
        w.WriteLine("ms;id;datos;estado");
        long t0 = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
        long fin = t0 + maxSeg * 1000L;
        long ultimoAviso = 0;
        while (true) {
          long ahora = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
          if (ahora >= fin || parar()) break;
          PASSTHRU_MSG m; uint k;
          r = pt.Read(ch, out m, 50, out k);
          if (k < 1) { if (r != 0 && r != 0x09 && r != 0x10) { errores++; ultimoError = r; } goto aviso; }
          if ((m.RxStatus & 0x01) != 0) { ecos++; goto aviso; } // eco propio (no debería haber: no enviamos nada)
          int len = (int)Math.Min(m.DataSize, 4128);
          if (len < 4) continue;
          uint id = (uint)(m.Data[0] << 24 | m.Data[1] << 16 | m.Data[2] << 8 | m.Data[3]);
          w.WriteLine((ahora - t0) + ";" + (bits29 ? id.ToString("X8") : id.ToString("X3")) + ";" + Puente.Hex(SinId(m.Data, len), len - 4) + ";" + m.RxStatus.ToString("X"));
          n++;
          aviso:
          if (ahora - ultimoAviso > 2000) {
            Console.Write("\r  Grabando... " + n + " tramas, " + ((ahora - t0) / 1000) + " s" + (errores > 0 ? ", errores de lectura " + errores + " (último " + ultimoError + ")" : "") + (ecos > 0 ? ", ecos " + ecos : "") + "   ");
            ultimoAviso = ahora; w.Flush();
          }
        }
      }
    } finally {
      if (ch != 0) try { pt.Disconnect(ch); } catch { }
      try { pt.Close(dev); } catch { }
    }
    return n;
  }
  static byte[] SinId(byte[] d, int len) { var b = new byte[len - 4]; Array.Copy(d, 4, b, 0, len - 4); return b; }
}
