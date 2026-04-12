'use client';

import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Provider, useSetAtom, useAtomValue } from 'jotai';

// Layout & UI Components
import { Sidebar } from '../components/layout/Sidebar';
import { TopHeader } from '../components/layout/TopHeader';
import { MaterialIcon } from '../components/ui/MaterialIcon';
import { NodeLibrary } from '../components/ui/NodeLibrary';

// Custom Nodes
import { TriggerNode } from '../components/nodes/TriggerNode';
import { HttpNode } from '../components/nodes/HttpNode';
import { ConditionNode } from '../components/nodes/ConditionNode';
import { ScriptNode } from '../components/nodes/ScriptNode';
import { DelayNode } from '../components/nodes/DelayNode';

// Jotai State
import { nodeExecutionFamily, isLiveConnectionEnabledAtom } from '../store/executionStore';

const nodeTypes = {
  trigger: TriggerNode,
  http: HttpNode,
  script: ScriptNode,
  delay: DelayNode,
  condition: ConditionNode,
};

// Initial state showcasing purely configurational values now (volatiles removed!)
const initialNodes = [
  { id: '1', type: 'trigger', position: { x: 300, y: 50 }, data: {} },
  { id: '2', type: 'http', position: { x: 300, y: 150 }, data: {} },
  { id: '3', type: 'condition', position: { x: 260, y: 280 }, data: {} },
  { id: '4', type: 'delay', position: { x: 150, y: 460 }, data: {} },
  { id: '5', type: 'script', position: { x: 450, y: 460 }, data: {} },
];

const defaultEdgeStyle = { stroke: '#94a3b8', strokeWidth: 3, strokeDasharray: '6' };

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
  { id: 'e2-3', source: '2', target: '3', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
  { id: 'e3-4', source: '3', sourceHandle: 'true', target: '4', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
  { id: 'e3-5', source: '3', sourceHandle: 'false', target: '5', animated: true, type: 'smoothstep', style: defaultEdgeStyle },
] as any[];

let id = 6;
const getId = () => `${id++}`;

function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [inputMode, setInputMode] = React.useState<'mouse' | 'trackpad'>('mouse');

  // Memory Atom Tie-ins to simulate highly-scalable WebSockets
  const setNode1 = useSetAtom(nodeExecutionFamily('1'));
  const setNode2 = useSetAtom(nodeExecutionFamily('2'));
  const setNode3 = useSetAtom(nodeExecutionFamily('3'));
  const setNode4 = useSetAtom(nodeExecutionFamily('4'));
  const setNode5 = useSetAtom(nodeExecutionFamily('5'));

  const isLive = useAtomValue(isLiveConnectionEnabledAtom);

  // Disable native context menu robustly to handle Firefox race conditions
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Simulating an arriving WebSocket payload vs traditional API Fetch Protocol
  useEffect(() => {
    if (!isLive) {
      // Execute mocked REST Initial Fetch Protocol
      console.log("[ExecutionStore] Fetching Static REST Snapshot...");
      setTimeout(() => {
        setNode1({ nodeId: '1', status: 'success' });
        setNode2({ nodeId: '2', status: 'success' });
        setNode3({ nodeId: '3', status: 'idle' });
        setNode4({ nodeId: '4', status: 'idle', isLoading: true });
        setNode5({ nodeId: '5', status: 'idle' });
      }, 500);
      return;
    }

    // Entering Live Event Socket Loop Mode
    console.log("[ExecutionStore] Establishing Live WebSocket Stream...");

    // Wipe specific nodes to show a fresh 'loading' phase simulating real-time activity
    setNode3({ nodeId: '3', status: 'running' });
    setNode4({ nodeId: '4', status: 'running' });
    setNode5({ nodeId: '5', status: 'idle' });

    // Stream random mock error directly via websocket
    const simulateLiveIncomingPacket = setInterval(() => {
      setNode5({ nodeId: '5', status: 'failed', error: "WS Event: Dynamic payload violation in streaming context." });
    }, 2000);

    return () => {
      console.log("[ExecutionStore] Halting Live WebSocket Stream...");
      clearInterval(simulateLiveIncomingPacket);
    };
  }, [isLive, setNode1, setNode2, setNode3, setNode4, setNode5]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, style: defaultEdgeStyle }, eds)),
    [setEdges]
  );

  const handleAddNode = useCallback((type: 'trigger' | 'condition' | 'http' | 'delay' | 'script') => {
    // Generate new nodes roughly in the middle of standard viewport
    setNodes(nds => nds.concat({ id: getId(), type, position: { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 }, data: {} }));
  }, [setNodes]);

  return (
    <div className="flex h-screen w-full bg-[#fafaf5] font-sans overflow-hidden text-stone-800">
      {/* Import Manrope and Inter fonts & Icons from HTML */}
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <style>{`
        .react-flow__nodesselection-rect {
          display: none !important;
          border: none !important;
        }
      `}</style>

      {/* Extracted Sidebar Layout */}
      <Sidebar />

      <main className="flex-1 flex flex-col relative">
        {/* Extracted Top Header Layout */}
        <TopHeader />

        {/* Extracted Vertical Action Menu */}
        <NodeLibrary onAddNode={handleAddNode} />

        {/* Canvas Area */}
        <div className="flex-1 w-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            panOnScroll={inputMode === 'trackpad'}
            zoomOnScroll={inputMode === 'mouse'}
            panOnDrag={false}
            selectionOnDrag={inputMode === 'mouse'}
            panActivationKeyCode="Shift"
            selectionKeyCode={null}
            selectionMode={"partial" as any}
            elementsSelectable={true}
          >
            {/* Native XYFlow styling for the dot grid using stitch colors */}
            <Background gap={24} size={2} color="#afb3ac" style={{ backgroundColor: '#fafaf5' }} />

            {/* Centered Zoom Controls Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white shadow-xl p-1.5 rounded-xl z-20 border border-stone-200">
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                <MaterialIcon icon="add" />
              </button>
              <div className="w-[1px] h-4 bg-stone-200 mx-1"></div>
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                <MaterialIcon icon="remove" />
              </button>
              <div className="w-[1px] h-4 bg-stone-200 mx-1"></div>
              <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors">
                <MaterialIcon icon="center_focus_weak" />
              </button>
              <div className="px-3 py-1.5 text-xs font-semibold text-stone-500">100%</div>
            </div>

            {/* Input Mode Toggle */}
            <Panel position="bottom-right" className="bg-white px-2 py-1.5 rounded-xl shadow-lg border border-stone-200 m-6 flex gap-1 items-center">
              <button
                onClick={() => setInputMode('mouse')}
                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${inputMode === 'mouse' ? 'bg-blue-50 text-blue-600' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
                title="Mouse Mode (Shift+Drag to pan, Scroll to zoom, Drag to select)"
              >
                <MaterialIcon icon="mouse" className="text-xl" />
              </button>
              <div className="w-[1px] h-5 bg-stone-200 mx-1"></div>
              <button
                onClick={() => setInputMode('trackpad')}
                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${inputMode === 'trackpad' ? 'bg-blue-50 text-blue-600' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
                title="Trackpad Mode (Scroll to pan, pinch/cmd-scroll to zoom)"
              >
                <MaterialIcon icon="touchpad_mouse" className="text-xl" />
              </button>
            </Panel>
          </ReactFlow>
        </div>
      </main>
    </div>
  );
}

// Ensure SSR Strict Memory Boundary by mounting Jotai universally!
export default function WorkflowPrototyper() {
  return (
    <Provider>
      <WorkflowCanvas />
    </Provider>
  );
}