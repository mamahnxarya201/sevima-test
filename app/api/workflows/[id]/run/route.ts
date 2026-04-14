/**
 * app/api/workflows/[id]/run/route.ts
 *
 * POST /api/workflows/:id/run — Trigger a workflow execution
 *
 * Returns { runId } immediately.
 * Execution happens asynchronously — subscribe to /api/ws/runs/:runId for live updates.
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { requireEditorOrAbove } from '@/lib/auth/rbac';
import { workflowIdParamSchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:run:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const workflow = await ctx.tenantDb.workflow.findUnique({
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

    const run = await ctx.tenantDb.workflowRun.create({
      data: {
        workflowVersionId: activeVersionRecord.id,
        triggeredById: ctx.userId,
        status: 'PENDING',
      },
    });

    /** Execution starts when client connects to `/api/ws/runs/:runId` (see ws route). */
    return Response.json({ runId: run.id }, { status: 202 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
