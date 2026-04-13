# How Node Outputs are Captured and Passed

## 1. Execution Engine (Docker Sandbox)
When a node runs, it executes inside a secure Docker container (e.g., Node.js for Script nodes, Alpine/curl for HTTP nodes).
The execution engine captures the standard output (`stdout`) of the container.
The **last line** of the `stdout` is expected to be a valid JSON string. This JSON represents the node's outputs.

Example Script Node:
```javascript
const result = { success: true, data: "some computed value" };
// The very last console.log is captured as the output
console.log(JSON.stringify(result));
```

## 2. Capturing Outputs
The backend execution service reads this last line, parses it as JSON, and stores it in the database for that specific step run (`stepRun.outputs`).
It also broadcasts this output via WebSocket to the frontend so the UI can update in real-time.

## 3. Passing to Downstream Nodes
When the execution engine prepares to run the *next* node in the DAG, it looks at the incoming edges.
It gathers the outputs from all upstream nodes that successfully completed.
These outputs are injected into the new Docker container as **Environment Variables**.

The environment variable is named using the upstream node's ID, typically formatted as `NODE_[ID]_OUTPUT`.

Example: If Node `step_1` outputs `{"user": "alice"}`, and Node `step_2` depends on `step_1`, the container for `step_2` will have an environment variable:
`NODE_step_1_OUTPUT='{"user": "alice"}'`

## 4. Using Upstream Outputs
Inside the downstream node (e.g., a Script Node), you can access these outputs by parsing the environment variables.

```javascript
// Inside step_2's script
const step1OutputStr = process.env['NODE_step_1_OUTPUT'];
if (step1OutputStr) {
  const step1Output = JSON.parse(step1OutputStr);
  console.log("Got user:", step1Output.user); // "alice"
}
```

For HTTP nodes, the execution engine might support a templating syntax (like `{{step_1.user}}`) in the URL or Body fields, which the engine resolves by looking up the upstream outputs before launching the curl container.
