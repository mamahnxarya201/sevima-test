'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue } from 'jotai';
import { MaterialIcon } from './MaterialIcon';
import { workflowSettingsAtom, persistedWorkflowIdAtom } from '@/store/workflowStore';
import { DEFAULT_WORKFLOW_SETTINGS, type WorkflowSettings } from '@/lib/dag/workflowSettings';
import { authClient } from '@/lib/auth/auth-client';

interface ScheduleState {
  cronExpr: string;
  enabled: boolean;
  loaded: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wider text-[#afb3ac]">
        {label}
      </label>
      {children}
      {hint && (
        <span className="text-[11px] leading-relaxed text-[#afb3ac]">{hint}</span>
      )}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-28 rounded-xl border-none bg-[#f3f4ee] px-3 py-2 text-[13px] font-semibold text-[#2f342e] outline-none focus:ring-2 focus:ring-[#3a6095]"
      />
      {suffix && (
        <span className="text-[12px] font-medium text-[#afb3ac]">{suffix}</span>
      )}
    </div>
  );
}

export function WorkflowSettingsDialog({ open, onClose, canEdit = true }: Props) {
  const [settings, setSettings] = useAtom(workflowSettingsAtom);
  const workflowId = useAtomValue(persistedWorkflowIdAtom);
  const [local, setLocal] = useState<WorkflowSettings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<ScheduleState>({
    cronExpr: '',
    enabled: false,
    loaded: false,
  });
  const scheduleLoadedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !workflowId) return;
    if (scheduleLoadedForRef.current === workflowId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        const res = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/schedule`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled) return;
        const s = body.schedule;
        setSchedule({
          cronExpr: s?.cronExpr ?? '',
          enabled: s?.enabled ?? false,
          loaded: true,
        });
        scheduleLoadedForRef.current = workflowId;
      } catch {
        if (!cancelled) setSchedule((p) => ({ ...p, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, workflowId]);

  useEffect(() => {
    if (open) {
      setLocal({ ...settings });
      setSaveError(null);
    }
  }, [open, settings]);

  const patch = useCallback(
    <K extends keyof WorkflowSettings>(key: K, value: WorkflowSettings[K]) => {
      setLocal((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    if (!workflowId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: tokenData } = await authClient.token();
      const token = tokenData?.token ?? '';

      // Save workflow settings
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings: local }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : 'Save failed');
      }

      // Save schedule (if cron expression is provided, upsert; otherwise delete)
      if (schedule.cronExpr.trim()) {
        const schedRes = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/schedule`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              cronExpr: schedule.cronExpr.trim(),
              enabled: schedule.enabled,
            }),
          },
        );
        if (!schedRes.ok) {
          const body = await schedRes.json().catch(() => ({}));
          throw new Error(typeof body.error === 'string' ? body.error : 'Schedule save failed');
        }
      } else if (schedule.loaded) {
        // Empty cron = remove schedule
        await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/schedule`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }

      setSettings(local);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workflowId, local, schedule, setSettings, onClose, canEdit]);

  const handleReset = useCallback(() => {
    if (!canEdit) return;
    setLocal({ ...DEFAULT_WORKFLOW_SETTINGS });
  }, [canEdit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-settings-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex w-full max-w-lg max-h-[min(90vh,48rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#afb3ac]/20 bg-[#fafaf5] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0e4dc] text-[#3a6095]">
              <MaterialIcon icon="tune" className="text-lg" />
            </div>
            <h2
              id="workflow-settings-title"
              className="font-['Manrope'] text-[16px] font-bold text-[#2f342e]"
            >
              Workflow Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-bold text-[#afb3ac] transition-colors hover:text-[#2f342e]"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <SettingsField
            label="Default retries per node"
            hint="Applied to nodes without an explicit retry count (0 = no retries). Exponential backoff: delay = base * 2^attempt."
          >
            <NumberInput
              value={local.defaultNodeRetries}
              onChange={(v) => patch('defaultNodeRetries', v)}
              min={0}
              max={10}
              disabled={!canEdit}
            />
          </SettingsField>

          <SettingsField
            label="Retry base delay"
            hint="Base delay between retries. Doubles on each attempt."
          >
            <NumberInput
              value={local.defaultRetryDelayMs}
              onChange={(v) => patch('defaultRetryDelayMs', v)}
              min={0}
              max={60000}
              step={100}
              suffix="ms"
              disabled={!canEdit}
            />
          </SettingsField>

          <SettingsField
            label="Max node failures"
            hint="How many nodes can fail before the workflow stops. Remaining nodes in the same level may still complete."
          >
            <NumberInput
              value={local.maxNodeFailures}
              onChange={(v) => patch('maxNodeFailures', v)}
              min={1}
              max={100}
              disabled={!canEdit}
            />
          </SettingsField>

          <SettingsField
            label="Workflow retries"
            hint="How many times to restart the entire workflow on failure. Each retry creates a new run."
          >
            <NumberInput
              value={local.workflowRetries}
              onChange={(v) => patch('workflowRetries', v)}
              min={0}
              max={10}
              disabled={!canEdit}
            />
          </SettingsField>

          <SettingsField
            label="Global timeout"
            hint="Maximum wall-clock time for a single run. Running steps are killed when exceeded."
          >
            <NumberInput
              value={Math.round(local.globalTimeoutMs / 1000)}
              onChange={(v) => patch('globalTimeoutMs', v * 1000)}
              min={5}
              max={3600}
              suffix="seconds"
              disabled={!canEdit}
            />
          </SettingsField>

          {/* Scheduled trigger (cron) */}
          <div className="border-t border-[#afb3ac]/15 pt-5">
            <div className="mb-4 flex items-center gap-2">
              <MaterialIcon icon="schedule" className="text-base text-[#3a6095]" />
              <span className="text-[13px] font-bold text-[#2f342e]">Scheduled Trigger</span>
            </div>

            <div className="flex flex-col gap-4">
              <SettingsField
                label="Cron expression"
                hint="5-field cron (min hour day month weekday). Examples: '*/10 * * * *' (every 10min), '0 */6 * * *' (every 6h). Leave empty to disable."
              >
                <input
                  type="text"
                  value={schedule.cronExpr}
                  onChange={(e) =>
                    setSchedule((p) => ({ ...p, cronExpr: e.target.value }))
                  }
                  disabled={!canEdit}
                  placeholder="0 */6 * * *"
                  spellCheck={false}
                  className="w-48 rounded-xl border-none bg-[#f3f4ee] px-3 py-2 font-mono text-[13px] font-semibold text-[#2f342e] outline-none placeholder:text-[#afb3ac] focus:ring-2 focus:ring-[#3a6095]"
                />
              </SettingsField>

              {schedule.cronExpr.trim() && (
                <SettingsField label="Enabled">
                  <button
                    type="button"
                    onClick={() =>
                      setSchedule((p) => ({ ...p, enabled: !p.enabled }))
                    }
                    disabled={!canEdit}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      schedule.enabled ? 'bg-[#3a6095]' : 'bg-[#afb3ac]/40'
                    }`}
                    role="switch"
                    aria-checked={schedule.enabled}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </SettingsField>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[#afb3ac]/15 bg-[#f3f4ee] px-6 py-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={!canEdit}
            className="text-[12px] font-semibold text-[#afb3ac] transition-colors hover:text-[#2f342e]"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {!canEdit && (
              <span className="text-[11px] font-semibold text-[#afb3ac]">Viewer mode: read-only</span>
            )}
            {saveError && (
              <span className="max-w-[12rem] truncate text-[11px] font-semibold text-red-600">
                {saveError}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !workflowId || !canEdit}
              className="flex items-center gap-1.5 rounded-lg bg-[#3a6095] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#2c4c77] disabled:opacity-60"
            >
              <MaterialIcon
                icon={saving ? 'sync' : 'check'}
                className={`text-base ${saving ? 'animate-spin' : ''}`}
              />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
