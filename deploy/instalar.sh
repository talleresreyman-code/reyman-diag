#!/usr/bin/env bash
# Reyman Diag · primera instalación en el VPS (como root, en /opt/reyman-diag). Se puede repetir sin problema.
set -euo pipefail
cd "$(dirname "$0")/.."
APP=/opt/reyman-app
if [ ! -f .env ]; then
  cp .env.ejemplo .env
  sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 24)/" .env
  sed -i "s/^DIAG_INGEST_KEY=.*/DIAG_INGEST_KEY=$(openssl rand -hex 24)/" .env
  echo "· Creado .env con contraseñas nuevas"
fi
# Clave para consultar las OT en la App Reyman (se crea una sola vez)
if ! grep -q '^APP_REYMAN_API_KEY=rey_' .env && [ -d "$APP" ]; then
  K=$(cd "$APP" && docker compose exec -T app node server/cli.js crear-clave reyman reyman-diag | grep -o 'rey_[A-Za-z0-9_-]*' | tail -1 || true)
  [ -n "$K" ] && sed -i "s/^APP_REYMAN_API_KEY=.*/APP_REYMAN_API_KEY=$K/" .env && echo "· Clave de la App Reyman creada"
fi
# Misma clave de n8n que usa la App Reyman (para enviar correos por la Gmail del taller), si no está puesta
if ! grep -q '^N8N_CLAVE=.\+' .env && [ -f "$APP/.env" ]; then
  C=$(grep -E '^N8N_(CLAVE|SECRET|APP_KEY)=' "$APP/.env" | head -1 | cut -d= -f2- || true)
  [ -n "$C" ] && sed -i "s|^N8N_CLAVE=.*|N8N_CLAVE=$C|" .env && echo "· Clave de n8n copiada de la App Reyman"
fi
docker compose up -d --build
for i in $(seq 1 20); do docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud >/dev/null 2>&1 && break; sleep 2; done
docker compose exec -T diag wget -qO- http://127.0.0.1:3020/api/salud && echo " · Reyman Diag en marcha"
deploy/publicar-caddy.sh
echo "✓ Listo: https://diag.talleresreyman.es"
