### **Project Title: Multi-Tenant Workflow Engine with Isolated Database Strategy**

**Objective:**
Build a robust, scalable backend system using **NextJS** and **Prisma** that manages and executes complex workflows defined as Directed Acyclic Graphs (DAG). The system must support strict multi-tenancy through physically isolated databases per tenant.
---

### **Final Ultimate Master Prompt: Multi-Tenant Docker-DAG Engine**

**Objective:**
Build a NextJS-based workflow engine that orchestrates tasks defined in a **JSON DAG Schema**. The system utilizes **Dockerode** for sandboxed execution and follows a strict **Isolated Multi-Tenant Database** strategy (PostgreSQL).

#### **1. Database & Multi-Tenancy (Isolated Strategy)**
* **Management DB:** Central directory storing `Tenants` and their specific `connectionUrl`.
* **Tenant DB:** Isolated storage for `Workflows` and `WorkflowVersions`.
* **Dynamic Resolution:** A NextJS `Guard` resolves the tenant's database URL and injects it into a `Request-Scoped` Prisma provider.

#### **2. JSON DAG Schema & Parsing**
* **Schema Definition:** The engine consumes a `.json` schema containing `nodes` (tasks) and `edges` (dependencies).
    * **Node Types:** `HTTP_CALL`, `SCRIPT_EXECUTION`, `DELAY`, `CONDITION`.
    * **Configuration:** Each node includes metadata (Image name, CPU/RAM limits, Retry logic).
* **Validation Layer:** * **Structural:** Validate JSON against a JSON Schema (ensure all `edges` point to existing `nodes`).
    * **Logical:** Detect cycles using **Kahn’s Algorithm** (Topological Sort).
    * **Security:** Strict regex validation to prevent command injection within script nodes.

#### **3. Dockerized Execution (The Orchestrator)**
* **Execution Flow:** 1. Parse JSON -> Sort Nodes.
    2. Iterate through sorted levels (Parallelize independent nodes).
    3. For each node: `docker.pull()` -> `docker.createContainer()` (inject input via Env/Cmd) -> `start()` -> `wait()`.
    4. Capture logs/output and store as `StepRun` result.
    5. Pass output data to downstream nodes as specified in the DAG.
* **Cleanup:** Immediate container removal (`force: true`) to maintain host resource health.

#### **4. Resilience & Real-Time Monitoring**
* **Retries:** Exponential backoff at the container level if exit code $\neq 0$.
* **Live Updates:** Use **Socket.io** to stream container logs and status "lights" (lights up node visually) based on real-time Docker events.

#### **5. Technical Stack**
* **Backend:** NextJS & Prisma.
* **Orchestration:** Dockerode.
* **CLI:** Next or custom based solution  (for `migrate:tenants`).

---


### **Input JSON:**
```json
{
  "workflowName": "Diaz Data Processor",
  "nodes": [
    { 
      "id": "fetch_data", 
      "type": "HTTP", 
      "image": "alpine",
      "script": "curl -X GET https://api.yoursite.com/data" 
    },
    { 
      "id": "process_data", 
      "type": "SCRIPT", 
      "image": "python:3.9-slim",
      "script": "python -c 'import os; print(f\"Processing: {os.environ[\"PARENT_DATA\"]}\")'" 
    }
  ],
  "edges": [
    { "from": "fetch_data", "to": "process_data" }
  ]
}
```

Database schema (prefered)
cental db for managing tenant:
// management.prisma

generator client {
  provider = "prisma-client-js"
  output   = "./generated/management-client"
}

datasource db {
  provider = "postgresql"
}

model Tenant {
  id            String   @id @default(uuid())
  name          String
  // URL format: postgresql://user:pass@host:5432/tenant_db_name
  connectionUrl String
  status        String   @default("ACTIVE")
  createdAt     DateTime @default(now())

  users         User[]
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // Hashed
  role      Role     @default(VIEWER)
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
}

enum Role {
  ADMIN
  EDITOR
  VIEWER
}

tenant (isolated db)
// tenant.prisma

generator client {
  provider = "prisma-client-js"
  output   = "./generated/tenant-client"
}

datasource db {
  provider = "postgresql"
}

// --- WORKFLOW DEFINITION ---

model Workflow {
  id            String            @id @default(uuid())
  name          String
  description   String?

  // Decoupled: ID User dari Central DB
  ownerId       String

  activeVersion Int               @default(1)
  versions      WorkflowVersion[]

  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([ownerId])
}

model WorkflowVersion {
  id            String        @id @default(uuid())
  versionNumber Int

  // Format DAG: { "nodes": [...], "edges": [...] }
  definition    Json

  workflowId    String
  workflow      Workflow      @relation(fields: [workflowId], references: [id])
  runs          WorkflowRun[]

  @@unique([workflowId, versionNumber])
}

// --- EXECUTION ENGINE ---

model WorkflowRun {
  id                String          @id @default(uuid())
  status            RunStatus       @default(PENDING)

  workflowVersionId String
  workflowVersion   WorkflowVersion @relation(fields: [workflowVersionId], references: [id])

  // Decoupled: Siapa yang nge-trigger
  triggeredById     String?

  stepRuns          StepRun[]

  startedAt         DateTime?
  endedAt           DateTime?
  duration          Int?            // Milidetik

  // Optimasi buat Global Health Dashboard
  @@index([status, startedAt(sort: Desc)])
  @@index([triggeredById])
}

model StepRun {
  id           String    @id @default(uuid())
  stepId       String    // ID node dari JSON DAG (misal: "step_1")

  runId        String
  run          WorkflowRun @relation(fields: [runId], references: [id])

  status       RunStatus @default(PENDING)
  attempts     Int       @default(0)
  errorMessage String?

  startedAt    DateTime?
  endedAt      DateTime?

  @@index([runId])
}

enum RunStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
  RETRYING
  TIMEOUT
}

