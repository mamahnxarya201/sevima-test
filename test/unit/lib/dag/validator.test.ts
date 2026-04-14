import { describe, expect, it } from 'vitest';
import { validateDag } from '@/lib/dag/validator';

describe('validateDag', () => {
  it('happy path: validates a minimal acyclic workflow', () => {
    const dag = {
      workflowName: 'ok',
      nodes: [
        { id: 'fetch_data', type: 'HTTP_CALL', http: { url: 'https://example.com' } },
        { id: 'process_data', type: 'SCRIPT_EXECUTION', script: 'console.log("{}")' },
      ],
      edges: [{ from: 'fetch_data', to: 'process_data' }],
    };

    const out = validateDag(dag);
    expect(out.valid).toBe(true);
    expect(out.levels).toHaveLength(2);
  });

  it('malformed input: rejects invalid node shape and ids', () => {
    const dag = {
      workflowName: 'bad',
      nodes: [{ id: 'BAD-ID', type: 'HTTP_CALL' }],
      edges: [],
    };

    const out = validateDag(dag);
    expect(out.valid).toBe(false);
    expect(out.errors.join(' ')).toContain('Node id must be lowercase');
  });

  it('chaotic path: rejects security-injected script and cyclic graph', () => {
    const injected = validateDag({
      workflowName: 'inject',
      nodes: [
        {
          id: 'n1',
          type: 'SCRIPT_EXECUTION',
          runtime: 'sh',
          script: 'echo x && rm -rf /',
        },
      ],
      edges: [],
    });
    expect(injected.valid).toBe(false);
    expect(injected.errors.join(' ')).toContain('[security]');

    const cyclic = validateDag({
      workflowName: 'cycle',
      nodes: [
        { id: 'a', type: 'SCRIPT_EXECUTION', script: 'console.log("{}")' },
        { id: 'b', type: 'SCRIPT_EXECUTION', script: 'console.log("{}")' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    });
    expect(cyclic.valid).toBe(false);
    expect(cyclic.errors.join(' ')).toContain('contains a cycle');
  });

  it('allows JS || and && in node/python/condition scripts (not shell)', () => {
    const dag = {
      workflowName: 'js-ops',
      nodes: [
        {
          id: 'check_api_status',
          type: 'CONDITION',
          runtime: 'node',
          script:
            'const statusCode = parseInt(String(input.statusCode ?? input.body), 10) || 0;\nconsole.log(JSON.stringify({ result: statusCode < 500 }));',
        },
      ],
      edges: [],
    };
    const out = validateDag(dag);
    expect(out.valid).toBe(true);
  });

  it('rejects CONDITION that references input.<nodeId> without an incoming edge', () => {
    const dag = {
      workflowName: 'bad-ref',
      nodes: [
        { id: 'fetch_quote', type: 'HTTP_CALL', http: { url: 'https://example.com' } },
        {
          id: 'c',
          type: 'CONDITION',
          runtime: 'node',
          script: 'console.log(JSON.stringify({ result: input.fetch_quote.statusCode === 200 }));',
        },
      ],
      edges: [],
    };
    const out = validateDag(dag);
    expect(out.valid).toBe(false);
    expect(out.errors.some((e) => e.includes('[logic]') && e.includes('fetch_quote'))).toBe(true);
  });
});
