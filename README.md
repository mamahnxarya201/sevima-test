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
docker-compose up -d db
```

### 3. Generate & Migrate schemas
Generate the binary engines for BOTH the Host and Alpine environments:
```bash
npx prisma generate --schema prisma/management.prisma
npx prisma generate --schema prisma/tenant.prisma
```

Bootstrap the tables into your `management_db`:
```bash
npx prisma migrate dev --schema prisma/management.prisma --name init
```

*(Note: Ensure you respond to any drop-column prompts if you change schemas manually! Or use `npx prisma db push --schema prisma/management.prisma` for force resets).*

### 4. Running the Engine
For rapid UI development and local debugging:
```bash
npm run dev
```

Alternatively, to run the entire backend and worker orchestration purely inside the container:
```bash
docker-compose up -d orchestrator-node
```

## Architecture Notes
- Better Auth handles JWT persistence and injects the `tenantId` into session claims.
- The `tenantGuard` intercepts incoming requests, validates the Better Auth cookie/token, and overrides the Prisma runtime adapter strictly connecting to the correct DB proxy. 
- You can find the DAG schema format stored inside `lib/dag/types.ts`.
