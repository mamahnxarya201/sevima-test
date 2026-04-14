# Multi-Tenant DAG Workflow Engine

A modern, production-ready Distributed Acyclic Graph (DAG) workflow engine with native multi-tenancy, isolated sandbox execution, and real-time execution monitoring. 

## Features
- **True Multi-Tenancy**: Built on a dual-schema strategy using Prisma. A central Management DB tracks tenants and provisions fully isolated individual Postgres databases per workspace automatically upon registration.
- **Workflow Orchestrator**: Uses Dockerode to dynamically spin up short-lived Alpine Linux containers for running parallel HTTP & Scripting workloads.
- **Real-Time Telemetry**: Execution logs block-streamed directly to the frontend React Flow UI in real-time leveraging `next-ws` and an in-memory event bus.
- **Secure Sandboxing**: Implements topological sorting for parallel node processing, loop prevention, and robust shell-injection guardrails for script execution.

## Getting Started

### Prerequisites
- Node.js `20+`
- Docker or Podman
- PostgreSQL

### 1. Configure the Environment
Ensure your `.env` file matches the `docker-compose.yaml` topology. 
By default, the `.env` should look like this (enabling local host resolution to the DB):

```env
MANAGEMENT_DATABASE_URL="postgresql://user:password@localhost:5432/management_db"
TENANT_DATABASE_URL="postgresql://user:password@localhost:5432/default_tenant_db"
DATABASE_URL="postgresql://user:password@localhost:5432/management_db"
PORT=3000
DOCKER_HOST="unix:///var/run/docker.sock"
BETTER_AUTH_SECRET="your-secret"
BETTER_AUTH_URL="http://localhost:3000"
```

### 2. Stand up Infrastructure
Spin up the `postgres` core container:
```bash
docker-compose up
```

### 3. Generate & Migrate schemas
Generate the binary engines for BOTH the Host and Alpine environments:
```bash
npx prisma generate --schema prisma/management.prisma
npx prisma generate --schema prisma/tenant/schema.prisma
```


Tenant migrations live under **`prisma/tenant/migrations/`** (schema: `prisma/tenant/schema.prisma`). Do **not** point `migrate deploy` at `prisma/management.prisma` for tenant DBs — the root `prisma/migrations/` folder is for the management database only.

**Tenant DBs created before the split:** if `migrate deploy` reports migration history drift, connect to that tenant database and run `DROP TABLE IF EXISTS "_prisma_migrations";`, then `npm run migrate:tenants` (or register a new tenant).

*(Note: Ensure you respond to any drop-column prompts if you change schemas manually! Or use `npx prisma db push --schema prisma/management.prisma` for force resets).*

### 4. Running the Engine
For rapid UI development and local debugging:
```bash
npm run dev
```

Alternatively, to run the entire backend and worker orchestration purely inside the container:
```bash
docker compose up -d db
docker compose up -d orchestrator-node
```

The `orchestrator-node` service bind-mounts the repo at `/app` (for Dockerode + live edits) and stores **`node_modules` on a named volume** (`orchestrator_node_modules`) so installs are not slowed by the bind mount. **Next.js / Turbopack output** is stored on a separate named volume (`orchestrator_next` at `/app/.next`) so you can run `npm run dev` on the **host** and in **Docker** without permission fights over a shared `.next` folder. On startup, [`scripts/docker-orchestrator-entrypoint.sh`](scripts/docker-orchestrator-entrypoint.sh) runs **`npm ci` only** when `package.json` or `package-lock.json` is newer than `node_modules/.deps-stamp`, or on first run—otherwise it skips straight to `npm run dev`. To force a full reinstall, remove the stamp inside the container (`rm -f node_modules/.deps-stamp`) or drop the volume. To wipe the container-only Next cache: `docker volume rm sevima-test_orchestrator_next` (name may include your project directory prefix).

## Architecture Notes
- Better Auth handles JWT persistence and injects the `tenantId` into session claims.
- The `tenantGuard` intercepts incoming requests, validates the Better Auth cookie/token, and overrides the Prisma runtime adapter strictly connecting to the correct DB proxy. 
- You can find the DAG schema format stored inside `lib/dag/types.ts`.
