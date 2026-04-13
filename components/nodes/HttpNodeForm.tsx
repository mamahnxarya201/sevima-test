import React from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

export const HttpNodeForm = () => {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Method & URL</span>
        <div className="flex gap-2 w-full">
          <select className="bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095] w-24 shrink-0">
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
            <option>PATCH</option>
          </select>
          <input 
            type="text" 
            placeholder="https://api.example.com/data" 
            className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Headers</span>
        <div className="bg-[#f3f4ee] rounded-xl p-1 flex flex-col gap-1 w-full">
          <div className="flex gap-1 w-full">
            <input type="text" placeholder="Key" defaultValue="Authorization" className="flex-1 min-w-0 bg-white border-none outline-none text-[#2f342e] text-[12px] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#3a6095]" />
            <input type="text" placeholder="Value" defaultValue="Bearer token" className="flex-1 min-w-0 bg-white border-none outline-none text-[#2f342e] text-[12px] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#3a6095]" />
            <button className="w-8 shrink-0 flex items-center justify-center text-[#a83836] hover:bg-[#fa746f]/10 rounded-lg transition-colors"><MaterialIcon icon="close" className="text-[16px]" /></button>
          </div>
          <button className="w-full py-2 text-[12px] font-bold text-[#3a6095] hover:bg-[#e0e4dc] rounded-lg transition-colors flex items-center justify-center gap-1">
            <MaterialIcon icon="add" className="text-[16px]" /> Add Header
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Body (JSON)</span>
        <textarea 
          placeholder="{}" 
          className="w-full h-32 bg-[#f3f4ee] border-none outline-none text-[#2f342e] font-mono text-[12px] rounded-xl p-3 resize-none focus:ring-2 focus:ring-[#3a6095]"
        />
      </div>
    </div>
  );
};
