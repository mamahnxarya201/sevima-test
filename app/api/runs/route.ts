/**
 * GET /api/runs — Paginated execution logs across all workflows (tenant-scoped).
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { managementDb } from '@/lib/prisma/management';
import { executionLogsListQuerySchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveTenantContext(request);
    const cfg = rateLimitConfig();
    enforceRateLimit(`runs:list:${ctx.userId}`, cfg.max, cfg.windowMs);

    const parsed = executionLogsListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
    }
    const { limit, offset, sort, search } = parsed.data;
    const q = search?.trim() ?? '';
    const where =
      q.length > 0
        ? {
            OR: [
              { id: { contains: q } },
              { triggeredById: { contains: q } },
              { workflowVersion: { workflow: { name: { contains: q, mode: 'insensitive' as const } } } },
            ],
          }
        : {};

    const orderBy =
      sort === 'oldest'
        ? [
            { startedAt: { sort: 'asc' as const, nulls: 'last' as const } },
            { endedAt: { sort: 'asc' as const, nulls: 'last' as const } },
          ]
        : [
            { endedAt: { sort: 'desc' as const, nulls: 'last' as const } },
            { startedAt: { sort: 'desc' as const, nulls: 'last' as const } },
          ];

    const [runs, total] = await Promise.all([
      ctx.tenantDb.workflowRun.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          startedAt: true,
          endedAt: true,
          duration: true,
          triggeredById: true,
          workflowVersion: {
            select: {
              versionNumber: true,
              workflowId: true,
              definition: true,
              editorState: true,
              workflow: {
                select: {
                  name: true,
                },
              },
            },
          },
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

    const triggeredByIds = Array.from(
      new Set(
        runs
          .map((run) => run.triggeredById)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const users =
      triggeredByIds.length > 0
        ? await managementDb.user.findMany({
            where: { tenantId: ctx.tenantId, id: { in: triggeredByIds } },
            select: { id: true, name: true },
          })
        : [];
    const userNameById = new Map(users.map((u) => [u.id, u.name]));

    const runsWithNodeTypes = runs.map((run) => {
      const { definition, editorState, ...workflowVersion } = run.workflowVersion;
      const triggeredByLabel = run.triggeredById
        ? (userNameById.get(run.triggeredById) ?? 'Unknown User')
        : 'Scheduled Operation';
      return {
        ...run,
        triggeredByLabel,
        workflowVersion: {
          ...workflowVersion,
          nodeTypesById: nodeTypesByIdFromDefinition(definition),
          nodeDescriptionsById: nodeDescriptionsByIdFromEditorState(editorState),
        },
      };
    });

    return Response.json({ runs: runsWithNodeTypes, total, limit, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
