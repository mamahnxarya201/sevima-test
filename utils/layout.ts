import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 100 });

  nodes.forEach((node) => {
    const width = node.measured?.width ?? 280; // approximate BaseNode boundary 
    const height = node.measured?.height ?? 120;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 280 / 2,
        y: nodeWithPosition.y - 120 / 2,
      }
    };
  });

  return { nodes: newNodes, edges };
};
