'use client';

import React, { useState } from 'react';
import { MaterialIcon } from '../ui/MaterialIcon';
import { authClient } from '@/lib/auth/auth-client';

type NewWorkflowModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (workflowId: string) => void;
};

export function NewWorkflowModal({ open, onClose, onCreated }: NewWorkflowModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';
      if (!token) {
        setError('Not signed in');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || undefined,
          definition: {},
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not create workflow');
        setSubmitting(false);
        return;
      }
      const id = data.workflow?.id as string | undefined;
      if (!id) {
        setError('No workflow id returned');
        setSubmitting(false);
        return;
      }
      setName('');
      setDescription('');
      onCreated(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-wf-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#2f342e]/35 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[1.5rem] bg-[#fafaf5] shadow-[0_12px_40px_rgba(47,52,46,0.12)]"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="border-b border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e0e4dc] text-[#3a6095]">
                <MaterialIcon icon="add_circle" className="text-xl" />
              </div>
              <div>
                <h2 id="new-wf-title" className="font-['Manrope'] text-lg font-bold text-[#2f342e]">
                  New workflow
                </h2>
                <p className="mt-0.5 text-[13px] text-[#afb3ac]">
                  Name and describe it — you&apos;ll build the graph on the canvas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#afb3ac] transition-colors hover:bg-[#edefe8] hover:text-[#2f342e]"
              aria-label="Close"
            >
              <MaterialIcon icon="close" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <div>
            <label
              htmlFor="wf-name"
              className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]"
            >
              Name
            </label>
            <input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border-0 bg-white px-3 py-2.5 text-[13px] text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
              placeholder="e.g. Onboard new user"
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="wf-desc"
              className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-[#afb3ac]"
            >
              Description
            </label>
            <textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border-0 bg-white px-3 py-2.5 text-[13px] text-[#2f342e] shadow-inner outline-none ring-1 ring-[#afb3ac]/15 transition-shadow focus:ring-2 focus:ring-[#3a6095]"
              placeholder="Optional — what this automation does"
            />
          </div>
          {error && (
            <p className="rounded-md bg-[#fa746f]/20 px-3 py-2 text-[12px] font-semibold text-[#a83836]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-[#3a6095] transition-colors hover:bg-[#e0e4dc]/80"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#3a6095] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#2c4c77] active:bg-[#264060] disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
