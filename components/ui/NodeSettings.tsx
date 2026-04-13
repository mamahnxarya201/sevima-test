'use client';

import React from 'react';
import { MaterialIcon } from './MaterialIcon';
import { HttpNodeForm } from '../nodes/HttpNodeForm';
import { ConditionNodeForm } from '../nodes/ConditionNodeForm';
import { DelayNodeForm } from '../nodes/DelayNodeForm';
import { ScriptNodeForm } from '../nodes/ScriptNodeForm';

export const NodeSettings = ({ nodeId, nodeType, onClose }: { nodeId: string, nodeType: string, onClose: () => void }) => {
  const nodeTypeLabels: Record<string, string> = {
    http: 'Fetch Data',
    script: 'Script Execution',
    condition: 'Filter Path',
    delay: 'Delay Execution'
  };

  const nodeTypeIcons: Record<string, string> = {
    http: 'cloud_sync',
    script: 'terminal',
    condition: 'fork_right',
    delay: 'timer'
  };

  const label = nodeTypeLabels[nodeType] || nodeType;
  const icon = nodeTypeIcons[nodeType] || 'settings';

  return (
    <div className="w-[400px] h-full bg-[#fafaf5] flex flex-col shadow-[-12px_0_40px_rgba(47,52,46,0.06)] z-10 border-l border-[#afb3ac]/15">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <h2 className="text-[18px] font-bold text-[#2f342e] font-['Manrope']">Node Settings</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#edefe8] text-[#afb3ac] hover:text-[#2f342e] transition-colors"
        >
          <MaterialIcon icon="close" className="text-lg" />
        </button>
      </div>

      {/* Scrollable Form Area (Vertical Only) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 flex flex-col w-full">
        {/* Selected Node Card */}
        <div className="w-full bg-[#f3f4ee] rounded-[1.25rem] p-4 flex flex-col gap-3 mb-6 shrink-0">
          <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Selected Node</span>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-[#e0e4dc] flex items-center justify-center text-[#3a6095]">
              <MaterialIcon icon={icon} className="text-xl" />
            </div>
            <span className="text-[15px] font-bold text-[#2f342e] truncate">{label}</span>
          </div>
        </div>

        {/* Dynamic Form Area */}
        <div className="flex-1 flex flex-col gap-6 w-full">
          {nodeType === 'script' && <ScriptNodeForm />}
          {nodeType === 'http' && <HttpNodeForm />}
          {nodeType === 'condition' && <ConditionNodeForm />}
          {nodeType === 'delay' && <DelayNodeForm />}

          {/* Toggles (Shared across all nodes) */}
          <div className="flex flex-col gap-4 mt-2 w-full">
            <div className="flex items-center justify-between w-full">
              <span className="text-[13px] font-semibold text-[#2f342e]/80">Retry on failure</span>
              <div className="w-11 h-6 shrink-0 bg-[#3a6095] rounded-full relative cursor-pointer shadow-inner">
                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
              </div>
            </div>
            <div className="flex items-center justify-between w-full">
              <span className="text-[13px] font-semibold text-[#afb3ac]">Stop on error</span>
              <div className="w-11 h-6 shrink-0 bg-[#e0e4dc] rounded-full relative cursor-pointer shadow-inner">
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 mt-8 shrink-0 w-full">
          <button className="w-full py-3.5 bg-gradient-to-br from-[#3a6095] to-[#4a70a5] hover:from-[#2c4c77] hover:to-[#3a6095] text-white rounded-[1rem] text-[13px] font-bold shadow-md transition-all flex items-center justify-center gap-2">
            <MaterialIcon icon="save" className="text-[16px]" />
            Save Node
          </button>
          <button className="w-full py-3.5 bg-[#edefe8] hover:bg-[#e0e4dc] text-[#2f342e] rounded-[1rem] text-[13px] font-bold transition-all flex items-center justify-center gap-2">
            <MaterialIcon icon="play_arrow" className="text-[16px]" />
            Run Test
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#afb3ac]/15 flex items-center justify-between bg-[#fafaf5] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span className="text-[11px] font-bold text-[#2f342e]">Auto-saving...</span>
        </div>
        <span className="text-[11px] font-semibold text-[#afb3ac]">V2.4.0</span>
      </div>
    </div>
  );
};
