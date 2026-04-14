#!/usr/bin/env bash
#
# Run commands inside the running app container.
#
# Usage:
#   ./scripts/docker-run.sh <command> [args...]
#
# The first argument decides how the command is dispatched:
#   npm   — forwarded as-is:  npm run migrate:tenants
#   npx   — forwarded as-is:  npx prisma migrate deploy ...
#   node  — forwarded as-is:  node -e "console.log('hi')"
#   (anything else)          — treated as a raw shell command
#
# No arguments opens an interactive shell.
#
# ── README scripts that work in the production container ──────
#
#   ./scripts/docker-run.sh npm run migrate:tenants
#   ./scripts/docker-run.sh npm run seed:rbac -- --tenant "name" --role EDITOR
#   ./scripts/docker-run.sh npx prisma migrate deploy --schema prisma/management.prisma
#   ./scripts/docker-run.sh npx prisma migrate deploy --schema prisma/tenant/schema.prisma
#   ./scripts/docker-run.sh npx prisma db push --schema prisma/management.prisma
#
# ── Commands that need a dev environment (not in prod image) ──
#
#   npm run dev             (use the host or a dev compose override)
#   npm run test:unit       (vitest not installed in prod image)
#   npm run test:e2e        (playwright not installed in prod image)
#   npm run lint            (eslint not installed in prod image)

set -euo pipefail

SERVICE="${COMPOSE_SERVICE:-app}"
COMPOSE_CMD="docker compose"

if command -v podman-compose &>/dev/null && ! command -v docker &>/dev/null; then
  COMPOSE_CMD="podman-compose"
fi

if [ $# -eq 0 ]; then
  echo "Opening interactive shell in '${SERVICE}' container..."
  $COMPOSE_CMD exec "$SERVICE" sh
  exit 0
fi

case "$1" in
  npm|npx|node)
    echo "▶ $* (in '${SERVICE}' container)"
    $COMPOSE_CMD exec "$SERVICE" "$@"
    ;;
  *)
    echo "▶ sh -c \"$*\" (in '${SERVICE}' container)"
    $COMPOSE_CMD exec "$SERVICE" sh -c "$*"
    ;;
esac
