/**
 * Converts stored DAG JSON (execution schema) into React Flow nodes + edges.
 * Used when editorState is absent or incomplete.
 */

import type { Node, Edge } from '@xyflow/react';
import type { DagSchema, DagNode, NodeType } from '../dag/types';

const DAG_TO_RF: Record<NodeType, string> = {
  HTTP_CALL: 'http',
  SCRIPT_EXECUTION: 'script',
  DELAY: 'delay',
  CONDITION: 'condition',
};

const COL_W = 280;
const ROW_H = 160;
const ORIGIN = { x: 80, y: 80 };

function positionForIndex(i: number) {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return { x: ORIGIN.x + col * COL_W, y: ORIGIN.y + row * ROW_H };
}

function dagNodeToRfData(n: DagNode): Record<string, unknown> {
  const data: Record<string, unknown> = {
    image: n.image,
    cpuLimit: n.cpuLimit,
    memLimit: n.memLimit,
    retries: n.retries,
    retryDelayMs: n.retryDelayMs,
    inputs: n.inputs,
    outputs: n.outputs,
  };
  if (n.title !== undefined) data.title = n.title;
  if (n.description !== undefined) data.description = n.description;
  if (n.http) data.http = n.http;
  if (n.script !== undefined) data.script = n.script;
  if (n.runtime !== undefined) data.runtime = n.runtime;
  return data;
}

/** True when definition has no executable graph (draft / empty). */
export function isEmptyDraftDefinition(def: unknown): boolean {
  if (def === null || typeof def !== 'object') return true;
  const o = def as Record<string, unknown>;
  const nodes = o.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;
  return false;
}

export function importDagToCanvas(definition: unknown): { nodes: Node[]; edges: Edge[] } {
  if (isEmptyDraftDefinition(definition)) {
    return { nodes: [], edges: [] };
  }

  const dag = definition as DagSchema;
  const nodes: Node[] = dag.nodes.map((n, i) => ({
    id: n.id,
    type: DAG_TO_RF[n.type] ?? 'script',
    position: positionForIndex(i),
    data: dagNodeToRfData(n),
  }));

  const defaultEdgeStyle = { stroke: '#94a3b8', strokeWidth: 3, strokeDasharray: '6' };

  const edges: Edge[] = dag.edges.map((e, idx) => {
    let sourceHandle: string | undefined;
    if (e.branch === 'true') sourceHandle = 'true';
    else if (e.branch === 'false') sourceHandle = 'false';

    return {
      id: `e-${e.from}-${e.to}-${idx}`,
      source: e.from,
      target: e.to,
      sourceHandle,
      type: 'smoothstep',
      animated: true,
      style: defaultEdgeStyle,
    };
  });

  return { nodes, edges };
}
