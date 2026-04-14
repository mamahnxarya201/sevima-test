import { describe, expect, it } from 'vitest';
import { sortWorkflowRunsLatestFirst, workflowRunRecencyMs } from '@/lib/workflow/runHistorySort';

describe('runHistorySort', () => {
  it('happy path: sorts latest runs first by endedAt/startedAt recency', () => {
    const sorted = sortWorkflowRunsLatestFirst([
      { id: 'r1', startedAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T00:00:10Z' },
      { id: 'r2', startedAt: '2024-01-01T00:00:20Z', endedAt: null },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('malformed input: invalid timestamps collapse to zero recency', () => {
    expect(workflowRunRecencyMs({ startedAt: 'not-a-date', endedAt: undefined })).toBe(0);
  });

  it('chaotic path: ties are stable via descending id fallback', () => {
    const sorted = sortWorkflowRunsLatestFirst([
      { id: 'a', startedAt: null, endedAt: null },
      { id: 'z', startedAt: null, endedAt: null },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['z', 'a']);
  });
});
