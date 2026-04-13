import React from 'react';

export const DelayNodeForm = () => {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Wait Duration</span>
        <div className="flex gap-2 w-full">
          <input 
            type="number" 
            placeholder="5" 
            defaultValue="5"
            className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]"
          />
          <select className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]">
            <option>Seconds</option>
            <option>Minutes</option>
            <option>Hours</option>
          </select>
        </div>
      </div>
    </div>
  );
};
