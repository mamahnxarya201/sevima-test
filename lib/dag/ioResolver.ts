/**
 * lib/dag/ioResolver.ts
 *
 * Resolves a node's declared 'inputs' map into Docker Env vars,
 * reading values from the accumulated run context of completed upstream nodes.
 *
 * Example:
 *   node.inputs = { "UPSTREAM_BODY": "fetch_data.body" }
 *   runContext  = { "fetch_data": { "body": "<html>...", "statusCode": 200 } }
 *   → result   = ["UPSTREAM_BODY=<html>..."]
 */

import type { RunContext } from './types';

/**
 * Resolves a node's input declarations into Docker-compatible Env var strings.
 * @param inputs   The node's input map: { ENV_VAR_NAME: "nodeId.fieldName" }
 * @param runContext Accumulated outputs from already-completed nodes
 * @returns        Array of "KEY=value" strings for Dockerode's Env option
 */
export function resolveInputs(
  inputs: Record<string, string> | undefined,
  runContext: RunContext
): string[] {
  if (!inputs) return [];

  const env: string[] = [];

  for (const [envKey, sourcePath] of Object.entries(inputs)) {
    const dotIndex = sourcePath.indexOf('.');
    if (dotIndex === -1) {
      console.warn(`[ioResolver] Invalid input path "${sourcePath}" — must be "nodeId.field"`);
      continue;
    }

    const nodeId = sourcePath.slice(0, dotIndex);
    const field = sourcePath.slice(dotIndex + 1);
    const nodeOutputs = runContext[nodeId];

    if (!nodeOutputs) {
      console.warn(`[ioResolver] No outputs found for node "${nodeId}" (required by input "${envKey}")`);
      continue;
    }

    const value = nodeOutputs[field];
    if (value === undefined) {
      console.warn(`[ioResolver] Field "${field}" not found in outputs of node "${nodeId}"`);
      continue;
    }

    // Serialize non-string values as JSON
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    env.push(`${envKey}=${serialized}`);
  }

  return env;
}

/**
 * Parses the last line of container stdout as JSON to extract declared outputs.
 * If parsing fails, returns an empty object — non-fatal for nodes with no outputs.
 * @param stdout   Full container stdout string
 * @param outputs  Declared output field names from the DAG node
 * @returns        Parsed output fields as a plain object
 */
/**
 * Parse curl stdout from HTTP_CALL: response body followed by a final line
 * `{"__statusCode__": <n>}` from curl `-w`. Without this, only the status line
 * was JSON-parsed and the body was lost.
 */
export function parseHttpCallOutputs(
  logs: string,
  declaredOutputs?: string[]
): Record<string, unknown> {
  const lines = logs.trimEnd().split('\n');
  const lastLine = lines[lines.length - 1]?.trim() ?? '';
  let statusCode = 0;
  let responseText = logs.trimEnd();

  try {
    const last = JSON.parse(lastLine) as { __statusCode__?: number };
    if (last && typeof last === 'object' && typeof last.__statusCode__ === 'number') {
      statusCode = last.__statusCode__;
      responseText = lines.length > 1 ? lines.slice(0, -1).join('\n') : '';
    }
  } catch {
    /* entire log is body */
  }

  let body: unknown = responseText.trim();
  if (body !== '') {
    try {
      body = JSON.parse(String(body));
    } catch {
      /* keep as string */
    }
  } else {
    body = '';
  }

  const full: Record<string, unknown> = { statusCode, body };

  if (!declaredOutputs?.length) return full;
  const result: Record<string, unknown> = {};
  for (const field of declaredOutputs) {
    if (field in full) result[field] = full[field];
  }
  return result;
}

export function parseNodeOutputs(
  stdout: string,
  outputs: string[] | undefined
): Record<string, unknown> {
  if (!outputs || outputs.length === 0) return {};

  const lines = stdout.trim().split('\n');
  const lastLine = lines[lines.length - 1]?.trim();

  if (!lastLine) return {};

  try {
    const parsed = JSON.parse(lastLine);
    if (typeof parsed !== 'object' || parsed === null) return {};

    // Only extract the fields declared in 'outputs'
    const result: Record<string, unknown> = {};
    for (const field of outputs) {
      if (field in parsed) result[field] = parsed[field];
    }
    return result;
  } catch {
    console.warn(`[ioResolver] Could not parse last stdout line as JSON: "${lastLine?.slice(0, 100)}"`);
    return {};
  }
}
