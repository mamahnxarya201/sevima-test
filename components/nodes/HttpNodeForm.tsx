'use client';

import React, { useState } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

export const HttpNodeForm = () => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState([
    { id: '1', key: 'Authorization', value: 'Bearer token' }
  ]);
  const [body, setBody] = useState('');

  const addHeader = () => {
    setHeaders([...headers, { id: Math.random().toString(36).substring(2, 9), key: '', value: '' }]);
  };

  const removeHeader = (id: string) => {
    setHeaders(headers.filter(h => h.id !== id));
  };

  const updateHeader = (id: string, field: 'key' | 'value', newValue: string) => {
    setHeaders(headers.map(h => h.id === id ? { ...h, [field]: newValue } : h));
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Method & URL</span>
        <div className="flex gap-2 w-full">
          <div className="relative shrink-0">
            <select 
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] font-bold rounded-xl pl-4 pr-8 py-3 focus:ring-2 focus:ring-[#3a6095] w-24 appearance-none cursor-pointer"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
            <MaterialIcon 
              icon="expand_more" 
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#2f342e] pointer-events-none text-[18px]" 
            />
          </div>
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/data" 
            className="flex-1 min-w-0 bg-[#f3f4ee] border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#3a6095]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Headers</span>
        <div className="bg-[#f3f4ee] rounded-[1.25rem] p-3 flex flex-col gap-2 w-full">
          {headers.map((header) => (
            <div key={header.id} className="flex gap-2 w-full items-center">
              <input 
                type="text" 
                placeholder="Key" 
                value={header.key}
                onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                className="flex-1 min-w-0 bg-white border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095] shadow-sm" 
              />
              <input 
                type="text" 
                placeholder="Value" 
                value={header.value}
                onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                className="flex-1 min-w-0 bg-white border-none outline-none text-[#2f342e] text-[13px] rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-[#3a6095] shadow-sm" 
              />
              <button 
                onClick={() => removeHeader(header.id)}
                className="w-8 shrink-0 flex items-center justify-center text-[#a83836] hover:bg-[#fa746f]/20 rounded-lg transition-colors h-full py-2"
                title="Remove Header"
              >
                <MaterialIcon icon="close" className="text-[18px]" />
              </button>
            </div>
          ))}
          <button 
            onClick={addHeader}
            className="w-full mt-1 py-2 text-[13px] font-bold text-[#3a6095] hover:bg-[#e0e4dc] rounded-xl transition-colors flex items-center justify-center gap-1"
          >
            <MaterialIcon icon="add" className="text-[18px]" /> Add Header
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Body (JSON)</span>
        <textarea 
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="{}" 
          className="w-full h-32 bg-[#f3f4ee] border-none outline-none text-[#2f342e] font-mono text-[13px] rounded-[1.25rem] p-4 resize-none focus:ring-2 focus:ring-[#3a6095]"
        />
      </div>
    </div>
  );
};
