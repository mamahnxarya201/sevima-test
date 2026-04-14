'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { nodesAtom } from '@/store/workflowStore';
import type { ScriptRuntime } from '@/lib/dag/types';
import { MaterialIcon } from '../ui/MaterialIcon';

const DEFAULT_SCRIPT = `console.log(JSON.stringify({ ok: true }));`;

const ScriptEditorModal = ({
  isOpen,
  onClose,
  initialCode,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialCode: string;
  onSave: (code: string) => void;
}) => {
  const [code, setCode] = useState(initialCode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCode(initialCode);
    }
  }, [isOpen, initialCode]);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  if (!isOpen) return null;

  const lineCount = code.split('\n').length;
  const lines = Array.from({ length: Math.max(lineCount, 10) }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-[100] flex animate-in items-center justify-center bg-stone-900/30 p-8 backdrop-blur-sm fade-in duration-200">
      <div className="flex h-[80vh] w-full max-w-4xl animate-in flex-col overflow-hidden rounded-[1.5rem] border border-[#afb3ac]/20 bg-[#fafaf5] shadow-2xl zoom-in-95 duration-200">
        <div className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0e4dc] text-[#3a6095]">
              <MaterialIcon icon="terminal" className="text-lg" />
            </div>
            <h2 className="font-['Manrope'] text-[16px] font-bold text-[#2f342e]">Edit Script</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-bold text-[#afb3ac] transition-colors hover:text-[#2f342e]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(code);
                onClose();
              }}
              className="rounded-xl bg-[#3a6095] px-5 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#2c4c77] active:bg-[#264060]"
            >
              Save Changes
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 overflow-hidden bg-[#2f342e]">
          <div
            ref={lineNumbersRef}
            className="w-12 flex-shrink-0 select-none overflow-hidden bg-[#252924] py-6 pr-3 text-right font-mono text-[13px] leading-[1.6] text-[#afb3ac]/50"
          >
            {lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 resize-none whitespace-pre bg-transparent p-6 font-mono text-[13px] leading-[1.6] text-[#fafaf5] outline-none"
          />
        </div>
      </div>
    </div>
  );
};

export const ScriptNodeForm = ({ nodeId }: { nodeId: string }) => {
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const scriptCode = (data.script as string) || DEFAULT_SCRIPT;
  const runtime = ((data.runtime as ScriptRuntime) || 'node') as ScriptRuntime;

  const patchData = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [nodeId, setNodes]
  );

  return (
    <>
      <div className="flex w-full flex-col gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Runtime</span>
        <select
          value={runtime}
          onChange={(e) => patchData({ runtime: e.target.value as ScriptRuntime })}
          className="w-full cursor-pointer rounded-xl border-none bg-[#f3f4ee] px-4 py-3 text-[13px] font-bold text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
        >
          <option value="node">Node</option>
          <option value="python">Python</option>
          <option value="sh">Shell</option>
        </select>
      </div>

      <p className="text-[11px] leading-relaxed text-[#2f342e]/75">
        Reference upstream fields in the script as text templates:{' '}
        <code className="rounded bg-[#edefe8] px-1 font-mono text-[10px] text-[#3a6095]">input.statusCode</code>,{' '}
        <code className="rounded bg-[#edefe8] px-1 font-mono text-[10px] text-[#3a6095]">input.body</code> (substituted before run).
      </p>

      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Script Content</span>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#3a6095] transition-colors hover:text-[#2c4c77]"
          >
            See more <MaterialIcon icon="open_in_new" className="text-[12px]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="group relative w-full cursor-pointer overflow-hidden rounded-[1.25rem] bg-[#2f342e] p-4 text-left font-mono text-[13px] leading-relaxed text-[#fafaf5] shadow-inner transition-all hover:ring-2 hover:ring-[#3a6095]/50"
        >
          <div className="line-clamp-4 whitespace-pre-wrap break-all opacity-70 transition-opacity group-hover:opacity-100">
            {scriptCode}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#2f342e] to-transparent" />
        </button>
      </div>

      <ScriptEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialCode={scriptCode}
        onSave={(newCode) => patchData({ script: newCode })}
      />
    </>
  );
};
