#!/usr/bin/env bash
# Reyman Diag · volver a una copia de la base de datos.
#   bash deploy/restaurar-copia.sh                      → lista las copias que hay
#   bash deploy/restaurar-copia.sh copias/diag_XXX.dump → restaura esa copia (pide confirmación)
# Antes de restaurar hace otra copia del estado actual, por si hay que deshacerlo.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${1:-}" ]; then
  echo "Copias disponibles (la más reciente arriba):"
  ls -1t copias/diag_*.dump 2>/dev/null || echo "  (ninguna)"
  echo
  echo "Para restaurar una: bash deploy/restaurar-copia.sh copias/<nombre>.dump"
  exit 0
fi
F=$1
[ -s "$F" ] || { echo "✗ No encuentro la copia $F"; exit 1; }
echo "Vas a sustituir TODA la base de Reyman Diag por la copia $F."
echo "Lo guardado después de esa copia se perderá (antes se hace una copia del estado actual)."
read -r -p "Escribe SI para seguir: " R
[ "$R" = "SI" ] || { echo "Cancelado."; exit 1; }
bash deploy/copia-base.sh
docker compose stop diag
docker compose exec -T db pg_restore -U diag -d diag --clean --if-exists --no-owner --single-transaction < "$F"
docker compose start diag
for i in $(seq 1 20); do docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud >/dev/null 2>&1 && break; sleep 2; done
docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud && echo " · Base restaurada desde $F"
