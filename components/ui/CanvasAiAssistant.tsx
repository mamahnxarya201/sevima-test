'use client';

import React, { useMemo, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { authClient } from '@/lib/auth/auth-client';
import { exportCanvasToDag } from '@/lib/canvas/dagExporter';
import type { DagSchema } from '@/lib/dag/types';
import type { WorkflowSettings } from '@/lib/dag/workflowSettings';
import { MaterialIcon } from './MaterialIcon';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AiResponse = {
  mode: 'DAG_READY' | 'NEED_CLARIFICATION';
  assistantMessage: string;
  dag: DagSchema | null;
  clarifyingQuestions: string[];
  warnings: string[];
};

function newMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CanvasAiAssistant({
  workflowTitle,
  nodes,
  edges,
  workflowSettings,
  onApplyDag,
  compactTrigger = false,
}: {
  workflowTitle: string;
  nodes: Node[];
  edges: Edge[];
  workflowSettings: WorkflowSettings;
  onApplyDag: (dag: DagSchema) => void;
  compactTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: newMessageId(),
      role: 'assistant',
      content:
        'Describe your workflow in plain language. I can generate or modify the canvas graph for you.',
    },
  ]);
  const [latestWarnings, setLatestWarnings] = useState<string[]>([]);

  const currentDag = useMemo(
    () => exportCanvasToDag(workflowTitle || 'Untitled workflow', nodes, edges, workflowSettings),
    [workflowTitle, nodes, edges, workflowSettings]
  );

  const submit = async () => {
    const content = input.trim();
    if (!content || loading) return;

    const userMessage: UiMessage = {
      id: newMessageId(),
      role: 'user',
      content,
    };

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMessage]);
    setLatestWarnings([]);

    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token) {
        throw new Error('Please sign in again before using the AI assistant.');
      }

      const history = [...messages, userMessage]
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/ai/workflow-from-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          workflowName: workflowTitle || 'Untitled workflow',
          currentDag,
        }),
      });

      const data = (await response.json()) as AiResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate workflow from AI.');
      }

      if (Array.isArray(data.warnings)) {
        setLatestWarnings(data.warnings.slice(0, 3));
      }

      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'assistant',
          content: data.assistantMessage,
        },
      ]);

      if (data.mode === 'DAG_READY' && data.dag) {
        onApplyDag(data.dag);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'assistant',
          content: `I could not update the workflow right now: ${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={compactTrigger ? 'relative z-40' : 'absolute bottom-6 right-6 z-40'}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            compactTrigger
              ? 'p-2 rounded-lg flex items-center justify-center text-[#afb3ac] hover:text-[#2f342e] hover:bg-[#edefe8] transition-colors'
              : 'flex items-center gap-2 rounded-xl bg-[#3a6095] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(58,96,149,0.35)] transition-colors hover:bg-[#2c4c77]'
          }
          title="AI Assistant"
        >
          <MaterialIcon icon="smart_toy" className="text-base" />
          {!compactTrigger && 'AI Assistant'}
        </button>
      )}

      {open && (
        <div
          className={`flex h-[470px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[#afb3ac]/20 bg-white shadow-[0_20px_50px_rgba(47,52,46,0.15)] ${
            compactTrigger ? 'absolute bottom-full right-0 mb-3' : ''
          }`}
        >
          <div className="flex items-center justify-between border-b border-[#afb3ac]/15 bg-[#f3f4ee] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0e4dc] text-[#3a6095]">
                <MaterialIcon icon="smart_toy" className="text-lg" />
              </div>
              <span className="text-sm font-bold text-[#2f342e]">Canvas AI</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-[#afb3ac] transition-colors hover:bg-white hover:text-[#2f342e]"
            >
              <MaterialIcon icon="close" className="text-lg" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#fafaf5] p-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  message.role === 'user'
                    ? 'ml-auto bg-[#3a6095] text-white'
                    : 'bg-white text-[#2f342e] shadow-sm'
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading && (
              <div className="max-w-[85%] rounded-2xl bg-white px-3 py-2 text-[13px] text-[#afb3ac] shadow-sm">
                Thinking...
              </div>
            )}
          </div>

          {latestWarnings.length > 0 && (
            <div className="border-t border-[#f1d7aa] bg-[#fff8eb] px-3 py-2 text-[11px] text-[#8a6a3c]">
              {latestWarnings.join(' ')}
            </div>
          )}

          <div className="border-t border-[#afb3ac]/15 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                placeholder="Describe your workflow..."
                className="min-h-[44px] flex-1 resize-none rounded-xl border-none bg-[#f3f4ee] px-3 py-2 text-[13px] text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={loading || input.trim().length === 0}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3a6095] text-white transition-colors hover:bg-[#2c4c77] disabled:cursor-not-allowed disabled:opacity-50"
                title="Send"
              >
                <MaterialIcon icon="send" className="text-lg" />
              </button>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-[#afb3ac]">
              Generated DAG JSON stays internal and is not shown in chat.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
