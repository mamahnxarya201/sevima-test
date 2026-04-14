import { getTenantDb } from './tenant';

export async function createWorkflow(tenantUrl: string, data: { name: string, description?: string, ownerId: string, definition: any }) {
  const tenantDb = getTenantDb(tenantUrl);
  return tenantDb.workflow.create({
    data: {
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
      activeVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          definition: data.definition,
        },
      },
    },
    include: { versions: true },
  });
}

export async function updateWorkflow(tenantUrl: string, id: string, data: { name?: string, description?: string, definition?: any }) {
  const tenantDb = getTenantDb(tenantUrl);
  const workflow = await tenantDb.workflow.findUnique({
    where: { id },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const updates: any = { updatedAt: new Date() };
  if (data.name) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;

  if (data.definition) {
    const nextVersion = (workflow.versions[0]?.versionNumber ?? 0) + 1;
    updates.activeVersion = nextVersion;
    updates.versions = {
      create: { versionNumber: nextVersion, definition: data.definition },
    };
  }

  return tenantDb.workflow.update({
    where: { id },
    data: updates,
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
}

export async function getWorkflow(tenantUrl: string, id: string) {
  const tenantDb = getTenantDb(tenantUrl);
  return tenantDb.workflow.findUnique({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });
}
