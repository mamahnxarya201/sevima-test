/**
 * lib/orchestrator/executionEngine.ts
 *
 * Main orchestration loop.
 * Executes a validated DAG definition against Docker containers,
 * tracking state in the tenant DB and emitting real-time events via EventBus.
 *
 * Flow:
 *   validateDag → topological levels → for each level: Promise.all(nodes)
 *   → resolveInputs → runNode → exponential backoff retry → update StepRun
 *   → emit StepEvent → accumulate runContext → update WorkflowRun
 */

import pLimit from 'p-limit';
import { validateDag } from '../dag/validator';
import { resolveInputs, parseNodeOutputs, parseHttpCallOutputs } from '../dag/ioResolver';
import { mergeUpstreamOutputs, interpolateDagNode } from '../dag/inputInterpolation';
import { runNode } from './dockerRunner';
import { emitStepEvent, emitRunComplete } from '../socket/eventBus';
import type { DagSchema, DagNode, RunContext } from '../dag/types';
import type { PrismaClient } from '../generated/tenant-client';

// Global concurrency cap: max 5 containers running at any one time
const limit = pLimit(5);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runNodeWithRetry(
  runId: string,
  node: DagNode,
  edges: DagSchema['edges'],
  runContext: RunContext,
  tenantDb: PrismaClient
): Promise<Record<string, unknown>> {
  const maxAttempts = (node.retries ?? 0) + 1;
  const baseDelay = node.retryDelayMs ?? 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Mark as RUNNING (or RETRYING after first attempt)
    const status = attempt === 0 ? 'RUNNING' : 'RETRYING';

    await tenantDb.stepRun.updateMany({
      where: { runId, stepId: node.id },
      data: { status, attempts: attempt + 1, startedAt: attempt === 0 ? new Date() : undefined },
    });

    emitStepEvent({ runId, stepId: node.id, status });

    const mergedInput = mergeUpstreamOutputs(node.id, edges, runContext);
    const nodeRuntime = interpolateDagNode(node, mergedInput);
    const env = resolveInputs(node.inputs, runContext);

    const result = await runNode(nodeRuntime, env, { mergedInput });
    let outputs: Record<string, unknown>;

    if (node.type === 'DELAY') {
      outputs = mergedInput;
    } else if (node.type === 'HTTP_CALL') {
      outputs = parseHttpCallOutputs(result.logs, node.outputs);
    } else {
      outputs = parseNodeOutputs(result.logs, node.outputs);
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

      return outputs;
    }

    // Failed attempt — keep `logs` as raw container output (stdout/stderr)
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

      throw new Error(`Node "${node.id}" failed after ${maxAttempts} attempt(s). Exit code: ${result.exitCode}`);
    }

    // Exponential backoff before next retry
    const delay = baseDelay * Math.pow(2, attempt);
    console.log(`[engine] Node "${node.id}" failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`);
    await sleep(delay);
  }

  // Should never reach here
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
// PUBLIC: run a full workflow
// ─────────────────────────────────────────────

export async function runWorkflow(
  runId: string,
  definition: DagSchema,
  tenantDb: PrismaClient
): Promise<void> {
  const startTime = Date.now();

  try {
    // Validate and get topological levels
    const validation = validateDag(definition);
    if (!validation.valid) {
      await tenantDb.workflowRun.update({
        where: { id: runId },
        data: { status: 'FAILED', endedAt: new Date() },
      });
      emitRunComplete({ runId, status: 'FAILED', durationMs: Date.now() - startTime });
      return;
    }

    // Mark run as RUNNING
    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // Create initial StepRun records for all nodes
    await tenantDb.stepRun.createMany({
      data: definition.nodes.map((node) => ({
        runId,
        stepId: node.id,
        status: 'PENDING' as const,
      })),
    });

    // Track which node IDs should be skipped (false CONDITION branches)
    const skippedNodeIds = new Set<string>();
    const runContext: RunContext = {};

    for (const level of validation.levels) {
      // Execute all nodes in this level concurrently (up to global limit)
      await Promise.all(
        level.map((node) =>
          limit(async () => {
            // Skip nodes on a pruned branch
            if (skippedNodeIds.has(node.id)) {
              await tenantDb.stepRun.updateMany({
                where: { runId, stepId: node.id },
                data: { status: 'SUCCESS', logs: '[skipped — inactive branch]', endedAt: new Date() },
              });
              return;
            }

            const outputs = await runNodeWithRetry(runId, node, definition.edges, runContext, tenantDb);
            runContext[node.id] = outputs;

            // If CONDITION: figure out which downstream branch to skip
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
    }

    const durationMs = Date.now() - startTime;
    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: { status: 'SUCCESS', endedAt: new Date(), duration: durationMs },
    });

    emitRunComplete({ runId, status: 'SUCCESS', durationMs });
    console.log(`[engine] Run ${runId} completed successfully in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    await tenantDb.workflowRun.update({
      where: { id: runId },
      data: { status: 'FAILED', endedAt: new Date(), duration: durationMs },
    });

    emitRunComplete({ runId, status: 'FAILED', durationMs });
    console.error(`[engine] Run ${runId} failed: ${message}`);
  }
}
