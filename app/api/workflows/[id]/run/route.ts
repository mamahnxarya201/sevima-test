/**
 * app/api/workflows/[id]/run/route.ts
 *
 * POST /api/workflows/:id/run — Trigger a workflow execution
 *
 * Returns { runId } immediately.
 * Execution happens asynchronously — subscribe to /api/ws/runs/:runId for live updates.
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import { runWorkflow } from '@/lib/orchestrator/executionEngine';
import type { DagSchema } from '@/lib/dag/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId, tenantDb } = await resolveTenantContext(request);

    // Load active workflow version
    const workflow = await tenantDb.workflow.findUnique({
      where: { id },
      include: {
        versions: {
          where: { versionNumber: { gt: 0 } },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const activeVersionRecord = workflow.versions[0];
    if (!activeVersionRecord) {
      return Response.json({ error: 'No versions found for this workflow' }, { status: 400 });
    }

    // Create the run record
    const run = await tenantDb.workflowRun.create({
      data: {
        workflowVersionId: activeVersionRecord.id,
        triggeredById: userId,
        status: 'PENDING',
      },
    });

    // Fire and forget — execution runs async while we return immediately
    const definition = activeVersionRecord.definition as unknown as DagSchema;
    runWorkflow(run.id, definition, tenantDb).catch((err) => {
      console.error(`[run/${run.id}] Unhandled execution error:`, err);
    });

    return Response.json({ runId: run.id }, { status: 202 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
