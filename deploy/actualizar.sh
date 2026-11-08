#!/usr/bin/env bash
# Reyman Diag · publicar la última versión de GitHub (rama main)
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main
git reset -q --hard origin/main
chmod +x deploy/*.sh
docker compose up -d --build
for i in $(seq 1 20); do docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud >/dev/null 2>&1 && break; sleep 2; done
docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud && echo " · Reyman Diag actualizado"
