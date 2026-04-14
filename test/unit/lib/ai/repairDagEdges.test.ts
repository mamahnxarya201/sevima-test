import { describe, expect, it } from 'vitest';
import { repairDagEdgesForInputReferences } from '@/lib/ai/repairDagEdges';

describe('repairDagEdgesForInputReferences', () => {
  it('adds edges from referenced node ids to CONDITION', () => {
    const dag = {
      workflowName: 't',
      nodes: [
        { id: 'fetch_quote', type: 'HTTP_CALL' as const, http: { url: 'https://example.com' } },
        {
          id: 'branch',
          type: 'CONDITION' as const,
          runtime: 'node' as const,
          script:
            'console.log(JSON.stringify({ result: input.fetch_quote.statusCode === 200 }));',
        },
      ],
      edges: [] as { from: string; to: string }[],
    };
    const out = repairDagEdgesForInputReferences(dag);
    expect(out.edges).toEqual([{ from: 'fetch_quote', to: 'branch' }]);
  });

  it('does not duplicate existing edges', () => {
    const dag = {
      workflowName: 't',
      nodes: [
        { id: 'a', type: 'HTTP_CALL' as const, http: { url: 'https://example.com' } },
        {
          id: 'b',
          type: 'CONDITION' as const,
          runtime: 'node' as const,
          script: 'console.log(JSON.stringify({ result: input.a.statusCode === 200 }));',
        },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const out = repairDagEdgesForInputReferences(dag);
    expect(out.edges).toHaveLength(1);
  });
});
