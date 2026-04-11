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

// Layout & UI Components
import { Sidebar } from '../components/layout/Sidebar';
import { TopHeader } from '../components/layout/TopHeader';
import { MaterialIcon } from '../components/ui/MaterialIcon';

// Custom Nodes
import { TriggerNode } from '../components/nodes/TriggerNode';
import { HttpNode } from '../components/nodes/HttpNode';
import { ConditionNode } from '../components/nodes/ConditionNode';
import { ScriptNode } from '../components/nodes/ScriptNode';
import { DelayNode } from '../components/nodes/DelayNode';

const nodeTypes = {
  trigger: TriggerNode,
  http: HttpNode,
  script: ScriptNode,
  delay: DelayNode,
  condition: ConditionNode,
};

// Initial state showcasing mock live execution statuses
const initialNodes = [
  { id: '1', type: 'trigger', position: { x: 300, y: 50 }, data: { status: 'success' } },
  { id: '2', type: 'http', position: { x: 300, y: 150 }, data: { status: 'success' } },
  { id: '3', type: 'condition', position: { x: 260, y: 280 }, data: { status: 'running' } },
  { id: '4', type: 'delay', position: { x: 150, y: 460 }, data: { status: 'idle' } },
  { id: '5', type: 'script', position: { x: 450, y: 460 }, data: { status: 'failed' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
  { id: 'e3-4', source: '3', sourceHandle: 'true', target: '4', animated: true },
  { id: 'e3-5', source: '3', sourceHandle: 'false', target: '5', animated: true },
] as any[];

let id = 6;
const getId = () => `${id++}`;

export default function WorkflowPrototyper() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [inputMode, setInputMode] = React.useState<'mouse' | 'trackpad'>('mouse');

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

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#afb3ac', strokeWidth: 2, strokeDasharray: '4' } }, eds)),
    [setEdges]
  );

  return (
    <div className="flex h-screen w-full bg-[#fafaf5] font-sans overflow-hidden text-stone-800">
      {/* Import Manrope and Inter fonts & Icons from HTML */}
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
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

        {/* Drag & Drop Node Library (Minimalist Strip) */}
        <div className="absolute top-20 left-6 flex items-center gap-3 p-2 bg-white/60 backdrop-blur-md rounded-2xl border border-stone-200 shadow-sm z-20">
          <button 
            onClick={() => setNodes(nds => nds.concat({ id: getId(), type: 'trigger', position: { x: 100, y: 100 }, data: { status: 'idle' } }))}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white transition-all text-stone-500 rounded-xl shadow-sm" title="Add Trigger">
            <MaterialIcon icon="add_circle" />
          </button>
          <div className="w-[1px] h-6 bg-stone-200"></div>
          <button onClick={() => setNodes(nds => nds.concat({ id: getId(), type: 'condition', position: { x: 100, y: 100 }, data: { status: 'idle' } }))} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Logic"><MaterialIcon icon="fork_right" /></button>
          <button onClick={() => setNodes(nds => nds.concat({ id: getId(), type: 'http', position: { x: 100, y: 100 }, data: { status: 'idle' } }))} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Action"><MaterialIcon icon="cloud_sync" /></button>
          <button onClick={() => setNodes(nds => nds.concat({ id: getId(), type: 'delay', position: { x: 100, y: 100 }, data: { status: 'idle' } }))} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Delay"><MaterialIcon icon="timer" /></button>
          <button onClick={() => setNodes(nds => nds.concat({ id: getId(), type: 'script', position: { x: 100, y: 100 }, data: { status: 'idle' } }))} className="w-10 h-10 flex items-center justify-center bg-white hover:bg-blue-600 hover:text-white rounded-xl text-stone-500 transition-colors shadow-sm" title="Script"><MaterialIcon icon="terminal" /></button>
        </div>

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