import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { validateDag } from '@/lib/dag/validator';
import { updateWorkflow } from '@/lib/prisma/workflow';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { managementDb } from '@/lib/prisma/management';

const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${BETTER_AUTH_URL}/api/auth/jwks`));

export function GET() {
  return new Response('WebSocket endpoint', { status: 426 });
}

export async function SOCKET(
  client: WebSocket,
  request: IncomingMessage,
  server: any
) {
  const url = new URL(request.url ?? '', `http://${request.headers.host}`);
  const token = url.searchParams.get('token');
  const workflowId = url.pathname.split('/').pop();

  if (!token || !workflowId) {
    client.close(1008, 'Missing token or workflowId');
    return;
  }

  let tenantUrl: string;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BETTER_AUTH_URL,
      audience: BETTER_AUTH_URL,
    });
    
    const tenantId = payload['tenantId'] as string;
    if (!tenantId) throw new Error('No tenantId');

    const tenant = await managementDb.tenant.findUnique({
      where: { id: tenantId },
      select: { connectionUrl: true, status: true },
    });

    if (!tenant || tenant.status !== 'ACTIVE') throw new Error('Invalid tenant');
    tenantUrl = tenant.connectionUrl;
  } catch (err) {
    client.close(1008, 'Unauthorized');
    return;
  }

  client.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'sync') {
        const { name, definition } = message.payload;
        
        const validation = validateDag(definition);
        if (!validation.valid) {
          client.send(JSON.stringify({ type: 'error', error: 'Invalid DAG', details: validation.errors }));
          return;
        }

        await updateWorkflow(tenantUrl, workflowId, { name, definition });
        
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
