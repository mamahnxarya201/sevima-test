#!/bin/sh
set -eu

JWKS_URL="${JWKS_HTTP_URL:-http://host.docker.internal:3000/api/auth/jwks}"
OUT="${GRAFANA_JWKS_FILE:-/var/lib/grafana/jwks.json}"

fetch_jwks() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$JWKS_URL" -o "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$1" "$JWKS_URL"
  else
    echo "grafana entrypoint: need curl or wget to fetch JWKS" >&2
    return 1
  fi
}

i=0
while [ "$i" -lt 90 ]; do
  if fetch_jwks "$OUT.tmp" 2>/dev/null && [ -s "$OUT.tmp" ] && mv "$OUT.tmp" "$OUT"; then
    echo "grafana: wrote JWKS to $OUT"
    exec /run.sh "$@"
  fi
  i=$((i + 1))
  echo "grafana: waiting for JWKS at $JWKS_URL ($i/90)..."
  sleep 2
done

echo "grafana: could not fetch JWKS; start your app on port 3000, then restart this container." >&2
exit 1
