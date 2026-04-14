import { getTenantDb } from './tenant';
import { RunStatus } from '../generated/tenant-client';

export async function createWorkflowRun(tenantUrl: string, workflowVersionId: string, triggeredById?: string) {
  const tenantDb = getTenantDb(tenantUrl);
  return tenantDb.workflowRun.create({
    data: {
      workflowVersionId,
      triggeredById,
      status: RunStatus.PENDING,
    },
  });
}

export async function updateRunStatus(tenantUrl: string, runId: string, status: RunStatus, duration?: number) {
  const tenantDb = getTenantDb(tenantUrl);
  const data: any = { status };
  
  if (status === RunStatus.RUNNING) {
    data.startedAt = new Date();
  } else if (status === RunStatus.SUCCESS || status === RunStatus.FAILED || status === RunStatus.TIMEOUT) {
    data.endedAt = new Date();
    if (duration !== undefined) {
      data.duration = duration;
    }
  }

  return tenantDb.workflowRun.update({
    where: { id: runId },
    data,
  });
}

export async function updateStepStatus(tenantUrl: string, stepId: string, runId: string, status: RunStatus, logs?: string, errorMessage?: string, outputs?: any) {
  const tenantDb = getTenantDb(tenantUrl);
  
  // Find existing step run or create it
  let stepRun = await tenantDb.stepRun.findFirst({
    where: { stepId, runId },
  });

  const data: any = { status };
  if (logs) data.logs = logs;
  if (errorMessage) data.errorMessage = errorMessage;
  if (outputs) data.outputs = outputs;

  if (status === RunStatus.RUNNING && !stepRun?.startedAt) {
    data.startedAt = new Date();
  } else if (status === RunStatus.SUCCESS || status === RunStatus.FAILED || status === RunStatus.TIMEOUT) {
    data.endedAt = new Date();
  }

  if (stepRun) {
    return tenantDb.stepRun.update({
      where: { id: stepRun.id },
      data,
    });
  } else {
    return tenantDb.stepRun.create({
      data: {
        stepId,
        runId,
        ...data,
      },
    });
  }
}
