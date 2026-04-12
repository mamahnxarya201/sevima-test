import React from 'react';
import { MaterialIcon } from './MaterialIcon';

export interface NodeLibraryProps {
  onAddNode: (type: 'trigger' | 'condition' | 'http' | 'delay' | 'script') => void;
}

export const NodeLibrary = ({ onAddNode }: NodeLibraryProps) => {
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-6 flex flex-col items-center gap-4 p-3 bg-white/60 backdrop-blur-md rounded-2xl border border-stone-200 shadow-md z-20">
      <button onClick={() => onAddNode('trigger')} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white transition-all text-stone-500 rounded-xl shadow-sm" title="Add Trigger">
        <MaterialIcon icon="add_circle" />
      </button>
      <div className="w-6 h-[1px] bg-stone-200"></div>
      <button onClick={() => onAddNode('condition')} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Logic">
        <MaterialIcon icon="fork_right" />
      </button>
      <button onClick={() => onAddNode('http')} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Action">
        <MaterialIcon icon="cloud_sync" />
      </button>
      <button onClick={() => onAddNode('delay')} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Delay">
        <MaterialIcon icon="timer" />
      </button>
      <button onClick={() => onAddNode('script')} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Script">
        <MaterialIcon icon="terminal" />
      </button>
    </div>
  );
};
