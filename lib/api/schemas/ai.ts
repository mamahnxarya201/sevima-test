import { z } from 'zod';

const aiChatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

export const aiWorkflowFromChatBodySchema = z
  .object({
    messages: z.array(aiChatMessageSchema).min(1).max(30),
    workflowName: z.string().trim().min(1).max(500).optional(),
    currentDag: z.unknown().optional(),
  })
  .strict();

export type AiWorkflowFromChatBody = z.infer<typeof aiWorkflowFromChatBodySchema>;
