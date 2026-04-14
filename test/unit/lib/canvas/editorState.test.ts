import { describe, expect, it } from 'vitest';
import { parseEditorState, serializeEditorState } from '@/lib/canvas/editorState';

describe('editorState', () => {
  it('happy path: serializes and parses node+edge snapshots', () => {
    const state = serializeEditorState(
      [{ id: 'n1', type: 'script', position: { x: 1, y: 2 }, data: {} }],
      [{ id: 'e1', source: 'n1', target: 'n2' }]
    );
    const parsed = parseEditorState(state);
    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.edges).toHaveLength(1);
  });

  it('malformed input: parse returns null for non-object values', () => {
    expect(parseEditorState(null)).toBeNull();
    expect(parseEditorState('bad')).toBeNull();
  });

  it('chaotic path: serialize performs deep clone and resists caller mutation', () => {
    const nodes = [{ id: 'n1', type: 'script', position: { x: 0, y: 0 }, data: { deep: { a: 1 } } }];
    const out = serializeEditorState(nodes, []);
    (nodes[0].data as { deep: { a: number } }).deep.a = 999;

    const parsed = parseEditorState(out);
    expect((parsed?.nodes[0].data as { deep: { a: number } }).deep.a).toBe(1);
  });
});
