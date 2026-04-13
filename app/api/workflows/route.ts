/**
 * app/api/workflows/route.ts
 *
 * GET  /api/workflows  — List all workflows for the calling tenant
 * POST /api/workflows  — Create a new workflow with version 1
 *
 * All routes require Authorization: Bearer <jwt>
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, authErrorResponse } from '@/lib/auth/tenantGuard';
import { validateDag } from '@/lib/dag/validator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { userId, tenantDb } = await resolveTenantContext(request);

    const workflows = await tenantDb.workflow.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { versions: true, } },
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

    const { name, description, definition } = body as {
      name: string;
      description?: string;
      definition: unknown;
    };

    if (!name || !definition) {
      return Response.json({ error: 'name and definition are required' }, { status: 400 });
    }

    // Validate DAG before saving
    const validation = validateDag(definition);
    if (!validation.valid) {
      return Response.json({ error: 'Invalid DAG', details: validation.errors }, { status: 422 });
    }

    const workflow = await tenantDb.workflow.create({
      data: {
        name,
        description,
        ownerId: userId,
        activeVersion: 1,
        versions: {
          create: {
            versionNumber: 1,
            definition: definition as any,
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
