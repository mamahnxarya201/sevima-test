'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Viewport } from '@xyflow/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  nodesAtom,
  edgesAtom,
  workflowTitleAtom,
  tenantIdAtom,
  canvasViewportAtom,
  canvasDraftScopeAtom,
} from '@/store/workflowStore';
import { saveCanvasDraft, loadCanvasDraft, removeLegacyCanvasStorageKeys } from '@/lib/canvas/canvasDraftStorage';
import { authClient } from '@/lib/auth/auth-client';

const DEBOUNCE_MS = 400;

export type CanvasDraftPersistenceOptions = {
  /**
   * When false, no writes to localStorage (used until workflow + draft hydration finishes).
   * Prevents an empty `nodes=[]` snapshot from overwriting a good draft when `tenantId`
   * becomes available before the GET /api/workflows response applies the graph.
   */
  persistEnabled?: boolean;
};

/**
 * Debounced scoped localStorage for canvas: nodes, edges, viewport, workflowTitle.
 * Synced fields are listed in `lib/canvas/canvasDraftSync.ts`.
 * Keys: sevima.canvas.v1.<tenantId>.<workflowId> — never mix tenants or workflows.
 */
export function useCanvasDraftPersistence(
  effectiveWorkflowId: string | null,
  options: CanvasDraftPersistenceOptions = {}
) {
  const persistEnabled = options.persistEnabled !== false;
  const persistEnabledRef = useRef(persistEnabled);
  persistEnabledRef.current = persistEnabled;

  const [nodes] = useAtom(nodesAtom);
  const [edges] = useAtom(edgesAtom);
  const workflowTitle = useAtomValue(workflowTitleAtom);
  const tenantId = useAtomValue(tenantIdAtom);
  const setTenantId = useSetAtom(tenantIdAtom);
  const setViewportAtom = useSetAtom(canvasViewportAtom);
  const scopeLabel = useAtomValue(canvasDraftScopeAtom);

  const { getViewport } = useReactFlow();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const titleRef = useRef(workflowTitle);
  const tenantRef = useRef(tenantId);
  const workflowRef = useRef(effectiveWorkflowId);
  /** Skip persisting while server/local draft is being applied */
  const suppressPersistRef = useRef(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;
  titleRef.current = workflowTitle;
  tenantRef.current = tenantId;
  workflowRef.current = effectiveWorkflowId;

  useEffect(() => {
    removeLegacyCanvasStorageKeys();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token;
        if (!token || cancelled) return;
        const res = await fetch('/api/tenants', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const id = data.tenant?.id as string | undefined;
        if (id && !cancelled) setTenantId(id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTenantId]);

  const flushSave = useCallback(() => {
    const t = tenantRef.current;
    const w = workflowRef.current;
    if (!t || !w || !persistEnabledRef.current || suppressPersistRef.current) return;
    const vp = getViewport();
    setViewportAtom({ x: vp.x, y: vp.y, zoom: vp.zoom });
    saveCanvasDraft({
      tenantId: t,
      workflowId: w,
      nodes: nodesRef.current,
      edges: edgesRef.current,
      viewport: { x: vp.x, y: vp.y, zoom: vp.zoom },
      workflowTitle: titleRef.current,
    });
  }, [getViewport, setViewportAtom]);

  /** Always arm debounce on graph/viewport intent; `flushSave` alone respects `suppressPersistRef`. */
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushSave();
    }, DEBOUNCE_MS);
  }, [flushSave]);

  /**
   * Any change to nodes/edges/title OR scope (tenant/workflow) schedules persist.
   * Including `tenantId`/`effectiveWorkflowId` fixes: tenant loads after graph → still save.
   */
  useEffect(() => {
    if (!tenantId || !effectiveWorkflowId || !persistEnabled) return;
    scheduleSave();
  }, [nodes, edges, workflowTitle, tenantId, effectiveWorkflowId, persistEnabled, scheduleSave]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  /** Flush draft when tab backgrounds so we do not lose the last debounced window */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!persistEnabledRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushSave();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [flushSave]);

  /** Best-effort flush when leaving the page while debounce is pending */
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!persistEnabledRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushSave]);

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      setViewportAtom({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
      if (!persistEnabledRef.current) return;
      scheduleSave();
    },
    [scheduleSave, setViewportAtom]
  );

  const withPersistSuppressed = useCallback((fn: () => void) => {
    suppressPersistRef.current = true;
    try {
      fn();
    } finally {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          suppressPersistRef.current = false;
        });
      });
    }
  }, []);

  return {
    scopeLabel,
    onViewportChange,
    suppressPersistRef,
    withPersistSuppressed,
  };
}

export function readLocalCanvasDraft(tenantId: string | null, workflowId: string | null) {
  if (!tenantId || !workflowId) return null;
  return loadCanvasDraft(tenantId, workflowId);
}
