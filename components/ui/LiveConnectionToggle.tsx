import React from 'react';
import { useAtom } from 'jotai';
import { isLiveConnectionEnabledAtom } from '../../store/executionStore';

export const LiveConnectionToggle = () => {
  const [isLive, setIsLive] = useAtom(isLiveConnectionEnabledAtom);

  return (
    <div className="flex items-center gap-2 mr-4 bg-stone-100 p-1.5 rounded-xl border border-stone-200">
      <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 ml-2">Sync Engine</span>
      <button 
        onClick={() => setIsLive(false)}
        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${!isLive ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
      >
        REST API
      </button>
      <button 
        onClick={() => setIsLive(true)}
        className={`px-3 py-1 flex items-center gap-1.5 text-xs font-semibold rounded-lg transition-all ${isLive ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' : 'text-stone-400 hover:text-stone-600'}`}
      >
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse"></span>}
        WebSocket
      </button>
    </div>
  );
};
