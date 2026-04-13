/**
 * app/api/ws/runs/[runId]/route.ts
 *
 * WebSocket endpoint powered by next-ws.
 * Clients connect here to receive real-time step events for a run.
 *
 * Authentication: pass ?token=<jwt> query param (Bearer header not
 * available during WS handshake in browsers).
 *
 * Messages sent to client:
 *   { type: 'step', ...StepEvent }
 *   { type: 'complete', ...RunCompleteEvent }
 *   { type: 'snapshot', stepRuns: StepRun[] }   ← initial state on connect
 */

import type { IncomingMessage } from 'http';
import type { WebSocket, WebSocketServer } from 'ws';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { managementDb } from '@/lib/prisma/management';
import { getTenantDb } from '@/lib/prisma/tenant';
import { onStepEvent, onRunComplete } from '@/lib/socket/eventBus';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

export async function SOCKET(
  client: WebSocket,
  request: IncomingMessage,
  _server: WebSocketServer
) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  const runId = url.pathname.split('/').pop() ?? '';
  const token = url.searchParams.get('token') ?? '';

  // ── Auth ─────────────────────────────────────────────────────────
  let tenantId: string;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });
    tenantId = payload['tenantId'] as string;
    if (!tenantId) throw new Error('Missing tenantId');
  } catch {
    client.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    client.close(1008, 'Unauthorized');
    return;
  }

  // ── Resolve tenant DB ─────────────────────────────────────────────
  const tenant = await managementDb.tenant.findUnique({
    where: { id: tenantId },
    select: { connectionUrl: true },
  });
  if (!tenant) {
    client.close(1008, 'Tenant not found');
    return;
  }
  const tenantDb = getTenantDb(tenant.connectionUrl);

  // ── Send snapshot of current step states ─────────────────────────
  try {
    const stepRuns = await tenantDb.stepRun.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
    client.send(JSON.stringify({ type: 'snapshot', stepRuns }));
  } catch {
    // non-fatal — run may not have started yet
  }

  const send = (data: object) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(JSON.stringify(data));
    }
  };

  // ── Subscribe to live events ──────────────────────────────────────
  const unsubStep = onStepEvent(runId, (event) => send({ type: 'step', ...event }));
  const unsubComplete = onRunComplete(runId, (event) => send({ type: 'complete', ...event }));

  client.on('close', () => {
    unsubStep();
    unsubComplete();
  });
}
