'use client';

import React, { useState, useRef } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';

const ScriptEditorModal = ({ 
  isOpen, 
  onClose, 
  initialCode, 
  onSave 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  initialCode: string; 
  onSave: (code: string) => void;
}) => {
  const [code, setCode] = useState(initialCode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  if (!isOpen) return null;

  const lineCount = code.split('\n').length;
  const lines = Array.from({ length: Math.max(lineCount, 10) }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/30 backdrop-blur-sm p-8 animate-in fade-in duration-200">
      <div className="bg-[#fafaf5] w-full max-w-4xl h-[80vh] rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden border border-[#afb3ac]/20 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-[#f3f4ee] border-b border-[#afb3ac]/15">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#e0e4dc] flex items-center justify-center text-[#3a6095]">
              <MaterialIcon icon="terminal" className="text-lg" />
            </div>
            <h2 className="text-[16px] font-bold text-[#2f342e] font-['Manrope']">Edit Script</h2>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-bold text-[#afb3ac] hover:text-[#2f342e] transition-colors">
              Cancel
            </button>
            <button 
              onClick={() => { onSave(code); onClose(); }} 
              className="px-5 py-2 bg-gradient-to-br from-[#3a6095] to-[#4a70a5] hover:from-[#2c4c77] hover:to-[#3a6095] text-white rounded-xl text-[13px] font-bold shadow-sm transition-all"
            >
              Save Changes
            </button>
          </div>
        </div>

        <div className="flex-1 flex bg-[#2f342e] overflow-hidden relative">
          <div ref={lineNumbersRef} className="w-12 flex-shrink-0 bg-[#252924] text-[#afb3ac]/50 font-mono text-[13px] leading-[1.6] py-6 text-right pr-3 overflow-hidden select-none">
            {lines.map(line => <div key={line}>{line}</div>)}
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="flex-1 bg-transparent text-[#fafaf5] font-mono text-[13px] leading-[1.6] p-6 resize-none outline-none whitespace-pre"
          />
        </div>
      </div>
    </div>
  );
};

export const ScriptNodeForm = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scriptCode, setScriptCode] = useState(
    "export default async (data) => {\n  const mapped = data.items;\n  return mapped.filter(i => i.val > 0);\n};"
  );

  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#afb3ac] tracking-wider uppercase">Script Content</span>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="text-[10px] font-bold text-[#3a6095] hover:text-[#2c4c77] tracking-wider uppercase flex items-center gap-1 transition-colors"
          >
            See more <MaterialIcon icon="open_in_new" className="text-[12px]" />
          </button>
        </div>
        
        <div 
          onClick={() => setIsModalOpen(true)}
          className="w-full bg-[#2f342e] rounded-[1.25rem] p-4 font-mono text-[13px] leading-relaxed text-[#fafaf5] shadow-inner cursor-pointer hover:ring-2 hover:ring-[#3a6095]/50 transition-all relative overflow-hidden group"
        >
          <div className="opacity-70 group-hover:opacity-100 transition-opacity whitespace-pre-wrap break-all line-clamp-4">
            {scriptCode}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#2f342e] to-transparent"></div>
        </div>
      </div>

      <ScriptEditorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        initialCode={scriptCode}
        onSave={(newCode) => setScriptCode(newCode)}
      />
    </>
  );
};
