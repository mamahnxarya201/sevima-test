# Multi-Tenant Docker-DAG Workflow Engine — Revised Implementation Plan

Turning the existing React Flow DAG designer into a fully operational, multi-tenant, Dockerized workflow execution engine running inside a container (`orchestrator-node`).

---

## Design Decisions (Based on Your Feedback)

| Topic | Decision |
|---|---|
| **Docker socket** | Podman socket mounted via `docker-compose.yaml` at `/var/run/docker.sock:z`. Dockerode init uses `DOCKER_HOST=unix:///var/run/docker.sock` env already set in compose. |
| **Postgres provisioning** | App auto-creates a new isolated DB + dedicated Postgres user per tenant at registration time using a superuser connection (`DATABASE_URL` in `.env` → `postgresql://user:password@db:5432`). |
| **Auth** | **Better Auth** with `jwt()` plugin + `bearer()` plugin. Full login/register UI. The canvas and all API routes sit behind auth. JWT payload carries `{ userId, tenantId, role }` via `definePayload`. |
| **WebSocket strategy** | **`next-ws`** — patches Next.js at runtime to expose an `UPGRADE` export in API route files. No custom server needed. Works inside the containerized app router setup. |
| **Dual Prisma schemas** | Two separate schemas + two generated clients. Tenant client is instantiated dynamically per-request (documented below). |
| **I/O chaining** | Node output is captured from container stdout; the execution engine resolves each node's declared inputs from upstream node outputs according to DAG edges before launching the next container. |

---

## DAG JSON Schema (Full Annotated Reference)

This is the authoritative shape the system produces, consumes, and validates:

```jsonc
{
  "workflowName": "Diaz Data Processor",

  "nodes": [
    {
      // ── Required fields ────────────────────────────────────────────
      "id": "fetch_data",           // Unique node identifier (slug format)
      "type": "HTTP_CALL",          // HTTP_CALL | SCRIPT_EXECUTION | DELAY | CONDITION

      // ── Docker execution config ────────────────────────────────────
      "image": "alpine:3.19",       // Docker image to pull and run
      "script": "curl -s -X GET https://api.example.com/data",  // Cmd passed to container

      // ── Resource limits (optional, defaults applied if omitted) ────
      "cpuLimit": "0.5",            // Docker CpuQuota equivalent (fraction of 1 CPU)
      "memLimit": "128m",           // Docker Memory (bytes string)

      // ── Retry policy (optional) ────────────────────────────────────
      "retries": 3,                 // Max retry attempts on non-zero exit
      "retryDelayMs": 1000,         // Base delay; doubles on each attempt (expo backoff)

      // ── I/O contract ──────────────────────────────────────────────
      // 'inputs' declares which upstream node outputs to inject as env vars.
      // Key = env var name inside container, Value = "nodeId.fieldName" path.
      "inputs": {},                 // fetch_data has no upstream inputs

      // 'outputs' declares named fields parsed from stdout JSON.
      // Container MUST print a JSON object as its last stdout line.
      "outputs": ["body", "statusCode"]
    },
    {
      "id": "process_data",
      "type": "SCRIPT_EXECUTION",
      "image": "python:3.11-slim",
      "script": "python3 -c \"import os,json; d=os.environ['UPSTREAM_BODY']; print(json.dumps({'summary': 'Processed: '+d[:50]}))\"",
      "cpuLimit": "1.0",
      "memLimit": "256m",
      "retries": 2,
      "retryDelayMs": 500,

      // 'inputs' — engine injects UPSTREAM_BODY = output of fetch_data.body as env var
      "inputs": {
        "UPSTREAM_BODY": "fetch_data.body"
      },
      "outputs": ["summary"]
    },
    {
      "id": "wait_a_bit",
      "type": "DELAY",
      "image": "alpine:3.19",
      "script": "sleep 5",          // DELAY nodes simply sleep; no I/O contract needed
      "inputs": {},
      "outputs": []
    },
    {
      "id": "check_threshold",
      "type": "CONDITION",
      "image": "alpine:3.19",
      // CONDITION nodes must print exactly: {"result": true} or {"result": false}
      // The engine routes to the 'true' or 'false' branch based on this output.
      "script": "sh -c \"echo '{\\\"result\\\": true}'\"",
      "inputs": {
        "SUMMARY": "process_data.summary"
      },
      "outputs": ["result"]
    }
  ],

  "edges": [
    { "from": "fetch_data",     "to": "process_data"   },
    { "from": "process_data",   "to": "wait_a_bit"     },
    { "from": "wait_a_bit",     "to": "check_threshold" },
    // CONDITION edges carry a 'branch' field: "true" | "false"
    { "from": "check_threshold", "to": "notify_success", "branch": "true"  },
    { "from": "check_threshold", "to": "log_failure",    "branch": "false" }
  ]
}
```

### I/O Chaining Rules

```
Node A stdout (last line, must be valid JSON):
  → {"body": "<html>...", "statusCode": 200}

Engine parses declared outputs: ["body", "statusCode"]
Stores in run context: { "fetch_data": { body: "...", statusCode: 200 } }

Node B inputs: { "UPSTREAM_BODY": "fetch_data.body" }
Engine resolves → env var: UPSTREAM_BODY="<html>..."
Injected into docker.createContainer({ Env: ["UPSTREAM_BODY=<html>..."] })
```

---

## Proposed Changes

### Phase 1 — Infrastructure Updates

#### [MODIFY] `docker-compose.yaml`

Update the `orchestrator-node` service to run the actual Next.js app instead of a bare node script. Add `depends_on: db` with health check condition. Add `ports: 3000:3000` and `PORT=3000`.

#### [MODIFY] `.env`

Change `localhost` → `db` (Docker service name) in all database URLs so they resolve correctly inside the container network.

```
MANAGEMENT_DATABASE_URL="postgresql://user:password@db:5432/management_db"
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
DOCKER_HOST_PATH=/run/user/1000/podman/podman.sock
```

---

### Phase 2 — Dependencies

#### [MODIFY] `package.json`

| Package | Purpose |
|---|---|
| `better-auth` | Auth framework (session + JWT plugin + bearer plugin) |
| `dockerode` + `@types/dockerode` | Docker orchestration |
| `@prisma/client` + `prisma` | Dual ORM clients |
| `next-ws` + `ws` + `@types/ws` | WebSocket inside Next.js app router |
| `zod` | DAG schema + API input validation |
| `p-limit` | Concurrency cap for parallel node execution |
| `pg` | Raw Postgres client for tenant DB provisioning |

Add to `scripts`:
```json
"prepare": "next-ws",
"migrate:tenants": "tsx scripts/migrate-tenants.ts"
```

---

### Phase 3 — Dual Prisma Schema

#### [NEW] `prisma/management.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../lib/generated/management-client"
}

datasource db {
  provider = "postgresql"
  url      = env("MANAGEMENT_DATABASE_URL")
}

model Tenant {
  id            String   @id @default(uuid())
  name          String
  connectionUrl String
  status        String   @default("ACTIVE")
  createdAt     DateTime @default(now())
  users         User[]
}

model User {
  id       String @id @default(uuid())
  email    String @unique
  password String
  role     Role   @default(VIEWER)
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
}

enum Role { ADMIN EDITOR VIEWER }
```

#### [NEW] `prisma/tenant.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../lib/generated/tenant-client"
}

datasource db {
  provider = "postgresql"
  url      = env("TENANT_DATABASE_URL")  // placeholder; overridden at runtime
}

// Workflow, WorkflowVersion, WorkflowRun, StepRun, RunStatus
// (exact schema from guidelines.md)
```

#### [NEW] `lib/prisma/management.ts` — Management Client (Singleton)

```ts
import { PrismaClient as ManagementClient } from '../generated/management-client';

declare global { var __management_prisma: ManagementClient | undefined; }

export const managementDb = globalThis.__management_prisma ??
  (globalThis.__management_prisma = new ManagementClient());
```

#### [NEW] `lib/prisma/tenant.ts` — Dynamic Tenant Client

> **How the dual-client pattern works:**
> Prisma allows overriding the datasource URL at instantiation time. The `TENANT_DATABASE_URL` env var in `tenant.prisma` is only used for `prisma migrate deploy` during the CLI script. At runtime, every request creates (or retrieves from a cache) a client pointed at the specific tenant's DB.

```ts
import { PrismaClient as TenantClient } from '../generated/tenant-client';

// LRU-style cache: connectionUrl → PrismaClient instance
const tenantClientCache = new Map<string, TenantClient>();

export function getTenantDb(connectionUrl: string): TenantClient {
  if (tenantClientCache.has(connectionUrl)) {
    return tenantClientCache.get(connectionUrl)!;
  }
  const client = new TenantClient({
    datasources: { db: { url: connectionUrl } },
  });
  tenantClientCache.set(connectionUrl, client);
  return client;
}
```

---

### Phase 4 — Better Auth Setup

#### [NEW] `lib/auth/auth.ts` — Server-side

```ts
import { betterAuth } from 'better-auth';
import { jwt, bearer } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { managementDb } from '../prisma/management';

export const auth = betterAuth({
  database: prismaAdapter(managementDb, { provider: 'postgresql' }),
  plugins: [
    bearer(),
    jwt({
      jwt: {
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: (user as any).tenantId,
        }),
        expirationTime: '8h',
      },
    }),
  ],
  emailAndPassword: { enabled: true },
});
```

#### [NEW] `lib/auth/auth-client.ts` — Client-side

```ts
import { createAuthClient } from 'better-auth/client';
import { jwtClient, bearerClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [bearerClient(), jwtClient()],
});
```

#### [NEW] `lib/auth/tenantGuard.ts`

Reads `Authorization: Bearer <token>` → verifies via JWKS → extracts `tenantId` → fetches `connectionUrl` from management DB → returns tenant Prisma client.

#### [NEW] `app/api/auth/[...all]/route.ts`

Standard Better Auth catch-all handler.

---

### Phase 5 — DAG Validation Engine

#### [NEW] `lib/dag/types.ts`

Full TypeScript type definitions for `DagNode`, `DagEdge`, `DagSchema` matching the JSON schema above.

#### [NEW] `lib/dag/validator.ts`

Three-layer validation returning `{ levels: DagNode[][], errors: string[] }`:

1. **Structural** (Zod) — required fields, edge references valid node IDs, `outputs` array declared
2. **Logical** (Kahn's BFS) — builds adjacency list + in-degree map → detects cycles → returns topological levels
3. **Security** (regex) — rejects `$(...)`, backtick substitution, unquoted `;`, `&&`, `||`, `|` in `script` fields

#### [NEW] `lib/dag/ioResolver.ts`

At execution time, given a node's `inputs` map and the accumulated `runContext` (outputs from completed nodes), builds the `Env` array for Dockerode:

```ts
// inputs: { "UPSTREAM_BODY": "fetch_data.body" }
// runContext: { "fetch_data": { "body": "...", "statusCode": 200 } }
// → ["UPSTREAM_BODY=..."]
export function resolveInputs(
  inputs: Record<string, string>,
  runContext: Record<string, Record<string, string>>
): string[]
```

---

### Phase 6 — Docker Orchestrator

#### [NEW] `lib/orchestrator/dockerRunner.ts`

```ts
export interface StepResult {
  exitCode: number;
  logs: string;
  outputs: Record<string, unknown>; // parsed from last JSON line of stdout
  durationMs: number;
}

export async function runNode(node: DagNode, env: string[]): Promise<StepResult>
```

Flow per node:
1. `docker.pull(image)` — streams pull, waits for completion
2. `docker.createContainer({ Image, Cmd: ['sh','-c', script], Env, HostConfig: { Memory, CpuPeriod: 100000, CpuQuota: cpuFraction * 100000 } })`
3. `container.start()` → `container.wait()` → capture `StatusCode`
4. `container.logs({ stdout: true, stderr: true })` → collect, parse last stdout line as JSON for outputs
5. `container.remove({ force: true })`
6. Return `{ exitCode, logs, outputs, durationMs }`

#### [NEW] `lib/orchestrator/executionEngine.ts`

```ts
export async function runWorkflow(
  run: WorkflowRun,
  definition: DagSchema,
  tenantDb: TenantClient,
  emitEvent: (event: StepEvent) => void
): Promise<void>
```

Loop:
```
levels = validateDag(definition).levels
runContext = {}

for each level:
  await Promise.all(level.map(async (node) => {
    env = resolveInputs(node.inputs, runContext)
    
    for attempt 0..node.retries:
      update StepRun → RUNNING
      emitEvent({ stepId: node.id, status: 'RUNNING' })
      
      result = await runNode(node, env)
      
      if result.exitCode === 0:
        runContext[node.id] = result.outputs
        update StepRun → SUCCESS
        emitEvent({ stepId: node.id, status: 'SUCCESS', logs: result.logs })
        break
      else:
        if attempt < retries:
          update StepRun → RETRYING
          await sleep(retryDelayMs * 2^attempt)  // exponential backoff
        else:
          update StepRun → FAILED
          emitEvent({ stepId: node.id, status: 'FAILED', error: result.logs })
          throw new Error(`Step ${node.id} failed`)
  }))

update WorkflowRun → SUCCESS
emitEvent({ type: 'run:complete', status: 'SUCCESS' })
```

Uses `p-limit(5)` as a global concurrency gate across all levels.

---

### Phase 7 — API Routes

#### [NEW] `app/api/tenants/route.ts`

`POST /api/tenants` — registers a new tenant:
1. Connect to Postgres with `DATABASE_URL` (superuser)
2. Create new DB: `CREATE DATABASE tenant_<uuid>`
3. Create dedicated user: `CREATE USER tenant_<uuid>_user WITH PASSWORD '...'`
4. Grant privileges: `GRANT ALL ON DATABASE ... TO ...`
5. Store `Tenant` record in management DB with `connectionUrl`
6. Run `prisma migrate deploy` against new DB via child process

#### [NEW] `app/api/workflows/route.ts` — `GET` / `POST`
#### [NEW] `app/api/workflows/[id]/route.ts` — `GET` / `PATCH`
#### [NEW] `app/api/workflows/[id]/run/route.ts`

`POST` — creates `WorkflowRun` (PENDING), fires `executionEngine.runWorkflow(...)` as a **detached async task** (not awaited), returns `{ runId }` immediately.

#### [NEW] `app/api/runs/[runId]/route.ts` — `GET`

Returns full `WorkflowRun` with all `StepRun` statuses. Used for initial REST snapshot on page load before WebSocket takes over.

---

### Phase 8 — WebSocket via next-ws

#### [NEW] `app/api/ws/runs/[runId]/route.ts`

```ts
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

export function SOCKET(
  client: WebSocket,
  request: IncomingMessage,
  server: WebSocketServer
) {
  const runId = /* parse from URL */;
  // Subscribe client to run-scoped event bus
  runEventBus.on(runId, (event) => {
    client.send(JSON.stringify(event));
  });
  client.on('close', () => runEventBus.off(runId, handler));
}
```

#### [NEW] `lib/socket/eventBus.ts`

Simple in-process `EventEmitter` keyed by `runId`. The `executionEngine`'s `emitEvent` callback pushes events here. The WebSocket handler subscribes per-client.

#### [MODIFY] `store/executionStore.ts`

Replace mock `setInterval` simulation:
```ts
// Connect to ws://localhost:3000/api/ws/runs/<runId>
// On each message: update nodeExecutionFamily atom for that stepId
```

---

### Phase 9 — Auth UI (Full Login Flow)

#### [NEW] `app/(auth)/login/page.tsx`
#### [NEW] `app/(auth)/register/page.tsx`

Login and register pages using `authClient.signIn.email()` / `authClient.signUp.email()`. Styled to match the existing Manrope/Inter design system.

#### [MODIFY] `app/layout.tsx`

Wrap with `SessionProvider` from Better Auth. Redirect unauthenticated users to `/login`.

#### [NEW] `middleware.ts`

Next.js middleware to protect all routes under `/(app)` — reads session cookie, redirects to `/login` if missing.

---

### Phase 10 — Frontend Integration

#### [MODIFY] `components/layout/TopHeader.tsx`

- **"Run Workflow"** button: exports canvas → `POST /api/workflows/:id/run` → connects WS to `/api/ws/runs/:runId`
- **"Save Version"** button: serializes canvas → `PATCH /api/workflows/:id`
- Status badge: `IDLE | RUNNING | SUCCESS | FAILED` driven by Jotai atom

#### [NEW] `components/ui/LogDrawer.tsx`

Slide-in panel on node click showing node's `StepRun` logs (fetched from `GET /api/runs/:runId`).

#### [NEW] `lib/canvas/dagExporter.ts`

Converts React Flow `{ nodes, edges }` to the DAG JSON schema format, mapping React Flow node `type` → DAG `type` enum.

---

### Phase 11 — CLI Migration Tool

#### [NEW] `scripts/migrate-tenants.ts`

```ts
// npm run migrate:tenants
// Reads all tenants, sets TENANT_DATABASE_URL, runs: prisma migrate deploy --schema prisma/tenant.prisma
```

---

## File Tree (New Files)

```
lib/
  auth/
    auth.ts              ← Better Auth server config
    auth-client.ts       ← Better Auth client config
    tenantGuard.ts       ← JWT → tenant Prisma client
  prisma/
    management.ts        ← singleton management client
    tenant.ts            ← dynamic tenant client factory
  generated/             ← generated by prisma generate (gitignored)
  dag/
    types.ts
    validator.ts         ← Zod + Kahn's algorithm + regex
    ioResolver.ts        ← input/output chaining
  orchestrator/
    dockerRunner.ts
    executionEngine.ts
  socket/
    eventBus.ts
  canvas/
    dagExporter.ts
prisma/
  management.prisma
  tenant.prisma
app/
  (auth)/
    login/page.tsx
    register/page.tsx
  api/
    auth/[...all]/route.ts
    tenants/route.ts
    workflows/route.ts
    workflows/[id]/route.ts
    workflows/[id]/run/route.ts
    runs/[runId]/route.ts
    ws/runs/[runId]/route.ts  ← next-ws SOCKET export
components/
  ui/
    LogDrawer.tsx
scripts/
  migrate-tenants.ts
middleware.ts
```

---

## Verification Plan

| Step | Check |
|---|---|
| `npm run build` | TypeScript compiles with dual Prisma clients |
| DAG validator unit tests | Cycle detected, injection blocked, chained I/O resolves correctly |
| `docker-compose up` | `orchestrator-node` starts, `db` passes health check |
| Register tenant | New Postgres DB + user created, `Tenant` row inserted |
| Login | Better Auth issues JWT, canvas loads |
| Save workflow | DAG JSON stored as `WorkflowVersion` |
| Run workflow | Containers execute in topological order, nodes light up via WebSocket |
| Chained I/O | `process_data` container receives `UPSTREAM_BODY` env var from `fetch_data` output |
| Log drawer | `StepRun` logs visible after run completes |
