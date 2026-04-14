/**
 * GET /api/workflows/:id/runs — Paginated workflow run history with step summaries (tenant-scoped).
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { workflowIdParamSchema, workflowRunsListQuerySchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import { sortWorkflowRunsLatestFirst } from '@/lib/workflow/runHistorySort';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:runs:list:${ctx.userId}`, cfg.max, cfg.windowMs);

    const parsed = workflowRunsListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
    }
    const { limit, offset } = parsed.data;

    const workflow = await ctx.tenantDb.workflow.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const where = { workflowVersion: { workflowId: id } };

    const [runs, total] = await Promise.all([
      ctx.tenantDb.workflowRun.findMany({
        where,
        orderBy: [
          { endedAt: { sort: 'desc', nulls: 'last' } },
          { startedAt: { sort: 'desc', nulls: 'last' } },
        ],
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          duration: true,
          workflowVersion: { select: { versionNumber: true } },
          stepRuns: {
            orderBy: { startedAt: 'asc' },
            select: {
              stepId: true,
              status: true,
              logs: true,
              errorMessage: true,
              outputs: true,
              startedAt: true,
              endedAt: true,
            },
          },
        },
      }),
      ctx.tenantDb.workflowRun.count({ where }),
    ]);

    const runsSorted = sortWorkflowRunsLatestFirst(runs);

    return Response.json({ runs: runsSorted, total, limit, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
