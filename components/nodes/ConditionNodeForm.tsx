'use client';

import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { nodesAtom } from '@/store/workflowStore';

const DEFAULT_CONDITION_SCRIPT = `console.log(JSON.stringify({ result: true }));`;

export const ConditionNodeForm = ({ nodeId }: { nodeId: string }) => {
  const [nodes, setNodes] = useAtom(nodesAtom);

  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const script = (data.script as string) || DEFAULT_CONDITION_SCRIPT;

  const patchScript = useCallback(
    (next: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, script: next } } : n))
      );
    },
    [nodeId, setNodes]
  );

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-[12px] leading-relaxed text-[#afb3ac]">
        Branching uses <code className="rounded bg-[#edefe8] px-1 text-[#2f342e]">result</code> in JSON
        printed to stdout. Edit the script below.
      </p>
      <div className="flex w-full flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Condition script</span>
        <textarea
          value={script}
          onChange={(e) => patchScript(e.target.value)}
          spellCheck={false}
          className="min-h-[120px] w-full resize-y rounded-[1.25rem] border-none bg-[#f3f4ee] p-4 font-mono text-[13px] text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
        />
      </div>
    </div>
  );
};
