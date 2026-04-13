/**
 * lib/socket/eventBus.ts
 *
 * In-process EventEmitter that connects the execution engine to WebSocket clients.
 * The execution engine emits events here; next-ws route handlers subscribe per-client.
 *
 * Events:
 *   `step:<runId>`        → StepEvent  (per node status update)
 *   `complete:<runId>`    → RunCompleteEvent
 */

import { EventEmitter } from 'events';
import type { StepEvent, RunCompleteEvent } from '../dag/types';

class RunEventBus extends EventEmitter {}

export const runEventBus = new RunEventBus();
// Allow many concurrent run subscribers without Node.js warning
runEventBus.setMaxListeners(200);

export function emitStepEvent(event: StepEvent): void {
  runEventBus.emit(`step:${event.runId}`, event);
}

export function emitRunComplete(event: RunCompleteEvent): void {
  runEventBus.emit(`complete:${event.runId}`, event);
}

export function onStepEvent(runId: string, handler: (event: StepEvent) => void): () => void {
  runEventBus.on(`step:${runId}`, handler);
  return () => runEventBus.off(`step:${runId}`, handler);
}

export function onRunComplete(runId: string, handler: (event: RunCompleteEvent) => void): () => void {
  runEventBus.on(`complete:${runId}`, handler);
  return () => runEventBus.off(`complete:${runId}`, handler);
}
