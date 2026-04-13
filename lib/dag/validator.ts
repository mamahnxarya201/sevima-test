/**
 * lib/dag/validator.ts
 *
 * Three-layer DAG validation:
 *   1. Structural — Zod schema (required fields, edge refs point to existing nodes)
 *   2. Logical    — Kahn's Algorithm (BFS topological sort, cycle detection)
 *   3. Security   — Regex to block shell injection in 'script' fields
 *
 * Returns topological levels (for parallel execution) or a list of errors.
 */

import { z } from 'zod';
import type { DagNode, DagSchema } from './types';

// ─────────────────────────────────────────────
// 1. ZOD STRUCTURAL SCHEMA
// ─────────────────────────────────────────────

const HttpConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  url: z.string().url('http.url must be a valid URL'),
  headers: z.record(z.string(), z.string()).optional(),
  cookies: z.string().optional(),
  body: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  basicAuth: z.string().optional(),
  bearerToken: z.string().optional(),
  followRedirects: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});

const DagNodeSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Node id must be lowercase alphanumeric with _ or -'),
  type: z.enum(['HTTP_CALL', 'SCRIPT_EXECUTION', 'DELAY', 'CONDITION']),
  image: z.string().optional(),
  script: z.string().optional(),
  runtime: z.enum(['python', 'node', 'sh']).optional(),
  http: HttpConfigSchema.optional(),
  cpuLimit: z.string().optional(),
  memLimit: z.string().optional(),
  retries: z.number().int().min(0).max(10).optional(),
  retryDelayMs: z.number().int().min(0).optional(),
  inputs: z.record(z.string(), z.string()).optional(),
  outputs: z.array(z.string()).optional(),
}).refine(
  (node) => node.type !== 'HTTP_CALL' || node.http !== undefined,
  { message: 'HTTP_CALL nodes must have an "http" config block' }
).refine(
  (node) => node.type === 'HTTP_CALL' || node.script !== undefined,
  { message: 'Non-HTTP nodes must have a "script" field' }
);

const DagEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  branch: z.enum(['true', 'false']).optional(),
});

const DagSchemaZod = z.object({
  workflowName: z.string().min(1),
  nodes: z.array(DagNodeSchema).min(1, 'DAG must have at least one node'),
  edges: z.array(DagEdgeSchema),
});

// ─────────────────────────────────────────────
// 2. SECURITY — INJECTION GUARD
// ─────────────────────────────────────────────

/**
 * Patterns that indicate shell injection attempts in script fields.
 * Blocks unquoted subshell execution, command chaining, and pipe redirection.
 */
const INJECTION_PATTERNS = [
  /\$\(.*\)/,           // $(command)
  /`[^`]*`/,            // `backtick substitution`
  /[^'"]\s*&&\s*[^'"]/, // cmd && cmd (outside quotes — rough heuristic)
  /[^'"]\s*\|\|\s*[^'"]/,// cmd || cmd
  /;\s*rm\s/,           // ; rm ...
  /;\s*curl\s/,         // ; curl ...
  /;\s*wget\s/,         // ; wget ...
  />\s*\/etc/,          // redirect to /etc
];

function checkInjection(script: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(script)) {
      return `Possible injection detected in script: "${script.slice(0, 60)}"`;
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 3. KAHN'S ALGORITHM (TOPOLOGICAL SORT)
// ─────────────────────────────────────────────

/**
 * Performs a BFS topological sort using Kahn's Algorithm.
 * Returns sorted levels (nodes that can execute in parallel share a level),
 * or throws if a cycle is detected.
 */
function kahnSort(nodes: DagNode[], edges: DagSchema['edges']): DagNode[][] | null {
  const nodeMap = new Map<string, DagNode>(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const levels: DagNode[][] = [];
  let queue: string[] = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);

  let visited = 0;
  while (queue.length > 0) {
    const level: DagNode[] = queue.map((id) => nodeMap.get(id)!);
    levels.push(level);
    visited += queue.length;

    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const neighbor of adjacency.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) nextQueue.push(neighbor);
      }
    }
    queue = nextQueue;
  }

  if (visited !== nodes.length) return null; // cycle detected
  return levels;
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  levels: DagNode[][];
}

export function validateDag(input: unknown): ValidationResult {
  const errors: string[] = [];

  // Layer 1: Structural (Zod)
  const parsed = DagSchemaZod.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `[structural] ${i.path.join('.')}: ${i.message}`),
      levels: [],
    };
  }

  const dag: DagSchema = parsed.data as DagSchema;
  const nodeIds = new Set(dag.nodes.map((n) => n.id));

  // Layer 1b: Edge references valid node IDs
  for (const edge of dag.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`[structural] Edge from unknown node: "${edge.from}"`);
    if (!nodeIds.has(edge.to)) errors.push(`[structural] Edge to unknown node: "${edge.to}"`);
  }

  // Layer 3: Security — injection guard on scripts
  for (const node of dag.nodes) {
    if (node.script) {
      const injectionError = checkInjection(node.script);
      if (injectionError) errors.push(`[security] ${node.id}: ${injectionError}`);
    }
    if (node.http?.url) {
      const injectionError = checkInjection(node.http.url);
      if (injectionError) errors.push(`[security] ${node.id}: ${injectionError}`);
    }
  }

  if (errors.length > 0) return { valid: false, errors, levels: [] };

  // Layer 2: Logical — Kahn's cycle detection
  const levels = kahnSort(dag.nodes, dag.edges);
  if (!levels) {
    return {
      valid: false,
      errors: ['[logical] DAG contains a cycle — Kahn\'s topological sort failed'],
      levels: [],
    };
  }

  return { valid: true, errors: [], levels };
}
