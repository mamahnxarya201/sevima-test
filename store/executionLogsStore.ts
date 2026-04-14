import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { ExecutionLogRun, ExecutionLogStepSnapshot } from '@/lib/workflow/fetchExecutionLogs';

export type ExecutionLogsStreamStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

export const executionLogsRunIdsAtom = atom<string[]>([]);
export const executionLogsRunAtomFamily = atomFamily((runId: string) => {
  void runId;
  return atom<ExecutionLogRun | null>(null);
});
export const executionLogsTotalAtom = atom(0);
export const executionLogsLimitAtom = atom(10);
export const executionLogsLoadingAtom = atom(false);
export const executionLogsErrorAtom = atom<string | null>(null);
export const executionLogsStreamStatusAtom = atom<ExecutionLogsStreamStatus>('idle');
export const executionLogsStreamErrorAtom = atom<string | null>(null);
export const executionLogsExpandedRunIdsAtom = atom<Record<string, boolean>>({});
export const executionLogsSearchAtom = atom('');
export const executionLogsSortAtom = atom<'newest' | 'oldest'>('newest');
export const executionLogsPageAtom = atom(1);

const runningStates = new Set(['PENDING', 'RUNNING', 'RETRYING']);

export const executionLogsRuntimeCountAtom = atom((get) =>
  get(executionLogsRunIdsAtom).reduce((count, runId) => {
    const run = get(executionLogsRunAtomFamily(runId));
    return run && runningStates.has(run.status) ? count + 1 : count;
  }, 0)
);

function mergeRun(
  existing: ExecutionLogRun | null,
  incoming: Pick<
    ExecutionLogRun,
    'id' | 'status' | 'startedAt' | 'endedAt' | 'duration' | 'triggeredByLabel' | 'workflowVersion'
  >
): ExecutionLogRun {
  if (existing) {
    const incomingWorkflowVersion = incoming.workflowVersion as Partial<ExecutionLogRun['workflowVersion']>;
    const merged: ExecutionLogRun = {
      ...existing,
      ...incoming,
      triggeredByLabel: incoming.triggeredByLabel || existing.triggeredByLabel,
      workflowVersion: {
        ...existing.workflowVersion,
        ...incomingWorkflowVersion,
        nodeTypesById: {
          ...(existing.workflowVersion?.nodeTypesById ?? {}),
          ...(incomingWorkflowVersion?.nodeTypesById ?? {}),
        },
        nodeDescriptionsById: {
          ...(existing.workflowVersion?.nodeDescriptionsById ?? {}),
          ...(incomingWorkflowVersion?.nodeDescriptionsById ?? {}),
        },
      },
    };
    return merged;
  }

  return {
    ...incoming,
    workflowVersion: {
      ...incoming.workflowVersion,
      nodeTypesById: incoming.workflowVersion?.nodeTypesById ?? {},
      nodeDescriptionsById: incoming.workflowVersion?.nodeDescriptionsById ?? {},
    },
    triggeredByLabel: incoming.triggeredByLabel || 'Scheduled Operation',
    stepRuns: [],
  };
}

export const executionLogsReplaceRunsAtom = atom(null, (_get, set, runs: ExecutionLogRun[]) => {
  const ids = runs.map((run) => run.id);
  set(executionLogsRunIdsAtom, ids);
  for (const run of runs) {
    set(executionLogsRunAtomFamily(run.id), {
      ...run,
      workflowVersion: {
        ...run.workflowVersion,
        nodeTypesById: run.workflowVersion?.nodeTypesById ?? {},
        nodeDescriptionsById: run.workflowVersion?.nodeDescriptionsById ?? {},
      },
      triggeredByLabel: run.triggeredByLabel || 'Scheduled Operation',
    });
  }
});

export const executionLogsUpsertRunAtom = atom(
  null,
  (
    get,
    set,
    run: Pick<
      ExecutionLogRun,
      'id' | 'status' | 'startedAt' | 'endedAt' | 'duration' | 'triggeredByLabel' | 'workflowVersion'
    >
  ) => {
    const ids = get(executionLogsRunIdsAtom);
    const existing = get(executionLogsRunAtomFamily(run.id));
    const merged = mergeRun(existing, run);
    set(executionLogsRunAtomFamily(run.id), merged);
    set(executionLogsRunIdsAtom, [run.id, ...ids.filter((id) => id !== run.id)]);
  }
);

export const executionLogsApplyStepAtom = atom(
  null,
  (
    get,
    set,
    event: { runId: string; stepId: string; status: string; logs?: string; error?: string; outputs?: unknown }
  ) => {
    const run = get(executionLogsRunAtomFamily(event.runId));
    if (!run) return;
    const stepRuns = [...run.stepRuns];
    const stepIdx = stepRuns.findIndex((s) => s.stepId === event.stepId);
    const nextStep: ExecutionLogStepSnapshot = {
      stepId: event.stepId,
      status: event.status,
      logs: event.logs ?? null,
      errorMessage: event.error ?? null,
      outputs: event.outputs,
    };
    if (stepIdx >= 0) {
      stepRuns[stepIdx] = {
        ...stepRuns[stepIdx],
        ...nextStep,
      };
    } else {
      stepRuns.push(nextStep);
    }

    set(executionLogsRunAtomFamily(event.runId), { ...run, stepRuns });
  }
);
