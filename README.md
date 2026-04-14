# Multi-Tenant DAG Workflow Engine

A modern, production-ready Distributed Acyclic Graph (DAG) workflow engine with native multi-tenancy, isolated sandbox execution, and real-time execution monitoring. 

## Features

- **True Multi-Tenancy**: Built on a dual-schema strategy using Prisma. A central Management DB tracks tenants and provisions fully isolated individual Postgres databases per workspace automatically upon registration.
- **Workflow Orchestrator**: Uses Dockerode to dynamically spin up short-lived Alpine Linux containers for running parallel HTTP & Scripting workloads.
- **Real-Time Telemetry**: Execution logs block-streamed directly to the frontend React Flow UI in real-time leveraging `next-ws` and an in-memory event bus.
- **Secure Sandboxing**: Implements topological sorting for parallel node processing, loop prevention, and robust shell-injection guardrails for script execution.

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**
- **Docker** or **Podman** (with Compose)

### 1. Configure the Environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
BETTER_AUTH_SECRET="change-me-in-production"
DOCKER_HOST_PATH="/run/user/1000/podman/podman.sock"   # or /var/run/docker.sock for Docker
```

The DB URLs default to `localhost:5432` so host-side Prisma commands work against the Docker Postgres. The app container gets its own internal URLs automatically from `docker-compose.yaml`.

See `.env.example` for all available variables (ports, Grafana credentials, rate-limit tunables, etc.).

### 2. Start Postgres

```bash
docker compose up -d postgres
```

Wait until healthy (the healthcheck runs every 5 s):

```bash
docker compose ps postgres
```

### 3. Install Dependencies, Generate Clients, and Migrate

```bash
npm install

npx prisma generate --schema prisma/management.prisma
npx prisma generate --schema prisma/tenant/schema.prisma

npx prisma migrate deploy --schema prisma/management.prisma
npx prisma migrate deploy --schema prisma/tenant/schema.prisma
```

This creates the Prisma clients (with both native and Alpine binary targets) and applies all migration files to the Postgres instance running in Docker.

### 4. Build and Launch the Full Stack

```bash
docker compose up --build -d
```


| Service    | URL                                            | Env var for port  |
| ---------- | ---------------------------------------------- | ----------------- |
| App        | [http://localhost:3000](http://localhost:3000) | `APP_PORT`        |
| Grafana    | [http://localhost:3001](http://localhost:3001) | `GRAFANA_PORT`    |
| Prometheus | [http://localhost:9090](http://localhost:9090) | `PROMETHEUS_PORT` |
| Loki       | — (internal)                                   | `LOKI_PORT`       |


What happens on start:

1. **Postgres** is already running and migrated.
2. **App** waits for a healthy Postgres, runs `prisma migrate deploy` again (no-op since schemas are current), then starts the Next.js server.
3. **Prometheus** scrapes `/api/metrics` from the app container.
4. **Loki** receives execution logs pushed by the app.
5. **Grafana** waits for a healthy app, fetches JWKS for JWT auth, then starts with provisioned dashboards and datasources.

The host container runtime socket is mounted into the app container (`DOCKER_HOST_PATH`) so the workflow orchestrator can spin up execution containers.

### 5. Register Your First Tenant

1. Open [http://localhost:3000/register](http://localhost:3000/register) and create your tenant.
  - This provisions an isolated tenant database and creates the first `ADMIN` user automatically.
2. To add more users (`EDITOR` or `VIEWER`), use the helper script:

```bash
./scripts/docker-run.sh npm run seed:rbac -- --tenant "tenant-name" --role EDITOR
```

Optional flags:

- `--email "editor@your-domain.com"`
- `--name "Editor User"`
- `--password "StrongPassword123!"`

The script resolves tenant by **name** (not id). RBAC behavior:

- `ADMIN` / `EDITOR`: can create/update workflows and trigger runs.
- `VIEWER`: read-only access.

### 6. Running Commands in the Container

Use `scripts/docker-run.sh` to execute commands inside the running app container:

```bash
./scripts/docker-run.sh <command> [args...]
```

The first argument (`npm`, `npx`, `node`) is forwarded directly. Anything else runs as a raw shell command. No arguments opens an interactive shell.

```bash
# Migrations
./scripts/docker-run.sh npm run migrate:tenants
./scripts/docker-run.sh npx prisma migrate deploy --schema prisma/management.prisma
./scripts/docker-run.sh npx prisma migrate deploy --schema prisma/tenant/schema.prisma

# RBAC seed
./scripts/docker-run.sh npm run seed:rbac -- --tenant "name" --role EDITOR

# Force-push schema (use with care)
./scripts/docker-run.sh npx prisma db push --schema prisma/management.prisma

# Interactive shell
./scripts/docker-run.sh
```

### 7. Useful Docker Compose Commands

```bash
# View logs (follow)
docker compose logs -f app

# Restart a single service
docker compose restart app

# Rebuild after code changes
docker compose up --build -d app

# Stop everything
docker compose down

# Stop and wipe all data volumes
docker compose down -v
```

## Schema Migration Notes

The app entrypoint runs `prisma migrate deploy` on every container start (safe — already-applied migrations are skipped). For manual operations:

- Tenant migrations live under `prisma/tenant/migrations/` (schema: `prisma/tenant/schema.prisma`). Do **not** point `migrate deploy` at `prisma/management.prisma` for tenant DBs.
- **Tenant DBs created before the schema split:** if `migrate deploy` reports drift, connect to that tenant database and run `DROP TABLE IF EXISTS "_prisma_migrations";`, then `./scripts/docker-run.sh npm run migrate:tenants`.
- Force-reset a schema: `./scripts/docker-run.sh npx prisma db push --schema prisma/management.prisma`

## Testing

Tests run on the host (dev dependencies are not in the production image).

### Unit tests

- Run once: `npm run test:unit`
- Watch mode: `npm run test:unit:watch`
- Coverage: `npm run test:coverage`

Unit tests use Vitest + Testing Library with strict setup/teardown:

- `beforeAll`: starts MSW server
- `afterEach`: DOM cleanup, mock/timer reset, MSW handler reset, storage clear
- `afterAll`: closes MSW server

### E2E tests

- Run: `npm run test:e2e`
- Headed mode: `npm run test:e2e:headed`
- CI-managed web server: `npm run test:e2e:ci`

For real login flow, set `E2E_EMAIL` and `E2E_PASSWORD`. If missing, credentialed login tests are skipped.

## Architecture Notes

- Better Auth handles JWT persistence and injects the `tenantId` into session claims.
- The `tenantGuard` intercepts incoming requests, validates the Better Auth cookie/token, and overrides the Prisma runtime adapter strictly connecting to the correct DB proxy. 
- You can find the DAG schema format stored inside `lib/dag/types.ts`.

