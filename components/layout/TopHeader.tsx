'use client';

import React, { useState } from 'react';
import { useAtom } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { LiveConnectionToggle } from '../ui/LiveConnectionToggle';
import { HistoryPopup } from '../ui/HistoryPopup';
import { 
  workflowTitleAtom, 
  workflowAuthorAtom, 
  workflowLastUpdatedAtom,
  isSidebarOpenAtom 
} from '../../store/workflowStore';

export const TopHeader = () => {
  const [title, setTitle] = useAtom(workflowTitleAtom);
  const [author] = useAtom(workflowAuthorAtom);
  const [lastUpdated] = useAtom(workflowLastUpdatedAtom);
  const [isSidebarOpen, setIsSidebarOpen] = useAtom(isSidebarOpenAtom);
  
  const [showHistory, setShowHistory] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-stone-50/80 backdrop-blur-md shadow-sm border-b border-stone-200/50">
      <div className="flex items-center gap-6">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${isSidebarOpen ? 'text-stone-500 hover:bg-stone-200' : 'bg-stone-200 text-stone-800 shadow-sm'}`}
          title="Toggle Sidebar"
        >
          <MaterialIcon icon={isSidebarOpen ? "menu_open" : "menu"} />
        </button>
        
        <div className="relative flex flex-col justify-center">
          <input 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl font-bold tracking-tight text-stone-800 bg-transparent border-none outline-none hover:bg-stone-200/50 focus:bg-stone-200/50 px-2 py-0.5 rounded transition-all w-80"
          />
          <div 
            onClick={() => setShowHistory(!showHistory)}
            className="text-[11px] font-semibold text-stone-500 hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded w-max"
          >
            By {author} <span className="w-1 h-1 rounded-full bg-stone-400 inline-block"></span> Last updated {lastUpdated}
            <MaterialIcon icon="history" className="text-[14px] ml-0.5" />
          </div>
          
          {showHistory && <HistoryPopup onClose={() => setShowHistory(false)} />}
        </div>

        <div className="hidden md:flex gap-6 ml-4">
        <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm font-semibold" href="#">Workflows</a>
        <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm" href="#">Executions</a>
        <a className="text-stone-500 hover:text-stone-800 transition-colors text-sm" href="#">Settings</a>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <LiveConnectionToggle />
      <div className="flex items-center gap-2 pr-4 border-r border-stone-200">
        <button className="p-2 text-stone-500 hover:text-stone-800 transition-colors"><MaterialIcon icon="help" /></button>
        <button className="p-2 text-stone-500 hover:text-stone-800 transition-colors relative">
          <MaterialIcon icon="notifications" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-600 rounded-full"></span>
        </button>
      </div>
      <button className="bg-gradient-to-br from-blue-700 to-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:scale-[0.98] transition-transform">
        Create Workflow
      </button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-stone-400 to-stone-300 ring-2 ring-stone-200 shadow-sm flex items-center justify-center text-white text-xs font-bold">ET</div>
    </div>
  </header>
  );
};
