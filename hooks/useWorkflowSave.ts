'use client';

import { useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  workflowTitleAtom,
  persistedWorkflowIdAtom,
  workflowSavingAtom,
  workflowSaveErrorAtom,
  workflowCheckpointingAtom,
  workflowActiveVersionAtom,
  workflowLastUpdatedAtom,
  workflowCreatorAtom,
  workflowVersionsListAtom,
  nodesAtom,
  edgesAtom,
} from '../store/workflowStore';
import { exportCanvasToDag } from '../lib/canvas/dagExporter';
import { serializeEditorState } from '../lib/canvas/editorState';
import { authClient } from '@/lib/auth/auth-client';
import { saveWorkflowToApi } from '../lib/workflow/saveWorkflow';
import { fetchWorkflowMeta, versionSummariesFromWorkflow } from '../lib/workflow/fetchWorkflowMeta';
import { formatRelativeTime } from '../lib/datetime/formatRelativeTime';

export type SaveOutcome =
  | { ok: true; workflowId: string }
  | { ok: false; message: string };

/**
 * Manual save: reads title + graph from Jotai atoms (same source as controlled React Flow).
 */
export function useWorkflowSave() {
  const [title] = useAtom(workflowTitleAtom);
  const [workflowId, setWorkflowId] = useAtom(persistedWorkflowIdAtom);
  const setSaving = useSetAtom(workflowSavingAtom);
  const setSaveError = useSetAtom(workflowSaveErrorAtom);
  const setCheckpointing = useSetAtom(workflowCheckpointingAtom);
  const setActiveVersion = useSetAtom(workflowActiveVersionAtom);
  const setLastUpdated = useSetAtom(workflowLastUpdatedAtom);
  const setCreator = useSetAtom(workflowCreatorAtom);
  const setVersionsList = useSetAtom(workflowVersionsListAtom);
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);

  const applyMetaFromServer = useCallback(
    async (wid: string, token: string) => {
      const meta = await fetchWorkflowMeta(wid, token);
      if (!meta) return;
      setCreator(meta.createdBy);
      setVersionsList(versionSummariesFromWorkflow(meta.workflow));
      setLastUpdated(formatRelativeTime(meta.workflow.updatedAt));
      setActiveVersion(meta.workflow.activeVersion);
    },
    [setCreator, setVersionsList, setLastUpdated, setActiveVersion]
  );

  const save = useCallback(async (): Promise<SaveOutcome> => {
    setSaving(true);
    setSaveError(null);
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
        setSaveError(result.message);
        return { ok: false, message: result.message };
      }

      if (result.workflowId !== workflowId) {
        setWorkflowId(result.workflowId);
      }
      const wid = result.workflowId;
      if (token) {
        await applyMetaFromServer(wid, token);
      } else {
        if (result.updatedAt) setLastUpdated(formatRelativeTime(result.updatedAt));
        if (result.activeVersion !== undefined) setActiveVersion(result.activeVersion);
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
  }, [
    title,
    workflowId,
    nodes,
    edges,
    setWorkflowId,
    setSaving,
    setSaveError,
    setActiveVersion,
    setLastUpdated,
    applyMetaFromServer,
  ]);

  /** New immutable version row (checkpoint); draft autosave uses `save` / debounced hook. */
  const checkpoint = useCallback(async (): Promise<SaveOutcome> => {
    if (!workflowId) {
      const out = await save();
      return out;
    }
    setCheckpointing(true);
    setSaveError(null);
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
        checkpoint: true,
      });

      if (!result.ok) {
        setSaveError(result.message);
        return { ok: false, message: result.message };
      }

      if (token) {
        await applyMetaFromServer(result.workflowId, token);
      } else if (result.activeVersion !== undefined) {
        setActiveVersion(result.activeVersion);
      }

      return { ok: true, workflowId: result.workflowId };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Checkpoint failed';
      setSaveError(message);
      console.error('[useWorkflowSave] checkpoint', e);
      return { ok: false, message };
    } finally {
      setCheckpointing(false);
    }
  }, [
    workflowId,
    title,
    nodes,
    edges,
    save,
    setSaveError,
    setCheckpointing,
    setActiveVersion,
    applyMetaFromServer,
  ]);

  return { save, checkpoint, workflowId };
}
