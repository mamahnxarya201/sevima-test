'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Provider, useSetAtom, useAtomValue, useAtom, useStore } from 'jotai';

import { TopHeader } from '../../components/layout/TopHeader';
import { MaterialIcon } from '../../components/ui/MaterialIcon';
import { NodeLibrary } from '../../components/ui/NodeLibrary';
import { ContextMenu } from '../../components/ui/ContextMenu';
import { ExecutionSidebar } from '../../components/ui/ExecutionSidebar';
import { NodeSettings } from '../../components/ui/NodeSettings';
import { CanvasAiAssistant } from '../../components/ui/CanvasAiAssistant';

import { HttpNode } from '../../components/nodes/HttpNode';
import { ConditionNode } from '../../components/nodes/ConditionNode';
import { ScriptNode } from '../../components/nodes/ScriptNode';
import { DelayNode } from '../../components/nodes/DelayNode';

import {
  nodeExecutionFamily,
  executionMonitorActiveAtom,
  runStatusAtom,
  runStreamStatusAtom,
} from '../../store/executionStore';
import {
  nodesAtom,
  edgesAtom,
  persistedWorkflowIdAtom,
  workflowTitleAtom,
  workflowActiveVersionAtom,
  workflowViewingVersionAtom,
  workflowPendingVersionLoadAtom,
  workflowCreatorAtom,
  workflowSettingsAtom,
  workflowVersionsListAtom,
  workflowLastUpdatedAtom,
  tenantIdAtom,
} from '../../store/workflowStore';
import { useCanvasDraftPersistence, readLocalCanvasDraft } from '../../hooks/useCanvasDraftPersistence';
import { useDebouncedWorkflowSave } from '../../hooks/useDebouncedWorkflowSave';
import type { ExecutionStatus } from '../../store/executionStore';
import { authClient } from '@/lib/auth/auth-client';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { parseWorkflowSettings } from '@/lib/dag/workflowSettings';
import { parseEditorState } from '@/lib/canvas/editorState';
import { importDagToCanvas } from '@/lib/canvas/dagImporter';
import {
  fetchWorkflowMeta,
  fetchWorkflowAtVersion,
  versionSummariesFromWorkflow,
} from '@/lib/workflow/fetchWorkflowMeta';
import { formatRelativeTime } from '@/lib/datetime/formatRelativeTime';
import { getLayoutedElements } from '@/utils/layout';
import type { DagSchema } from '@/lib/dag/types';
import { useRolePermissions } from '@/hooks/useRolePermissions';

const nodeTypes = {
  http: HttpNode,
  script: ScriptNode,
  delay: DelayNode,
  condition: ConditionNode,
};

const defaultEdgeStyle = { stroke: '#94a3b8', strokeWidth: 3, strokeDasharray: '6' };

function newNodeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapStatus(s: string): ExecutionStatus {
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILED') return 'failed';
  if (s === 'RUNNING') return 'running';
  if (s === 'RETRYING') return 'retrying';
  return 'idle';
}

function WorkflowCanvas() {
  const authed = useRequireAuth();
  const { canEdit } = useRolePermissions();
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [edges, setEdges] = useAtom(edgesAtom);
  const [inputMode, setInputMode] = React.useState<'mouse' | 'trackpad'>('mouse');
  const { screenToFlowPosition, setViewport, fitView } = useReactFlow();
  const store = useStore();

  const searchParams = useSearchParams();
  const workflowIdFromUrl = searchParams.get('workflowId');
  const workflowLoadScopeRef = React.useRef<string>('');
  const versionSwitchGenerationRef = React.useRef(0);
  const [persistedWorkflowId, setPersistedWorkflowId] = useAtom(persistedWorkflowIdAtom);
  const workflowTitle = useAtomValue(workflowTitleAtom);
  const workflowSettings = useAtomValue(workflowSettingsAtom);
  const setWorkflowTitle = useSetAtom(workflowTitleAtom);
  const setWorkflowActiveVersion = useSetAtom(workflowActiveVersionAtom);
  const setWorkflowCreator = useSetAtom(workflowCreatorAtom);
  const setWorkflowSettings = useSetAtom(workflowSettingsAtom);
  const setWorkflowVersionsList = useSetAtom(workflowVersionsListAtom);
  const setWorkflowLastUpdated = useSetAtom(workflowLastUpdatedAtom);
  const setViewingVersion = useSetAtom(workflowViewingVersionAtom);
  const setPendingVersionLoad = useSetAtom(workflowPendingVersionLoadAtom);
  const pendingVersionLoad = useAtomValue(workflowPendingVersionLoadAtom);
  const viewingVersion = useAtomValue(workflowViewingVersionAtom);
  const activeVersionForSave = useAtomValue(workflowActiveVersionAtom);

  const effectiveWorkflowId = workflowIdFromUrl ?? persistedWorkflowId;
  const tenantId = useAtomValue(tenantIdAtom);

  /** False until GET /api/workflows has applied graph + viewport — avoids writing nodes=[] over a good draft. */
  const [canvasHydrated, setCanvasHydrated] = useState(false);

  const persistCanvasDraft =
    !effectiveWorkflowId || !tenantId ? true : canvasHydrated;

  const { onViewportChange, withPersistSuppressed } = useCanvasDraftPersistence(effectiveWorkflowId, {
    persistEnabled: persistCanvasDraft,
  });

  useEffect(() => {
    if (workflowIdFromUrl) {
      setPersistedWorkflowId(workflowIdFromUrl);
    }
  }, [workflowIdFromUrl, setPersistedWorkflowId]);

  useEffect(() => {
    if (!effectiveWorkflowId) {
      workflowLoadScopeRef.current = '';
      setWorkflowActiveVersion(null);
      setWorkflowCreator(null);
      setWorkflowVersionsList([]);
      setWorkflowLastUpdated('—');
      setViewingVersion(null);
      setPendingVersionLoad(null);
    }
  }, [
    effectiveWorkflowId,
    setWorkflowActiveVersion,
    setWorkflowCreator,
    setWorkflowVersionsList,
    setWorkflowLastUpdated,
    setViewingVersion,
    setPendingVersionLoad,
  ]);

  useEffect(() => {
    if (!effectiveWorkflowId || !tenantId) {
      setCanvasHydrated(false);
      return;
    }
    const scope = `${tenantId}:${effectiveWorkflowId}`;
    const scopeChanged = workflowLoadScopeRef.current !== scope;
    workflowLoadScopeRef.current = scope;

    let cancelled = false;
    setCanvasHydrated(false);

    const markHydrated = () => {
      if (!cancelled) setCanvasHydrated(true);
    };

    (async () => {
      try {
        if (scopeChanged) {
          setViewingVersion(null);
          setPendingVersionLoad(null);
        }
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          markHydrated();
          return;
        }
        const meta = await fetchWorkflowMeta(effectiveWorkflowId, token);
        if (!meta || cancelled) {
          markHydrated();
          return;
        }
        const w = meta.workflow;
        const ver = w.versions?.[0];
        setWorkflowCreator(meta.createdBy);
        setWorkflowSettings(parseWorkflowSettings(w.settings));
        setWorkflowVersionsList(versionSummariesFromWorkflow(w));
        setWorkflowLastUpdated(formatRelativeTime(w.updatedAt));
        if (typeof w.activeVersion === 'number') {
          setWorkflowActiveVersion(w.activeVersion);
        }
        if (cancelled) return;
        const draft = readLocalCanvasDraft(tenantId, effectiveWorkflowId);

        withPersistSuppressed(() => {
          const serverName = w.name ?? 'Untitled workflow';
          const titleFromDraft =
            draft &&
            typeof draft.workflowTitle === 'string' &&
            draft.workflowTitle.trim() !== ''
              ? draft.workflowTitle
              : null;
          setWorkflowTitle(titleFromDraft ?? serverName);
          const parsed = parseEditorState(ver?.editorState);
          if (parsed && parsed.nodes.length > 0) {
            setNodes(parsed.nodes);
            setEdges(parsed.edges);
          } else {
            const { nodes: n, edges: e } = importDagToCanvas(ver?.definition);
            const serverEmpty = n.length === 0 && e.length === 0;
            if (serverEmpty && draft && (draft.nodes.length > 0 || draft.edges.length > 0)) {
              setNodes(draft.nodes);
              setEdges(draft.edges);
            } else {
              setNodes(n);
              setEdges(e);
            }
          }
        });

        requestAnimationFrame(() => {
          if (cancelled) return;
          if (draft?.viewport) {
            setViewport(draft.viewport);
          } else {
            fitView({ padding: 0.1 });
          }
          // After React commits graph + viewport, allow draft persistence (see useCanvasDraftPersistence).
          setTimeout(markHydrated, 0);
        });
      } catch (e) {
        console.error('[canvas] load workflow', e);
        markHydrated();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveWorkflowId,
    tenantId,
    setWorkflowTitle,
    setNodes,
    setEdges,
    setViewport,
    fitView,
    withPersistSuppressed,
    setWorkflowActiveVersion,
    setWorkflowCreator,
    setWorkflowSettings,
    setWorkflowVersionsList,
    setWorkflowLastUpdated,
    setViewingVersion,
    setPendingVersionLoad,
  ]);

  const canAutosaveDraft =
    viewingVersion === null ||
    (activeVersionForSave != null && viewingVersion === activeVersionForSave);

  useDebouncedWorkflowSave(
    !!effectiveWorkflowId && !!tenantId && canvasHydrated && canAutosaveDraft
  );

  const onNodesChange = useCallback(
    (changes: any) => {
      if (!canEdit) return;
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes, canEdit]
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      if (!canEdit) return;
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges, canEdit]
  );

  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    entity: { id: string | null; type: 'node' | 'edge' | 'pane' };
  } | null>(null);

  const [miniMenu, setMiniMenu] = React.useState<{
    x: number;
    y: number;
    sourceNodeId: string;
  } | null>(null);
  const connectingNodeId = React.useRef<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: string } | null>(null);

  useEffect(() => {
    const target = pendingVersionLoad;
    if (target == null || !effectiveWorkflowId || !tenantId) return;
    const myGen = ++versionSwitchGenerationRef.current;
    let cancelled = false;

    const clearPendingIfStale = () => {
      setPendingVersionLoad((prev) => (prev === target ? null : prev));
    };

    (async () => {
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) {
          clearPendingIfStale();
          return;
        }
        const meta = await fetchWorkflowAtVersion(effectiveWorkflowId, target, token);
        if (cancelled || myGen !== versionSwitchGenerationRef.current) return;
        if (!meta) {
          clearPendingIfStale();
          return;
        }
        const w = meta.workflow;
        const ver = w.versions?.[0];
        if (!ver) {
          clearPendingIfStale();
          return;
        }

        let nextNodes: Node[];
        let nextEdges: Edge[];
        const parsed = parseEditorState(ver.editorState);
        if (parsed && parsed.nodes.length > 0) {
          nextNodes = parsed.nodes;
          nextEdges = parsed.edges;
        } else {
          const imp = importDagToCanvas(ver.definition);
          nextNodes = imp.nodes;
          nextEdges = imp.edges;
        }

        if (myGen !== versionSwitchGenerationRef.current) return;

        withPersistSuppressed(() => {
          setWorkflowTitle(w.name ?? 'Untitled workflow');
          setNodes(nextNodes);
          setEdges(nextEdges);
        });

        for (const n of nextNodes) {
          store.set(nodeExecutionFamily(n.id), {
            nodeId: n.id,
            status: 'idle',
          });
        }

        setSelectedNode(null);
        setSidebarOpen(false);

        requestAnimationFrame(() => {
          if (cancelled || myGen !== versionSwitchGenerationRef.current) return;
          fitView({ padding: 0.1 });
          setTimeout(() => {
            if (cancelled || myGen !== versionSwitchGenerationRef.current) return;
            const head = w.activeVersion;
            if (typeof head === 'number' && target === head) {
              setViewingVersion(null);
            } else {
              setViewingVersion(target);
            }
            clearPendingIfStale();
          }, 0);
        });
      } catch (e) {
        console.error('[canvas] load workflow version', e);
        clearPendingIfStale();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pendingVersionLoad,
    effectiveWorkflowId,
    tenantId,
    setWorkflowTitle,
    setNodes,
    setEdges,
    withPersistSuppressed,
    fitView,
    store,
    setViewingVersion,
    setPendingVersionLoad,
  ]);

  const executionMonitorActive = useAtomValue(executionMonitorActiveAtom);
  const setExecutionMonitorActive = useSetAtom(executionMonitorActiveAtom);
  const runStatus = useAtomValue(runStatusAtom);
  const runStreamStatus = useAtomValue(runStreamStatusAtom);
  const runSidebarLocked =
    runStatus === 'running' || runStreamStatus === 'connecting';

  useEffect(() => {
    function handleDagStep(evt: Event) {
      const msg = (evt as CustomEvent).detail as {
        stepId: string;
        status: string;
        logs?: string;
        error?: string;
        outputs?: Record<string, unknown>;
        durationMs?: number;
      };

      store.set(nodeExecutionFamily(msg.stepId), {
        nodeId: msg.stepId,
        status: mapStatus(msg.status),
        logs: msg.logs,
        error: msg.error,
        outputs: msg.outputs,
        durationMs: msg.durationMs,
      });
    }

    window.addEventListener('dag:step', handleDagStep);
    return () => window.removeEventListener('dag:step', handleDagStep);
  }, [store]);

  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  const onConnect = useCallback(
    (params: any) => {
      if (!canEdit) return;
      setEdges((eds) =>
        addEdge({ ...params, type: 'smoothstep', animated: true, style: defaultEdgeStyle }, eds)
      );
    },
    [setEdges, canEdit]
  );

  const handleAddNode = useCallback(
    (
      type: 'condition' | 'http' | 'delay' | 'script',
      meta?: { x: number; y: number; sourceId: string | null }
    ) => {
      if (!canEdit) return;
      const nid = newNodeId();
      let position = { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 };
      if (meta) position = screenToFlowPosition({ x: meta.x, y: meta.y });
      setNodes((nds) => [...nds, { id: nid, type, position, data: {} }]);
      if (meta?.sourceId) {
        setEdges((eds) => [
          ...eds,
          {
            id: `e${meta.sourceId}-${nid}`,
            source: meta.sourceId!,
            target: nid,
            type: 'smoothstep',
            animated: true,
            style: defaultEdgeStyle,
          },
        ]);
      }
    },
    [setNodes, setEdges, screenToFlowPosition, canEdit]
  );

  const onConnectStart = useCallback(
    (_: any, { nodeId }: any) => {
      if (!canEdit) return;
      connectingNodeId.current = nodeId;
    },
    [canEdit]
  );

  const onConnectEnd = useCallback((event: any, connectionState: any) => {
    if (!canEdit) return;
    if (connectionState.isValid) return;
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    const sourceNodeId = connectionState?.fromNode?.id || connectingNodeId.current;
    setMiniMenu({ x: clientX, y: clientY, sourceNodeId });
    connectingNodeId.current = null;
  }, [canEdit]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: any) => {
    if (!canEdit) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entity: { id: node.id, type: 'node' } });
  }, [canEdit]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: any) => {
    if (!canEdit) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entity: { id: edge.id, type: 'edge' } });
  }, [canEdit]);

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: any) => {
      e.preventDefault();
      if (!canEdit) return;
      if (runSidebarLocked) return;
      setSelectedNode({ id: node.id, type: node.type });
      setSidebarOpen(true);
    },
    [runSidebarLocked, canEdit]
  );

  const applyAiDag = useCallback(
    (dag: DagSchema) => {
      if (!canEdit) return;
      const imported = importDagToCanvas(dag);
      const layouted = getLayoutedElements(imported.nodes, imported.edges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      requestAnimationFrame(() => {
        fitView({ padding: 0.15 });
      });
    },
    [setNodes, setEdges, fitView, canEdit]
  );

  if (!authed) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#fafaf5] font-['Manrope'] text-[13px] font-semibold text-[#afb3ac]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#fafaf5] font-sans overflow-hidden text-[#2f342e]">
      <style>{`
        .react-flow__nodesselection-rect { display: none !important; border: none !important; }
      `}</style>

      <main className="flex-1 flex flex-col relative min-w-0">
        <TopHeader />
        <div className="flex-1 flex w-full relative overflow-hidden">
          {canEdit && <NodeLibrary onAddNode={handleAddNode} />}

          <div className="flex-1 h-full relative min-w-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onNodeContextMenu={onNodeContextMenu}
              onEdgeContextMenu={onEdgeContextMenu}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={() => {
                setMenu(null);
                setMiniMenu(null);
              }}
              onPaneContextMenu={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, entity: { id: null, type: 'pane' } });
                setMiniMenu(null);
              }}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              edgesReconnectable={canEdit}
              onViewportChange={onViewportChange}
              nodeTypes={nodeTypes}
              panOnScroll={inputMode === 'trackpad'}
              zoomOnScroll={inputMode === 'mouse'}
              panOnDrag={false}
              selectionOnDrag={inputMode === 'mouse' || inputMode === 'trackpad'}
              panActivationKeyCode="Shift"
              selectionKeyCode={null}
              selectionMode={'partial' as any}
              elementsSelectable={true}
            >
              <Background gap={24} size={2} color="#afb3ac" style={{ backgroundColor: '#fafaf5' }} />

              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-xl z-20 shadow-[0_12px_40px_rgba(47,52,46,0.06)]">
                <button
                  type="button"
                  className="p-2 hover:bg-[#edefe8] rounded-lg text-[#afb3ac] transition-colors"
                >
                  <MaterialIcon icon="add" />
                </button>
                <div className="w-px h-4 bg-[#edefe8] mx-1" />
                <button
                  type="button"
                  className="p-2 hover:bg-[#edefe8] rounded-lg text-[#afb3ac] transition-colors"
                >
                  <MaterialIcon icon="remove" />
                </button>
                <div className="w-px h-4 bg-[#edefe8] mx-1" />
                <button
                  type="button"
                  className="p-2 hover:bg-[#edefe8] rounded-lg text-[#afb3ac] transition-colors"
                >
                  <MaterialIcon icon="center_focus_weak" />
                </button>
                <div className="px-3 py-1.5 text-xs font-semibold text-[#afb3ac]">100%</div>
              </div>

              <Panel
                position="bottom-right"
                className="bg-white/90 backdrop-blur-md px-2 py-1.5 rounded-xl shadow-[0_12px_40px_rgba(47,52,46,0.06)] m-6 flex gap-1 items-center"
              >
                <button
                  type="button"
                  onClick={() => setInputMode('mouse')}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                    inputMode === 'mouse'
                      ? 'bg-[#9ec2fe]/30 text-[#3a6095]'
                      : 'text-[#afb3ac] hover:text-[#2f342e] hover:bg-[#edefe8]'
                  }`}
                  title="Mouse Mode"
                >
                  <MaterialIcon icon="mouse" className="text-xl" />
                </button>
                <div className="w-px h-5 bg-[#edefe8] mx-1" />
                <button
                  type="button"
                  onClick={() => setInputMode('trackpad')}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                    inputMode === 'trackpad'
                      ? 'bg-[#9ec2fe]/30 text-[#3a6095]'
                      : 'text-[#afb3ac] hover:text-[#2f342e] hover:bg-[#edefe8]'
                  }`}
                  title="Trackpad Mode"
                >
                  <MaterialIcon icon="touchpad_mouse" className="text-xl" />
                </button>
                {canEdit && (
                  <>
                    <div className="w-px h-5 bg-[#edefe8] mx-1" />
                    <CanvasAiAssistant
                      workflowTitle={workflowTitle}
                      nodes={nodes}
                      edges={edges}
                      workflowSettings={workflowSettings}
                      onApplyDag={applyAiDag}
                      compactTrigger
                    />
                  </>
                )}
              </Panel>

              {canEdit && menu && (
                <ContextMenu
                  x={menu.x}
                  y={menu.y}
                  entity={menu.entity}
                  onClose={() => setMenu(null)}
                />
              )}

              {canEdit && miniMenu && (
                <div
                  style={{
                    position: 'fixed',
                    left: miniMenu.x,
                    top: Math.max(0, miniMenu.y - 60),
                    zIndex: 60,
                  }}
                  className="absolute"
                >
                  <NodeLibrary
                    isMini
                    onAddNode={(type) => {
                      handleAddNode(type, {
                        x: miniMenu.x,
                        y: miniMenu.y,
                        sourceId: miniMenu.sourceNodeId,
                      });
                      setMiniMenu(null);
                    }}
                  />
                </div>
              )}
            </ReactFlow>
          </div>

          {executionMonitorActive && (
            <ExecutionSidebar
              nodes={nodes}
              workflowId={effectiveWorkflowId ?? null}
              runLocked={runSidebarLocked}
              onClose={() => {
                setExecutionMonitorActive(false);
                if (!selectedNode) setSidebarOpen(false);
              }}
            />
          )}
          {sidebarOpen && !executionMonitorActive && selectedNode && (
            <NodeSettings
              nodeId={selectedNode.id}
              nodeType={selectedNode.type}
              onClose={() => setSidebarOpen(false)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#fafaf5] font-['Manrope'] text-[13px] font-semibold text-[#afb3ac]">
      Loading canvas…
    </div>
  );
}

export default function CanvasPage() {
  return (
    <Provider>
      <ReactFlowProvider>
        <Suspense fallback={<CanvasFallback />}>
          <WorkflowCanvas />
        </Suspense>
      </ReactFlowProvider>
    </Provider>
  );
}
