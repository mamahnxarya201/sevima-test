# Accessing upstream data in workflows

This document describes how data flows from completed steps into downstream nodes: the merged `input` object, template interpolation on HTTP nodes, and the separate `inputs` map for Docker environment variables.

## Direct predecessors only

The engine builds **`input` only from nodes that have an edge pointing into the current node** (incoming edges). Nodes that are only reachable through multiple hops are **not** merged into `input` unless each hop is connected with an edge. If you need values from an indirect ancestor, either chain edges through intermediate nodes or duplicate the needed wiring.

If you reference **`input.<upstreamNodeId>.field`** in a CONDITION or Node/Python script, you **must** have an edge **`upstreamNodeId` → current node**. Without it, the producer and consumer can run in the same parallel batch and **`input.<upstreamNodeId>` is undefined** (common error: *Cannot read properties of undefined (reading 'statusCode')*). The workflow assistant auto-adds such edges when it detects `input.<id>.` in script text; validation also requires the edge.

Implementation: `mergeUpstreamOutputs` in `lib/dag/inputInterpolation.ts`.

## The `input` object (scripts)

For **CONDITION** (always Node.js) and **SCRIPT_EXECUTION** with **`runtime: node`** or **`runtime: python`**, the runner injects upstream data before your script runs:

- **Node.js:** `const input = JSON.parse(process.env.DAG_MERGED_INPUT_JSON || '{}');` is prepended for you; you write the body using the `input` variable.
- **Python:** an equivalent `input` dict is loaded from the same env var.

**Shell** (`runtime: sh`) scripts do **not** receive this injection; use **Node** or **Python** when you need `input`, or use the **`inputs`** map (below) to pass values as environment variables.

Implementation: `lib/orchestrator/dockerRunner.ts` (`DAG_MERGED_INPUT_JSON`, `NODE_INPUT_PRELUDE`, `wrapConditionScript`).

## How `input` is merged

For each **direct** upstream node id `U`, that node’s output object is stored in two ways:


| Access pattern      | Meaning                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`input.U.field`** | Namespaced by **upstream node id** `U`. Prefer this when multiple nodes feed the same step or when keys could collide. |
| **`input.field`**   | Flattened: all upstream output keys are copied onto `input`. If two upstreams both define the same key, **the later predecessor in sorted predecessor id order wins**. |


**Important:** `U` must be the **DAG node `id`** (e.g. `fetch_quote`), not the canvas **title** or **description**. If the id is `http_1`, use `input.http_1.statusCode`, not `input.fetch_quote` unless the id is actually `fetch_quote`.

If the id contains characters that are not valid in `input.foo.bar` (e.g. hyphens), use bracket syntax:

```js
input['my-node-id'].statusCode
```

## Typical upstream output shapes

### `HTTP_CALL`

Parsed from the curl run (see `parseHttpCallOutputs` in `lib/dag/ioResolver.ts`). By default you get at least:

- **`statusCode`** — HTTP status number  
- **`body`** — response body; parsed as JSON when possible, otherwise a string

If the node declares a custom **`outputs`** list, only those field names are **exposed** to the rest of the workflow (filtering still derives from the same full parse). **`statusCode` is always included** in the stored outputs even when omitted from `outputs`, so CONDITION scripts can still branch on HTTP status.

### `SCRIPT_EXECUTION`

Outputs are taken from the **last line of stdout**, parsed as JSON. Only keys listed in the node’s **`outputs`** array are kept.

### `CONDITION`

Consumes `input` and must print a JSON object whose last `console.log` includes **`result`**: boolean.

Condition outputs are persisted as:
- all merged upstream input fields (pass-through), plus
- parsed condition JSON fields (typically `result`, and optional forwarded fields).

That means branch nodes directly below a condition can still access upstream data (for example `input.fetch_quote.body`) even if they only have an incoming edge from the condition.

### `DELAY`

Does not add new fields; it **passes through** the same merged object it received as its outputs, so downstream nodes still see upstream data as if wired through the delay.

## HTTP templates vs script `input`

These are different mechanisms:

- **HTTP_CALL** `url`, `headers`, string `body`, etc. can contain placeholders like **`input.someField`** or **`input.upstreamId.body`**. Those strings are **interpolated** before curl runs (`interpolateInputTemplates` / `interpolateDagNode`). Only the **`input.path`** pattern used in templates is substituted; arbitrary `input` expressions in a string are not evaluated as JavaScript.
- **CONDITION** and **Node/Python SCRIPT_EXECUTION** get a real **`input`** object in code (JSON from env), not string substitution in the template sense.

`interpolateDagNode` **does not** rewrite `input` inside CONDITION or SCRIPT_EXECUTION scripts, so you can safely use `console.log(JSON.stringify(input))` in Node without breaking JSON literals.

## The `inputs` map (environment variables)

The optional **`inputs`** field on a node maps **environment variable names** to paths like **`upstreamNodeId.fieldName`**. The engine resolves those from **`runContext`** and passes them into the container as **`KEY=value`**. This is separate from the merged **`input`** JSON used for CONDITION and Node/Python scripts.

Use **`inputs`** when you need explicit env vars (e.g. for images or shell); use **`input`** in Node/Python when you want a single structured object.

See `resolveInputs` in `lib/dag/ioResolver.ts`.

## Quick reference

```text
# Namespaced (robust with multiple feeders)
input.fetch_quote.statusCode === 200

# Flat (simple graphs; watch collisions)
input.statusCode === 200

# Odd node id
input['step-2'].body
```

For implementation details and tests, see `lib/dag/inputInterpolation.ts` and `test/unit/lib/dag/inputInterpolation.test.ts`.