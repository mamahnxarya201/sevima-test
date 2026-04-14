---
name: DAG Auto-Save & WebSocket Sync
overview: Implement persistent DAG state using Jotai localStorage, abstract Prisma database calls into dedicated repositories, and build a dual-debouncer WebSocket sync system for optimistic UI updates.
todos:
  - id: clear_defaults
    content: Clear default nodes/edges in app/page.tsx
    status: completed
  - id: jotai_storage
    content: Update Jotai stores to use atomWithStorage for nodes, edges, and execution state
    status: completed
  - id: prisma_repos
    content: Create Prisma repository files (workflow.ts, workflowVersion.ts, workflowRun.ts)
    status: completed
  - id: ws_endpoint
    content: Create WebSocket auto-save endpoint at app/api/ws/workflows/[id]/route.ts
    status: completed
  - id: dual_debouncer
    content: Implement useWorkflowSync.ts with dual debouncers for optimistic UI sync
    status: completed
  - id: json_debugger
    content: Create useWorkflowDebugger.ts and add Debug JSON button to TopHeader.tsx
    status: completed
isProject: false
---

# DAG Auto-Save & WebSocket Sync Implementation Plan

## 1. Clear Default Canvas & Setup Jotai LocalStorage
- **Clear Defaults**: In `app/page.tsx`, remove the hardcoded `initialNodes` and `initialEdges`. Initialize the canvas as empty.
- **Persist State**: Update `store/workflowStore.ts` to replace standard atoms with `atomWithStorage` (from `jotai/utils`) for `nodesAtom`, `edgesAtom`, and `workflowTitleAtom`. This ensures the canvas state and the workflow title survive page reloads. The title will also be synced to the database.
- **Persist Execution**: Update `store/executionStore.ts` to wrap the `nodeExecutionFamily` in `atomWithStorage` so execution logs and statuses are also preserved locally.

## 2. Abstract Prisma Database Logic
Create dedicated repository files to cleanly separate database operations from API routes:
- `lib/prisma/workflow.ts`: Functions to `createWorkflow`, `updateWorkflow`, and `getWorkflow`.
- `lib/prisma/workflowVersion.ts`: Functions to `createWorkflowVersion` and `getLatestVersion`.
- `lib/prisma/workflowRun.ts`: Functions to `createWorkflowRun`, `updateRunStatus`, and `updateStepStatus`.

## 3. Create WebSocket Auto-Save Endpoint
- **New Route**: Create `app/api/ws/workflows/[id]/route.ts` using `next-ws`.
- **Logic**: This endpoint will maintain an open connection with the client. When it receives a JSON message containing a new DAG definition, it will:
  1. Validate the JSON using `validateDag`.
  2. Use the new Prisma repositories to update the `Workflow` and bump the `WorkflowVersion`.
  3. Send an acknowledgment back to the client.

## 4. Implement Dual Debouncers (Optimistic UI)
Create a new hook `hooks/useWorkflowSync.ts` to manage the synchronization between `localStorage` and PostgreSQL:
- **Debouncer 1 (Fast Sync)**: Watches the Jotai nodes/edges. When changes stop for 2 seconds, it converts the canvas to JSON using `exportCanvasToDag` and sends it over the WebSocket.
- **Debouncer 2 (Discrepancy Check)**: Runs every 30 seconds. It compares a hash of the current local JSON against the last acknowledged JSON hash from the server. If there is a discrepancy (e.g., a dropped connection), it forces a full sync to PostgreSQL.

## 5. JSON Debugger Hook & UI
- **Hook**: Create `hooks/useWorkflowDebugger.ts` that continuously provides the validated DAG JSON output.
- **UI**: Add a "Debug JSON" button in `components/layout/TopHeader.tsx` that opens a simple modal displaying the raw, formatted JSON for easy inspection.

## 6. How Node Outputs are Captured and Passed
The execution engine uses Dockerode to run each node in a container.
- **Capturing Output**: The engine captures the container's `stdout`. The **last line** of the stdout must be a valid JSON object. The engine parses this JSON and stores it in the `RunContext` under the node's ID.
- **Passing to Downstream Nodes**: In the DAG JSON, downstream nodes declare an `inputs` mapping. For example, if `process_data` outputs `{"count": 42}`, the downstream node can declare `"inputs": { "UPSTREAM_COUNT": "process_data.count" }`. The engine resolves this and injects `UPSTREAM_COUNT=42` as an environment variable into the downstream container.

---

### Example Workflow JSON (Parallel & All Types)
Here is an example of the validated JSON structure based on `lib/dag/types.ts` that includes every node type and a parallel execution branch:

```json
{
  "workflowName": "Parallel Data Processor",
  "nodes": [
    {
      "id": "fetch_users",
      "type": "HTTP_CALL",
      "http": {
        "method": "GET",
        "url": "https://api.example.com/users"
      },
      "outputs": ["body", "statusCode"]
    },
    {
      "id": "check_status",
      "type": "CONDITION",
      "script": "sh -c \"if [ '$STATUS' = '200' ]; then echo '{\\\"result\\\": true}'; else echo '{\\\"result\\\": false}'; fi\"",
      "inputs": { "STATUS": "fetch_users.statusCode" },
      "outputs": ["result"]
    },
    {
      "id": "process_data",
      "type": "SCRIPT_EXECUTION",
      "runtime": "node",
      "script": "const data = JSON.parse(process.env.USERS); console.log(JSON.stringify({ count: data.length }));",
      "inputs": { "USERS": "fetch_users.body" },
      "outputs": ["count"]
    },
    {
      "id": "notify_admin",
      "type": "HTTP_CALL",
      "http": {
        "method": "POST",
        "url": "https://api.slack.com/webhook",
        "body": { "text": "Workflow failed!" }
      }
    },
    {
      "id": "wait_for_sync",
      "type": "DELAY",
      "script": "sleep 10"
    }
  ],
  "edges": [
    { "from": "fetch_users", "to": "check_status" },
    { "from": "check_status", "to": "process_data", "branch": "true" },
    { "from": "check_status", "to": "notify_admin", "branch": "false" },
    { "from": "process_data", "to": "wait_for_sync" }
  ]
}
```