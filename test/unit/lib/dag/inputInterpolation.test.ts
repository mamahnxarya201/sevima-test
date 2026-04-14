import { describe, expect, it } from 'vitest';
import {
  getByPath,
  interpolateDagNode,
  interpolateInputTemplates,
  mergeUpstreamOutputs,
} from '@/lib/dag/inputInterpolation';
import type { DagEdge, DagNode, RunContext } from '@/lib/dag/types';

describe('inputInterpolation', () => {
  it('happy path: merges upstream outputs in sorted predecessor order', () => {
    const edges: DagEdge[] = [
      { from: 'b', to: 'target' },
      { from: 'a', to: 'target' },
    ];
    const runContext: RunContext = {
      a: { value: 1, same: 'first' },
      b: { other: 2, same: 'second' },
    };

    expect(mergeUpstreamOutputs('target', edges, runContext)).toEqual({
      a: { value: 1, same: 'first' },
      b: { other: 2, same: 'second' },
      value: 1,
      same: 'second',
      other: 2,
    });
  });

  it('malformed input: ignores non-object upstream chunks safely', () => {
    const edges: DagEdge[] = [{ from: 'bad', to: 'target' }];
    const runContext = { bad: 'oops' } as unknown as RunContext;

    expect(mergeUpstreamOutputs('target', edges, runContext)).toEqual({});
    expect(getByPath({ a: { b: 1 } }, 'a.nope')).toBeUndefined();
  });

  it('chaotic path: handles missing placeholders and skips script replacement for SCRIPT_EXECUTION', () => {
    const rendered = interpolateInputTemplates('id=input.id missing=input.ghost', { id: 42 });
    expect(rendered).toBe('id=42 missing=');

    const node: DagNode = {
      id: 's1',
      type: 'SCRIPT_EXECUTION',
      script: 'console.log(input.body)',
    };
    const interpolated = interpolateDagNode(node, { body: { nested: true } });
    expect(interpolated.script).toBe('console.log(input.body)');
  });
});
