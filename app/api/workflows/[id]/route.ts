/**
 * app/api/workflows/[id]/route.ts
 *
 * GET   /api/workflows/:id  — Workflow, versions (newest first), optional `createdBy` from management User;
 *                               optional `?atVersion=n` returns one checkpoint row for that version number
 * PATCH /api/workflows/:id  — Update metadata; draft saves update latest version in place;
 *                               checkpoint: true creates a new WorkflowVersion snapshot
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';
import { isEmptyDraftDefinition } from '@/lib/canvas/dagImporter';
import { requireEditorOrAbove } from '@/lib/auth/rbac';
import { readJsonBody } from '@/lib/api/jsonBody';
import { patchWorkflowBodySchema, workflowIdParamSchema } from '@/lib/api/schemas/workflow';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import { managementDb } from '@/lib/prisma/management';

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
    enforceRateLimit(`workflows:one:get:${ctx.userId}`, cfg.max, cfg.windowMs);

    const atVersionRaw = request.nextUrl.searchParams.get('atVersion');
    if (atVersionRaw != null && atVersionRaw !== '') {
      const vn = parseInt(atVersionRaw, 10);
      if (!Number.isFinite(vn) || vn < 1) {
        return Response.json({ error: 'Invalid atVersion' }, { status: 400 });
      }
      const workflowBase = await ctx.tenantDb.workflow.findUnique({
        where: { id },
      });
      if (!workflowBase) {
        return Response.json({ error: 'Workflow not found' }, { status: 404 });
      }
      const versionRow = await ctx.tenantDb.workflowVersion.findFirst({
        where: { workflowId: id, versionNumber: vn },
      });
      if (!versionRow) {
        return Response.json({ error: 'Version not found' }, { status: 404 });
      }
      let createdBy: { name: string; email: string } | null = null;
      try {
        const owner = await managementDb.user.findUnique({
          where: { id: workflowBase.ownerId },
          select: { name: true, email: true },
        });
        if (owner) {
          createdBy = { name: owner.name, email: owner.email };
        }
      } catch {
        /* owner missing or DB edge case */
      }
      return Response.json({
        workflow: { ...workflowBase, versions: [versionRow] },
        createdBy,
      });
    }

    const workflow = await ctx.tenantDb.workflow.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 80,
        },
      },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    let createdBy: { name: string; email: string } | null = null;
    try {
      const owner = await managementDb.user.findUnique({
        where: { id: workflow.ownerId },
        select: { name: true, email: true },
      });
      if (owner) {
        createdBy = { name: owner.name, email: owner.email };
      }
    } catch {
      /* owner missing or DB edge case */
    }

    return Response.json({ workflow, createdBy });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:patch:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const raw = await readJsonBody(request);
    const body = patchWorkflowBodySchema.parse(raw);

    const workflow = await ctx.tenantDb.workflow.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const latest = workflow.versions[0];

    const workflowUpdate: Record<string, unknown> = {};
    if (body.name !== undefined) workflowUpdate.name = body.name;
    if (body.description !== undefined) {
      workflowUpdate.description =
        typeof body.description === 'string'
          ? body.description.trim() || null
          : body.description;
    }
    if (body.settings !== undefined) {
      workflowUpdate.settings = body.settings;
    }
    if (Object.keys(workflowUpdate).length > 0) {
      await ctx.tenantDb.workflow.update({
        where: { id },
        data: workflowUpdate,
      });
    }

    if (body.definition !== undefined) {
      const skipValidation = isEmptyDraftDefinition(body.definition);
      if (!skipValidation) {
        const validation = validateDag(body.definition);
        if (!validation.valid) {
          return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
        }
      }

      const isCheckpoint = body.checkpoint === true;

      if (isCheckpoint) {
        const nextVersion = (latest?.versionNumber ?? 0) + 1;
        await ctx.tenantDb.workflow.update({
          where: { id },
          data: {
            activeVersion: nextVersion,
            versions: {
              create: {
                versionNumber: nextVersion,
                definition: body.definition as object,
                ...(body.editorState !== undefined
                  ? { editorState: body.editorState as object }
                  : {}),
              },
            },
          },
        });
      } else if (latest) {
        await ctx.tenantDb.workflowVersion.update({
          where: { id: latest.id },
          data: {
            definition: body.definition as object,
            ...(body.editorState !== undefined ? { editorState: body.editorState as object } : {}),
          },
        });
      } else {
        await ctx.tenantDb.workflow.update({
          where: { id },
          data: {
            activeVersion: 1,
            versions: {
              create: {
                versionNumber: 1,
                definition: body.definition as object,
                ...(body.editorState !== undefined
                  ? { editorState: body.editorState as object }
                  : {}),
              },
            },
          },
        });
      }
    } else if (body.editorState !== undefined && latest) {
      await ctx.tenantDb.workflowVersion.update({
        where: { id: latest.id },
        data: { editorState: body.editorState as object },
      });
    }

    const updated = await ctx.tenantDb.workflow.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    return Response.json({ workflow: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = workflowIdParamSchema.parse(rawId);
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);
    const cfg = rateLimitConfig();
    enforceRateLimit(`workflows:delete:${ctx.userId}`, cfg.mutationMax, cfg.windowMs);

    const exists = await ctx.tenantDb.workflow.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    await ctx.tenantDb.$transaction(async (tx) => {
      const versionRows = await tx.workflowVersion.findMany({
        where: { workflowId: id },
        select: { id: true },
      });
      const versionIds = versionRows.map((v) => v.id);

      if (versionIds.length > 0) {
        const runRows = await tx.workflowRun.findMany({
          where: { workflowVersionId: { in: versionIds } },
          select: { id: true },
        });
        const runIds = runRows.map((r) => r.id);

        if (runIds.length > 0) {
          await tx.stepRun.deleteMany({ where: { runId: { in: runIds } } });
          await tx.workflowRun.deleteMany({ where: { id: { in: runIds } } });
        }

        await tx.workflowVersion.deleteMany({ where: { id: { in: versionIds } } });
      }

      await tx.workflow.delete({ where: { id } });
    });

    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
