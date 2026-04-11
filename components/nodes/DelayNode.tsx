import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MaterialIcon } from '../ui/MaterialIcon';

export const DelayNode = ({ data, selected }: any) => {
  const status = data?.status;
  
  let ringClass = selected ? 'ring-2 ring-blue-600 shadow-md shadow-blue-200/50' : 'ring-1 ring-stone-200 shadow-sm hover:ring-2 hover:ring-blue-600';
  let barClass = 'bg-blue-600';
  let iconBgClass = 'bg-stone-100 text-stone-500';
  
  if (status === 'failed') {
    ringClass = selected ? 'ring-2 ring-red-600 shadow-md shadow-red-200/50' : 'ring-[1.5px] ring-red-300 shadow-sm hover:ring-red-400';
    barClass = 'bg-red-400';
    iconBgClass = 'bg-red-100 text-red-700';
  } else if (status === 'success') {
    ringClass = selected ? 'ring-2 ring-emerald-600 shadow-md shadow-emerald-200/50' : 'ring-[1.5px] ring-emerald-300 shadow-sm hover:ring-emerald-400';
    barClass = 'bg-emerald-400';
    iconBgClass = 'bg-emerald-100 text-emerald-700';
  } else if (status === 'running') {
    ringClass = selected ? 'ring-2 ring-blue-600 shadow-md shadow-blue-200/50' : 'ring-[1.5px] ring-blue-300 shadow-sm animate-pulse';
  }

  return (
    <div className={`relative w-64 bg-white rounded-2xl overflow-hidden transition-all duration-300 group ${ringClass}`}>
      <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
      <div className={`h-1 transition-colors ${barClass}`}></div>
      <div className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${iconBgClass}`}>
          <MaterialIcon icon="timer" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-stone-800">Delay Execution</h3>
          <p className="text-xs text-stone-500">5 Minutes</p>
        </div>
      </div>
      {status === 'failed' && (
        <div className="mx-4 mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-[11px] leading-tight flex gap-2">
           <span className="font-semibold text-red-800">Error:</span> {data?.error || "Timeout constraint exceeded."}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
    </div>
  );
};
