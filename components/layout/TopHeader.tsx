import React from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';
import { LiveConnectionToggle } from '../ui/LiveConnectionToggle';

export const TopHeader = () => (
  <header className="w-full sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-stone-50/80 backdrop-blur-md shadow-sm border-b border-stone-200/50">
    <div className="flex items-center gap-8">
      <span className="text-xl font-bold tracking-tight text-stone-800">Building Silver Jet Rocket</span>
      <div className="hidden md:flex gap-6">
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
      <div className="w-8 h-8 rounded-full bg-stone-300 ring-2 ring-stone-200"></div>
    </div>
  </header>
);
