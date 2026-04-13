import { getTenantDb } from './tenant';

export async function createWorkflowVersion(tenantUrl: string, workflowId: string, definition: any) {
  const tenantDb = getTenantDb(tenantUrl);
  const workflow = await tenantDb.workflow.findUnique({
    where: { id: workflowId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const nextVersion = (workflow.versions[0]?.versionNumber ?? 0) + 1;

  return tenantDb.workflowVersion.create({
    data: {
      workflowId,
      versionNumber: nextVersion,
      definition,
    },
  });
}

export async function getLatestVersion(tenantUrl: string, workflowId: string) {
  const tenantDb = getTenantDb(tenantUrl);
  return tenantDb.workflowVersion.findFirst({
    where: { workflowId },
    orderBy: { versionNumber: 'desc' },
  });
}
