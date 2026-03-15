export const WORKFLOW_GRAPH_NODE_WIDTH = 236;
export const WORKFLOW_GRAPH_NODE_HEIGHT = 92;
export const WORKFLOW_GRAPH_COLUMN_GAP = 352;
export const WORKFLOW_GRAPH_ROW_GAP = 164;
export const WORKFLOW_GRAPH_CANVAS_PADDING_X = 28;
export const WORKFLOW_GRAPH_CANVAS_PADDING_TOP = 28;
export const WORKFLOW_GRAPH_CANVAS_PADDING_BOTTOM = 20;

export type WorkflowGraphSurfaceNode = {
  id: string;
  isEntry: boolean;
  layout?: { x: number; y: number } | null;
};

export type WorkflowGraphSurfaceEdge = {
  from: string;
  to: string;
  kind: string;
};

export function buildWorkflowSurfaceCurve(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  kind: string,
) {
  const isBackEdge = targetX < sourceX;

  if (kind === 'reject' || isBackEdge) {
    const horizontalDistance = Math.abs(targetX - sourceX);
    const crestOffset = Math.min(200, Math.max(80, horizontalDistance * 0.28));
    const crestY = Math.min(sourceY, targetY) - crestOffset;
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

export function layoutWorkflowSurfaceNodes<T extends WorkflowGraphSurfaceNode>(
  nodes: T[],
  edges: WorkflowGraphSurfaceEdge[],
) {
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
        x: column * WORKFLOW_GRAPH_COLUMN_GAP,
        y: row * WORKFLOW_GRAPH_ROW_GAP,
      },
    };
  });
}

export function buildWorkflowSurfaceEdgePath(
  edge: WorkflowGraphSurfaceEdge,
  nodes: Array<{ id: string; layout?: { x: number; y: number } | null }>,
) {
  const source = nodes.find((node) => node.id === edge.from);
  const target = nodes.find((node) => node.id === edge.to);
  if (!source || !target) {
    return null;
  }
  const sourceLayout = source.layout;
  const targetLayout = target.layout;
  if (!sourceLayout || !targetLayout) {
    return null;
  }

  const sourceX = sourceLayout.x + WORKFLOW_GRAPH_NODE_WIDTH;
  const sourceY = sourceLayout.y + WORKFLOW_GRAPH_NODE_HEIGHT / 2;
  const targetX = targetLayout.x;
  const targetY = targetLayout.y + WORKFLOW_GRAPH_NODE_HEIGHT / 2;
  return buildWorkflowSurfaceCurve(sourceX, sourceY, targetX, targetY, edge.kind);
}

export function getWorkflowSurfaceCanvasBounds(
  nodes: Array<{ layout?: { x: number; y: number } | null }>,
) {
  const readyNodes = nodes.filter((node): node is { layout: { x: number; y: number } } => Boolean(node.layout));
  if (readyNodes.length === 0) {
    return {
      width: 320,
      height: 180,
    };
  }

  return {
    width: Math.max(...readyNodes.map((node) => node.layout.x + WORKFLOW_GRAPH_NODE_WIDTH + WORKFLOW_GRAPH_CANVAS_PADDING_X * 2)),
    height: Math.max(...readyNodes.map((node) => node.layout.y + WORKFLOW_GRAPH_NODE_HEIGHT + WORKFLOW_GRAPH_CANVAS_PADDING_TOP + WORKFLOW_GRAPH_CANVAS_PADDING_BOTTOM)),
  };
}
