import type { DagSchema } from '@/lib/dag/types';

/**
 * Matches `input.<identifier>.` where <identifier> may be a DAG node id.
 * Used to auto-add missing edges when the model forgets to wire HTTP → CONDITION.
 */
const INPUT_NODE_REF_RE = /\binput\.([a-z0-9_-]+)\./g;

/**
 * For each CONDITION / SCRIPT_EXECUTION script, if it references `input.<nodeId>.…`
 * and `<nodeId>` is an existing node, ensure there is an edge `nodeId → this node`.
 * Fixes the common failure where HTTP and CONDITION run in parallel because the edge was omitted.
 */
export function repairDagEdgesForInputReferences(dag: DagSchema): DagSchema {
  const nodeIds = new Set(dag.nodes.map((n) => n.id));
  const edgeKeys = new Set(dag.edges.map((e) => `${e.from}\0${e.to}`));
  const edges = [...dag.edges];

  for (const node of dag.nodes) {
    if (node.type !== 'CONDITION' && node.type !== 'SCRIPT_EXECUTION') continue;
    const script = node.script ?? '';
    const re = new RegExp(INPUT_NODE_REF_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(script)) !== null) {
      const ref = m[1];
      if (!nodeIds.has(ref)) continue;
      if (ref === node.id) continue;
      const key = `${ref}\0${node.id}`;
      if (!edgeKeys.has(key)) {
        edges.push({ from: ref, to: node.id });
        edgeKeys.add(key);
      }
    }
  }

  return { ...dag, edges };
}
