'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Provider, useSetAtom, useAtomValue, useAtom, useStore } from 'jotai';

import { TopHeader } from '../../components/layout/TopHeader';
import { MaterialIcon } from '../../components/ui/MaterialIcon';
import { NodeLibrary } from '../../components/ui/NodeLibrary';
import { ContextMenu } from '../../components/ui/ContextMenu';
import { ExecutionSidebar } from '../../components/ui/ExecutionSidebar';
import { NodeSettings } from '../../components/ui/NodeSettings';

import { HttpNode } from '../../components/nodes/HttpNode';
import { ConditionNode } from '../../components/nodes/ConditionNode';
import { ScriptNode } from '../../components/nodes/ScriptNode';
import { DelayNode } from '../../components/nodes/DelayNode';

import { nodeExecutionFamily, isLiveConnectionEnabledAtom } from '../../store/executionStore';
import { nodesAtom, edgesAtom, persistedWorkflowIdAtom, workflowTitleAtom } from '../../store/workflowStore';
import type { DAGExecutionPayload, ExecutionStatus } from '../../store/executionStore';
import { authClient } from '@/lib/auth/auth-client';
import { parseEditorState } from '@/lib/canvas/editorState';
import { importDagToCanvas } from '@/lib/canvas/dagImporter';

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
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [edges, setEdges] = useAtom(edgesAtom);
  const [inputMode, setInputMode] = React.useState<'mouse' | 'trackpad'>('mouse');
  const { screenToFlowPosition } = useReactFlow();
  const store = useStore();

  const searchParams = useSearchParams();
  const workflowIdFromUrl = searchParams.get('workflowId');
  const [persistedWorkflowId, setPersistedWorkflowId] = useAtom(persistedWorkflowIdAtom);
  const setWorkflowTitle = useSetAtom(workflowTitleAtom);

  const effectiveWorkflowId = workflowIdFromUrl ?? persistedWorkflowId;

  useEffect(() => {
    if (workflowIdFromUrl) {
      setPersistedWorkflowId(workflowIdFromUrl);
    }
  }, [workflowIdFromUrl, setPersistedWorkflowId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!effectiveWorkflowId) return;
      try {
        const { data: tokenData } = await authClient.token();
        const token = tokenData?.token ?? '';
        if (!token) return;
        const res = await fetch(`/api/workflows/${effectiveWorkflowId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const w = data.workflow;
        const ver = w.versions?.[0];
        if (cancelled) return;
        setWorkflowTitle(w.name ?? 'Untitled workflow');
        const parsed = parseEditorState(ver?.editorState);
        if (parsed && parsed.nodes.length > 0) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
        } else {
          const { nodes: n, edges: e } = importDagToCanvas(ver?.definition);
          setNodes(n);
          setEdges(e);
        }
      } catch (e) {
        console.error('[canvas] load workflow', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveWorkflowId, setWorkflowTitle, setNodes, setEdges]);

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
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

  const isLive = useAtomValue(isLiveConnectionEnabledAtom);

  useEffect(() => {
    function handleDagStep(evt: Event) {
      const msg = (evt as CustomEvent).detail as {
        stepId: string;
        status: string;
        logs?: string;
        error?: string;
        outputs?: Record<string, unknown>;
      };

      store.set(nodeExecutionFamily(msg.stepId), {
        nodeId: msg.stepId,
        status: mapStatus(msg.status),
        logs: msg.logs,
        error: msg.error,
        outputs: msg.outputs,
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

  useEffect(() => {
    if (isLive) return;
    const t = setTimeout(() => {
      nodes.forEach((n, i) => {
        const statuses: ExecutionStatus[] = ['success', 'success', 'idle', 'idle', 'idle'];
        store.set(nodeExecutionFamily(n.id), {
          nodeId: n.id,
          status: statuses[i % statuses.length] ?? 'idle',
          isLoading: i === 3,
        });
      });
    }, 500);
    return () => clearTimeout(t);
  }, [isLive, nodes, store]);

  const onConnect = useCallback(
    (params: any) =>
      setEdges((eds) =>
        addEdge({ ...params, type: 'smoothstep', animated: true, style: defaultEdgeStyle }, eds)
      ),
    [setEdges]
  );

  const handleAddNode = useCallback(
    (
      type: 'condition' | 'http' | 'delay' | 'script',
      meta?: { x: number; y: number; sourceId: string | null }
    ) => {
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
    [setNodes, setEdges, screenToFlowPosition]
  );

  const onConnectStart = useCallback((_: any, { nodeId }: any) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd = useCallback((event: any, connectionState: any) => {
    if (connectionState.isValid) return;
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    const sourceNodeId = connectionState?.fromNode?.id || connectingNodeId.current;
    setMiniMenu({ x: clientX, y: clientY, sourceNodeId });
    connectingNodeId.current = null;
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: any) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entity: { id: node.id, type: 'node' } });
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: any) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, entity: { id: edge.id, type: 'edge' } });
  }, []);

  const onNodeDoubleClick = useCallback((e: React.MouseEvent, node: any) => {
    e.preventDefault();
    setSelectedNode({ id: node.id, type: node.type });
    setSidebarOpen(true);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#fafaf5] font-sans overflow-hidden text-[#2f342e]">
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .react-flow__nodesselection-rect { display: none !important; border: none !important; }
      `}</style>

      <main className="flex-1 flex flex-col relative min-w-0">
        <TopHeader />
        <div className="flex-1 flex w-full relative overflow-hidden">
          <NodeLibrary onAddNode={handleAddNode} />

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
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, entity: { id: null, type: 'pane' } });
                setMiniMenu(null);
              }}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.1 }}
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
              </Panel>

              {menu && (
                <ContextMenu
                  x={menu.x}
                  y={menu.y}
                  entity={menu.entity}
                  onClose={() => setMenu(null)}
                />
              )}

              {miniMenu && (
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

          {sidebarOpen && selectedNode && (
            <>
              {isLive ? (
                <ExecutionSidebar nodes={nodes} onClose={() => setSidebarOpen(false)} />
              ) : (
                <NodeSettings
                  nodeId={selectedNode.id}
                  nodeType={selectedNode.type}
                  onClose={() => setSidebarOpen(false)}
                />
              )}
            </>
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
