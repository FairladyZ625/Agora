import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  COMPACT_WORKFLOW_GRAPH_METRICS,
  DEFAULT_WORKFLOW_GRAPH_METRICS,
  buildWorkflowSurfaceEdgePath,
  getWorkflowSurfaceCanvasBounds,
  layoutWorkflowSurfaceNodes,
} from '@/lib/workflowGraphSurface';

type WorkflowGraphViewNode = {
  id: string;
  label: string;
  kindLabel: string | null;
  gateLabel: string | null;
  isEntry: boolean;
  layout?: { x: number; y: number } | null;
};

type WorkflowGraphViewEdge = {
  id?: string;
  from: string;
  to: string;
  kind: string;
};

export function WorkflowGraphView({
  testId,
  nodes,
  edges,
  currentNodeId = null,
  entryLabel = 'entry',
  edgeKindLabels = { advance: 'advance', reject: 'reject' },
}: {
  testId?: string;
  nodes: WorkflowGraphViewNode[];
  edges: WorkflowGraphViewEdge[];
  currentNodeId?: string | null;
  entryLabel?: string;
  edgeKindLabels?: Record<'advance' | 'reject', string>;
}) {
  const markerId = useId().replaceAll(':', '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const graphMetrics = useMemo(
    () => (nodes.length <= 4 ? COMPACT_WORKFLOW_GRAPH_METRICS : DEFAULT_WORKFLOW_GRAPH_METRICS),
    [nodes.length],
  );
  const layoutNodes = useMemo(
    () => layoutWorkflowSurfaceNodes(nodes, edges, graphMetrics),
    [edges, graphMetrics, nodes],
  );
  const canvasBounds = useMemo(
    () => getWorkflowSurfaceCanvasBounds(layoutNodes, graphMetrics),
    [graphMetrics, layoutNodes],
  );
  const edgeGeometries = useMemo(
    () => edges.map((edge, index) => ({
      edge,
      index,
      geometry: buildWorkflowSurfaceEdgePath(edge, layoutNodes, graphMetrics),
    })),
    [edges, graphMetrics, layoutNodes],
  );
  const contentTopInset = useMemo(() => {
    const minLabelY = Math.min(
      0,
      ...edgeGeometries
        .map((entry) => entry.geometry?.labelY)
        .filter((value): value is number => typeof value === 'number'),
    );
    return Math.max(0, 28 - minLabelY);
  }, [edgeGeometries]);
  const shiftedCanvasHeight = canvasBounds.height + contentTopInset;
  const renderedCanvasHeight = shiftedCanvasHeight + graphMetrics.nodeHeight;
  const availableWidth = Math.max(containerWidth - 32, 0);
  const rawScale = availableWidth > 0 ? availableWidth / canvasBounds.width : 1;
  const maxScale = nodes.length <= 4 ? 1.08 : 1.18;
  const minScale = nodes.length <= 4 ? 0.24 : 0.3;
  const scale = Math.min(maxScale, Math.max(minScale, rawScale));
  const scaledWidth = canvasBounds.width * scale;
  const offsetX = containerWidth > 0 ? Math.max(0, (containerWidth - scaledWidth) / 2) : 0;
  const viewportHeight = Math.max(renderedCanvasHeight * scale + graphMetrics.nodeHeight * scale * 4 + 12, 220);
  const viewportStyle = {
    '--workflow-graph-preview-height': `${viewportHeight}px`,
  } as CSSProperties;
  const canvasStyle = {
    '--workflow-graph-canvas-width': `${canvasBounds.width}px`,
    '--workflow-graph-canvas-height': `${renderedCanvasHeight}px`,
    '--workflow-graph-scale': scale,
    '--workflow-graph-offset-x': `${offsetX}px`,
    '--workflow-graph-node-width': `${graphMetrics.nodeWidth}px`,
    '--workflow-graph-node-height': `${graphMetrics.nodeHeight}px`,
    '--workflow-graph-edge-label-font-size': graphMetrics === COMPACT_WORKFLOW_GRAPH_METRICS ? '10px' : '11px',
    '--workflow-graph-edge-label-padding-y': graphMetrics === COMPACT_WORKFLOW_GRAPH_METRICS ? '4px' : '5px',
    '--workflow-graph-edge-label-padding-x': graphMetrics === COMPACT_WORKFLOW_GRAPH_METRICS ? '9px' : '11px',
    '--workflow-graph-pill-font-size': graphMetrics === COMPACT_WORKFLOW_GRAPH_METRICS ? '10px' : '11px',
  } as CSSProperties;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const sync = () => {
      setContainerWidth(element.clientWidth > 0 ? element.clientWidth : canvasBounds.width);
    };
    sync();

    const observer = new ResizeObserver(() => sync());
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvasBounds.width]);

  return (
    <div ref={containerRef} className="workflow-graph-view" data-testid={testId}>
      <div className="workflow-graph-view__viewport" style={viewportStyle}>
        <div className="workflow-graph-view__canvas" style={canvasStyle}>
        <svg className="template-graph-overlay workflow-graph-view__edges" viewBox={`0 0 ${canvasBounds.width} ${shiftedCanvasHeight}`}>
          <defs>
            <marker id={`${markerId}-advance`} markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
              <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--advance" />
            </marker>
            <marker id={`${markerId}-reject`} markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
              <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--reject" />
            </marker>
          </defs>
          <g transform={`translate(0 ${contentTopInset})`}>
          {edgeGeometries.map(({ edge, index, geometry }) => {
            if (!geometry) {
              return null;
            }
            return (
              <g key={edge.id ?? `${edge.from}-${edge.to}-${edge.kind}-${index}`} className={`template-graph-overlay__edge template-graph-overlay__edge--${edge.kind}`}>
                <path
                  className="template-graph-overlay__path"
                  d={geometry.path}
                  markerEnd={`url(#${markerId}-${edge.kind === 'reject' ? 'reject' : 'advance'})`}
                />
              </g>
            );
          })}
          </g>
        </svg>

        <div className="workflow-graph-view__edge-labels" aria-hidden="true">
          {edgeGeometries.map(({ edge, index, geometry }) => {
            if (!geometry) {
              return null;
            }
            return (
              <div
                key={`label-${edge.id ?? `${edge.from}-${edge.to}-${edge.kind}-${index}`}`}
                className={`template-graph-edge__label template-graph-edge__label--${edge.kind}`}
                style={{
                  transform: `translate(-50%, -50%) translate(${geometry.labelX}px, ${geometry.labelY + contentTopInset}px)`,
                }}
              >
                {edgeKindLabels[edge.kind as 'advance' | 'reject'] ?? edge.kind}
              </div>
            );
          })}
        </div>

        {layoutNodes.map((node) => (
          <div
            key={node.id}
            className={`template-graph-node workflow-graph-view__node${currentNodeId === node.id ? ' template-graph-node--selected workflow-graph-view__node--current' : ''}`}
            style={{ left: `${node.layout.x}px`, top: `${node.layout.y + contentTopInset}px` }}
          >
            <div className="template-graph-node__eyebrow">
              <span className="template-graph-node__kind">{node.kindLabel ?? 'stage'}</span>
              {node.isEntry ? <span className="template-graph-node__entry">{entryLabel}</span> : null}
            </div>
            <div className="template-graph-node__title">{node.label}</div>
            <div className="template-graph-node__gate">{node.gateLabel ?? 'open'}</div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
