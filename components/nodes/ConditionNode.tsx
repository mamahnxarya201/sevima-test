import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MaterialIcon } from '../ui/MaterialIcon';

export const ConditionNode = ({ data, selected }: any) => {
  const status = data?.status;
  
  let ringClass = selected ? 'ring-2 ring-blue-600 shadow-md shadow-blue-200/50' : 'ring-2 ring-blue-600/20 shadow-sm hover:ring-blue-600/40';
  let headerClass = 'bg-blue-100';
  let iconBgClass = 'bg-blue-50 text-blue-600';
  let headerTextClass = 'text-blue-800';
  
  if (status === 'failed') {
    ringClass = selected ? 'ring-2 ring-red-600 shadow-md shadow-red-200/50' : 'ring-[1.5px] ring-red-300 shadow-sm hover:ring-red-400';
    headerClass = 'bg-[#ebebe6]';
    iconBgClass = 'bg-red-100 text-red-700';
    headerTextClass = 'text-stone-500';
  } else if (status === 'success') {
    ringClass = selected ? 'ring-2 ring-emerald-600 shadow-md shadow-emerald-200/50' : 'ring-[1.5px] ring-emerald-300 shadow-sm hover:ring-emerald-400';
    headerClass = 'bg-emerald-50/50';
    iconBgClass = 'bg-emerald-100 text-emerald-700';
  } else if (status === 'running') {
    ringClass = selected ? 'ring-2 ring-blue-600 shadow-md shadow-blue-200/50' : 'ring-[1.5px] ring-blue-400 shadow-sm animate-pulse';
  }

  return (
    <div className={`relative w-80 bg-white rounded-2xl overflow-hidden transition-all duration-300 ${ringClass}`}>
      <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
      <div className={`h-10 px-4 flex items-center justify-between transition-colors ${headerClass}`}>
        <div className="flex items-center gap-2">
          {status === 'failed' && <MaterialIcon icon="error" className="text-red-700 text-[14px]" />}
          <span className={`text-[10px] font-bold uppercase tracking-widest ${headerTextClass}`}>Logic Control</span>
        </div>
        {/* <MaterialIcon icon="alt_route" className={`text-sm ${headerTextClass}`} /> */}
      </div>
      <div className="p-5 pb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${iconBgClass}`}>
            <MaterialIcon icon="call_split" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-800">Check Subscription</h3>
            <p className="text-xs text-stone-500">plan_type == 'enterprise'</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-stone-100">
          <div className="text-center p-2 rounded-lg bg-stone-50">
            <span className="text-[10px] font-bold text-blue-600 block mb-1">TRUE</span>
          </div>
          <div className="text-center p-2 rounded-lg bg-stone-50">
            <span className="text-[10px] font-bold text-stone-400 block mb-1">FALSE</span>
          </div>
        </div>
      </div>
      {status === 'failed' && (
        <div className="mx-4 mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-[11px] leading-tight flex gap-2">
           <span className="font-semibold text-red-800">Error:</span> {data?.error || "Property 'plan_type' missing in input object."}
        </div>
      )}
      <Handle type="source" id="true" position={Position.Bottom} style={{ left: '30%' }} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
      <Handle type="source" id="false" position={Position.Bottom} style={{ left: '70%' }} className="w-4 h-4 !bg-white border-[3px] !border-stone-400 rounded-full shadow-sm" />
    </div>
  );
};
