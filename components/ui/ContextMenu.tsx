import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { MaterialIcon } from './MaterialIcon';
import { getLayoutedElements } from '../../utils/layout';
import { nodesAtom, edgesAtom } from '../../store/workflowStore';

export interface ContextMenuProps {
  x: number;
  y: number;
  entity: { id: string | null; type: 'node' | 'edge' | 'pane' };
  onClose: () => void;
}

/**
 * Canvas graph state must go through Jotai (`nodesAtom` / `edgesAtom`) — the canvas is controlled
 * from those atoms. Do not use `useReactFlow().setNodes/setEdges`; they only touch RF internal
 * state and are overwritten on the next render, breaking persistence and delete.
 */
export const ContextMenu = ({ x, y, entity, onClose }: ContextMenuProps) => {
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);
  const setNodes = useSetAtom(nodesAtom);
  const setEdges = useSetAtom(edgesAtom);
  const { fitView } = useReactFlow();

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const totalSelected = selectedNodes.length + selectedEdges.length;

  const isEntitySelected =
    (entity.type === 'node' && selectedNodes.some((n) => n.id === entity.id)) ||
    (entity.type === 'edge' && selectedEdges.some((e) => e.id === entity.id));

  const isBulkAction = isEntitySelected && totalSelected > 1;

  const handleDelete = () => {
    if (isBulkAction) {
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      const selectedEdgeIds = new Set(selectedEdges.map((e) => e.id));

      setNodes((nds) => nds.filter((n) => !selectedNodeIds.has(n.id)));
      setEdges((eds) =>
        eds.filter(
          (e) =>
            !selectedEdgeIds.has(e.id) &&
            !selectedNodeIds.has(e.source) &&
            !selectedNodeIds.has(e.target)
        )
      );
    } else {
      if (entity.type === 'node' && entity.id) {
        setNodes((nds) => nds.filter((n) => n.id !== entity.id));
        setEdges((eds) => eds.filter((e) => e.source !== entity.id && e.target !== entity.id));
      } else if (entity.type === 'edge' && entity.id) {
        setEdges((eds) => eds.filter((e) => e.id !== entity.id));
      }
    }
    onClose();
  };

  const handleAutoLayout = () => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(nodes, edges);

    setNodes((nds) =>
      nds.map((n) => ({
        ...newNodes.find((nn) => nn.id === n.id)!,
        style: { ...n.style, transition: 'transform 0.5s ease-out' },
      }))
    );
    setEdges([...newEdges]);
    onClose();

    setTimeout(() => {
      window.requestAnimationFrame(() => fitView({ duration: 800, padding: 0.1 }));

      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => {
            const newStyle = { ...n.style };
            delete newStyle.transition;
            return { ...n, style: newStyle };
          })
        );
      }, 550);
    }, 50);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        onClick={onClose}
      />

      <div
        style={{ left: x, top: y }}
        className="fixed z-50 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="flex flex-col p-1 py-1.5">
          {entity.type === 'pane' ? (
            <button
              type="button"
              onClick={handleAutoLayout}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-stone-700 transition-colors hover:bg-stone-100"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon icon="account_tree" className="text-[18px] text-blue-600" />
                Auto Layout
              </span>
              <span className="font-mono text-[10px] tracking-tighter text-stone-400">Arr</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-stone-100"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon icon="delete" className="text-[18px]" />
                {isBulkAction
                  ? `Delete All (${totalSelected})`
                  : entity.type === 'node'
                    ? 'Delete Node'
                    : 'Delete Connection'}
              </span>
              <span className="font-mono text-[10px] tracking-tighter text-stone-400">Del</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};
