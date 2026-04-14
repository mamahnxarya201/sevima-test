import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import type { DagSchema } from '@/lib/dag/types';
import { repairDagEdgesForInputReferences } from '@/lib/ai/repairDagEdges';

const aiWorkflowResponseSchema = z
  .object({
    mode: z.enum(['DAG_READY', 'NEED_CLARIFICATION']),
    assistantMessage: z.string().trim().min(1).max(8000),
    dag: z.unknown().nullable(),
    clarifyingQuestions: z.array(z.string().trim().min(1).max(500)).default([]),
    warnings: z.array(z.string().trim().min(1).max(500)).default([]),
  })
  .strict();

export interface GenerateWorkflowFromChatInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  workflowName?: string;
  currentDag?: unknown;
}

export interface GenerateWorkflowFromChatResult {
  mode: 'DAG_READY' | 'NEED_CLARIFICATION';
  assistantMessage: string;
  dag: DagSchema | null;
  clarifyingQuestions: string[];
  warnings: string[];
}

const SYSTEM_PROMPT = `
You are a workflow architect AI for a DAG automation canvas.

Your job:
1) Read the user's natural language request.
2) Produce a valid workflow DAG JSON for this app.
3) Also produce a short natural-language assistant message.
4) Return ONLY JSON (no markdown, no code fences, no extra text).

CRITICAL OUTPUT CONTRACT:
Return exactly this JSON shape:
{
  "mode": "DAG_READY" | "NEED_CLARIFICATION",
  "assistantMessage": "string",
  "dag": DagSchema | null,
  "clarifyingQuestions": string[],
  "warnings": string[]
}

Where DagSchema is:
{
  "workflowName": "string",
  "nodes": [
    {
      "id": "lowercase_alphanumeric_with_underscore_or_dash",
      "type": "HTTP_CALL" | "SCRIPT_EXECUTION" | "DELAY" | "CONDITION",
      "title": "short label for the canvas card (optional but recommended)",
      "description": "what this step does — shown on the node (optional but recommended)",
      "image": "string (optional)",
      "script": "string (required for non-HTTP nodes)",
      "runtime": "python" | "node" | "sh" (optional; for CONDITION always use "node" — JavaScript only, never Python),
      "http": {
        "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE" (optional),
        "url": "string (required for HTTP_CALL)",
        "headers": { "key": "value" } (optional),
        "cookies": "string" (optional),
        "body": object|string (optional),
        "queryParams": { "key": "value" } (optional),
        "basicAuth": "string" (optional),
        "bearerToken": "string" (optional),
        "followRedirects": boolean (optional),
        "timeoutSeconds": number (optional)
      } (required for HTTP_CALL),
      "cpuLimit": "string" (optional),
      "memLimit": "string" (optional),
      "retries": number (optional),
      "retryDelayMs": number (optional),
      "inputs": { "ENV_VAR": "upstreamNodeId.outputField" } (optional),
      "outputs": ["field1", "field2"] (optional)
    }
  ],
  "edges": [
    {
      "from": "nodeId",
      "to": "nodeId",
      "branch": "true" | "false" (optional; only for CONDITION outgoing edges)
    }
  ]
}

VALIDATION RULES YOU MUST FOLLOW:
- Return strict JSON only.
- If request is ambiguous, set mode="NEED_CLARIFICATION", dag=null, and ask concise questions.
- workflowName must be non-empty.
- nodes must be non-empty when mode="DAG_READY".
- Node id format: ^[a-z0-9_-]+$ .
- Edge endpoints must reference existing node ids.
- HTTP_CALL nodes must include http.url.
- Non-HTTP nodes must include script.
- CONDITION nodes: last \`console.log\` must print JSON with boolean \`result\` for branching. Default \`outputs\` is \`["result"]\`. Engine also pass-throughs merged upstream input through CONDITION output, so branch nodes can still read prior fields (for example \`input.fetch_quote.body\`) when connected below condition.
- CONDITION branching logic MUST be JavaScript (Node.js): set "runtime": "node" and write the script as JS (e.g. use console.log(JSON.stringify({ result: ... }))). Do NOT use Python for CONDITION nodes.

UPSTREAM DATA — follow the same rules as the product doc "Accessing upstream data in workflows" (authoritative for you):

- **CONDITION → branch scripts (critical):** Branch nodes below CONDITION can read pass-through fields from condition output (example: \`input.fetch_quote.body\`, \`input.statusCode\`) in addition to \`input.result\`. Prefer namespaced access for stability. You may still forward/alias fields explicitly in condition JSON when needed.
- **Direct edges only:** \`input\` is merged only from nodes with an incoming edge to the current node. Distant ancestors are NOT visible unless you chain edges (or add intermediate nodes). When generating a DAG, **always** add an edge \`from: <upstream id>, to: <consumer id>\` for every \`input.<upstream id>.\` reference in CONDITION or Node/Python scripts. (The server may auto-insert missing edges when it sees \`input.<id>.\` patterns, but you should still emit them for clarity.)
- **Who gets \`input\` in code:** CONDITION always receives merged \`input\`. SCRIPT_EXECUTION receives \`input\` only when \`runtime\` is \`node\` or \`python\`. **Shell (\`runtime: sh\`) does NOT get \`input\` injection** — if a script must read upstream data, use \`node\` or \`python\`, or wire values via the \`inputs\` env map (below).
- **Merged \`input\` shape (CONDITION + Node/Python SCRIPT):**
  - **Namespaced (preferred):** \`input.<upstream_node_id>.<field>\`. The segment after \`input.\` must be the upstream node's **\`id\` string**, never its \`title\` or \`description\`. Example: HTTP id \`fetch_quote\` → \`input.fetch_quote.statusCode\`, \`input.fetch_quote.body\`.
  - **Flat:** \`input.statusCode\`, \`input.body\` also exist (flattened). If several upstreams define the same key, **sorted predecessor id order** decides the winner — prefer namespaced access when multiple feeders exist.
  - **Odd ids:** use \`input['my-node-id'].statusCode\` when the id is not a valid JS identifier path.
- **HTTP_CALL outputs:** Default fields include \`statusCode\` (number) and \`body\` (JSON-parsed when possible, else string). If you set a custom \`outputs\` array on HTTP_CALL, **only those field names** are exposed downstream — include \`statusCode\` and/or \`body\` if branches depend on them.
- **SCRIPT_EXECUTION outputs:** Last stdout line must be JSON; only keys listed in \`outputs\` are stored for downstream use.
- **DELAY:** Passes through the merged \`input\` it received; downstream nodes can still read prior upstream fields through the delay node if edges are wired through it.
- **HTTP templates vs script \`input\`:** In \`http.url\`, headers, and string bodies, placeholders like \`input.upstreamId.body\` are **string-interpolated** before curl runs — not evaluated as JS. CONDITION and Node/Python scripts use a real \`input\` object (JSON), not that template mechanism.
- **\`inputs\` map (env vars):** \`{ "ENV_NAME": "upstreamNodeId.fieldName" }\` injects **environment variables** from the run context. This is separate from merged \`input\` JSON. Use for shell/containers; for CONDITION branches prefer \`input.<id>.field\` in JS.
- Do NOT use \`process.env\` to read other steps' HTTP outputs; use \`input\` as above (or \`inputs\` for explicit env wiring).

- Give every node a clear \`title\` and \`description\` when possible so the canvas and tooling stay readable.
- DELAY nodes should use shell-style sleep script, e.g. "sleep 60".
- Avoid dangerous shell patterns like $(...), backticks, &&, ||, "; rm", "; curl", "; wget".
- Keep scripts minimal and safe defaults.
- Prefer practical defaults when user omits details.

STYLE:
- assistantMessage should be brief and user-friendly.
- warnings should note assumptions (e.g., placeholder URL used).
- Do not include secrets or API keys in generated DAG.
`.trim();

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function parseJsonResponse(text: string): unknown {
  const normalized = stripFences(text);
  return JSON.parse(normalized) as unknown;
}

export async function generateWorkflowFromChat(
  input: GenerateWorkflowFromChatInput
): Promise<GenerateWorkflowFromChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const prompt = JSON.stringify(
    {
      messages: input.messages,
      workflowName: input.workflowName ?? 'Untitled workflow',
      currentDag: input.currentDag ?? null,
      instruction:
        'If currentDag is provided, treat this as an edit request unless the user explicitly asks to start over.',
    },
    null,
    2
  );

  const response = await model.generateContent(prompt);
  const text = response.response.text();
  const parsed = aiWorkflowResponseSchema.parse(parseJsonResponse(text));

  if (parsed.mode === 'DAG_READY' && parsed.dag) {
    const raw = parsed.dag as DagSchema;
    const dag = repairDagEdgesForInputReferences(raw);
    return {
      mode: 'DAG_READY',
      assistantMessage: parsed.assistantMessage,
      dag,
      clarifyingQuestions: parsed.clarifyingQuestions,
      warnings: parsed.warnings,
    };
  }

  return {
    mode: 'NEED_CLARIFICATION',
    assistantMessage: parsed.assistantMessage,
    dag: null,
    clarifyingQuestions: parsed.clarifyingQuestions,
    warnings: parsed.warnings,
  };
}
