import { useId, useMemo } from 'react';

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
  const layoutNodes = useMemo(() => layoutWorkflowNodes(nodes, edges), [edges, nodes]);
  const canvasWidth = Math.max(...layoutNodes.map((node) => node.layout.x + 280), 320);
  const canvasHeight = Math.max(...layoutNodes.map((node) => node.layout.y + 140), 180);

  return (
    <div className="workflow-graph-view" data-testid={testId}>
      <div className="workflow-graph-view__canvas" style={{ minHeight: `${canvasHeight}px` }}>
        <svg className="template-graph-overlay workflow-graph-view__edges" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
          <defs>
            <marker id={`${markerId}-advance`} markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
              <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--advance" />
            </marker>
            <marker id={`${markerId}-reject`} markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
              <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--reject" />
            </marker>
          </defs>
          {edges.map((edge, index) => {
            const geometry = buildEdgePath(edge, layoutNodes);
            if (!geometry) {
              return null;
            }
            const labelWidth = edge.kind === 'reject' ? 62 : 76;
            return (
              <g key={edge.id ?? `${edge.from}-${edge.to}-${edge.kind}-${index}`} className={`template-graph-overlay__edge template-graph-overlay__edge--${edge.kind}`}>
                <path
                  className="template-graph-overlay__path"
                  d={geometry.path}
                  markerEnd={`url(#${markerId}-${edge.kind === 'reject' ? 'reject' : 'advance'})`}
                />
                <g className="template-graph-overlay__label" transform={`translate(${geometry.labelX - labelWidth / 2} ${geometry.labelY - 10})`}>
                  <rect width={labelWidth} height="20" rx="999" />
                  <text x={labelWidth / 2} y="13">
                    {edgeKindLabels[edge.kind as 'advance' | 'reject'] ?? edge.kind}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {layoutNodes.map((node) => (
          <div
            key={node.id}
            className={`template-graph-node workflow-graph-view__node${currentNodeId === node.id ? ' template-graph-node--selected workflow-graph-view__node--current' : ''}`}
            style={{ left: `${node.layout.x}px`, top: `${node.layout.y}px` }}
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
  );
}

function layoutWorkflowNodes(nodes: WorkflowGraphViewNode[], edges: WorkflowGraphViewEdge[]) {
  const allHaveLayout = nodes.every((node) => node.layout);
  if (allHaveLayout) {
    return nodes.map((node) => ({
      ...node,
      layout: { x: node.layout!.x, y: node.layout!.y },
    }));
  }

  const advanceBySource = new Map<string, string[]>();
  const incomingAdvanceCount = new Map<string, number>();

  for (const node of nodes) {
    advanceBySource.set(node.id, []);
    incomingAdvanceCount.set(node.id, 0);
  }

  for (const edge of edges) {
    if (edge.kind !== 'advance') {
      continue;
    }
    advanceBySource.get(edge.from)?.push(edge.to);
    incomingAdvanceCount.set(edge.to, (incomingAdvanceCount.get(edge.to) ?? 0) + 1);
  }

  const queue = nodes.filter((node) => node.isEntry).map((node) => node.id);
  if (queue.length === 0) {
    queue.push(...nodes.filter((node) => (incomingAdvanceCount.get(node.id) ?? 0) === 0).map((node) => node.id));
  }

  const visited = new Set<string>();
  const columns = new Map<string, number>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const column = columns.get(nodeId) ?? 0;
    for (const nextId of advanceBySource.get(nodeId) ?? []) {
      columns.set(nextId, Math.max(columns.get(nextId) ?? 0, column + 1));
      queue.push(nextId);
    }
  }

  let fallbackColumn = 0;
  const rowCounts = new Map<number, number>();
  return nodes.map((node) => {
    const column = columns.get(node.id) ?? fallbackColumn++;
    const row = rowCounts.get(column) ?? 0;
    rowCounts.set(column, row + 1);
    return {
      ...node,
      layout: {
        x: column * 320,
        y: row * 148,
      },
    };
  });
}

function buildEdgePath(edge: WorkflowGraphViewEdge, nodes: Array<WorkflowGraphViewNode & { layout: { x: number; y: number } }>) {
  const source = nodes.find((node) => node.id === edge.from);
  const target = nodes.find((node) => node.id === edge.to);
  if (!source || !target) {
    return null;
  }

  const sourceX = source.layout.x + 220;
  const sourceY = source.layout.y + 42;
  const targetX = target.layout.x;
  const targetY = target.layout.y + 42;
  const isBackEdge = targetX < sourceX;

  if (edge.kind === 'reject' || isBackEdge) {
    const crestY = Math.min(sourceY, targetY) - 108;
    const midX = (sourceX + targetX) / 2;
    return {
      path: `M ${sourceX} ${sourceY} C ${sourceX + 68} ${sourceY}, ${sourceX + 36} ${crestY}, ${midX} ${crestY} S ${targetX - 68} ${targetY}, ${targetX} ${targetY}`,
      labelX: midX,
      labelY: crestY - 14,
    };
  }

  const controlOffset = Math.max(72, (targetX - sourceX) * 0.35);
  return {
    path: `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`,
    labelX: (sourceX + targetX) / 2,
    labelY: (sourceY + targetY) / 2 - 14,
  };
}
