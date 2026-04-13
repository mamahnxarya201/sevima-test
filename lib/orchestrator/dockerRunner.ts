/**
 * lib/orchestrator/dockerRunner.ts
 *
 * Runs a single DAG node inside a Docker container.
 * Handles: pull → create → start → wait → logs → remove
 *
 * For HTTP_CALL nodes, builds a curl command from the HttpConfig block.
 * For SCRIPT_EXECUTION, selects the right default image based on 'runtime'.
 * Always cleans up containers immediately after completion (force remove).
 */

import Dockerode from 'dockerode';
import type { DagNode, HttpConfig } from '../dag/types';

const docker = new Dockerode({
  socketPath: process.env.DOCKER_HOST?.replace('unix://', '') ?? '/var/run/docker.sock',
});

export interface StepResult {
  exitCode: number;
  logs: string;
  durationMs: number;
}

// ─────────────────────────────────────────────
// Default images per runtime / node type
// ─────────────────────────────────────────────

const RUNTIME_IMAGES: Record<string, string> = {
  python: 'python:3.11-slim',
  node: 'node:20-alpine',
  sh: 'alpine:3.19',
};

function resolveImage(node: DagNode): string {
  if (node.image) return node.image;
  if (node.type === 'HTTP_CALL') return 'alpine:3.19'; // curl is available in alpine
  if (node.type === 'SCRIPT_EXECUTION' && node.runtime) return RUNTIME_IMAGES[node.runtime];
  if (node.type === 'DELAY' || node.type === 'CONDITION') return 'alpine:3.19';
  return 'alpine:3.19';
}

// ─────────────────────────────────────────────
// HTTP_CALL → curl command builder
// ─────────────────────────────────────────────

function buildCurlCommand(http: HttpConfig): string {
  const parts: string[] = ['curl', '-s', '-w', '\\n{"__statusCode__": %{http_code}}'];

  const method = http.method ?? 'GET';
  parts.push('-X', method);

  // Headers
  if (http.headers) {
    for (const [key, value] of Object.entries(http.headers)) {
      parts.push('-H', `"${key}: ${value}"`);
    }
  }

  // Auto Content-Type for body
  if (http.body && !http.headers?.['Content-Type'] && !http.headers?.['content-type']) {
    parts.push('-H', '"Content-Type: application/json"');
  }

  // Bearer token
  if (http.bearerToken) {
    parts.push('-H', `"Authorization: Bearer ${http.bearerToken}"`);
  }

  // Basic auth
  if (http.basicAuth) {
    parts.push('-u', `"${http.basicAuth}"`);
  }

  // Cookies
  if (http.cookies) {
    parts.push('--cookie', `"${http.cookies}"`);
  }

  // Body
  if (http.body) {
    const bodyStr = typeof http.body === 'string' ? http.body : JSON.stringify(http.body);
    parts.push('--data-raw', `'${bodyStr}'`);
  }

  // Timeout
  const timeout = http.timeoutSeconds ?? 30;
  parts.push('--max-time', String(timeout));

  // Follow redirects
  if (http.followRedirects !== false) {
    parts.push('-L');
  }

  // Query params
  let url = http.url;
  if (http.queryParams && Object.keys(http.queryParams).length > 0) {
    const qs = new URLSearchParams(http.queryParams).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }

  parts.push(`"${url}"`);

  // Wrap in sh -c so curl can handle the string with quotes
  return `sh -c '${parts.join(' ')}'`;
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
// Main: run a single DAG node in Docker
// ─────────────────────────────────────────────

export async function runNode(node: DagNode, env: string[]): Promise<StepResult> {
  const image = resolveImage(node);

  // Build the command array
  let cmd: string[];
  if (node.type === 'HTTP_CALL' && node.http) {
    cmd = ['sh', '-c', buildCurlCommand(node.http)];
  } else {
    const script = node.script ?? 'echo "no script defined"';
    if (node.type === 'SCRIPT_EXECUTION' && node.runtime === 'python') {
      cmd = ['python3', '-c', script];
    } else if (node.type === 'SCRIPT_EXECUTION' && node.runtime === 'node') {
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

  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    Env: env,
    AttachStdout: true,
    AttachStderr: true,
    HostConfig: {
      Memory: parseMemBytes(memLimit),
      CpuPeriod: 100000,
      CpuQuota: Math.floor(cpuFraction * 100000),
      AutoRemove: false, // we manually remove after log collection
    },
  });

  await container.start();
  const waitResult = await container.wait();
  const exitCode: number = waitResult.StatusCode;

  const logs = await collectLogs(container);
  const durationMs = Date.now() - startTime;

  // Always force-remove the container
  try {
    await container.remove({ force: true });
  } catch {
    // Ignore removal errors — container may have already been removed
  }

  return { exitCode, logs, durationMs };
}
