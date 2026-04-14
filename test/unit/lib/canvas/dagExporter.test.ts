import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { exportCanvasToDag } from '@/lib/canvas/dagExporter';

describe('dagExporter', () => {
  it('happy path: maps canvas nodes/edges into execution DAG format', () => {
    const nodes: Node[] = [
      { id: 'n1', type: 'http', position: { x: 0, y: 0 }, data: { http: { url: 'https://a.com' } } },
      { id: 'n2', type: 'condition', position: { x: 1, y: 1 }, data: { script: 'console.log(true)' } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'n2', sourceHandle: 'true', target: 'n1' }];

    const dag = exportCanvasToDag('wf', nodes, edges);
    expect(dag.workflowName).toBe('wf');
    expect(dag.nodes[0].type).toBe('HTTP_CALL');
    expect(dag.edges[0]).toEqual({ from: 'n2', to: 'n1', branch: 'true' });
  });

  it('malformed input: fills safe defaults when node data is incomplete', () => {
    const dag = exportCanvasToDag(
      'wf',
      [{ id: 'n1', type: 'http', position: { x: 0, y: 0 }, data: {} }],
      []
    );
    expect(dag.nodes[0].http?.url).toBe('https://example.com');
  });

  it('chaotic path: falls back to SCRIPT_EXECUTION for unknown canvas type', () => {
    const dag = exportCanvasToDag(
      'wf',
      [{ id: 'n1', type: 'unknown-type', position: { x: 0, y: 0 }, data: {} }],
      []
    );
    expect(dag.nodes[0].type).toBe('SCRIPT_EXECUTION');
    expect(dag.nodes[0].script).toBeTruthy();
  });
});
