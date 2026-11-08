#!/usr/bin/env bash
# Reyman Diag · añade diag.talleresreyman.es al Caddy que ya publica n8n y la App Reyman (HTTPS automático)
set -euo pipefail
DOMINIO=${1:-diag.talleresreyman.es}
CADDY=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /caddy/ {print $1; exit}')
[ -n "$CADDY" ] || { echo "No encuentro el contenedor de Caddy (docker ps)"; exit 1; }
# Caddyfile del host que monta ese contenedor
FICHERO=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')
if [ -z "$FICHERO" ]; then
  DIR=$(docker inspect "$CADDY" --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}')
  [ -n "$DIR" ] && FICHERO="$DIR/Caddyfile"
fi
[ -f "${FICHERO:-}" ] || { echo "No encuentro el Caddyfile de $CADDY"; exit 1; }
if grep -q "$DOMINIO" "$FICHERO"; then
  echo "· $DOMINIO ya estaba en $FICHERO"
else
  cp "$FICHERO" "$FICHERO.antes-diag"
  printf '\n%s {\n\treverse_proxy reyman-diag:3020\n}\n' "$DOMINIO" >> "$FICHERO"
  echo "· Añadido $DOMINIO a $FICHERO (copia en $FICHERO.antes-diag)"
fi
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile
echo "✓ Caddy recargado: https://$DOMINIO"
