'use client';

import React from 'react';
import { useAtomValue } from 'jotai';
import { MaterialIcon } from '../ui/MaterialIcon';
import { isSidebarOpenAtom } from '../../store/workflowStore';

export const Sidebar = () => {
  const isOpen = useAtomValue(isSidebarOpenAtom);

  return (
    <aside 
      className={`h-full bg-stone-100 z-40 shrink-0 relative transition-all duration-500 ease-in-out overflow-hidden
        ${isOpen ? 'w-64 opacity-100 border-r border-stone-200' : 'w-0 opacity-0 border-r-0'}
      `}
    >
      <div className="w-64 flex flex-col h-full p-4 gap-2">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-blue-400 flex items-center justify-center shrink-0">
        <MaterialIcon icon="account_tree" className="text-white text-lg" />
      </div>
      <div>
        <h1 className="font-bold text-stone-900 font-sans leading-tight">FlowForge</h1>
        <p className="text-[11px] uppercase tracking-wider text-stone-500">Tenant Name</p>
      </div>
    </div>
    
    <nav className="flex-1 flex flex-col gap-1">
      <a className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg" href="#">
        <MaterialIcon icon="dashboard" />
        <span className="text-sm">Dashboard</span>
      </a>
      <a className="flex items-center gap-3 px-3 py-2.5 bg-stone-200 text-blue-700 font-semibold rounded-lg transition-all" href="#">
        <MaterialIcon icon="account_tree" />
        <span className="text-sm">Automations</span>
      </a>
      <a className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg" href="#">
        <MaterialIcon icon="receipt_long" />
        <span className="text-sm">Logs</span>
      </a>
      <a className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg" href="#">
        <MaterialIcon icon="folder_open" />
        <span className="text-sm">Assets</span>
      </a>
      <a className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg" href="#">
        <MaterialIcon icon="groups" />
        <span className="text-sm">Team</span>
      </a>
    </nav>
    
    <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-stone-200">
      <button className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg">
        <MaterialIcon icon="help_outline" />
        <span className="text-sm">Help</span>
      </button>
        <button className="flex items-center gap-3 px-3 py-2.5 text-stone-600 hover:bg-stone-200/50 transition-all rounded-lg">
          <MaterialIcon icon="settings" />
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </div>
  </aside>
  );
};
