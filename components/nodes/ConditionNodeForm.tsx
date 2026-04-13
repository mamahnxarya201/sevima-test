import React from 'react';

export const ConditionNodeForm = () => {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Input Key</span>
        <input 
          type="text" 
          placeholder="e.g. fetch_data.statusCode" 
          defaultValue="fetch_data.statusCode"
          className="w-full bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]"
        />
      </div>

      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Condition</span>
        <div className="flex gap-2 w-full">
          <select className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]">
            <option>Equals (==)</option>
            <option>Not Equals (!=)</option>
            <option>Greater Than (&gt;)</option>
            <option>Less Than (&lt;)</option>
            <option>Contains</option>
          </select>
          <input 
            type="text" 
            placeholder="Value" 
            defaultValue="200"
            className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095]"
          />
        </div>
      </div>
    </div>
  );
};
