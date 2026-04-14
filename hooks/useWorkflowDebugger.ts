import { useAtomValue } from 'jotai';
import { nodesAtom, edgesAtom, workflowTitleAtom } from '../store/workflowStore';
import { exportCanvasToDag } from '../lib/canvas/dagExporter';
import { validateDag } from '../lib/dag/validator';

export function useWorkflowDebugger() {
  const nodes = useAtomValue(nodesAtom);
  const edges = useAtomValue(edgesAtom);
  const title = useAtomValue(workflowTitleAtom);

  const dag = exportCanvasToDag(title, nodes, edges);
  const validation = validateDag(dag);

  return {
    json: JSON.stringify(dag, null, 2),
    isValid: validation.valid,
    errors: validation.errors,
  };
}
