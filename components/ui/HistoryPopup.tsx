import React from 'react';
import { useAtomValue } from 'jotai';
import { workflowHistoryAtom } from '../../store/workflowStore';
import { MaterialIcon } from './MaterialIcon';

export const HistoryPopup = ({ onClose }: { onClose: () => void }) => {
  const history = useAtomValue(workflowHistoryAtom);

  return (
    <div className="absolute top-full mt-2 left-0 w-80 bg-white shadow-xl shadow-stone-200/50 border border-stone-200 rounded-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-3 bg-stone-50 border-b border-stone-100">
        <h3 className="font-semibold text-sm text-stone-800 flex items-center gap-2">
          <MaterialIcon icon="history" className="text-[18px] text-stone-500" />
          Version History
        </h3>
        <button onClick={onClose} className="p-1.5 hover:bg-stone-200 transition-colors rounded-lg text-stone-500">
          <MaterialIcon icon="close" className="text-[16px]" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {history.map((entry, idx) => (
          <div key={entry.id} className={`px-4 py-3 flex gap-3 ${idx !== history.length - 1 ? 'border-b border-stone-100' : ''}`}>
             <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
               {entry.user.charAt(0)}
             </div>
             <div>
               <p className="text-[13px] font-medium text-stone-800 leading-tight mb-1">{entry.action}</p>
               <div className="flex gap-2 items-center mt-0.5">
                 <span className="text-[10px] text-stone-500 font-semibold">{entry.user}</span>
                 <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                 <span className="text-[10px] text-stone-400">{entry.timestamp}</span>
               </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
