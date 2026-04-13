import type { Node, Edge } from '@xyflow/react';

/** Persisted React Flow snapshot stored on WorkflowVersion.editorState */
export type WorkflowEditorState = {
  nodes: Node[];
  edges: Edge[];
};

export function serializeEditorState(nodes: Node[], edges: Edge[]): WorkflowEditorState {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)) as Node[],
    edges: JSON.parse(JSON.stringify(edges)) as Edge[],
  };
}

export function parseEditorState(raw: unknown): WorkflowEditorState | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
  return { nodes: o.nodes as Node[], edges: o.edges as Edge[] };
}
