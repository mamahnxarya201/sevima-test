/**
 * app/api/workflows/[id]/route.ts
 *
 * GET   /api/workflows/:id  — Get workflow with active version DAG
 * PATCH /api/workflows/:id  — Save a new DAG version (bumps versionNumber)
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';

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
    const { definition, name, description } = body as {
      definition?: unknown;
      name?: string;
      description?: string;
    };

    const workflow = await tenantDb.workflow.findUnique({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (definition) {
      const validation = validateDag(definition);
      if (!validation.valid) {
        return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
      }

      const nextVersion = (workflow.versions[0]?.versionNumber ?? 0) + 1;
      updates.activeVersion = nextVersion;
      updates.versions = {
        create: { versionNumber: nextVersion, definition: definition as any },
      };
    }

    const updated = await tenantDb.workflow.update({
      where: { id },
      data: updates as any,
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    return Response.json({ workflow: updated });
  } catch (err) {
    return authErrorResponse(err);
  }
}
