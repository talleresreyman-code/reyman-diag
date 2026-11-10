#!/usr/bin/env bash
# Reyman Diag · copia de seguridad de la base de datos (Postgres «diag»).
# Deja copias/diag_AAAAMMDD_HHMMSS.dump y conserva solo las 10 más recientes.
# La lanza actualizar.sh antes de cada actualización; también se puede lanzar a mano: bash deploy/copia-base.sh
set -euo pipefail
cd "$(dirname "$0")/.."
GUARDAR=${COPIAS_GUARDAR:-10}
if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "· La base no está en marcha (primera instalación): no hay copia que hacer"
  exit 0
fi
mkdir -p copias && chmod 700 copias
F="copias/diag_$(date +%Y%m%d_%H%M%S).dump"
if docker compose exec -T db pg_dump -U diag -Fc diag > "$F.tmp" && [ -s "$F.tmp" ]; then
  mv "$F.tmp" "$F" && chmod 600 "$F"
  echo "· Copia de la base: $F ($(du -h "$F" | cut -f1))"
else
  rm -f "$F.tmp"
  echo "✗ No se ha podido hacer la copia de la base. No se sigue." >&2
  exit 1
fi
# Conservar solo las últimas $GUARDAR
ls -1t copias/diag_*.dump 2>/dev/null | tail -n +$((GUARDAR + 1)) | xargs -r rm -f
