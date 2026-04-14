#!/bin/sh
set -eu

echo "▶ Running management DB migrations..."
npx prisma migrate deploy --schema prisma/management.prisma

echo "▶ Running tenant DB migrations..."
npx prisma migrate deploy --schema prisma/tenant/schema.prisma

echo "▶ Starting server..."
exec "$@"
