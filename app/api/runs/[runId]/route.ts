/**
 * app/api/runs/[runId]/route.ts
 *
 * GET /api/runs/:runId — Fetch full run status with all step results
 * Used for the initial REST snapshot on page load, before WebSocket takes over.
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const { tenantDb } = await resolveTenantContext(request);

    const run = await tenantDb.workflowRun.findUnique({
      where: { id: runId },
      include: {
        stepRuns: {
          orderBy: { startedAt: 'asc' },
        },
        workflowVersion: {
          select: { versionNumber: true, workflowId: true },
        },
      },
    });

    if (!run) {
      return Response.json({ error: 'Run not found' }, { status: 404 });
    }

    return Response.json({ run });
  } catch (err) {
    return authErrorResponse(err);
  }
}
