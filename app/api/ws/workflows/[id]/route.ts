import type { WebSocket, WebSocketServer } from 'ws';
import type { NextRequest } from 'next/server';
import { validateDag } from '@/lib/dag/validator';
import { updateWorkflow } from '@/lib/prisma/workflow';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { managementDb } from '@/lib/prisma/management';
import { normalizeRole, requireEditorOrAbove } from '@/lib/auth/rbac';
import { wsWorkflowClientMessageSchema } from '@/lib/api/schemas/wsWorkflow';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

export function GET() {
  return new Response('WebSocket endpoint', { status: 426 });
}

export async function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  request: NextRequest,
) {
  const token = request.nextUrl.searchParams.get('token');
  const workflowId = request.nextUrl.pathname.split('/').pop();

  if (!token || !workflowId) {
    client.close(1008, 'Missing token or workflowId');
    return;
  }

  let tenantUrl: string;
  let userRole: ReturnType<typeof normalizeRole>;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });

    const tenantId = payload['tenantId'] as string;
    if (!tenantId) throw new Error('No tenantId');

    userRole = normalizeRole(payload['role'] as string | undefined);

    const tenant = await managementDb.tenant.findUnique({
      where: { id: tenantId },
      select: { connectionUrl: true, status: true },
    });

    if (!tenant || tenant.status !== 'ACTIVE') throw new Error('Invalid tenant');
    tenantUrl = tenant.connectionUrl;
  } catch {
    client.close(1008, 'Unauthorized');
    return;
  }

  client.on('message', async (data) => {
    try {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(data.toString());
      } catch {
        client.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
        return;
      }

      const parsed = wsWorkflowClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        client.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid message',
            issues: parsed.error.issues,
          })
        );
        return;
      }

      const message = parsed.data;

      if (message.type === 'sync') {
        try {
          requireEditorOrAbove(userRole);
        } catch {
          client.send(JSON.stringify({ type: 'error', error: 'Insufficient permissions' }));
          return;
        }

        const validation = validateDag(message.payload.definition);
        if (!validation.valid) {
          client.send(JSON.stringify({ type: 'error', error: 'Invalid DAG', details: validation.errors }));
          return;
        }

        await updateWorkflow(tenantUrl, workflowId, {
          name: message.payload.name,
          definition: message.payload.definition,
        });

        client.send(JSON.stringify({ type: 'sync_ack', hash: message.hash }));
      }
    } catch (err) {
      console.error('[WS Sync Error]', err);
      client.send(JSON.stringify({ type: 'error', error: 'Internal server error' }));
    }
  });

  client.on('close', () => {
    // Clean up
  });
}
