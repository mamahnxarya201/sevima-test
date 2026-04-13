'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Panel,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Provider, useSetAtom, useAtomValue } from 'jotai';

// Layout & UI Components
import { Sidebar } from '../components/layout/Sidebar';
import { TopHeader } from '../components/layout/TopHeader';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import { NodeLibrary } from '../components/ui/NodeLibrary';
import { ContextMenu } from '../components/ui/ContextMenu';
import { ExecutionSidebar } from '../components/ui/ExecutionSidebar';
import { NodeSettings } from '../components/ui/NodeSettings';

// Custom Nodes
import { HttpNode } from '../components/nodes/HttpNode';
import { ConditionNode } from '../components/nodes/ConditionNode';
import { ScriptNode } from '../components/nodes/ScriptNode';
import { DelayNode } from '../components/nodes/DelayNode';

// Jotai State
import { nodeExecutionFamily, isLiveConnectionEnabledAtom } from '../store/executionStore';
import type { DAGExecutionPayload, ExecutionStatus } from '../store/executionStore';

const nodeTypes = {
  http: HttpNode,
  script: ScriptNode,
  delay: DelayNode,
  condition: ConditionNode,
};

const initialNodes = [
  { id: '2', type: 'http',      position: { x: 300, y: 150 }, data: {} },
  { id: '3', type: 'condition', position: { x: 260, y: 280 }, data: {} },
  { id: '4', type: 'delay',     position: { x: 150, y: 460 }, data: {} },
  { id: '5', type: 'script',    position: { x: 450, y: 460 }, data: {} },
];

const defaultEdgeStyle = { stroke: '#94a3b8', strokeWidth: 3, strokeDasharray: '6' };

const initialEdges = [
  { id: 'e2-3', source: '2', target: '3', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
  { id: 'e3-4', source: '3', sourceHandle: 'true',  target: '4', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
  { id: 'e3-5', source: '3', sourceHandle: 'false', target: '5', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
] as any[];

let id = 6;
const getId = () => `${id++}`;

// Map backend status strings → ExecutionStatus
function mapStatus(s: string): ExecutionStatus {
  if (s === 'SUCCESS') return 'success';
  if (s === 'FAILED')  return 'failed';
  if (s === 'RUNNING') return 'running';
  if (s === 'RETRYING') return 'retrying';
  return 'idle';
}

function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [inputMode, setInputMode] = React.useState<'mouse' | 'trackpad'>('mouse');
  const { screenToFlowPosition } = useReactFlow();

  // Context Menu
  const [menu, setMenu] = React.useState<{ x: number; y: number; entity: { id: string | null; type: 'node' | 'edge' | 'pane' } } | null>(null);

  // Quick-connect menu
  const [miniMenu, setMiniMenu] = React.useState<{ x: number; y: number; sourceNodeId: string } | null>(null);
  const connectingNodeId = React.useRef<string | null>(null);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: string } | null>(null);

  // Node atom setters — one per initial node
  const setNode1 = useSetAtom(nodeExecutionFamily('1'));
  const setNode2 = useSetAtom(nodeExecutionFamily('2'));
  const setNode3 = useSetAtom(nodeExecutionFamily('3'));
  const setNode4 = useSetAtom(nodeExecutionFamily('4'));
  const setNode5 = useSetAtom(nodeExecutionFamily('5'));

  const isLive = useAtomValue(isLiveConnectionEnabledAtom);

  const setterMap = React.useRef<Map<string, (v: DAGExecutionPayload) => void>>(new Map());
  useEffect(() => {
    setterMap.current.set('1', setNode1);
    setterMap.current.set('2', setNode2);
    setterMap.current.set('3', setNode3);
    setterMap.current.set('4', setNode4);
    setterMap.current.set('5', setNode5);
  }, [setNode1, setNode2, setNode3, setNode4, setNode5]);

  // ── Listen for live dag:step events dispatched by TopHeader's WS handler ──
  useEffect(() => {
    function handleDagStep(evt: Event) {
      const msg = (evt as CustomEvent).detail as {
        stepId: string;
        status: string;
        logs?: string;
        error?: string;
        outputs?: Record<string, unknown>;
      };

      const setter = setterMap.current.get(msg.stepId);
      if (setter) {
        setter({
          nodeId: msg.stepId,
          status: mapStatus(msg.status),
          logs: msg.logs,
          error: msg.error,
          outputs: msg.outputs,
        });
      }
    }

    window.addEventListener('dag:step', handleDagStep);
    return () => window.removeEventListener('dag:step', handleDagStep);
  }, []);

  // ── Disable native context menu ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // ── Mock snapshot when NOT live (dev convenience) ─────────────────────────
  useEffect(() => {
    if (isLive) return;
    const t = setTimeout(() => {
      setNode1({ nodeId: '1', status: 'success' });
      setNode2({ nodeId: '2', status: 'success' });
      setNode3({ nodeId: '3', status: 'idle' });
      setNode4({ nodeId: '4', status: 'idle', isLoading: true });
      setNode5({ nodeId: '5', status: 'idle' });
    }, 500);
    return () => clearTimeout(t);
  }, [isLive, setNode1, setNode2, setNode3, setNode4, setNode5]);

  // ── React Flow callbacks ──────────────────────────────────────────────────

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, style: defaultEdgeStyle }, eds)),
    [setEdges]
  );

  const handleAddNode = useCallback(
    (type: 'condition' | 'http' | 'delay' | 'script', meta?: { x: number; y: number; sourceId: string | null }) => {
      const nid = getId();
      let position = { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 };
      if (meta) position = screenToFlowPosition({ x: meta.x, y: meta.y });
      setNodes((nds) => nds.concat({ id: nid, type, position, data: {} }));
      if (meta?.sourceId) {
        setEdges((eds) => eds.concat({ id: `e${meta.sourceId}-${nid}`, source: meta.sourceId, target: nid, type: 'smoothstep', animated: true, style: defaultEdgeStyle }));
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

  // Double-click node → open sidebar
  const onNodeDoubleClick = useCallback((e: React.MouseEvent, node: any) => {
    e.preventDefault();
    setSelectedNode({ id: node.id, type: node.type });
    setSidebarOpen(true);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#fafaf5] font-sans overflow-hidden text-stone-800">
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <style>{`
        .react-flow__nodesselection-rect { display: none !important; border: none !important; }
      `}</style>

      <Sidebar />

      <main className="flex-1 flex flex-col relative">
        <TopHeader />
        <div className="flex-1 flex w-full relative overflow-hidden">
          <NodeLibrary onAddNode={handleAddNode} />

          {/* Canvas */}
          <div className="flex-1 h-full relative">
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
            onPaneClick={() => { setMenu(null); setMiniMenu(null); }}
            onPaneContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, entity: { id: null, type: 'pane' } }); setMiniMenu(null); }}
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

            {/* Zoom Controls */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white shadow-xl p-1.5 rounded-xl z-20 border border-stone-200">
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"><MaterialIcon icon="add" /></button>
              <div className="w-[1px] h-4 bg-stone-200 mx-1" />
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"><MaterialIcon icon="remove" /></button>
              <div className="w-[1px] h-4 bg-stone-200 mx-1" />
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"><MaterialIcon icon="center_focus_weak" /></button>
              <div className="px-3 py-1.5 text-xs font-semibold text-stone-500">100%</div>
            </div>

            {/* Input Mode Toggle */}
            <Panel position="bottom-right" className="bg-white px-2 py-1.5 rounded-xl shadow-lg border border-stone-200 m-6 flex gap-1 items-center">
              <button
                onClick={() => setInputMode('mouse')}
                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${inputMode === 'mouse' ? 'bg-blue-50 text-blue-600' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
                title="Mouse Mode"
              >
                <MaterialIcon icon="mouse" className="text-xl" />
              </button>
              <div className="w-[1px] h-5 bg-stone-200 mx-1" />
              <button
                onClick={() => setInputMode('trackpad')}
                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${inputMode === 'trackpad' ? 'bg-blue-50 text-blue-600' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
                title="Trackpad Mode"
              >
                <MaterialIcon icon="touchpad_mouse" className="text-xl" />
              </button>
            </Panel>

            {/* Context Menu */}
            {menu && (
              <ContextMenu
                x={menu.x}
                y={menu.y}
                entity={menu.entity}
                onClose={() => setMenu(null)}
              />
            )}

            {/* Quick-connect mini menu */}
            {miniMenu && (
              <div style={{ position: 'fixed', left: miniMenu.x, top: Math.max(0, miniMenu.y - 60), zIndex: 60 }} className="absolute">
                <NodeLibrary isMini onAddNode={(type) => {
                  handleAddNode(type, { x: miniMenu.x, y: miniMenu.y, sourceId: miniMenu.sourceNodeId });
                  setMiniMenu(null);
                }} />
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Execution Sidebar / Node Settings */}
        {sidebarOpen && selectedNode && (
          isLive ? (
            <ExecutionSidebar
              nodes={nodes}
              onClose={() => setSidebarOpen(false)}
            />
          ) : (
            <NodeSettings
              nodeId={selectedNode.id}
              nodeType={selectedNode.type}
              onClose={() => setSidebarOpen(false)}
            />
          )
        )}
      </div>
      </main>
    </div>
  );
}

export default function WorkflowPrototyper() {
  return (
    <Provider>
      <ReactFlowProvider>
        <WorkflowCanvas />
      </ReactFlowProvider>
    </Provider>
  );
}