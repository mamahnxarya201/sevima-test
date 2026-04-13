/**
 * app/api/workflows/[id]/route.ts
 *
 * GET   /api/workflows/:id  — Workflow + latest version (definition + editorState)
 * PATCH /api/workflows/:id  — Update metadata; new version if definition provided;
 *                               editorState-only updates latest version in place
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';
import { isEmptyDraftDefinition } from '@/lib/canvas/dagImporter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { tenantDb } = await resolveTenantContext(request);

    const workflow = await tenantDb.workflow.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return Response.json({ workflow });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { tenantDb } = await resolveTenantContext(request);
    const body = await request.json();
    const { definition, name, description, editorState } = body as {
      definition?: unknown;
      name?: string;
      description?: string | null;
      editorState?: unknown;
    };

    const workflow = await tenantDb.workflow.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const latest = workflow.versions[0];

    if (name !== undefined || description !== undefined) {
      await tenantDb.workflow.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        },
      });
    }

    if (definition !== undefined) {
      const skipValidation = isEmptyDraftDefinition(definition);
      if (!skipValidation) {
        const validation = validateDag(definition);
        if (!validation.valid) {
          return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
        }
      }

      const nextVersion = (latest?.versionNumber ?? 0) + 1;
      await tenantDb.workflow.update({
        where: { id },
        data: {
          activeVersion: nextVersion,
          versions: {
            create: {
              versionNumber: nextVersion,
              definition: definition as object,
              ...(editorState !== undefined
                ? { editorState: editorState as object }
                : {}),
            },
          },
        },
      });
    } else if (editorState !== undefined && latest) {
      await tenantDb.workflowVersion.update({
        where: { id: latest.id },
        data: { editorState: editorState as object },
      });
    }

    const updated = await tenantDb.workflow.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    return Response.json({ workflow: updated });
  } catch (err) {
    return authErrorResponse(err);
  }
}
