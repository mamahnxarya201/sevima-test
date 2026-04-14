'use client';

import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  workflowTitleAtom,
  persistedWorkflowIdAtom,
  workflowSavingAtom,
  workflowSaveErrorAtom,
  workflowActiveVersionAtom,
  workflowLastUpdatedAtom,
  nodesAtom,
  edgesAtom,
} from '../store/workflowStore';
import { formatRelativeTime } from '../lib/datetime/formatRelativeTime';
import { exportCanvasToDag } from '../lib/canvas/dagExporter';
import { serializeEditorState } from '../lib/canvas/editorState';
import { authClient } from '@/lib/auth/auth-client';
import { saveWorkflowToApi } from '../lib/workflow/saveWorkflow';

const DEBOUNCE_MS = 3000;

/**
 * Auto-persist canvas + title to the API after idle debounce.
 */
export function useDebouncedWorkflowSave(enabled: boolean) {
  const title = useAtomValue(workflowTitleAtom);
  const workflowId = useAtomValue(persistedWorkflowIdAtom);
  const setWorkflowId = useSetAtom(persistedWorkflowIdAtom);
  const setSaving = useSetAtom(workflowSavingAtom);
  const setSaveError = useSetAtom(workflowSaveErrorAtom);
  const setActiveVersion = useSetAtom(workflowActiveVersionAtom);
  const setLastUpdated = useSetAtom(workflowLastUpdatedAtom);
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>('');
  /** Jotai setters are stable; keep them off the effect deps so the array length never changes (HMR-safe). */
  const settersRef = useRef({
    setWorkflowId,
    setSaving,
    setSaveError,
    setActiveVersion,
    setLastUpdated,
  });
  settersRef.current = {
    setWorkflowId,
    setSaving,
    setSaveError,
    setActiveVersion,
    setLastUpdated,
  };

  useEffect(() => {
    if (!enabled || !workflowId) return;

    const serialized = JSON.stringify({
      title,
      definition: exportCanvasToDag(title, nodes, edges),
      editorState: serializeEditorState(nodes, edges),
    });

    if (serialized === lastSerializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastSerializedRef.current = serialized;
      const {
        setWorkflowId: setWid,
        setSaving: setSav,
        setSaveError: setErr,
        setActiveVersion: setVer,
        setLastUpdated: setLU,
      } = settersRef.current;

      setSav(true);
      setErr(null);
      try {
        const definition = exportCanvasToDag(title, nodes, edges);
        const editorState = serializeEditorState(nodes, edges);
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        const result = await saveWorkflowToApi({
          name: title,
          definition,
          editorState,
          workflowId,
          token,
        });
        if (!result.ok) {
          setErr(result.message);
        } else {
          if (result.workflowId !== workflowId) {
            setWid(result.workflowId);
          }
          if (result.activeVersion !== undefined) {
            setVer(result.activeVersion);
          }
          if (result.updatedAt) {
            setLU(formatRelativeTime(result.updatedAt));
          }
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSav(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Only data deps — fixed length; setters read via settersRef.current
  }, [enabled, workflowId, title, nodes, edges]);
}
