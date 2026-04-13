/**
 * app/api/workflows/route.ts
 *
 * GET  /api/workflows  — List workflows (tenant-wide); ?search=&sort=name|updated
 * POST /api/workflows  — Create workflow + v1; definition defaults to {} (draft, no validateDag)
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';
import { isEmptyDraftDefinition } from '@/lib/canvas/dagImporter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { tenantDb } = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('search')?.trim() ?? '';
    const sort = searchParams.get('sort') ?? 'updated';

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
      sort === 'name'
        ? { name: 'asc' as const }
        : { updatedAt: 'desc' as const };

    const workflows = await tenantDb.workflow.findMany({
      where,
      orderBy,
      include: {
        _count: { select: { versions: true } },
      },
    });

    return Response.json({ workflows });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, tenantDb } = await resolveTenantContext(request);
    const body = await request.json();

    const { name, description, definition, editorState } = body as {
      name: string;
      description?: string;
      definition?: unknown;
      editorState?: unknown;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'name is required' }, { status: 400 });
    }

    const def = definition !== undefined ? definition : {};

    if (!isEmptyDraftDefinition(def)) {
      const validation = validateDag(def);
      if (!validation.valid) {
        return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
      }
    }

    const workflow = await tenantDb.workflow.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: userId,
        activeVersion: 1,
        versions: {
          create: {
            versionNumber: 1,
            definition: def as object,
            ...(editorState !== undefined ? { editorState: editorState as object } : {}),
          },
        },
      },
      include: { versions: true },
    });

    return Response.json({ workflow }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err);
  }
}
