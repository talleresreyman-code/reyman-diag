#!/bin/sh
# Vigilante de actualizaciones de Reyman Diag. Lo lanza cron cada minuto (lo da de alta actualizar.sh).
#  1) Cada 5 minutos (o cuando la app lo pide) mira en GitHub si hay versión nueva y lo deja en deploy/estado/disponible.txt
#  2) Si un administrador ha pulsado «Actualizar» en la app (deploy/estado/pedido), ejecuta actualizar.sh y guarda el resultado.
# La app solo puede dejar esos avisos en la carpeta deploy/estado: no ejecuta nada en el servidor por sí misma.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
E=deploy/estado
mkdir -p "$E" && chmod 777 "$E"
exec 9>"$E/.lock"
flock -n 9 || exit 0

linea() { tr '\r\n' '  ' | cut -c1-200; }

comprobar() {
  git fetch --quiet origin main 2>"$E/.fetch_err" || { echo "error=$(linea < "$E/.fetch_err")" > "$E/disponible.tmp"; echo "cuando=$(date -Iseconds)" >> "$E/disponible.tmp"; mv "$E/disponible.tmp" "$E/disponible.txt"; chmod 666 "$E/disponible.txt"; return; }
  {
    echo "cuando=$(date -Iseconds)"
    echo "commit=$(git rev-parse --short origin/main)"
    echo "fecha=$(git log -1 --format=%cI origin/main)"
    echo "mensaje=$(git log -1 --format=%s origin/main | linea)"
    git log --format='cambio=%h|%cI|%s' HEAD..origin/main 2>/dev/null | head -30
  } > "$E/disponible.tmp"
  mv "$E/disponible.tmp" "$E/disponible.txt"
  chmod 666 "$E/disponible.txt"
}

MIN=$(date +%M | sed 's/^0//')
if [ -f "$E/comprobar" ] || [ ! -f "$E/disponible.txt" ] || [ $((MIN % 5)) -eq 0 ]; then
  rm -f "$E/comprobar"
  comprobar
fi

if [ -f "$E/pedido" ]; then
  QUIEN=$(linea < "$E/pedido")
  rm -f "$E/pedido"
  DE=$(git rev-parse --short HEAD)
  printf 'estado=actualizando\ninicio=%s\nquien=%s\nde=%s\n' "$(date -Iseconds)" "$QUIEN" "$DE" > "$E/resultado.txt"
  chmod 666 "$E/resultado.txt"
  if bash deploy/actualizar.sh > "$E/ultima.log" 2>&1; then R=ok; else R=error; fi
  printf 'estado=%s\ninicio=%s\nfin=%s\nquien=%s\nde=%s\na=%s\n' "$R" "$(sed -n 's/^inicio=//p' "$E/resultado.txt")" "$(date -Iseconds)" "$QUIEN" "$DE" "$(git rev-parse --short HEAD)" > "$E/resultado.tmp"
  mv "$E/resultado.tmp" "$E/resultado.txt"
  chmod 666 "$E/resultado.txt" "$E/ultima.log"
  comprobar
fi
