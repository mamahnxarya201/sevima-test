import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { MaterialIcon } from './MaterialIcon';

export interface ContextMenuProps {
  x: number;
  y: number;
  entity: { id: string | null; type: 'node' | 'edge' | 'pane' };
  onClose: () => void;
}

import { getLayoutedElements } from '../../utils/layout';

export const ContextMenu = ({ x, y, entity, onClose }: ContextMenuProps) => {
  const { setNodes, setEdges, getNodes, getEdges, fitView } = useReactFlow();

  const selectedNodes = getNodes().filter(n => n.selected);
  const selectedEdges = getEdges().filter(e => e.selected);
  const totalSelected = selectedNodes.length + selectedEdges.length;

  const isEntitySelected = 
    (entity.type === 'node' && selectedNodes.some(n => n.id === entity.id)) ||
    (entity.type === 'edge' && selectedEdges.some(e => e.id === entity.id));

  const isBulkAction = isEntitySelected && totalSelected > 1;

  const handleDelete = () => {
    if (isBulkAction) {
      const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
      const selectedEdgeIds = new Set(selectedEdges.map(e => e.id));
      
      setNodes((nodes) => nodes.filter(n => !selectedNodeIds.has(n.id)));
      setEdges((edges) => edges.filter(e => 
        !selectedEdgeIds.has(e.id) && 
        !selectedNodeIds.has(e.source) && 
        !selectedNodeIds.has(e.target)
      ));
    } else {
      if (entity.type === 'node') {
        setNodes((nodes) => nodes.filter((n) => n.id !== entity.id));
        setEdges((edges) => edges.filter((e) => e.source !== entity.id && e.target !== entity.id));
      } else if (entity.type === 'edge') {
        setEdges((edges) => edges.filter((e) => e.id !== entity.id));
      }
    }
    onClose();
  };

  const handleAutoLayout = () => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(getNodes(), getEdges());
    
    // Inject smooth transitions specifically for layout operations
    setNodes((nds) => nds.map(n => ({
      ...newNodes.find(nn => nn.id === n.id)!,
      style: { ...n.style, transition: 'transform 0.5s ease-out' }
    })));
    setEdges([...newEdges]);
    onClose();
    
    setTimeout(() => {
      window.requestAnimationFrame(() => fitView({ duration: 800, padding: 0.1 }));
      
      // Cleanup inline transition hook restoring precise dragging capability!
      setTimeout(() => {
         setNodes((nds) => nds.map(n => {
           const newStyle = { ...n.style };
           delete newStyle.transition;
           return { ...n, style: newStyle };
         }));
      }, 550);
    }, 50);
  };

  return (
    <>
      {/* Invisible overlay cleanly capturing outside dismiss clicks globally */}
      <div 
        className="fixed inset-0 z-40" 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
        onClick={onClose} 
      />
      
      {/* Absolute Context Menu Layer */}
      <div 
        style={{ left: x, top: y }}
        className="fixed z-50 w-52 bg-white backdrop-blur-md border border-stone-200 shadow-xl rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex flex-col py-1.5 p-1">
           {entity.type === 'pane' ? (
             <button 
               onClick={handleAutoLayout}
               className="px-3 py-2 text-[13px] font-semibold text-stone-700 hover:bg-stone-100 rounded-lg flex items-center justify-between transition-colors text-left"
             >
               <span className="flex items-center gap-2">
                 <MaterialIcon icon="account_tree" className="text-[18px] text-blue-600" />
                 Auto Layout
               </span>
               <span className="text-[10px] text-stone-400 font-mono tracking-tighter">Arr</span>
             </button>
           ) : (
             <button 
               onClick={handleDelete}
               className="px-3 py-2 text-[13px] font-semibold text-red-600 hover:bg-stone-100 rounded-lg flex items-center justify-between transition-colors text-left"
             >
               <span className="flex items-center gap-2">
                 <MaterialIcon icon="delete" className="text-[18px]" />
                 {isBulkAction ? `Delete All (${totalSelected})` : (entity.type === 'node' ? 'Delete Node' : 'Delete Connection')}
               </span>
               <span className="text-[10px] text-stone-400 font-mono tracking-tighter">Del</span>
             </button>
           )}
        </div>
      </div>
    </>
  );
};
