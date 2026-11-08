// Host de pruebas: lee órdenes por la entrada estándar y contesta por la salida, con el coche simulado.
using System;
public static class Host {
  public static void Main(string[] args) {
    var coche = new CocheSimulado();
    if (args.Length > 0 && args[0] == "250") coche.Baudios = 250000;
    if (args.Length > 0 && args[0] == "29") coche.BitsBus = 29;
    var p = new Puente(coche);
    string l;
    Console.Out.WriteLine("LISTO");
    Console.Out.Flush();
    while ((l = Console.In.ReadLine()) != null) {
      Console.Out.WriteLine(p.Atender(l));
      Console.Out.Flush();
    }
  }
}
