'use client';

import React, { useCallback } from 'react';
import { useAtom } from 'jotai';
import { nodesAtom } from '@/store/workflowStore';
import { MaterialIcon } from './MaterialIcon';
import { HttpNodeForm } from '../nodes/HttpNodeForm';
import { ConditionNodeForm } from '../nodes/ConditionNodeForm';
import { DelayNodeForm } from '../nodes/DelayNodeForm';
import { ScriptNodeForm } from '../nodes/ScriptNodeForm';

export const NodeSettings = ({
  nodeId,
  nodeType,
  onClose,
}: {
  nodeId: string;
  nodeType: string;
  onClose: () => void;
}) => {
  const [nodes, setNodes] = useAtom(nodesAtom);

  const node = nodes.find((n) => n.id === nodeId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const retries = typeof data.retries === 'number' ? data.retries : 2;
  const retryOnFailure = retries > 0;
  const stopOnError = Boolean(data.stopOnError);

  const patchData = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [nodeId, setNodes]
  );

  const nodeTypeLabels: Record<string, string> = {
    http: 'Fetch User Data',
    script: 'Post-Process',
    condition: 'Check Subscription',
    delay: 'Delay Execution',
  };

  const nodeTypeIcons: Record<string, string> = {
    http: 'cloud_sync',
    script: 'terminal',
    condition: 'fork_right',
    delay: 'timer',
  };

  const nodeTypeDescriptions: Record<string, string> = {
    http: 'GET request to Auth0',
    script: 'Transforming payload...',
    condition: "plan_type == 'enterprise'",
    delay: '5 Minutes',
  };

  const label = nodeTypeLabels[nodeType] || nodeType;
  const defaultDesc = nodeTypeDescriptions[nodeType] || '';
  const icon = nodeTypeIcons[nodeType] || 'settings';

  const title = typeof data.title === 'string' ? data.title : label;
  const description = typeof data.description === 'string' ? data.description : defaultDesc;

  return (
    <div className="z-10 flex h-full w-[400px] flex-col border-l border-[#afb3ac]/15 bg-[#fafaf5] shadow-[-12px_0_40px_rgba(47,52,46,0.06)]">
      <div className="flex shrink-0 items-center justify-between px-6 py-5">
        <h2 className="font-['Manrope'] text-[18px] font-bold text-[#2f342e]">Node Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#afb3ac] transition-colors hover:bg-[#edefe8] hover:text-[#2f342e]"
        >
          <MaterialIcon icon="close" className="text-lg" />
        </button>
      </div>

      <div className="flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 pb-6">
        <div className="mb-6 flex w-full shrink-0 flex-col gap-3 rounded-[1.25rem] bg-[#f3f4ee] p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#afb3ac]">Selected Node</span>
          <div className="flex items-start gap-3"> 
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e0e4dc] text-[#3a6095]">
              <MaterialIcon icon={icon} className="text-xl" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                type="text"
                value={title}
                onChange={(e) => patchData({ title: e.target.value })}
                placeholder="Node Title"
                className="w-full bg-transparent text-[15px] font-bold text-[#2f342e] outline-none placeholder:text-[#afb3ac]"
              />
              <textarea
                value={description}
                onChange={(e) => patchData({ description: e.target.value })}
                placeholder="Add a description..."
                className="w-full resize-none bg-transparent text-[12px] text-[#2f342e]/70 outline-none placeholder:text-[#afb3ac]"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-6">
          {nodeType === 'script' && <ScriptNodeForm nodeId={nodeId} />}
          {nodeType === 'http' && <HttpNodeForm nodeId={nodeId} />}
          {nodeType === 'condition' && <ConditionNodeForm nodeId={nodeId} />}
          {nodeType === 'delay' && <DelayNodeForm nodeId={nodeId} />}

          <div className="mt-2 flex w-full flex-col gap-4">
            <div className="flex w-full items-center justify-between">
              <span
                className={`text-[13px] font-semibold transition-colors ${retryOnFailure ? 'text-[#2f342e]/80' : 'text-[#afb3ac]'}`}
              >
                Retry on failure
              </span>
              <button
                type="button"
                onClick={() => patchData({ retries: retryOnFailure ? 0 : 2 })}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full shadow-inner transition-colors duration-200 ${retryOnFailure ? 'bg-[#3a6095]' : 'bg-[#e0e4dc]'}`}
                aria-pressed={retryOnFailure}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200 ${retryOnFailure ? 'right-1' : 'left-1'}`}
                />
              </button>
            </div>
            <div className="flex w-full items-center justify-between">
              <span
                className={`text-[13px] font-semibold transition-colors ${stopOnError ? 'text-[#2f342e]/80' : 'text-[#afb3ac]'}`}
              >
                Stop on error
              </span>
              <button
                type="button"
                onClick={() => patchData({ stopOnError: !stopOnError })}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full shadow-inner transition-colors duration-200 ${stopOnError ? 'bg-[#3a6095]' : 'bg-[#e0e4dc]'}`}
                aria-pressed={stopOnError}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200 ${stopOnError ? 'right-1' : 'left-1'}`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-[#afb3ac]/15 bg-[#fafaf5] px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-bold text-[#2f342e]">Changes sync to the graph — auto-saved to server when idle</span>
        </div>
        <span className="text-[11px] font-semibold text-[#afb3ac]">V2.4.0</span>
      </div>
    </div>
  );
};
