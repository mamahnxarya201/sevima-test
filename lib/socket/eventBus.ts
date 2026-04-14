/**
 * lib/socket/eventBus.ts
 *
 * In-process EventEmitter that connects the execution engine to WebSocket clients.
 * The execution engine emits events here; next-ws route handlers subscribe per-client.
 *
 * Events:
 *   `step:<runId>`         → StepEvent  (per node status update)
 *   `complete:<runId>`     → RunCompleteEvent
 *   `retry:<originalRunId>` → WorkflowRetryEvent (engine is retrying the workflow)
 */

import { EventEmitter } from 'events';
import type { StepEvent, RunCompleteEvent, WorkflowRetryEvent } from '../dag/types';

class RunEventBus extends EventEmitter {}

export const runEventBus = new RunEventBus();
runEventBus.setMaxListeners(200);

export function emitStepEvent(event: StepEvent): void {
  runEventBus.emit(`step:${event.runId}`, event);
  runEventBus.emit('step:any', event);
}

export function emitRunComplete(event: RunCompleteEvent): void {
  runEventBus.emit(`complete:${event.runId}`, event);
  runEventBus.emit('complete:any', event);
}

export function emitWorkflowRetry(event: WorkflowRetryEvent): void {
  runEventBus.emit(`retry:${event.originalRunId}`, event);
}

export function onStepEvent(runId: string, handler: (event: StepEvent) => void): () => void {
  runEventBus.on(`step:${runId}`, handler);
  return () => runEventBus.off(`step:${runId}`, handler);
}

export function onRunComplete(runId: string, handler: (event: RunCompleteEvent) => void): () => void {
  runEventBus.on(`complete:${runId}`, handler);
  return () => runEventBus.off(`complete:${runId}`, handler);
}

export function onWorkflowRetry(originalRunId: string, handler: (event: WorkflowRetryEvent) => void): () => void {
  runEventBus.on(`retry:${originalRunId}`, handler);
  return () => runEventBus.off(`retry:${originalRunId}`, handler);
}

export function onAnyStepEvent(handler: (event: StepEvent) => void): () => void {
  runEventBus.on('step:any', handler);
  return () => runEventBus.off('step:any', handler);
}

export function onAnyRunComplete(handler: (event: RunCompleteEvent) => void): () => void {
  runEventBus.on('complete:any', handler);
  return () => runEventBus.off('complete:any', handler);
}
