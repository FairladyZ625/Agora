import { EdgeLabelRenderer, type EdgeProps } from 'reactflow';
import { buildWorkflowSurfaceCurve } from '@/lib/workflowGraphSurface';

export function WorkflowGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  markerEnd,
}: EdgeProps<{ kind?: string; label?: string }>) {
  const kind = data?.kind === 'reject' ? 'reject' : 'advance';
  const geometry = buildWorkflowSurfaceCurve(sourceX, sourceY, targetX, targetY, kind);
  const label = data?.label ?? kind;
  const labelWidth = kind === 'reject' ? 62 : 76;

  return (
    <>
      <path
        data-edge-id={id}
        d={geometry.path}
        markerEnd={markerEnd}
        className={`template-graph-edge template-graph-edge--${kind}${selected ? ' template-graph-edge--selected' : ''}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`template-graph-edge__label template-graph-edge__label--${kind}${selected ? ' template-graph-edge__label--selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${geometry.labelX}px, ${geometry.labelY}px)`,
            minWidth: `${labelWidth}px`,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
