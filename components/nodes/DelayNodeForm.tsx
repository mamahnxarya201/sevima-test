'use client';

import React, { useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { nodesAtom } from '@/store/workflowStore';

/** Parse `sleep <seconds>` (total seconds) for Alpine/busybox `sleep`. */
function parseDelayScript(script: string | undefined): { amount: number; unit: 's' | 'm' | 'h' } {
  const s = script?.trim() ?? '';
  const m = s.match(/^sleep\s+(\d+)$/i);
  if (m) {
    const sec = parseInt(m[1], 10);
    if (sec >= 3600 && sec % 3600 === 0) return { amount: sec / 3600, unit: 'h' };
    if (sec >= 60 && sec % 60 === 0) return { amount: sec / 60, unit: 'm' };
    return { amount: sec, unit: 's' };
  }
  return { amount: 5, unit: 's' };
}

function buildSleepScript(amount: number, unit: 's' | 'm' | 'h'): string {
  let sec = amount;
  if (unit === 'm') sec = amount * 60;
  if (unit === 'h') sec = amount * 3600;
  return `sleep ${sec}`;
}

export const DelayNodeForm = ({ nodeId }: { nodeId: string }) => {
  const [nodes, setNodes] = useAtom(nodesAtom);

  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const script = data.script as string | undefined;

  const { amount, unit } = useMemo(() => parseDelayScript(script), [script]);

  const patchScript = useCallback(
    (nextAmount: number, nextUnit: 's' | 'm' | 'h') => {
      const next = buildSleepScript(nextAmount, nextUnit);
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, script: next } } : n))
      );
    },
    [nodeId, setNodes]
  );

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex w-full flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Wait Duration</span>
        <div className="flex w-full gap-2">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => patchScript(Math.max(1, parseInt(e.target.value, 10) || 1), unit)}
            className="min-w-0 flex-1 rounded-xl border-none bg-[#f3f4ee] px-3 py-2.5 text-[13px] text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
          />
          <select
            value={unit}
            onChange={(e) => patchScript(amount, e.target.value as 's' | 'm' | 'h')}
            className="min-w-0 flex-1 cursor-pointer rounded-xl border-none bg-[#f3f4ee] px-3 py-2.5 text-[13px] font-bold text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
          >
            <option value="s">Seconds</option>
            <option value="m">Minutes</option>
            <option value="h">Hours</option>
          </select>
        </div>
      </div>
    </div>
  );
};
