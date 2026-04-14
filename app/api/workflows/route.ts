/**
 * app/api/workflows/route.ts
 *
 * GET  /api/workflows  — List workflows (tenant-wide); ?search=&sort=name|updated&limit=&offset=
 * POST /api/workflows  — Create workflow + v1; definition defaults to {} (draft, no validateDag)
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';
import { isEmptyDraftDefinition } from '@/lib/canvas/dagImporter';
import { requireEditorOrAbove } from '@/lib/auth/rbac';
import { readJsonBody } from '@/lib/api/jsonBody';
import { createWorkflowBodySchema, workflowListQuerySchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import { Prisma } from '@/lib/generated/tenant-client';

export const dynamic = 'force-dynamic';

type WorkflowRunStatRow = {
  wid: string;
  run_count: number;
  last_run_status: string;
  last_run_at: Date | null;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:get:${ctx.userId}`, cfg.max, cfg.windowMs);

    const sp = request.nextUrl.searchParams;
    const raw = {
      search: sp.get('search') ?? undefined,
      sort: sp.get('sort') ?? undefined,
      limit: sp.get('limit') ?? undefined,
      offset: sp.get('offset') ?? undefined,
    };
    const parsed = workflowListQuerySchema.parse(raw);
    const q = parsed.search?.trim() ?? '';

    const where =
      q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {};

    const orderBy =
      parsed.sort === 'name'
        ? { name: 'asc' as const }
        : { updatedAt: 'desc' as const };

    const [total, workflows] = await Promise.all([
      ctx.tenantDb.workflow.count({ where }),
      ctx.tenantDb.workflow.findMany({
        where,
        orderBy,
        skip: parsed.offset,
        take: parsed.limit,
        include: {
          _count: { select: { versions: true } },
        },
      }),
    ]);

    let runStats: WorkflowRunStatRow[] = [];
    if (workflows.length > 0) {
      const ids = workflows.map((w) => w.id);
      runStats = await ctx.tenantDb.$queryRaw<WorkflowRunStatRow[]>`
        WITH base AS (
          SELECT wv."workflowId" AS wid,
                 wr.status::text AS status,
                 wr."startedAt" AS started_at,
                 (COUNT(*) OVER (PARTITION BY wv."workflowId"))::int AS run_count,
                 ROW_NUMBER() OVER (
                   PARTITION BY wv."workflowId"
                   ORDER BY wr."startedAt" DESC NULLS LAST, wr.id DESC
                 ) AS rn
          FROM "WorkflowRun" wr
          INNER JOIN "WorkflowVersion" wv ON wr."workflowVersionId" = wv.id
          WHERE wv."workflowId" IN (${Prisma.join(ids)})
        )
        SELECT wid, run_count, status AS last_run_status, started_at AS last_run_at
        FROM base
        WHERE rn = 1
      `;
    }

    const statMap = new Map(
      runStats.map((r) => [
        r.wid,
        {
          runCount: Number(r.run_count),
          lastRunAt: r.last_run_at ? r.last_run_at.toISOString() : null,
          lastRunStatus: r.last_run_status,
        },
      ])
    );

    const workflowsWithRuns = workflows.map((w) => ({
      ...w,
      runSummary: statMap.get(w.id) ?? {
        runCount: 0,
        lastRunAt: null,
        lastRunStatus: null as string | null,
      },
    }));

    return Response.json({
      workflows: workflowsWithRuns,
      total,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:post:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const raw = await readJsonBody(request);
    const body = createWorkflowBodySchema.parse(raw);

    const def = body.definition !== undefined ? body.definition : {};

    if (!isEmptyDraftDefinition(def)) {
      const validation = validateDag(def);
      if (!validation.valid) {
        return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
      }
    }

    const description =
      body.description === undefined
        ? null
        : typeof body.description === 'string'
          ? body.description.trim() || null
          : null;

    const workflow = await ctx.tenantDb.workflow.create({
      data: {
        name: body.name,
        description,
        ownerId: ctx.userId,
        activeVersion: 1,
        versions: {
          create: {
            versionNumber: 1,
            definition: def as object,
            ...(body.editorState !== undefined ? { editorState: body.editorState as object } : {}),
          },
        },
      },
      include: { versions: true },
    });

    return Response.json({ workflow }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
