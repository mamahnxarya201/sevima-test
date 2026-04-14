#!/bin/sh
# Orchestrator container: conditional npm ci, then next dev.
# node_modules is on a named volume; npm package cache is persisted separately (see compose).

set -e
cd /app

# Persisted across container recreations — avoids re-downloading the registry on every fresh node_modules volume.
NPM_CACHE="${NPM_CONFIG_CACHE:-/npm-cache}"
export NPM_CONFIG_CACHE="$NPM_CACHE"
mkdir -p "$NPM_CACHE"

# Faster / less chatty installs inside Docker (audit can add network round-trips).
export NPM_CONFIG_AUDIT="${NPM_CONFIG_AUDIT:-false}"
export NPM_CONFIG_FUND="${NPM_CONFIG_FUND:-false}"
export CI=true

STAMP="/app/node_modules/.deps-stamp"
NEED_CI=0

if [ ! -f "$STAMP" ]; then
  NEED_CI=1
elif [ ! -d /app/node_modules/next ]; then
  NEED_CI=1
else
  for f in /app/package.json /app/package-lock.json; do
    if [ -f "$f" ] && [ "$f" -nt "$STAMP" ]; then
      NEED_CI=1
      break
    fi
  done
fi

if [ "$NEED_CI" -eq 1 ]; then
  echo "[orchestrator-node] Running npm ci (first install can take several minutes: download + extract + postinstall)…"
  echo "[orchestrator-node] npm cache: $NPM_CACHE"
  # --foreground-scripts: show lifecycle output (prepare, prisma, etc.) so it never looks "silent hung"
  npm ci --foreground-scripts --no-audit --no-fund --loglevel=notice
  touch "$STAMP"
  echo "[orchestrator-node] npm ci finished."
else
  echo "[orchestrator-node] Skipping npm ci (deps stamp up to date)."
fi

exec npm run dev
