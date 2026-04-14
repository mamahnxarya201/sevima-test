/**
 * app/api/workflows/[id]/schedule/route.ts
 *
 * GET    /api/workflows/:id/schedule — Get the current schedule (if any)
 * PUT    /api/workflows/:id/schedule — Create or update the cron schedule
 * DELETE /api/workflows/:id/schedule — Remove the cron schedule
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { requireEditorOrAbove } from '@/lib/auth/rbac';
import { readJsonBody } from '@/lib/api/jsonBody';
import { workflowIdParamSchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import { managementDb } from '@/lib/prisma/management';
import { upsertCronJob, removeCronJob } from '@/lib/scheduler/cronSync';

export const dynamic = 'force-dynamic';

const CRON_5_FIELD = /^\s*(\S+\s+){4}\S+\s*$/;

const scheduleBodySchema = z.object({
  cronExpr: z.string().min(1).max(200).refine(
    (v) => CRON_5_FIELD.test(v),
    { message: 'Cron expression must have exactly 5 fields (minute hour day month weekday). Example: */10 * * * *' },
  ),
  enabled: z.boolean().default(true),
}).strict();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const workflowId = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`schedule:get:${ctx.userId}`, cfg.max, cfg.windowMs);

    const schedule = await managementDb.workflowSchedule.findUnique({
      where: { tenantId_workflowId: { tenantId: ctx.tenantId, workflowId } },
    });

    return Response.json({ schedule: schedule ?? null });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const workflowId = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`schedule:put:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const raw = await readJsonBody(request);
    const body = scheduleBodySchema.parse(raw);

    // Verify the workflow exists in the tenant DB
    const workflow = await ctx.tenantDb.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true },
    });
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const schedule = await managementDb.workflowSchedule.upsert({
      where: { tenantId_workflowId: { tenantId: ctx.tenantId, workflowId } },
      create: {
        tenantId: ctx.tenantId,
        workflowId,
        cronExpr: body.cronExpr,
        enabled: body.enabled,
      },
      update: {
        cronExpr: body.cronExpr,
        enabled: body.enabled,
      },
    });

    // Sync to pg_cron
    let cronError: string | null = null;
    if (body.enabled) {
      try {
        await upsertCronJob(schedule.id, ctx.tenantId, workflowId, body.cronExpr);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[schedule] pg_cron sync failed:', msg);
        cronError = `Schedule saved but pg_cron sync failed: ${msg}`;
      }
    } else {
      try {
        await removeCronJob(schedule.id);
      } catch {
        // pg_cron not available — fine, nothing to unschedule
      }
      await managementDb.workflowSchedule.update({
        where: { id: schedule.id },
        data: { pgCronJobId: null },
      });
    }

    return Response.json({
      schedule,
      ...(cronError ? { warning: cronError } : {}),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const workflowId = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`schedule:delete:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const existing = await managementDb.workflowSchedule.findUnique({
      where: { tenantId_workflowId: { tenantId: ctx.tenantId, workflowId } },
    });

    if (!existing) {
      return Response.json({ error: 'No schedule found' }, { status: 404 });
    }

    try {
      await removeCronJob(existing.id);
    } catch {
      // pg_cron not available
    }

    await managementDb.workflowSchedule.delete({
      where: { id: existing.id },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
