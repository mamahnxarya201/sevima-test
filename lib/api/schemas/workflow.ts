import { z } from 'zod';

/** Path segments that are UUIDs (workflow id, run id, etc.) */
export const uuidParamSchema = z.string().uuid('Invalid id');

export const workflowIdParamSchema = uuidParamSchema;
export const runIdParamSchema = uuidParamSchema;

export const workflowListQuerySchema = z
  .object({
    search: z.string().max(500).optional(),
    sort: z.enum(['name', 'updated']).default('updated'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const createWorkflowBodySchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    description: z.union([z.string().max(5000), z.null()]).optional(),
    definition: z.unknown().optional(),
    editorState: z.unknown().optional(),
  })
  .strict();

export const patchWorkflowBodySchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    description: z.union([z.string().max(5000), z.null()]).optional(),
    definition: z.unknown().optional(),
    editorState: z.unknown().optional(),
    /** When true with definition, create a new WorkflowVersion row (immutable checkpoint). When false/omitted, update the latest version in place (draft autosave). */
    checkpoint: z.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' })
  .refine((o) => !o.checkpoint || o.definition !== undefined, {
    message: 'checkpoint requires definition',
    path: ['checkpoint'],
  });

export const workflowRunsListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;
export type WorkflowRunsListQuery = z.infer<typeof workflowRunsListQuerySchema>;
export type CreateWorkflowBody = z.infer<typeof createWorkflowBodySchema>;
export type PatchWorkflowBody = z.infer<typeof patchWorkflowBodySchema>;
