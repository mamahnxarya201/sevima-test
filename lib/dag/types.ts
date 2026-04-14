// DAG Type Definitions
// These types define the JSON schema for workflow DAG definitions.
// The engine both produces and consumes this schema.

export type NodeType = 'HTTP_CALL' | 'SCRIPT_EXECUTION' | 'DELAY' | 'CONDITION';

/**
 * Runtime for SCRIPT_EXECUTION nodes.
 * - 'python' → image default: python:3.11-slim
 * - 'node'   → image default: node:20-alpine
 * - 'sh'     → image default: alpine:3.19
 */
export type ScriptRuntime = 'python' | 'node' | 'sh';

/**
 * HTTP method for HTTP_CALL nodes.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Full HTTP config for HTTP_CALL nodes.
 * The engine builds a curl command from this config and runs it inside
 * the specified Docker container.
 */
export interface HttpConfig {
  /** HTTP method (default: GET) */
  method?: HttpMethod;
  url: string;
  /** Request headers — injected as -H flags to curl */
  headers?: Record<string, string>;
  /** Cookie string — injected as --cookie flag to curl */
  cookies?: string;
  /**
   * Request body — JSON-stringified and passed as --data-raw.
   * Automatically sets Content-Type: application/json if not overridden.
   */
  body?: Record<string, unknown> | string;
  /** Query params — appended to the URL */
  queryParams?: Record<string, string>;
  /** Basic auth — "user:password" */
  basicAuth?: string;
  /** Bearer token — injected as Authorization: Bearer <token> header */
  bearerToken?: string;
  /** Follow redirects (default: true) */
  followRedirects?: boolean;
  /** Timeout in seconds (default: 30) */
  timeoutSeconds?: number;
}

export interface DagNode {
  /** Unique identifier for this node (slug format, e.g. "fetch_data") */
  id: string;
  type: NodeType;

  /** Canvas / editor label (optional; ignored by executor, stored in definition for humans & AI) */
  title?: string;
  /** Canvas / editor description (optional; ignored by executor) */
  description?: string;

  /** Docker image to pull and run */
  image?: string;

  // ── SCRIPT_EXECUTION / DELAY / CONDITION fields ────────────────────
  /**
   * Command to run inside the container.
   * For SCRIPT_EXECUTION: use 'runtime' to pick Python/Node/sh.
   * For CONDITION: must print {"result": true} or {"result": false} to stdout.
   * For DELAY: e.g. "sleep 5".
   * Ignored for HTTP_CALL (use 'http' instead).
   */
  script?: string;

  /**
   * Runtime for SCRIPT_EXECUTION nodes.
   * Determines the default image if 'image' is not specified:
   *   python → python:3.11-slim
   *   node   → node:20-alpine
   *   sh     → alpine:3.19
   */
  runtime?: ScriptRuntime;

  // ── HTTP_CALL fields ───────────────────────────────────────────────
  /** Full HTTP call configuration. Used only when type === 'HTTP_CALL'. */
  http?: HttpConfig;

  // ── Resource limits ────────────────────────────────────────────────
  /** CPU limit as a fraction of 1 CPU (e.g. "0.5" = 50%). Default: "1.0" */
  cpuLimit?: string;
  /** Memory limit as Docker-style bytes string (e.g. "128m"). Default: "256m" */
  memLimit?: string;

  // ── Retry policy ───────────────────────────────────────────────────
  /** Max retry attempts on non-zero exit code. Default: 0 */
  retries?: number;
  /** Base delay in ms between retries. Doubles on each attempt. Default: 1000 */
  retryDelayMs?: number;

  // ── I/O contract ───────────────────────────────────────────────────
  /**
   * Input env vars to inject from upstream node outputs.
   * Key: env var name inside the container.
   * Value: "upstreamNodeId.outputField" path.
   * Example: { "UPSTREAM_BODY": "fetch_data.body" }
   */
  inputs?: Record<string, string>;

  /**
   * Output field names to parse from the last JSON line of stdout.
   * The container MUST print a valid JSON object as its final stdout line.
   * Example: ["body", "statusCode"]
   */
  outputs?: string[];
}

export interface DagEdge {
  from: string;
  to: string;
  /**
   * For CONDITION node outgoing edges only.
   * Routes execution to this edge's target based on the CONDITION node's
   * {"result": true/false} output.
   */
  branch?: 'true' | 'false';
}

export interface DagSchema {
  workflowName: string;
  nodes: DagNode[];
  edges: DagEdge[];
}

// ─────────────────────────────────────────────
// Runtime context types (used by execution engine)
// ─────────────────────────────────────────────

/** Accumulated outputs keyed by nodeId → outputField → value */
export type RunContext = Record<string, Record<string, unknown>>;

export interface StepEvent {
  runId: string;
  stepId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'RETRYING' | 'TIMEOUT';
  logs?: string;
  error?: string;
  outputs?: Record<string, unknown>;
  /** From dockerRunner / container `durationMs` */
  durationMs?: number;
}

export interface RunCompleteEvent {
  runId: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  durationMs: number;
  /** Present when status is FAILED/TIMEOUT — e.g. validation errors or thrown engine message */
  error?: string;
}

/** Emitted when the engine creates a new WorkflowRun as a retry of a failed run. */
export interface WorkflowRetryEvent {
  /** The original run that the WS client initially subscribed to. */
  originalRunId: string;
  /** The failed run that triggered this retry. */
  failedRunId: string;
  /** The new run created for the retry attempt. */
  newRunId: string;
  /** 1-based retry attempt number. */
  attempt: number;
  maxAttempts: number;
}
