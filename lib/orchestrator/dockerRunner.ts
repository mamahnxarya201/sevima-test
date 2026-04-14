/**
 * lib/orchestrator/dockerRunner.ts
 *
 * Runs a single DAG node inside a Docker container.
 * Handles: pull → create → start → wait → logs → remove
 *
 * For HTTP_CALL nodes, builds a curl command from the HttpConfig block.
 * For SCRIPT_EXECUTION, selects the right default image based on 'runtime'.
 * Always cleans up containers immediately after completion (force remove).
 *
 * CONDITION nodes run with NetworkDisabled and a validation wrapper that
 * enforces { result: boolean } output. Container-level timeout kills hung
 * containers and returns exit code 124.
 */

import Dockerode from 'dockerode';
import type { DagNode, HttpConfig } from '../dag/types';

const docker = new Dockerode({
  socketPath: process.env.DOCKER_HOST?.replace('unix://', '') ?? '/var/run/docker.sock',
});

/** Default container timeout: 5 minutes. Overridden by AbortSignal from the engine. */
const DEFAULT_CONTAINER_TIMEOUT_MS = 300_000;

export interface StepResult {
  exitCode: number;
  logs: string;
  durationMs: number;
}

export interface RunNodeOptions {
  mergedInput?: Record<string, unknown>;
  /** AbortSignal from the engine's global workflow timeout. */
  signal?: AbortSignal;
  /** Per-step timeout in ms (falls back to DEFAULT_CONTAINER_TIMEOUT_MS). */
  stepTimeoutMs?: number;
}

// ─────────────────────────────────────────────
// Default images per runtime / node type
// ─────────────────────────────────────────────

/** Official curl static binary image — Alpine base images do not ship curl by default. */
const HTTP_CALL_IMAGE = 'curlimages/curl:8.11.1';

const RUNTIME_IMAGES: Record<string, string> = {
  python: 'python:3.11-slim',
  node: 'node:20-alpine',
  sh: 'alpine:3.19',
};

function resolveImage(node: DagNode): string {
  if (node.image) return node.image;
  if (node.type === 'HTTP_CALL') return HTTP_CALL_IMAGE;
  if (node.type === 'SCRIPT_EXECUTION' && node.runtime) return RUNTIME_IMAGES[node.runtime];
  if (node.type === 'DELAY') return 'alpine:3.19';
  if (node.type === 'CONDITION') return 'node:20-alpine';
  return 'alpine:3.19';
}

// ─────────────────────────────────────────────
// HTTP_CALL → curl argv (no shell)
// ─────────────────────────────────────────────
//
// Curl exit 3 = "URL malformed". Common causes: missing scheme (https://), empty url,
// or a broken shell line. We pass argv directly to `curl` (image ENTRYPOINT) so
// quoting never mangles the URL or body.

function normalizeHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new Error(
      'HTTP_CALL: url is empty. Curl uses exit code 3 when the URL is missing or malformed.'
    );
  }
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  // Bare host/path — curl requires a scheme or it fails with exit 3
  return `https://${t}`;
}

/**
 * Arguments for `curl` only (Dockerfile ENTRYPOINT is `curl` on curlimages/curl).
 */
function buildCurlCmdArgs(http: HttpConfig): string[] {
  const method = http.method ?? 'GET';

  let url = normalizeHttpUrl(http.url);
  if (http.queryParams && Object.keys(http.queryParams).length > 0) {
    const qs = new URLSearchParams(http.queryParams).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }

  const args: string[] = [
    '-s',
    '-S', // show errors on stderr (helps debug vs silent -s alone)
    '-w',
    '\n{"__statusCode__": %{http_code}}',
    '-X',
    method,
  ];

  if (http.headers) {
    for (const [key, value] of Object.entries(http.headers)) {
      if (!key) continue;
      args.push('-H', `${key}: ${value}`);
    }
  }

  if (http.body && !http.headers?.['Content-Type'] && !http.headers?.['content-type']) {
    args.push('-H', 'Content-Type: application/json');
  }

  if (http.bearerToken) {
    args.push('-H', `Authorization: Bearer ${http.bearerToken}`);
  }

  if (http.basicAuth) {
    args.push('-u', http.basicAuth);
  }

  if (http.cookies) {
    args.push('--cookie', http.cookies);
  }

  if (http.body) {
    const bodyStr = typeof http.body === 'string' ? http.body : JSON.stringify(http.body);
    args.push('--data-raw', bodyStr);
  }

  const timeout = http.timeoutSeconds ?? 30;
  args.push('--max-time', String(timeout));

  if (http.followRedirects !== false) {
    args.push('-L');
  }

  args.push(url);
  return args;
}

// ─────────────────────────────────────────────
// Pull helper (streams pull output to avoid timeout)
// ─────────────────────────────────────────────

async function pullImage(image: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// ─────────────────────────────────────────────
// Collect container logs as a string
// ─────────────────────────────────────────────

async function collectLogs(container: Dockerode.Container): Promise<string> {
  const logBuffer = await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
  });

  // Docker multiplexes stdout/stderr — strip the 8-byte frame headers
  const chunks: string[] = [];
  let offset = 0;
  const buf = Buffer.isBuffer(logBuffer) ? logBuffer : Buffer.from(String(logBuffer));
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    const payload = buf.slice(offset + 8, offset + 8 + size).toString('utf8');
    chunks.push(payload);
    offset += 8 + size;
  }
  return chunks.join('');
}

// ─────────────────────────────────────────────
// CONDITION node wrapper: validates { result: boolean }
// ─────────────────────────────────────────────

function wrapConditionScript(userScript: string, hasInput: boolean): string {
  const inputLine = hasInput
    ? "const input = JSON.parse(process.env.DAG_MERGED_INPUT_JSON || '{}');\n"
    : '';
  // The wrapper intercepts console.log to capture the last call,
  // then validates the output is { result: true|false }.
  return `
${inputLine}const __origLog = console.log;
let __lastOutput = null;
console.log = (...args) => { __lastOutput = args[0]; __origLog.apply(console, args); };
try {
${userScript}
} catch (__e) {
  process.stderr.write('Condition script error: ' + (__e && __e.message ? __e.message : String(__e)) + '\\n');
  process.exit(2);
}
try {
  const __parsed = JSON.parse(__lastOutput);
  if (typeof __parsed !== 'object' || __parsed === null || typeof __parsed.result !== 'boolean') {
    process.stderr.write('Condition must output { "result": true } or { "result": false }\\n');
    process.exit(3);
  }
} catch (__pe) {
  if (__lastOutput === null) {
    process.stderr.write('Condition script produced no output. Expected: console.log(JSON.stringify({ result: true|false }))\\n');
  } else {
    process.stderr.write('Condition output is not valid JSON: ' + String(__lastOutput).slice(0, 200) + '\\n');
  }
  process.exit(3);
}
`.trim();
}

// ─────────────────────────────────────────────
// Main: run a single DAG node in Docker
// ─────────────────────────────────────────────

const NODE_INPUT_PRELUDE =
  "const input = JSON.parse(process.env.DAG_MERGED_INPUT_JSON || '{}');\n";
const PYTHON_INPUT_PRELUDE =
  'import os, json\ninput = json.loads(os.environ.get("DAG_MERGED_INPUT_JSON") or "{}")\n';

export async function runNode(
  node: DagNode,
  env: string[],
  options?: RunNodeOptions,
): Promise<StepResult> {
  const image = resolveImage(node);

  const containerEnv = [...env];
  const hasInput = options?.mergedInput !== undefined;
  if (
    hasInput &&
    (node.type === 'SCRIPT_EXECUTION' || node.type === 'CONDITION')
  ) {
    containerEnv.push(`DAG_MERGED_INPUT_JSON=${JSON.stringify(options!.mergedInput)}`);
  }

  // HTTP_CALL: `curlimages/curl` ENTRYPOINT is `curl` — Cmd is only curl flags + URL (no shell).
  let cmd: string[];
  let entrypoint: string[] | undefined;
  if (node.type === 'HTTP_CALL' && node.http) {
    try {
      cmd = buildCurlCmdArgs(node.http);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 3,
        logs: `[HTTP_CALL] ${msg}\n`,
        durationMs: 0,
      };
    }
  } else if (node.type === 'CONDITION') {
    const userScript = node.script ?? 'console.log(JSON.stringify({ result: true }));';
    const wrapped = wrapConditionScript(userScript, hasInput);
    cmd = ['node', '-e', wrapped];
  } else {
    let script = node.script ?? 'echo "no script defined"';
    const injectInput = hasInput && node.type === 'SCRIPT_EXECUTION';

    if (node.type === 'SCRIPT_EXECUTION' && node.runtime === 'python') {
      if (injectInput) {
        script = PYTHON_INPUT_PRELUDE + script;
      }
      cmd = ['python3', '-c', script];
    } else if (node.type === 'SCRIPT_EXECUTION' && node.runtime === 'node') {
      if (injectInput) {
        script = NODE_INPUT_PRELUDE + script;
      }
      cmd = ['node', '-e', script];
    } else {
      cmd = ['sh', '-c', script];
    }
  }

  // Resource limits
  const cpuFraction = parseFloat(node.cpuLimit ?? '1.0');
  const memLimit = node.memLimit ?? '256m';

  const parseMemBytes = (m: string): number => {
    const match = m.match(/^(\d+)(m|g|k)?$/i);
    if (!match) return 268435456; // 256m default
    const val = parseInt(match[1]);
    const unit = (match[2] ?? 'm').toLowerCase();
    if (unit === 'g') return val * 1024 * 1024 * 1024;
    if (unit === 'm') return val * 1024 * 1024;
    if (unit === 'k') return val * 1024;
    return val;
  };

  // Pull image first
  await pullImage(image);

  const startTime = Date.now();

  const networkDisabled = node.type === 'CONDITION';

  const container = await docker.createContainer({
    Image: image,
    ...(entrypoint !== undefined ? { Entrypoint: entrypoint } : {}),
    Cmd: cmd,
    Env: containerEnv,
    AttachStdout: true,
    AttachStderr: true,
    NetworkDisabled: networkDisabled,
    HostConfig: {
      Memory: parseMemBytes(memLimit),
      CpuPeriod: 100000,
      CpuQuota: Math.floor(cpuFraction * 100000),
      AutoRemove: false,
    },
  });

  await container.start();

  // Race container.wait() against a timeout + optional AbortSignal
  const stepTimeout = options?.stepTimeoutMs ?? DEFAULT_CONTAINER_TIMEOUT_MS;
  let timedOut = false;

  const waitWithTimeout = async (): Promise<number> => {
    return new Promise<number>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(async () => {
        if (settled) return;
        settled = true;
        timedOut = true;
        try { await container.kill(); } catch { /* already dead */ }
        resolve(124);
      }, stepTimeout);

      const onAbort = async () => {
        if (settled) return;
        settled = true;
        timedOut = true;
        clearTimeout(timer);
        try { await container.kill(); } catch { /* already dead */ }
        resolve(124);
      };

      options?.signal?.addEventListener('abort', onAbort, { once: true });

      container.wait().then((r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onAbort);
        resolve(r.StatusCode);
      }).catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  };

  const exitCode = await waitWithTimeout();
  let logs = await collectLogs(container);
  const durationMs = Date.now() - startTime;

  if (timedOut) {
    const reason = options?.signal?.aborted
      ? `[TIMEOUT] Step killed — workflow exceeded global timeout`
      : `[TIMEOUT] Step killed after ${Math.round(stepTimeout / 1000)}s container timeout`;
    logs = logs ? `${logs}\n${reason}\n` : `${reason}\n`;
  }

  try {
    await container.remove({ force: true });
  } catch {
    // container may have already been removed
  }

  return { exitCode, logs, durationMs };
}
