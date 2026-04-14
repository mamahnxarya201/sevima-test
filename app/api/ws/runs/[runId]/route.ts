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

import type { WebSocket, WebSocketServer } from 'ws';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { managementDb } from '@/lib/prisma/management';
import { getTenantDb } from '@/lib/prisma/tenant';
import { onStepEvent, onRunComplete, onWorkflowRetry } from '@/lib/socket/eventBus';
import { runWorkflowWithRetries } from '@/lib/orchestrator/executionEngine';
import type { DagSchema } from '@/lib/dag/types';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

/** One engine start per run per process (reconnects only subscribe). */
const engineStartedRunIds = new Set<string>();
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

export function GET() {
  return new Response('WebSocket endpoint', { status: 426 });
}

export async function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  request: NextRequest,
) {
  const runId = request.nextUrl.pathname.split('/').pop() ?? '';
  const token = request.nextUrl.searchParams.get('token') ?? '';

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
    select: { connectionUrl: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') {
    client.close(1008, !tenant ? 'Tenant not found' : 'Tenant inactive');
    return;
  }
  const tenantDb = getTenantDb(tenant.connectionUrl);

  const send = (data: object) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(JSON.stringify(data));
    }
  };

  // ── Subscribe BEFORE starting the engine — fast validation failures emit
  // `complete` synchronously; listeners must be registered first or the client
  // never receives error details (race).
  const unsubs: (() => void)[] = [];

  const subscribeToRun = (rid: string) => {
    unsubs.push(onStepEvent(rid, (event) => send({ type: 'step', ...event })));
    unsubs.push(onRunComplete(rid, (event) => send({ type: 'complete', ...event })));
  };

  subscribeToRun(runId);

  unsubs.push(
    onWorkflowRetry(runId, (event) => {
      send({ type: 'workflow_retry', ...event });
      subscribeToRun(event.newRunId);
    }),
  );

  client.on('close', () => {
    for (const unsub of unsubs) unsub();
  });

  // ── Snapshot of current step states (may be empty if engine has not written rows yet)
  try {
    const stepRuns = await tenantDb.stepRun.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
    client.send(JSON.stringify({ type: 'snapshot', stepRuns }));
  } catch {
    // non-fatal — run may not have started yet
  }

  // ── Start engine once: first authenticated WS connection for a PENDING run ──
  if (!engineStartedRunIds.has(runId)) {
    engineStartedRunIds.add(runId);
    try {
      const run = await tenantDb.workflowRun.findUnique({
        where: { id: runId },
        include: {
          workflowVersion: {
            select: {
              id: true,
              definition: true,
              workflow: { select: { settings: true } },
            },
          },
        },
      });
      if (run?.status === 'PENDING' && run.workflowVersion?.definition) {
        const definition = run.workflowVersion.definition as unknown as DagSchema;
        const settings = run.workflowVersion.workflow?.settings;
        void runWorkflowWithRetries(
          runId,
          run.workflowVersion.id,
          definition,
          tenantDb,
          tenantId,
          settings,
          run.triggeredById ?? undefined,
        ).catch((err) => {
          console.error(`[ws/run ${runId}] runWorkflowWithRetries:`, err);
        });
      }
    } catch (e) {
      console.error('[ws/run] Failed to start workflow:', e);
      engineStartedRunIds.delete(runId);
    }
  }
}
