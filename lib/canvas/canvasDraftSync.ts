/**
 * Declarative list of Jotai-backed fields snapshotted into scoped canvas localStorage
 * (`sevima.canvas.v1.<tenantId>.<workflowId>`). Wiring lives in `useCanvasDraftPersistence`.
 *
 * When adding a field: extend `CanvasDraftPayload`, `parseCanvasDraft` / `saveCanvasDraft`,
 * subscribe in the hook, and apply on canvas load.
 */
export type CanvasDraftSyncedField = 'nodes' | 'edges' | 'viewport' | 'workflowTitle';
