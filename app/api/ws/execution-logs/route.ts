/**
 * app/api/ws/execution-logs/route.ts
 *
 * WebSocket endpoint for live execution logs across all tenant workflows.
 * Authentication: pass ?token=<jwt> query param.
 */
import type { WebSocket, WebSocketServer } from 'ws';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { managementDb } from '@/lib/prisma/management';
import { getTenantDb } from '@/lib/prisma/tenant';
import { onAnyRunComplete, onAnyStepEvent } from '@/lib/socket/eventBus';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

type RunSummaryPayload = {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  duration: number | null;
  triggeredByLabel: string;
  workflowVersion: {
    workflowId: string;
    versionNumber: number;
    workflow: { name: string };
    nodeTypesById: Record<string, string>;
    nodeDescriptionsById: Record<string, string>;
  };
};

function nodeTypesByIdFromDefinition(definition: unknown): Record<string, string> {
  if (!definition || typeof definition !== 'object') return {};
  const maybeNodes = (definition as { nodes?: unknown }).nodes;
  if (!Array.isArray(maybeNodes)) return {};

  const out: Record<string, string> = {};
  for (const node of maybeNodes) {
    if (!node || typeof node !== 'object') continue;
    const id = (node as { id?: unknown }).id;
    const type = (node as { type?: unknown }).type;
    if (typeof id === 'string' && id.length > 0 && typeof type === 'string' && type.length > 0) {
      out[id] = type;
    }
  }
  return out;
}

function nodeDescriptionsByIdFromEditorState(editorState: unknown): Record<string, string> {
  if (!editorState || typeof editorState !== 'object') return {};
  const maybeNodes = (editorState as { nodes?: unknown }).nodes;
  if (!Array.isArray(maybeNodes)) return {};

  const out: Record<string, string> = {};
  for (const node of maybeNodes) {
    if (!node || typeof node !== 'object') continue;
    const id = (node as { id?: unknown }).id;
    const data = (node as { data?: unknown }).data;
    if (typeof id !== 'string' || id.length === 0 || !data || typeof data !== 'object') continue;
    const description = (data as { description?: unknown }).description;
    if (typeof description === 'string' && description.trim() !== '') {
      out[id] = description.trim();
    }
  }
  return out;
}

export function GET() {
  return new Response('WebSocket endpoint', { status: 426 });
}

export async function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  request: NextRequest,
) {
  const token = request.nextUrl.searchParams.get('token') ?? '';

  let tenantId = '';
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });
    tenantId = String(payload['tenantId'] ?? '');
    if (!tenantId) throw new Error('Missing tenantId');
  } catch {
    client.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    client.close(1008, 'Unauthorized');
    return;
  }

  const tenant = await managementDb.tenant.findUnique({
    where: { id: tenantId },
    select: { connectionUrl: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') {
    client.close(1008, !tenant ? 'Tenant not found' : 'Tenant inactive');
    return;
  }
  const tenantDb = getTenantDb(tenant.connectionUrl);

  const userNameCache = new Map<string, string>();
  const resolveTriggeredByLabel = async (triggeredById: string | null): Promise<string> => {
    if (!triggeredById) return 'Scheduled Operation';
    if (userNameCache.has(triggeredById)) return userNameCache.get(triggeredById) ?? 'Unknown User';
    const user = await managementDb.user.findUnique({
      where: { id: triggeredById },
      select: { name: true, tenantId: true },
    });
    const name = user && user.tenantId === tenantId ? user.name : 'Unknown User';
    userNameCache.set(triggeredById, name);
    return name;
  };

  const send = (data: object) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  };

  const runCache = new Map<string, RunSummaryPayload | null>();

  const getRunSummary = async (runId: string): Promise<RunSummaryPayload | null> => {
    if (runCache.has(runId)) return runCache.get(runId) ?? null;

    const run = await tenantDb.workflowRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        triggeredById: true,
        workflowVersion: {
          select: {
            workflowId: true,
            versionNumber: true,
            definition: true,
            editorState: true,
            workflow: { select: { name: true } },
          },
        },
      },
    });
    if (!run) {
      runCache.set(runId, null);
      return null;
    }
    const payload: RunSummaryPayload = {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt?.toISOString() ?? null,
      endedAt: run.endedAt?.toISOString() ?? null,
      duration: run.duration,
      triggeredByLabel: await resolveTriggeredByLabel(run.triggeredById),
      workflowVersion: {
        workflowId: run.workflowVersion.workflowId,
        versionNumber: run.workflowVersion.versionNumber,
        workflow: { name: run.workflowVersion.workflow.name },
        nodeTypesById: nodeTypesByIdFromDefinition(run.workflowVersion.definition),
        nodeDescriptionsById: nodeDescriptionsByIdFromEditorState(run.workflowVersion.editorState),
      },
    };
    runCache.set(runId, payload);
    return payload;
  };

  const runningRuns = await tenantDb.workflowRun.findMany({
    where: { status: { in: ['PENDING', 'RUNNING', 'RETRYING'] } },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      startedAt: true,
      endedAt: true,
      duration: true,
      triggeredById: true,
      workflowVersion: {
        select: {
          workflowId: true,
          versionNumber: true,
          definition: true,
          editorState: true,
          workflow: { select: { name: true } },
        },
      },
    },
  });
  send({
    type: 'running_snapshot',
    runs: await Promise.all(
      runningRuns.map(async (run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt?.toISOString() ?? null,
        endedAt: run.endedAt?.toISOString() ?? null,
        duration: run.duration,
        triggeredByLabel: await resolveTriggeredByLabel(run.triggeredById),
        workflowVersion: {
          workflowId: run.workflowVersion.workflowId,
          versionNumber: run.workflowVersion.versionNumber,
          workflow: run.workflowVersion.workflow,
          nodeTypesById: nodeTypesByIdFromDefinition(run.workflowVersion.definition),
          nodeDescriptionsById: nodeDescriptionsByIdFromEditorState(run.workflowVersion.editorState),
        },
      }))
    ),
  });

  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    onAnyStepEvent((event) => {
      void (async () => {
        const run = await getRunSummary(event.runId);
        if (!run) return;
        send({ type: 'run_upsert', run: { ...run, status: 'RUNNING', endedAt: null } });
        send({ type: 'step', ...event });
      })();
    })
  );

  unsubscribers.push(
    onAnyRunComplete((event) => {
      void (async () => {
        const run = await getRunSummary(event.runId);
        if (!run) return;
        send({
          type: 'run_upsert',
          run: {
            ...run,
            status: event.status,
            duration: event.durationMs,
            endedAt: new Date().toISOString(),
          },
        });
        send({ type: 'complete', ...event });
      })();
    })
  );

  client.on('close', () => {
    for (const unsub of unsubscribers) unsub();
  });
}
