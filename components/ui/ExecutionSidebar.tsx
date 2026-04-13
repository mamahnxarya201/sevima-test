'use client';

import React from 'react';
import { useAtomValue } from 'jotai';
import { nodeExecutionFamily } from '../../store/executionStore';
import { MaterialIcon } from './MaterialIcon';

const nodeTypeLabels: Record<string, string> = {
  trigger: 'HTTP Webhook',
  http: 'Fetch Data',
  script: 'Process Data',
  condition: 'Filter Path',
  delay: 'Delay Execution'
};

const TimelineItem = ({ nodeId, nodeType, isLast }: { nodeId: string, nodeType: string, isLast: boolean }) => {
  const state = useAtomValue(nodeExecutionFamily(nodeId));
  
  // Determine colors based on status
  let dotColor = 'bg-[#afb3ac]';
  let lineColor = 'bg-[#edefe8]';
  let statusText = 'Pending';
  let statusColor = 'text-[#afb3ac]';
  let subtitle = 'Waiting for predecessor...';
  
  if (state.status === 'success') {
    dotColor = 'bg-emerald-500';
    lineColor = 'bg-emerald-500';
    statusText = 'Completed in 12ms';
    statusColor = 'text-emerald-600';
    subtitle = state.logs || 'Payload received successfully (2.1kb)';
  } else if (state.status === 'running') {
    dotColor = 'bg-[#3a6095] ring-4 ring-[#9ec2fe]/30';
    lineColor = 'bg-[#edefe8]';
    statusText = 'Running...';
    statusColor = 'text-[#3a6095]';
    subtitle = state.logs || 'Mapping 42 array items...';
  } else if (state.status === 'failed') {
    dotColor = 'bg-[#a83836]';
    lineColor = 'bg-[#edefe8]';
    statusText = 'Failed';
    statusColor = 'text-[#a83836]';
    subtitle = state.error || 'Execution failed';
  }
  
  const label = nodeTypeLabels[nodeType] || nodeType;

  return (
    <div className="relative pl-8 pb-8">
      {/* Vertical Line */}
      {!isLast && (
        <div className={`absolute left-[11px] top-4 bottom-0 w-[2px] ${lineColor} rounded-full`} />
      )}
      
      {/* Dot */}
      <div className={`absolute left-[7px] top-1.5 w-2.5 h-2.5 rounded-full ${dotColor}`} />
      
      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-[#2f342e]">{label}</span>
          <span className="text-[11px] font-medium text-[#afb3ac]">
            {state.status === 'success' ? '14:02:11' : ''}
          </span>
        </div>
        <span className="text-[12px] text-[#2f342e]/70 truncate">{subtitle}</span>
        
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-[12px] font-semibold ${statusColor}`}>
            {statusText}
          </span>
        </div>
        
        {/* Progress bar if running */}
        {state.status === 'running' && (
          <div className="mt-2 h-1.5 w-full bg-[#edefe8] rounded-full overflow-hidden">
            <div className="h-full bg-[#3a6095] w-2/3 rounded-full animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
};

export const ExecutionSidebar = ({ nodes, onClose }: { nodes: any[], onClose: () => void }) => {
  return (
    <div className="w-[400px] h-full bg-[#fafaf5] flex flex-col shadow-[-12px_0_40px_rgba(47,52,46,0.06)] z-10 border-l border-[#afb3ac]/15">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 bg-[#f3f4ee]">
        <div className="flex items-center gap-3">
          <MaterialIcon icon="list_alt" className="text-[#3a6095] text-xl" />
          <h2 className="text-[16px] font-bold text-[#2f342e] font-['Manrope']">Execution Logs</h2>
          <span className="px-2 py-1 bg-[#e0e4dc] text-[#2f342e] text-[9px] font-bold tracking-wider rounded uppercase">
            Real-Time
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#edefe8] text-[#afb3ac] hover:text-[#2f342e] transition-colors"
        >
          <MaterialIcon icon="close" className="text-lg" />
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col">
          {nodes.map((node, i) => (
            <TimelineItem 
              key={node.id} 
              nodeId={node.id} 
              nodeType={node.type} 
              isLast={i === nodes.length - 1} 
            />
          ))}
        </div>
        
        {/* Previous Run Section */}
        <div className="mt-8 pt-8 relative">
          {/* Subtle separator using background shift instead of line */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#f3f4ee] to-transparent opacity-50" />
          
          <h3 className="text-[11px] font-bold text-[#afb3ac] tracking-wider uppercase mb-5">Previous Run</h3>
          
          <div className="bg-[#fa746f]/10 rounded-[1.5rem] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-bold text-[#a83836] font-['Manrope']">Run #8421 (Failed)</span>
              <span className="text-[11px] font-medium text-[#a83836]/60">2m ago</span>
            </div>
            <p className="text-[13px] text-[#a83836]/80 leading-relaxed mb-4">
              Stopped at 'Filter Path' due to validation error.
            </p>
            <button className="text-[11px] font-bold text-[#a83836] uppercase tracking-wider hover:text-[#a83836]/70 transition-colors">
              View Debug Stack
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
