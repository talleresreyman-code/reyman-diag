#!/usr/bin/env bash
# Reyman Diag · publicar la última versión de GitHub (rama main)
set -euo pipefail
cd "$(dirname "$0")/.."
# 1) Copia de seguridad de la base antes de tocar nada (copias/diag_AAAAMMDD_HHMMSS.dump, se guardan las 10 últimas).
#    Si la copia falla, no se actualiza. En la primera instalación (base aún sin arrancar) no hay nada que copiar.
bash deploy/copia-base.sh
if [ "${1:-}" != "--sin-git" ]; then
  git fetch -q origin main
  git reset -q --hard origin/main
fi
chmod +x deploy/*.sh
# Versión instalada (la ve la app) y vigilante en cron cada minuto (botón «Actualizar» de la app)
mkdir -p deploy/estado && chmod 777 deploy/estado
printf 'commit=%s\nfecha=%s\nmensaje=%s\ninstalada=%s\n' "$(git rev-parse --short HEAD)" "$(git log -1 --format=%cI)" "$(git log -1 --format=%s | tr '\r\n' '  ' | cut -c1-200)" "$(date -Iseconds)" > deploy/estado/instalada.txt
chmod 666 deploy/estado/instalada.txt
if ! crontab -l 2>/dev/null | grep -q reyman-diag/deploy/vigilante.sh; then
  (crontab -l 2>/dev/null; echo "* * * * * sh $(pwd)/deploy/vigilante.sh >/dev/null 2>&1") | crontab -
fi
docker compose up -d --build
for i in $(seq 1 20); do docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud >/dev/null 2>&1 && break; sleep 2; done
docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud && echo " · Reyman Diag actualizado"
