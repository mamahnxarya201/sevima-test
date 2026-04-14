/**
 * lib/orchestrator/executionEngine.ts
 *
 * Main orchestration loop.
 * Executes a validated DAG definition against Docker containers,
 * tracking state in the tenant DB and emitting real-time events via EventBus.
 *
 * Flow:
 *   validateDag → topological levels → for each level: Promise.allSettled(nodes)
 *   → resolveInputs → runNode → exponential backoff retry → update StepRun
 *   → emit StepEvent → accumulate runContext → update WorkflowRun
 *
 * Features:
 *   - Per-node retry with exponential backoff (delay = base * 2^attempt)
 *   - Global workflow timeout (AbortController kills running containers)
 *   - Partial failure tolerance (maxNodeFailures before workflow stops)
 *   - Workflow-level retries (each retry creates a new WorkflowRun row)
 *   - Condition node post-check (validates boolean result)
 */

import pLimit from 'p-limit';
import { validateDag } from '../dag/validator';
import { resolveInputs, parseNodeOutputs, parseHttpCallOutputs } from '../dag/ioResolver';
import { mergeUpstreamOutputs, interpolateDagNode } from '../dag/inputInterpolation';
import { runNode } from './dockerRunner';
import { emitStepEvent, emitRunComplete, emitWorkflowRetry } from '../socket/eventBus';
import {
  workflowRunsTotal,
  workflowRunsActive,
  workflowRunDuration,
  stepRunsTotal,
  stepRunDuration,
  stepRetries,
} from '../metrics/prometheus';
import { pushStepLog } from '../metrics/lokiPush';
import type { DagSchema, DagNode, RunContext } from '../dag/types';
import type { PrismaClient } from '../generated/tenant-client';
import {
  type WorkflowSettings,
  DEFAULT_WORKFLOW_SETTINGS,
  parseWorkflowSettings,
} from '../dag/workflowSettings';

const limit = pLimit(5);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Per-node retry with exponential backoff
// ─────────────────────────────────────────────

async function runNodeWithRetry(
  runId: string,
  node: DagNode,
  edges: DagSchema['edges'],
  runContext: RunContext,
  tenantDb: PrismaClient,
  tenantId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const maxAttempts = (node.retries ?? 0) + 1;
  const baseDelay = node.retryDelayMs ?? 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error(`Workflow timeout — node "${node.id}" aborted before attempt ${attempt + 1}`);
    }

    const status = attempt === 0 ? 'RUNNING' : 'RETRYING';

    await tenantDb.stepRun.updateMany({
      where: { runId, stepId: node.id },
      data: { status, attempts: attempt + 1, startedAt: attempt === 0 ? new Date() : undefined },
    });

    emitStepEvent({ runId, stepId: node.id, status });

    const mergedInput = mergeUpstreamOutputs(node.id, edges, runContext);
    const nodeRuntime = interpolateDagNode(node, mergedInput);
    const env = resolveInputs(node.inputs, runContext);

    const result = await runNode(nodeRuntime, env, { mergedInput, signal });
    let outputs: Record<string, unknown>;
    let parsedConditionOutputs: Record<string, unknown> | null = null;

    if (node.type === 'DELAY') {
      outputs = mergedInput;
    } else if (node.type === 'HTTP_CALL') {
      outputs = parseHttpCallOutputs(result.logs, node.outputs);
    } else if (node.type === 'CONDITION') {
      parsedConditionOutputs = parseNodeOutputs(result.logs, node.outputs);
      // Preserve upstream context for downstream branch nodes.
      outputs = {
        ...mergedInput,
        ...parsedConditionOutputs,
      };
    } else {
      outputs = parseNodeOutputs(result.logs, node.outputs);
    }

    // Condition node post-check: validate result is boolean
    if (node.type === 'CONDITION' && result.exitCode === 0) {
      const condResult = (parsedConditionOutputs ?? {})['result'];
      if (condResult !== true && condResult !== false && condResult !== 'true' && condResult !== 'false') {
        const errMsg = `Condition node "${node.id}" output.result is ${JSON.stringify(condResult)}, expected boolean`;
        await tenantDb.stepRun.updateMany({
          where: { runId, stepId: node.id },
          data: {
            status: 'FAILED',
            logs: result.logs,
            errorMessage: errMsg,
            endedAt: new Date(),
          },
        });
        emitStepEvent({
          runId, stepId: node.id, status: 'FAILED',
          logs: result.logs, error: errMsg, durationMs: result.durationMs,
        });
        stepRunsTotal.inc({ status: 'FAILED', node_type: node.type, tenant_id: tenantId });
        pushStepLog(runId, node.id, node.type, 'FAILED', result.logs, errMsg, tenantId);
        throw new Error(errMsg);
      }
    }

    if (result.exitCode === 0) {
      await tenantDb.stepRun.updateMany({
        where: { runId, stepId: node.id },
        data: {
          status: 'SUCCESS',
          logs: result.logs,
          outputs: outputs as any,
          endedAt: new Date(),
        },
      });

      emitStepEvent({
        runId,
        stepId: node.id,
        status: 'SUCCESS',
        logs: result.logs,
        outputs,
        durationMs: result.durationMs,
      });

      stepRunsTotal.inc({ status: 'SUCCESS', node_type: node.type, tenant_id: tenantId });
      if (result.durationMs != null) stepRunDuration.observe({ node_type: node.type, tenant_id: tenantId }, result.durationMs / 1000);
      pushStepLog(runId, node.id, node.type, 'SUCCESS', result.logs, undefined, tenantId);

      return outputs;
    }

    // Timeout exit code — no retry, fail immediately
    if (result.exitCode === 124) {
      const timeoutStatus = signal?.aborted ? 'TIMEOUT' as const : 'FAILED' as const;
      await tenantDb.stepRun.updateMany({
        where: { runId, stepId: node.id },
        data: {
          status: timeoutStatus,
          logs: result.logs,
          errorMessage: `Step timed out (exit 124)`,
          endedAt: new Date(),
        },
      });
      emitStepEvent({
        runId, stepId: node.id, status: timeoutStatus,
        logs: result.logs, error: 'Step timed out', durationMs: result.durationMs,
      });

      stepRunsTotal.inc({ status: timeoutStatus, node_type: node.type, tenant_id: tenantId });
      pushStepLog(runId, node.id, node.type, timeoutStatus, result.logs, 'Step timed out', tenantId);

      throw new Error(`Node "${node.id}" timed out`);
    }

    const isLastAttempt = attempt === maxAttempts - 1;
    if (isLastAttempt) {
      await tenantDb.stepRun.updateMany({
        where: { runId, stepId: node.id },
        data: {
          status: 'FAILED',
          logs: result.logs,
          errorMessage: `Exit code ${result.exitCode}`,
          endedAt: new Date(),
        },
      });

      emitStepEvent({
        runId,
        stepId: node.id,
        status: 'FAILED',
        logs: result.logs,
        error: `Exit code ${result.exitCode}`,
        durationMs: result.durationMs,
      });

      stepRunsTotal.inc({ status: 'FAILED', node_type: node.type, tenant_id: tenantId });
      if (result.durationMs != null) stepRunDuration.observe({ node_type: node.type, tenant_id: tenantId }, result.durationMs / 1000);
      pushStepLog(runId, node.id, node.type, 'FAILED', result.logs, `Exit code ${result.exitCode}`, tenantId);

      throw new Error(`Node "${node.id}" failed after ${maxAttempts} attempt(s). Exit code: ${result.exitCode}`);
    }

    stepRetries.inc({ node_type: node.type, tenant_id: tenantId });

    const delay = baseDelay * Math.pow(2, attempt);
    console.log(`[engine] Node "${node.id}" failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`);
    await sleep(delay);
  }

  throw new Error(`Unexpected state in runNodeWithRetry for node "${node.id}"`);
}

// ─────────────────────────────────────────────
// CONDITION node branch resolution
// ─────────────────────────────────────────────

function resolveConditionBranch(
  nodeId: string,
  outputs: Record<string, unknown>,
  edges: DagSchema['edges']
): string[] {
  const result = outputs['result'];
  const branch = result === true || result === 'true' ? 'true' : 'false';

  return edges
    .filter((e) => e.from === nodeId && e.branch === branch)
    .map((e) => e.to);
}

// ─────────────────────────────────────────────
// Single workflow run (with timeout + partial failure)
// ─────────────────────────────────────────────

export async function runWorkflow(
  runId: string,
  definition: DagSchema,
  tenantDb: PrismaClient,
  tenantId: string,
  settings: WorkflowSettings = DEFAULT_WORKFLOW_SETTINGS,
): Promise<'SUCCESS' | 'FAILED' | 'TIMEOUT'> {
  const startTime = Date.now();

  const ac = new AbortController();
  const globalTimer = setTimeout(() => ac.abort(), settings.globalTimeoutMs);

  try {
    const validation = validateDag(definition);
    if (!validation.valid) {
      const detail =
        validation.errors.length > 0
          ? `DAG validation failed:\n${validation.errors.slice(0, 20).join('\n')}`
          : 'DAG validation failed.';
      await tenantDb.workflowRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          errorMessage: detail.slice(0, 8000),
        },
      });
      emitRunComplete({
        runId,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        error: detail.slice(0, 8000),
      });
      return 'FAILED';
    }

    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    workflowRunsActive.inc({ tenant_id: tenantId });

    await tenantDb.stepRun.createMany({
      data: definition.nodes.map((node) => ({
        runId,
        stepId: node.id,
        status: 'PENDING' as const,
      })),
    });

    const skippedNodeIds = new Set<string>();
    const runContext: RunContext = {};
    let failedNodeCount = 0;

    for (const level of validation.levels) {
      if (ac.signal.aborted) break;

      const results = await Promise.allSettled(
        level.map((node) =>
          limit(async () => {
            if (skippedNodeIds.has(node.id)) {
              await tenantDb.stepRun.updateMany({
                where: { runId, stepId: node.id },
                data: { status: 'SUCCESS', logs: '[skipped — inactive branch]', endedAt: new Date() },
              });
              return;
            }

            const outputs = await runNodeWithRetry(runId, node, definition.edges, runContext, tenantDb, tenantId, ac.signal);
            runContext[node.id] = outputs;

            if (node.type === 'CONDITION') {
              const activeBranch = outputs['result'] === true || outputs['result'] === 'true' ? 'true' : 'false';
              const inactiveBranch = activeBranch === 'true' ? 'false' : 'true';

              definition.edges
                .filter((e) => e.from === node.id && e.branch === inactiveBranch)
                .forEach((e) => skippedNodeIds.add(e.to));
            }
          })
        )
      );

      for (const r of results) {
        if (r.status === 'rejected') {
          failedNodeCount++;
          console.error(`[engine] Node failure in run ${runId}: ${r.reason}`);
        }
      }

      if (failedNodeCount >= settings.maxNodeFailures) {
        const msg = `Workflow stopped: ${failedNodeCount} node(s) failed (max ${settings.maxNodeFailures})`;
        console.error(`[engine] ${msg}`);
        throw new Error(msg);
      }
    }

    // Check for timeout after all levels
    if (ac.signal.aborted) {
      throw new TimeoutError(settings.globalTimeoutMs);
    }

    const durationMs = Date.now() - startTime;
    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: { status: 'SUCCESS', endedAt: new Date(), duration: durationMs, errorMessage: null },
    });

    emitRunComplete({ runId, status: 'SUCCESS', durationMs });
    workflowRunsActive.dec({ tenant_id: tenantId });
    workflowRunsTotal.inc({ status: 'SUCCESS', tenant_id: tenantId });
    workflowRunDuration.observe({ status: 'SUCCESS', tenant_id: tenantId }, durationMs / 1000);
    console.log(`[engine] Run ${runId} completed successfully in ${durationMs}ms`);
    return 'SUCCESS';
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const isTimeout = err instanceof TimeoutError || ac.signal.aborted;
    const finalStatus = isTimeout ? 'TIMEOUT' as const : 'FAILED' as const;
    const message = err instanceof Error ? err.message : String(err);

    if (isTimeout) {
      const timeoutSec = Math.round(settings.globalTimeoutMs / 1000);
      const timeoutLog = `[TIMEOUT] Workflow exceeded global timeout of ${timeoutSec}s`;

      await tenantDb.stepRun.updateMany({
        where: { runId, status: 'RUNNING' },
        data: {
          status: 'TIMEOUT',
          errorMessage: timeoutLog,
          endedAt: new Date(),
        },
      });

      console.error(`[engine] Run ${runId} timed out after ${timeoutSec}s`);
    }

    const failureNote = message.slice(0, 8000);

    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        endedAt: new Date(),
        duration: durationMs,
        ...(finalStatus !== 'SUCCESS' ? { errorMessage: failureNote } : {}),
      },
    });

    emitRunComplete({
      runId,
      status: finalStatus,
      durationMs,
      ...(finalStatus !== 'SUCCESS' ? { error: failureNote } : {}),
    });
    workflowRunsActive.dec({ tenant_id: tenantId });
    workflowRunsTotal.inc({ status: finalStatus, tenant_id: tenantId });
    workflowRunDuration.observe({ status: finalStatus, tenant_id: tenantId }, durationMs / 1000);
    if (!isTimeout) {
      console.error(`[engine] Run ${runId} failed: ${message}`);
    }
    return finalStatus;
  } finally {
    clearTimeout(globalTimer);
  }
}

class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Workflow timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

// ─────────────────────────────────────────────
// Workflow-level retries (creates new WorkflowRun per attempt)
// ─────────────────────────────────────────────

export async function runWorkflowWithRetries(
  originalRunId: string,
  workflowVersionId: string,
  definition: DagSchema,
  tenantDb: PrismaClient,
  tenantId: string,
  rawSettings?: unknown,
  triggeredById?: string,
): Promise<void> {
  const settings = parseWorkflowSettings(rawSettings);
  const maxAttempts = settings.workflowRetries + 1;

  let currentRunId = originalRunId;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await runWorkflow(currentRunId, definition, tenantDb, tenantId, settings);

    if (result === 'SUCCESS') return;

    const isLastAttempt = attempt === maxAttempts - 1;
    if (isLastAttempt) return;

    // Create a new WorkflowRun for the retry
    const delay = settings.defaultRetryDelayMs * Math.pow(2, attempt);
    console.log(`[engine] Workflow retry ${attempt + 1}/${settings.workflowRetries} for run ${currentRunId}, waiting ${delay}ms`);
    await sleep(delay);

    const newRun = await tenantDb.workflowRun.create({
      data: {
        workflowVersionId,
        triggeredById,
        status: 'PENDING',
      },
    });

    emitWorkflowRetry({
      originalRunId,
      failedRunId: currentRunId,
      newRunId: newRun.id,
      attempt: attempt + 1,
      maxAttempts: settings.workflowRetries,
    });

    currentRunId = newRun.id;
  }
}
