/**
 * lib/canvas/dagExporter.ts
 *
 * Converts the React Flow canvas state (nodes + edges) to the DAG JSON schema
 * that the execution engine expects.
 *
 * Mapping:
 *   React Flow type → DagNode type
 *   trigger         → (entry point, maps to the first HTTP_CALL or SCRIPT_EXECUTION)
 *   http            → HTTP_CALL
 *   script          → SCRIPT_EXECUTION
 *   delay           → DELAY
 *   condition       → CONDITION
 */

import type { Node, Edge } from '@xyflow/react';
import type { DagSchema, DagNode, DagEdge, HttpConfig } from '../dag/types';

const TYPE_MAP: Record<string, DagNode['type']> = {
  http: 'HTTP_CALL',
  script: 'SCRIPT_EXECUTION',
  delay: 'DELAY',
  condition: 'CONDITION',
  trigger: 'HTTP_CALL', // Trigger nodes become HTTP_CALL with the webhook config
};

/** Placeholder URL so empty HTTP nodes still pass structural validation (user replaces in settings). */
const DEFAULT_HTTP_URL = 'https://example.com';

const DEFAULT_SCRIPT_NODE = "console.log(JSON.stringify({ ok: true }));";
const DEFAULT_DELAY_SCRIPT = 'sleep 1';
const DEFAULT_CONDITION_SCRIPT =
  "console.log(JSON.stringify({ result: true }));";

function resolveHttpConfig(data: Record<string, unknown>): HttpConfig {
  const partial = data.http as Partial<HttpConfig> | undefined;
  const url =
    typeof partial?.url === 'string' && partial.url.trim() !== ''
      ? partial.url.trim()
      : DEFAULT_HTTP_URL;
  return {
    method: partial?.method ?? 'GET',
    url,
    headers: partial?.headers,
    cookies: partial?.cookies,
    body: partial?.body,
    queryParams: partial?.queryParams,
    basicAuth: partial?.basicAuth,
    bearerToken: partial?.bearerToken,
    followRedirects: partial?.followRedirects,
    timeoutSeconds: partial?.timeoutSeconds,
  };
}

function buildDagNode(node: Node): DagNode {
  const type = TYPE_MAP[node.type ?? ''] ?? 'SCRIPT_EXECUTION';
  const data = (node.data ?? {}) as Record<string, unknown>;

  const rawOutputs = data.outputs as string[] | undefined;
  const defaultHttpOutputs =
    Array.isArray(rawOutputs) && rawOutputs.length > 0 ? rawOutputs : ['body', 'statusCode'];

  const base: DagNode = {
    id: node.id,
    type,
    image: data.image as string | undefined,
    cpuLimit: data.cpuLimit as string | undefined,
    memLimit: data.memLimit as string | undefined,
    retries: data.retries as number | undefined,
    retryDelayMs: data.retryDelayMs as number | undefined,
    inputs: data.inputs as Record<string, string> | undefined,
    outputs: undefined,
  };

  if (type === 'HTTP_CALL') {
    return { ...base, http: resolveHttpConfig(data), outputs: defaultHttpOutputs };
  }

  const userScript = data.script as string | undefined;
  const runtime = (data.runtime as DagNode['runtime'] | undefined) ?? 'node';

  if (type === 'SCRIPT_EXECUTION') {
    return {
      ...base,
      outputs: rawOutputs,
      runtime,
      script: userScript && userScript.trim() !== '' ? userScript : DEFAULT_SCRIPT_NODE,
    };
  }

  if (type === 'DELAY') {
    return {
      ...base,
      outputs: rawOutputs,
      runtime: 'sh',
      script: userScript && userScript.trim() !== '' ? userScript : DEFAULT_DELAY_SCRIPT,
    };
  }

  // CONDITION
  return {
    ...base,
    outputs: rawOutputs,
    runtime,
    script: userScript && userScript.trim() !== '' ? userScript : DEFAULT_CONDITION_SCRIPT,
  };
}

export function exportCanvasToDag(
  workflowName: string,
  nodes: Node[],
  edges: Edge[]
): DagSchema {
  const dagNodes: DagNode[] = nodes.map((node) => buildDagNode(node));

  const dagEdges: DagEdge[] = edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    branch: edge.sourceHandle === 'true' ? 'true'
      : edge.sourceHandle === 'false' ? 'false'
      : undefined,
  }));

  return { workflowName, nodes: dagNodes, edges: dagEdges };
}
