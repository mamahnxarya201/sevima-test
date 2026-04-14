/**
 * Merge upstream node outputs and substitute `input.field` / `input.nested.path`
 * in HTTP config and scripts before Docker runs.
 */

import type { DagEdge, DagNode, HttpConfig } from './types';
import type { RunContext } from './types';

/** Direct predecessors (edges pointing to this node), merged left → right (sorted by from-id). */
export function mergeUpstreamOutputs(
  nodeId: string,
  edges: DagEdge[],
  runContext: RunContext
): Record<string, unknown> {
  const preds = edges
    .filter((e) => e.to === nodeId)
    .map((e) => e.from)
    .sort();
  const out: Record<string, unknown> = {};
  for (const pid of preds) {
    const chunk = runContext[pid];
    if (chunk && typeof chunk === 'object' && !Array.isArray(chunk)) {
      Object.assign(out, chunk as Record<string, unknown>);
    }
  }
  return out;
}

export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || path === '') return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Replace `input.a`, `input.body.x` with values from merged upstream outputs.
 * Objects/arrays stringify as JSON; missing paths become empty string.
 */
export function interpolateInputTemplates(
  template: string,
  input: Record<string, unknown>
): string {
  if (!template) return template;
  return template.replace(/\binput\.([a-zA-Z0-9_.]+)\b/g, (_, pathStr: string) => {
    const value = getByPath(input, pathStr);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  });
}

function interpolateRecord(
  rec: Record<string, string> | undefined,
  input: Record<string, unknown>
): Record<string, string> | undefined {
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = interpolateInputTemplates(v, input);
  }
  return out;
}

/** Apply `input.*` substitution to a node copy used at runtime (does not mutate the saved DAG). */
export function interpolateDagNode(node: DagNode, input: Record<string, unknown>): DagNode {
  if (node.type === 'HTTP_CALL' && node.http) {
    const h = node.http;
    let body: HttpConfig['body'] = h.body;
    if (typeof h.body === 'string') {
      body = interpolateInputTemplates(h.body, input);
    }
    return {
      ...node,
      http: {
        ...h,
        url: interpolateInputTemplates(h.url, input),
        headers: interpolateRecord(h.headers, input),
        body,
        cookies: h.cookies ? interpolateInputTemplates(h.cookies, input) : undefined,
        queryParams: interpolateRecord(h.queryParams, input),
        basicAuth: h.basicAuth ? interpolateInputTemplates(h.basicAuth, input) : undefined,
        bearerToken: h.bearerToken ? interpolateInputTemplates(h.bearerToken, input) : undefined,
      },
    };
  }
  // SCRIPT / CONDITION receive a real `input` object via DAG_MERGED_INPUT_JSON in the runner
  // (see dockerRunner). String-replacing `input.*` here breaks `console.log(input.body)` and
  // can mangle JSON inside the script.
  if (node.script && node.type !== 'SCRIPT_EXECUTION' && node.type !== 'CONDITION') {
    return { ...node, script: interpolateInputTemplates(node.script, input) };
  }
  return node;
}
