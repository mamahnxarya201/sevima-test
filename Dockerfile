# ─────────────────────────────────────────────
# Stage 1 — install production + dev dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────────────
# Stage 2 — generate Prisma clients, patch next-ws, build
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma generate for both schemas (needs the musl binary target already declared in schemas)
RUN npx prisma generate --schema prisma/management.prisma && \
    npx prisma generate --schema prisma/tenant/schema.prisma

# next-ws monkey-patches the Next.js server to support WebSockets
RUN npm run prepare

RUN npm run build

# ─────────────────────────────────────────────
# Stage 3 — production runner (standalone output)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public

# Prisma generated clients (required at runtime for DB access)
COPY --from=builder /app/lib/generated ./lib/generated

# Prisma schemas + tenant migrations (for `prisma migrate deploy` at startup)
COPY --from=builder /app/prisma ./prisma

# Migration & seed scripts (tsx is bundled in standalone, but we need the source)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

# Docker entrypoint helper
COPY docker/app-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Install only the CLIs needed at runtime (prisma for migrations, tsx for scripts)
RUN npm install --no-save prisma@~6.4.1 tsx@^4.21.0

RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
