import { z } from 'zod';

/** Client → server messages on `/api/ws/workflows/:id` */
export const wsWorkflowClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sync'),
    hash: z.string().max(256).optional(),
    payload: z
      .object({
        name: z.string().min(1).max(500),
        definition: z.unknown(),
      })
      .strict(),
  }),
]);

export type WsWorkflowClientMessage = z.infer<typeof wsWorkflowClientMessageSchema>;
