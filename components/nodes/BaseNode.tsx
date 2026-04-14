import React from 'react';
import { useAtom } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { nodeExecutionFamily } from '../../store/executionStore';

export interface BaseNodeProps {
  nodeId: string;   // Required Jotai tie-in
  selected?: boolean;
  
  width?: string;
  baseRingClass?: string;
  defaultError?: string;
  
  showHeader?: boolean;
  headerTitle?: string;
  headerColorClass?: string;
  headerTextClass?: string;
  
  iconName?: string;
  iconBgClass?: string;
  title?: string;
  description?: string;
  
  topBarClass?: string; 
  hasSpinner?: boolean;
  
  children?: React.ReactNode;
  handles?: React.ReactNode;
}

export const BaseNode = ({
  nodeId,
  selected,
  width = 'w-72',
  baseRingClass = 'ring-1 ring-stone-200 shadow-sm hover:ring-2 hover:ring-blue-600',
  showHeader = true,
  headerTitle = 'Node',
  headerColorClass = 'bg-stone-100',
  headerTextClass = 'text-stone-500',
  iconName = 'widgets',
  iconBgClass = 'bg-stone-100 text-stone-500',
  title = 'Unknown Task',
  description = '...',
  defaultError,
  topBarClass,
  hasSpinner,
  children,
  handles
}: BaseNodeProps) => {
  // Directly subscribe to the ultra-fast Jotai memory context for Volatile stream statuses
  const [execState] = useAtom(nodeExecutionFamily(nodeId));
  const { status, error, isLoading } = execState;

  const isRunning = status === 'running' || status === 'retrying';

  // Status logic
  let ringClass = selected ? 'ring-2 ring-blue-600 shadow-md shadow-blue-200/50 z-10' : `${baseRingClass} z-0`;
  let finalHeaderClass = headerColorClass;
  let finalIconBgClass = iconBgClass;
  let finalHeaderTextClass = headerTextClass;
  let finalTopBarClass = topBarClass;

  if (status === 'failed') {
    ringClass = selected ? 'ring-2 ring-red-600 shadow-md shadow-red-200/50 z-10' : 'ring-[1.5px] ring-red-300 shadow-sm hover:ring-red-400 z-0';
    finalHeaderClass = 'bg-[#ebebe6]';
    finalIconBgClass = 'bg-red-100 text-red-700';
    finalHeaderTextClass = 'text-stone-500';
    if (topBarClass) finalTopBarClass = 'bg-red-400';
  } else if (status === 'success') {
    ringClass = selected ? 'ring-2 ring-emerald-600 shadow-md shadow-emerald-200/50 z-10' : 'ring-[1.5px] ring-emerald-300 shadow-sm hover:ring-emerald-400 z-0';
    finalHeaderClass = 'bg-emerald-50/50';
    finalIconBgClass = 'bg-emerald-100 text-emerald-700';
    if (topBarClass) finalTopBarClass = 'bg-emerald-400';
  } else if (isRunning) {
    ringClass = selected
      ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-300/70 z-10'
      : 'ring-2 ring-blue-400 shadow-md shadow-blue-200/80 z-0';
  }

  // Blur/Loading state
  if (isLoading) {
    return (
      <div className={`relative ${width} bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-200`}>
        {handles}
        <div className="filter blur-[3px] opacity-60 animate-pulse pointer-events-none select-none transition-all duration-700">
           {showHeader && (
             <div className="h-10 bg-stone-100 px-4 flex items-center">
               <div className="w-16 h-3 bg-stone-300 rounded"></div>
             </div>
           )}
           {topBarClass && <div className="h-1 bg-stone-200"></div>}
           <div className="p-5 flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-stone-200"></div>
             <div className="flex-1 space-y-2">
               <div className="h-4 bg-stone-200 rounded w-2/3"></div>
               <div className="h-3 bg-stone-200 rounded w-1/2"></div>
             </div>
           </div>
        </div>
      </div>
    );
  }

  const runningMotionClass = isRunning ? 'node-running-active' : '';

  return (
    <div
      className={`relative ${width} bg-white rounded-2xl overflow-hidden transition-all duration-300 group ${ringClass} ${runningMotionClass}`}
    >
      {handles}

      {isRunning && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-blue-400/40 motion-safe:animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
      )}

      {topBarClass && <div className={`h-1 transition-colors ${finalTopBarClass}`}></div>}
      
      {showHeader && (
        <div className={`h-10 px-4 flex items-center justify-between transition-colors ${finalHeaderClass}`}>
          <div className="flex items-center gap-2">
            {status === 'failed' && <MaterialIcon icon="error" className="text-red-700 text-[14px]" />}
            <span className={`text-[10px] font-bold uppercase tracking-widest ${finalHeaderTextClass}`}>{headerTitle}</span>
          </div>
        </div>
      )}

      <div className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${finalIconBgClass}`}>
          <MaterialIcon icon={iconName} />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-sm font-semibold text-stone-800 leading-tight mb-0.5">{title}</h3>
          <p className="text-xs text-stone-500 leading-tight">{description}</p>
        </div>
        {(hasSpinner || isRunning) && (
          <div
            className={`w-5 h-5 shrink-0 rounded-full border-2 animate-spin transition-opacity ${
              isRunning
                ? 'border-blue-200 border-t-blue-600 opacity-100'
                : 'border-stone-300 border-t-stone-600 opacity-0 hidden group-hover:block group-hover:opacity-100'
            }`}
            aria-hidden={!isRunning}
          />
        )}
      </div>

      {children}
      
      {status === 'failed' && (
        <div className="mx-4 mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-red-700 text-[11px] leading-tight flex gap-2">
           <span className="font-semibold text-red-800">Error:</span> {error || defaultError || "Execution failed unexpectedly."}
        </div>
      )}
    </div>
  );
};
