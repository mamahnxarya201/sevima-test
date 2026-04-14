'use client';

import React from 'react';
import { useAtomValue } from 'jotai';
import {
  workflowVersionsListAtom,
  workflowActiveVersionAtom,
  workflowViewingVersionAtom,
} from '../../store/workflowStore';
import { MaterialIcon } from './MaterialIcon';

export const HistoryPopup = ({
  onClose,
  onSelectVersion,
}: {
  onClose: () => void;
  onSelectVersion: (versionNumber: number) => void;
}) => {
  const versions = useAtomValue(workflowVersionsListAtom);
  const activeVersion = useAtomValue(workflowActiveVersionAtom);
  const viewingVersion = useAtomValue(workflowViewingVersionAtom);

  return (
    <div className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-stone-200/50 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <MaterialIcon icon="history" className="text-[18px] text-stone-500" />
          Version history
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-200"
          aria-label="Close"
        >
          <MaterialIcon icon="close" className="text-[16px]" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {versions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-stone-500">No checkpoints yet.</p>
        ) : (
          versions.map((v, idx) => {
            const isActive = activeVersion != null && v.versionNumber === activeVersion;
            const isViewing = viewingVersion != null && v.versionNumber === viewingVersion;
            return (
              <button
                type="button"
                key={v.id}
                onClick={() => onSelectVersion(v.versionNumber)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 ${
                  idx !== versions.length - 1 ? 'border-b border-stone-100' : ''
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isActive
                      ? 'bg-[#3a6095]/15 text-[#3a6095] ring-1 ring-[#3a6095]/30'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  v{v.versionNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-tight text-stone-800">
                    Checkpoint {v.versionNumber}
                    {isActive && (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Current
                      </span>
                    )}
                    {isViewing && (
                      <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        Viewing
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-500">
                    Immutable snapshot — use <span className="font-semibold">Checkpoint</span> in the header to add
                    another.
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
