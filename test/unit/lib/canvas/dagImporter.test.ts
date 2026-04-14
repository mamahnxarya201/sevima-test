import { describe, expect, it } from 'vitest';
import { importDagToCanvas, isEmptyDraftDefinition } from '@/lib/canvas/dagImporter';

describe('dagImporter', () => {
  it('happy path: imports nodes and branch handles from DAG definition', () => {
    const { nodes, edges } = importDagToCanvas({
      workflowName: 'wf',
      nodes: [{ id: 'c1', type: 'CONDITION', script: 'console.log(true)' }],
      edges: [{ from: 'c1', to: 'n1', branch: 'false' }],
    });

    expect(nodes[0].type).toBe('condition');
    expect(edges[0].sourceHandle).toBe('false');
  });

  it('malformed input: treats empty objects as empty draft definitions', () => {
    expect(isEmptyDraftDefinition({})).toBe(true);
    expect(importDagToCanvas({})).toEqual({ nodes: [], edges: [] });
  });

  it('chaotic path: falls back to script node when node type is unknown', () => {
    const { nodes } = importDagToCanvas({
      workflowName: 'wf',
      nodes: [{ id: 'x', type: 'NOT_REAL' }],
      edges: [],
    } as never);

    expect(nodes[0].type).toBe('script');
  });
});
