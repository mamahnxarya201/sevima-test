/**
 * app/api/runs/[runId]/route.ts
 *
 * GET /api/runs/:runId — Fetch full run status with all step results
 * Used for the initial REST snapshot on page load, before WebSocket takes over.
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { runIdParamSchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId: rawRunId } = await params;
    const runId = runIdParamSchema.parse(rawRunId);
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`runs:get:${ctx.userId}`, cfg.max, cfg.windowMs);

    const run = await ctx.tenantDb.workflowRun.findUnique({
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
    return apiErrorResponse(err);
  }
}
