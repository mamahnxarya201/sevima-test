/**
 * POST /api/ai/workflow-from-chat
 *
 * Authenticated AI assistant route that turns chat input into DAG JSON.
 * Uses tenant JWT auth + RBAC; only editors/admins can mutate canvas content.
 */
import { NextRequest } from 'next/server';
import { resolveTenantContext, apiErrorResponse } from '@/lib/auth/tenantGuard';
import { requireEditorOrAbove } from '@/lib/auth/rbac';
import { enforceRateLimit, rateLimitConfig } from '@/lib/rateLimit/memory';
import { readJsonBody } from '@/lib/api/jsonBody';
import { aiWorkflowFromChatBodySchema } from '@/lib/api/schemas/ai';
import { generateWorkflowFromChat } from '@/lib/ai/geminiWorkflow';
import { validateDag } from '@/lib/dag/validator';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveTenantContext(request);
    requireEditorOrAbove(ctx.role);

    const cfg = rateLimitConfig();
    const aiLimit = Math.max(10, Math.floor(cfg.mutationMax / 2));
    enforceRateLimit(`ai:workflow:${ctx.userId}`, aiLimit, cfg.windowMs);

    const raw = await readJsonBody(request);
    const body = aiWorkflowFromChatBodySchema.parse(raw);

    const ai = await generateWorkflowFromChat({
      messages: body.messages,
      workflowName: body.workflowName,
      currentDag: body.currentDag,
    });

    if (ai.mode === 'DAG_READY' && ai.dag) {
      const validation = validateDag(ai.dag);
      if (!validation.valid) {
        return Response.json({
          mode: 'NEED_CLARIFICATION',
          assistantMessage:
            'I need a bit more detail before applying this workflow safely. Please clarify your intent.',
          dag: null,
          clarifyingQuestions: [
            'Should I keep your current workflow and only add new nodes, or replace it entirely?',
          ],
          warnings: [
            'Model output failed server-side DAG validation.',
            ...validation.errors.slice(0, 4),
          ],
        });
      }
    }

    return Response.json(ai);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
