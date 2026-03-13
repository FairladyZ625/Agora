import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useOnViewportChange,
  useUpdateNodeInternals,
  type NodeProps,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
import { useTemplateStore } from '@/stores/templateStore';
import type { TemplateDetail, TemplateGraph } from '@/types/dashboard';

type GraphStageNodeData = {
  label: string;
  executionKind: string | null;
  gateType: string | null;
  isEntry: boolean;
};

function formatExecutionKindLabel(executionKind: string | null) {
  switch (executionKind) {
    case 'citizen_execute':
      return 'execute';
    case 'craftsman_dispatch':
      return 'craftsman';
    case 'human_approval':
      return 'approval';
    case 'citizen_discuss':
      return 'discuss';
    default:
      return 'stage';
  }
}

function formatGateLabel(gateType: string | null) {
  if (!gateType) {
    return 'open';
  }
  return gateType.replaceAll('_', ' ');
}

function GraphStageNode({ data, selected }: NodeProps<Node<GraphStageNodeData>>) {
  return (
    <div className={`template-graph-node${selected ? ' template-graph-node--selected' : ''}`}>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="template-graph-node__handle template-graph-node__handle--in"
      />
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="template-graph-node__handle template-graph-node__handle--out"
      />
      <div className="template-graph-node__eyebrow">
        <span className="template-graph-node__kind">{formatExecutionKindLabel(data.executionKind)}</span>
        {data.isEntry ? <span className="template-graph-node__entry">entry</span> : null}
      </div>
      <div className="template-graph-node__title">{data.label}</div>
      <div className="template-graph-node__gate">{formatGateLabel(data.gateType)}</div>
    </div>
  );
}

const graphNodeTypes = {
  stage: GraphStageNode,
};

function cloneTemplateDetail(template: TemplateDetail): TemplateDetail {
  const graph = tidyGraphLayout(template.graph ?? deriveTemplateGraphFromStages(template.stages));
  return {
    ...template,
    stages: template.stages.map((stage) => ({ ...stage })),
    defaultTeamRoles: [...template.defaultTeamRoles],
    defaultTeam: template.defaultTeam.map((member) => ({
      ...member,
      suggested: [...member.suggested],
    })),
    graph: {
      ...graph,
      entryNodes: [...graph.entryNodes],
      nodes: graph.nodes.map((node) => ({
        ...node,
        allowedActions: [...node.allowedActions],
        layout: node.layout ? { ...node.layout } : null,
      })),
      edges: graph.edges.map((edge) => ({ ...edge })),
    },
  };
}

function deriveTemplateGraphFromStages(stages: TemplateDetail['stages'], existingGraph?: TemplateGraph | null): TemplateGraph {
  const existingNodeById = new Map((existingGraph?.nodes ?? []).map((node) => [node.id, node]));
  return {
    graphVersion: existingGraph?.graphVersion ?? 1,
    entryNodes: stages[0] ? [stages[0].id] : [],
    nodes: stages.map((stage, index) => {
      const existing = existingNodeById.get(stage.id);
      return {
        id: stage.id,
        name: stage.name,
        kind: 'stage' as const,
        executionKind: existing?.executionKind ?? null,
        allowedActions: existing?.allowedActions ?? [],
        gateType: stage.gateType ?? null,
        gateApprover: stage.gateApprover ?? null,
        gateRequired: stage.gateRequired ?? null,
        gateTimeoutSec: stage.gateTimeoutSec ?? null,
        layout: existing?.layout ?? { x: index * 260, y: 0 },
      };
    }),
    edges: stages.flatMap((stage, index) => {
      const edges: TemplateGraph['edges'] = [];
      const nextStage = stages[index + 1];
      if (nextStage) {
        edges.push({
          id: `${stage.id}__advance__${nextStage.id}`,
          from: stage.id,
          to: nextStage.id,
          kind: 'advance',
        });
      }
      if (stage.rejectTarget) {
        edges.push({
          id: `${stage.id}__reject__${stage.rejectTarget}`,
          from: stage.id,
          to: stage.rejectTarget,
          kind: 'reject',
        });
      }
      return edges;
    }),
  };
}

function deriveStagesFromTemplateGraph(graph: TemplateGraph): TemplateDetail['stages'] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const advanceEdgesByFrom = new Map<string, string>();
  const rejectEdgesByFrom = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind === 'advance' && !advanceEdgesByFrom.has(edge.from)) {
      advanceEdgesByFrom.set(edge.from, edge.to);
    }
    if (edge.kind === 'reject' && !rejectEdgesByFrom.has(edge.from)) {
      rejectEdgesByFrom.set(edge.from, edge.to);
    }
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    ordered.push(nodeId);
    const next = advanceEdgesByFrom.get(nodeId);
    if (next) {
      walk(next);
    }
  };
  graph.entryNodes.forEach(walk);
  graph.nodes.forEach((node) => walk(node.id));
  return ordered
    .map((id) => nodeById.get(id))
    .filter((node): node is NonNullable<typeof nodeById extends Map<string, infer V> ? V : never> => Boolean(node))
    .filter((node) => node.kind === 'stage')
    .map((node) => ({
      id: node.id,
      name: node.name,
      mode: node.executionKind === 'citizen_execute' || node.executionKind === 'craftsman_dispatch' ? 'execute' : 'discuss',
      gateType: node.gateType ?? null,
      gateApprover: node.gateApprover ?? null,
      gateRequired: node.gateRequired ?? null,
      gateTimeoutSec: node.gateTimeoutSec ?? null,
      rejectTarget: rejectEdgesByFrom.get(node.id) ?? null,
    }));
}

function tidyGraphLayout(graph: TemplateGraph): TemplateGraph {
  const advanceBySource = new Map<string, string[]>();
  const incomingAdvanceCount = new Map<string, number>();

  for (const node of graph.nodes) {
    advanceBySource.set(node.id, []);
    incomingAdvanceCount.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    if (edge.kind !== 'advance') {
      continue;
    }
    advanceBySource.get(edge.from)?.push(edge.to);
    incomingAdvanceCount.set(edge.to, (incomingAdvanceCount.get(edge.to) ?? 0) + 1);
  }

  const queue = graph.entryNodes.length > 0
    ? [...graph.entryNodes]
    : graph.nodes.filter((node) => (incomingAdvanceCount.get(node.id) ?? 0) === 0).map((node) => node.id);
  const visited = new Set<string>();
  const columns = new Map<string, number>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const currentColumn = columns.get(nodeId) ?? 0;
    for (const nextId of advanceBySource.get(nodeId) ?? []) {
      columns.set(nextId, Math.max(columns.get(nextId) ?? 0, currentColumn + 1));
      queue.push(nextId);
    }
  }

  let fallbackColumn = 0;
  const rowCounts = new Map<number, number>();

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const column = columns.get(node.id) ?? fallbackColumn++;
      const row = rowCounts.get(column) ?? 0;
      rowCounts.set(column, row + 1);
      return {
        ...node,
        layout: {
          x: column * 320,
          y: row * 144,
        },
      };
    }),
  };
}

function validateTemplateGraphDraft(graph: TemplateGraph) {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (graph.nodes.length === 0) {
    errors.push('Graph must include at least one node.');
  }
  if (graph.entryNodes.length === 0) {
    errors.push('Graph must include at least one entry node.');
  }
  for (const entryId of graph.entryNodes) {
    if (!nodeIds.has(entryId)) {
      errors.push(`Unknown entry node: ${entryId}`);
    }
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Unknown edge source: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Unknown edge target: ${edge.to}`);
    }
  }
  return errors;
}

function GraphCanvasInternalsSync({ nodeIds }: { nodeIds: string[] }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeSignature = nodeIds.join('|');

  useEffect(() => {
    if (nodeIds.length === 0) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      for (const nodeId of nodeIds) {
        updateNodeInternals(nodeId);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [nodeIds, nodeSignature, updateNodeInternals]);

  return null;
}

function buildOverlayEdgePath(edge: TemplateGraph['edges'][number], nodes: TemplateGraph['nodes']) {
  const source = nodes.find((node) => node.id === edge.from);
  const target = nodes.find((node) => node.id === edge.to);
  if (!source?.layout || !target?.layout) {
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

function GraphCanvasOverlay({
  nodes,
  edges,
  selectedEdgeId,
  onSelectEdge,
}: {
  nodes: TemplateGraph['nodes'];
  edges: TemplateGraph['edges'];
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
}) {
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  useOnViewportChange({
    onChange: setViewport,
  });

  return (
    <svg className="react-flow__edges template-graph-overlay">
      <defs>
        <marker id="template-graph-arrow-advance" markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
          <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--advance" />
        </marker>
        <marker id="template-graph-arrow-reject" markerWidth="14" markerHeight="14" viewBox="-7 -7 14 14" orient="auto">
          <path d="M -4 -4 L 0 0 L -4 4" className="template-graph-overlay__marker template-graph-overlay__marker--reject" />
        </marker>
      </defs>
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
        {edges.map((edge) => {
          const geometry = buildOverlayEdgePath(edge, nodes);
          if (!geometry) {
            return null;
          }

          const selected = selectedEdgeId === edge.id;
          const labelWidth = edge.kind === 'reject' ? 62 : 76;

          return (
            <g
              key={edge.id}
              className={`template-graph-overlay__edge template-graph-overlay__edge--${edge.kind}${selected ? ' template-graph-overlay__edge--selected' : ''}`}
            >
              <path
                className="template-graph-overlay__hitbox"
                d={geometry.path}
                onClick={() => onSelectEdge(edge.id)}
              />
              <path
                className="template-graph-overlay__path"
                d={geometry.path}
                markerEnd={`url(#${edge.kind === 'reject' ? 'template-graph-arrow-reject' : 'template-graph-arrow-advance'})`}
                onClick={() => onSelectEdge(edge.id)}
              />
              <g
                className="template-graph-overlay__label"
                transform={`translate(${geometry.labelX - labelWidth / 2} ${geometry.labelY - 10})`}
                onClick={() => onSelectEdge(edge.id)}
              >
                <rect width={labelWidth} height="20" rx="999" />
                <text x={labelWidth / 2} y="13">
                  {edge.kind}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function TemplateGraphEditorContent() {
  const copy = useTemplatesPageCopy();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const selectedTemplate = useTemplateStore((state) => state.selectedTemplate);
  const selectedTemplateId = useTemplateStore((state) => state.selectedTemplateId);
  const detailLoading = useTemplateStore((state) => state.detailLoading);
  const error = useTemplateStore((state) => state.error);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const selectTemplate = useTemplateStore((state) => state.selectTemplate);
  const saveSelectedTemplate = useTemplateStore((state) => state.saveSelectedTemplate);
  const [draftState, setDraftState] = useState<TemplateDetail | null>(null);
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [selectedGraphEdgeId, setSelectedGraphEdgeId] = useState<string | null>(null);
  const [graphSaveError, setGraphSaveError] = useState(false);

  useEffect(() => {
    void fetchTemplates();
    if (templateId && templateId !== selectedTemplateId) {
      void selectTemplate(templateId);
    }
  }, [fetchTemplates, selectTemplate, selectedTemplateId, templateId]);

  const draft = useMemo(() => {
    if (draftState && draftState.id === templateId) {
      return draftState;
    }
    return selectedTemplate && selectedTemplate.id === templateId ? cloneTemplateDetail(selectedTemplate) : null;
  }, [draftState, selectedTemplate, templateId]);

  const updateDraft = (transform: (current: TemplateDetail) => TemplateDetail) => {
    if (!draft) {
      return;
    }
    setDraftState(transform(draft));
  };

  const updateDraftGraph = (transform: (graph: NonNullable<TemplateDetail['graph']>) => NonNullable<TemplateDetail['graph']>) => {
    updateDraft((current) => {
      const nextGraph = transform(current.graph ?? deriveTemplateGraphFromStages(current.stages));
      return {
        ...current,
        graph: nextGraph,
        stages: deriveStagesFromTemplateGraph(nextGraph),
      };
    });
  };

  const draftGraph = draft ? (draft.graph ?? deriveTemplateGraphFromStages(draft.stages)) : null;
  const graphValidationErrors = draftGraph ? validateTemplateGraphDraft(draftGraph) : [];
  const graphNodes: Node<GraphStageNodeData>[] = (
    draftGraph?.nodes.map((node) => ({
      id: node.id,
      position: node.layout ?? { x: 0, y: 0 },
      data: {
        label: node.name,
        executionKind: node.executionKind,
        gateType: node.gateType,
        isEntry: draftGraph.entryNodes.includes(node.id),
      },
      type: 'stage',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      sourceHandle: 'out',
      targetHandle: 'in',
      width: 220,
      height: 84,
      draggable: true,
    })) ?? []
  );
  const graphCanvasEdges: Edge[] = (
    draftGraph?.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      label: edge.kind,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: edge.kind === 'reject',
      style: edge.kind === 'reject'
        ? {
            stroke: 'var(--template-graph-edge-reject)',
            strokeWidth: 1.8,
            strokeDasharray: '7 6',
          }
        : {
            stroke: 'var(--template-graph-edge-advance)',
            strokeWidth: 1.8,
          },
      labelStyle: edge.kind === 'reject'
        ? { fill: 'var(--template-graph-edge-reject)', fontSize: '11px', fontWeight: 600 }
        : { fill: 'var(--template-graph-edge-advance)', fontSize: '11px', fontWeight: 600 },
      labelBgStyle: edge.kind === 'reject'
        ? { fill: 'var(--template-graph-label-reject-bg)' }
        : { fill: 'var(--template-graph-label-bg)' },
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 999,
    })) ?? []
  );
  const selectedGraphNode = draftGraph?.nodes.find((node) => node.id === selectedGraphNodeId) ?? null;
  const selectedGraphEdge = draftGraph?.edges.find((edge) => edge.id === selectedGraphEdgeId) ?? null;

  const handleGraphNodesChange = (changes: NodeChange[]) => {
    updateDraftGraph((currentGraph) => {
      const nextNodes = applyNodeChanges(changes, graphNodes);
      return {
        ...currentGraph,
        nodes: currentGraph.nodes.map((node) => {
          const nextNode = nextNodes.find((candidate) => candidate.id === node.id);
          return nextNode
            ? {
                ...node,
                layout: { x: nextNode.position.x, y: nextNode.position.y },
              }
            : node;
        }),
      };
    });
  };

  const handleGraphEdgesChange = (changes: EdgeChange[]) => {
    updateDraftGraph((currentGraph) => {
      const nextEdges = applyEdgeChanges(changes, graphCanvasEdges);
      return {
        ...currentGraph,
        edges: currentGraph.edges.filter((edge) => nextEdges.some((candidate) => candidate.id === edge.id)),
      };
    });
  };

  const handleGraphConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    const source = connection.source;
    const target = connection.target;
    updateDraftGraph((currentGraph) => ({
      ...currentGraph,
      edges: addEdge({
        id: `${source}__advance__${target}`,
        source,
        target,
        label: 'advance',
      }, graphCanvasEdges).map((edge) => ({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        kind: edge.label === 'reject' ? 'reject' : 'advance',
      })) as TemplateGraph['edges'],
    }));
    setSelectedGraphEdgeId(`${source}__advance__${target}`);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    if (graphValidationErrors.length > 0) {
      setGraphSaveError(true);
      return;
    }
    setGraphSaveError(false);
    await saveSelectedTemplate(draft);
  };

  if (detailLoading) {
    return <div className="surface-panel surface-panel--workspace">Loading workflow editor…</div>;
  }

  if (!draft || !draftGraph) {
    return (
      <div className="surface-panel surface-panel--workspace">
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
        <p className="type-body-sm">Template graph not available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{copy.graphTitle}</p>
            <h2 className="page-title">{draft.name}</h2>
            <p className="page-summary">在专用页面中编辑工作流 DAG，而不是在模板概览页内嵌预览。</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="button-secondary" onClick={() => navigate('/templates')}>
              <ArrowLeft size={16} />
              返回模板
            </button>
            <button type="button" className="button-primary" onClick={() => void handleSave()}>
              保存流程
            </button>
          </div>
        </div>
        {graphSaveError ? (
          <div className="inline-alert inline-alert--danger mt-5">请先修复 graph 配置问题。</div>
        ) : null}
      </section>

      <section className="template-graph-editor-layout">
        <aside className="surface-panel surface-panel--workspace space-y-3">
          <h3 className="section-title">Graph tools</h3>
          <button
            type="button"
            className="button-secondary w-full justify-center"
            onClick={() => updateDraftGraph((currentGraph) => {
              const nextId = `node_${currentGraph.nodes.length + 1}`;
              return {
                ...currentGraph,
                nodes: [
                  ...currentGraph.nodes,
                  {
                    id: nextId,
                    name: '新节点',
                    kind: 'stage',
                    executionKind: null,
                    allowedActions: [],
                    gateType: null,
                    gateApprover: null,
                    gateRequired: null,
                    gateTimeoutSec: null,
                    layout: { x: currentGraph.nodes.length * 240, y: 120 },
                  },
                ],
              };
            })}
          >
            新增节点
          </button>
          <button
            type="button"
            className="button-secondary w-full justify-center"
            onClick={() => updateDraftGraph((currentGraph) => tidyGraphLayout(currentGraph))}
          >
            整理布局
          </button>
          <div className="space-y-2">
            <p className="field-label">节点</p>
            {draftGraph.nodes.map((node) => (
              <button
                key={`graph-node-list-${node.id}`}
                type="button"
                aria-label={`graph node ${node.id}`}
                className="data-row w-full text-left"
                onClick={() => {
                  setSelectedGraphNodeId(node.id);
                  setSelectedGraphEdgeId(null);
                }}
              >
                <span className="type-heading-xs">{node.name}</span>
                <span className="type-text-xs">{node.id}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="field-label">边</p>
            {draftGraph.edges.map((edge) => (
              <button
                key={`graph-edge-list-${edge.id}`}
                type="button"
                aria-label={`graph edge ${edge.from} ${edge.to}`}
                className="data-row w-full text-left"
                onClick={() => {
                  setSelectedGraphEdgeId(edge.id);
                  setSelectedGraphNodeId(null);
                }}
              >
                <span className="type-mono-xs">{`${edge.from} -> ${edge.to}`}</span>
                <span className="type-text-xs">{edge.kind}</span>
              </button>
            ))}
          </div>
          <p className="type-text-xs">拖动节点、连边、选中节点或边后在右侧 inspector 编辑。</p>
        </aside>

          <div className="surface-panel surface-panel--workspace">
            <div className="template-graph-editor-canvas">
              <ReactFlow
                fitView
                fitViewOptions={{ padding: 0.2, duration: 380 }}
                nodes={graphNodes}
                edges={graphCanvasEdges}
                nodeTypes={graphNodeTypes}
                onNodesChange={handleGraphNodesChange}
                onEdgesChange={handleGraphEdgesChange}
                onConnect={handleGraphConnect}
                connectionLineStyle={{ stroke: 'var(--template-graph-edge-advance)', strokeWidth: 1.8 }}
                connectionLineContainerStyle={{ opacity: 0.85 }}
                defaultEdgeOptions={{
                  type: 'smoothstep',
                  markerEnd: { type: MarkerType.ArrowClosed },
                }}
                onNodeClick={(_, node) => {
                  setSelectedGraphNodeId(node.id);
                  setSelectedGraphEdgeId(null);
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedGraphEdgeId(edge.id);
                  setSelectedGraphNodeId(null);
                }}
              >
                <GraphCanvasInternalsSync nodeIds={draftGraph.nodes.map((node) => node.id)} />
                <Background gap={20} size={1} color="var(--color-text-tertiary)" />
                <Controls />
              </ReactFlow>
              <GraphCanvasOverlay
                nodes={draftGraph.nodes}
                edges={draftGraph.edges}
                selectedEdgeId={selectedGraphEdgeId}
                onSelectEdge={(edgeId) => {
                  setSelectedGraphEdgeId(edgeId);
                  setSelectedGraphNodeId(null);
                }}
              />
            </div>
          </div>
        <aside className="surface-panel surface-panel--workspace space-y-3">
          <h3 className="section-title">Graph inspector</h3>
          {graphValidationErrors.length > 0 ? (
            <div className="inline-alert inline-alert--warning">
              {graphValidationErrors.join(' / ')}
            </div>
          ) : null}
          {selectedGraphNode ? (
            <div className="space-y-3">
              <p className="type-heading-xs">{selectedGraphNode.id}</p>
              <label className="space-y-2">
                <span className="field-label">Entry node</span>
                <input
                  aria-label={`graph node ${selectedGraphNode.id} entry`}
                  type="checkbox"
                  checked={draftGraph.entryNodes.includes(selectedGraphNode.id)}
                  onChange={(event) => updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    entryNodes: event.target.checked
                      ? Array.from(new Set([...currentGraph.entryNodes, selectedGraphNode.id]))
                      : currentGraph.entryNodes.filter((entryId) => entryId !== selectedGraphNode.id),
                  }))}
                />
              </label>
              <label className="space-y-2">
                <span className="field-label">Node name</span>
                <input
                  aria-label={`graph node ${selectedGraphNode.id} name`}
                  className="input-shell"
                  type="text"
                  value={selectedGraphNode.name}
                  onChange={(event) => updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    nodes: currentGraph.nodes.map((node) => (
                      node.id === selectedGraphNode.id
                        ? { ...node, name: event.target.value }
                        : node
                    )),
                  }))}
                />
              </label>
              <label className="space-y-2">
                <span className="field-label">Execution kind</span>
                <select
                  aria-label={`graph node ${selectedGraphNode.id} execution kind`}
                  className="input-shell"
                  value={selectedGraphNode.executionKind ?? ''}
                  onChange={(event) => updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    nodes: currentGraph.nodes.map((node) => (
                      node.id === selectedGraphNode.id
                        ? { ...node, executionKind: event.target.value.length > 0 ? event.target.value : null }
                        : node
                    )),
                  }))}
                >
                  <option value="">discuss(default)</option>
                  <option value="citizen_discuss">citizen_discuss</option>
                  <option value="citizen_execute">citizen_execute</option>
                  <option value="craftsman_dispatch">craftsman_dispatch</option>
                  <option value="human_approval">human_approval</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="field-label">Gate type</span>
                <select
                  aria-label={`graph node ${selectedGraphNode.id} gate type`}
                  className="input-shell"
                  value={selectedGraphNode.gateType ?? ''}
                  onChange={(event) => updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    nodes: currentGraph.nodes.map((node) => (
                      node.id === selectedGraphNode.id
                        ? { ...node, gateType: event.target.value.length > 0 ? event.target.value : null }
                        : node
                    )),
                  }))}
                >
                  <option value="">none</option>
                  <option value="command">command</option>
                  <option value="approval">approval</option>
                  <option value="archon_review">archon_review</option>
                  <option value="all_subtasks_done">all_subtasks_done</option>
                  <option value="auto_timeout">auto_timeout</option>
                  <option value="quorum">quorum</option>
                </select>
              </label>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    entryNodes: currentGraph.entryNodes.filter((entryId) => entryId !== selectedGraphNode.id),
                    nodes: currentGraph.nodes.filter((node) => node.id !== selectedGraphNode.id),
                    edges: currentGraph.edges.filter((edge) => edge.from !== selectedGraphNode.id && edge.to !== selectedGraphNode.id),
                  }));
                  setSelectedGraphNodeId(null);
                }}
              >
                Delete node
              </button>
            </div>
          ) : null}
          {selectedGraphEdge ? (
            <div className="space-y-3">
              <p className="type-heading-xs">{selectedGraphEdge.id}</p>
              <p className="type-text-xs">{selectedGraphEdge.from} {'->'} {selectedGraphEdge.to}</p>
              <label className="space-y-2">
                <span className="field-label">Edge kind</span>
                <select
                  aria-label={`graph edge ${selectedGraphEdge.id} kind`}
                  className="input-shell"
                  value={selectedGraphEdge.kind}
                  onChange={(event) => updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    edges: currentGraph.edges.map((edge) => (
                      edge.id === selectedGraphEdge.id
                        ? { ...edge, kind: event.target.value as TemplateGraph['edges'][number]['kind'] }
                        : edge
                    )),
                  }))}
                >
                  <option value="advance">advance</option>
                  <option value="reject">reject</option>
                </select>
              </label>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  updateDraftGraph((currentGraph) => ({
                    ...currentGraph,
                    edges: currentGraph.edges.filter((edge) => edge.id !== selectedGraphEdge.id),
                  }));
                  setSelectedGraphEdgeId(null);
                }}
              >
                Delete edge
              </button>
            </div>
          ) : null}
          {!selectedGraphNode && !selectedGraphEdge ? (
            <p className="type-body-sm">Select a node or edge on the canvas.</p>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

export function TemplateGraphEditorPage() {
  return (
    <ReactFlowProvider>
      <TemplateGraphEditorContent />
    </ReactFlowProvider>
  );
}
