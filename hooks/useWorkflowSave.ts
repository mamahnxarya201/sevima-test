'use client';

import { useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useReactFlow } from '@xyflow/react';
import {
  workflowTitleAtom,
  persistedWorkflowIdAtom,
  workflowSavingAtom,
  workflowSaveErrorAtom,
} from '../store/workflowStore';
import { exportCanvasToDag } from '../lib/canvas/dagExporter';
import { serializeEditorState } from '../lib/canvas/editorState';
import { authClient } from '@/lib/auth/auth-client';
import { saveWorkflowToApi } from '../lib/workflow/saveWorkflow';

export type SaveOutcome =
  | { ok: true; workflowId: string }
  | { ok: false; message: string };

/**
 * Manual save: reads title + canvas from atoms/React Flow, writes REST + persisted workflow id atom.
 */
export function useWorkflowSave() {
  const [title] = useAtom(workflowTitleAtom);
  const [workflowId, setWorkflowId] = useAtom(persistedWorkflowIdAtom);
  const setSaving = useSetAtom(workflowSavingAtom);
  const setSaveError = useSetAtom(workflowSaveErrorAtom);
  const { getNodes, getEdges } = useReactFlow();

  const save = useCallback(async (): Promise<SaveOutcome> => {
    setSaving(true);
    setSaveError(null);
    try {
      const definition = exportCanvasToDag(title, getNodes(), getEdges());
      const editorState = serializeEditorState(getNodes(), getEdges());
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
        setSaveError(result.message);
        return { ok: false, message: result.message };
      }

      if (result.workflowId !== workflowId) {
        setWorkflowId(result.workflowId);
      }

      return { ok: true, workflowId: result.workflowId };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      setSaveError(message);
      console.error('[useWorkflowSave]', e);
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }, [title, workflowId, getNodes, getEdges, setWorkflowId, setSaving, setSaveError]);

  return { save, workflowId };
}
