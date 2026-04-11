import type { TemplateDetailDto, TemplateGraphDto, TemplateStageDto, WorkflowStageDto } from '@agora-ts/contracts';

type RuntimeGraphShape = {
  entry_nodes: string[];
  nodes: Array<{
    id: string;
    kind?: string | undefined;
    terminal?: {
      outcome: string;
      summary?: string | undefined;
    } | undefined;
  }>;
  edges: Array<{ from: string; to: string; kind: string }>;
};

export function deriveGraphFromStages(stages: TemplateStageDto[] = []): TemplateGraphDto {
  return {
    graph_version: 1,
    entry_nodes: stages[0] ? [stages[0].id] : ['entry'],
    nodes: stages.map((stage, index) => ({
      id: stage.id,
      ...(stage.name ? { name: stage.name } : {}),
      kind: 'stage',
      ...(stage.execution_kind ? { execution_kind: stage.execution_kind } : {}),
      ...(stage.allowed_actions ? { allowed_actions: stage.allowed_actions } : {}),
      ...(stage.roster ? { roster: stage.roster } : {}),
      ...(stage.gate ? { gate: stage.gate } : {}),
      layout: {
        x: index * 280,
        y: 0,
      },
    })),
    edges: stages.flatMap((stage, index) => {
      const edges: TemplateGraphDto['edges'] = [];
      const nextStage = stages[index + 1];
      if (nextStage) {
        edges.push({
          id: `${stage.id}__advance__${nextStage.id}`,
          from: stage.id,
          to: nextStage.id,
          kind: 'advance',
        });
      }
      if (stage.reject_target) {
        edges.push({
          id: `${stage.id}__reject__${stage.reject_target}`,
          from: stage.id,
          to: stage.reject_target,
          kind: 'reject',
        });
      }
      return edges;
    }),
  };
}

export function deriveStagesFromGraph(graph: TemplateGraphDto): TemplateStageDto[] {
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

  const orderedIds = topologicallyOrderLinearGraph(graph);
  return orderedIds
    .map((id) => nodeById.get(id))
    .filter((node): node is NonNullable<typeof nodeById extends Map<string, infer V> ? V : never> => Boolean(node))
    .filter((node) => node.kind === 'stage')
    .map((node) => ({
      id: node.id,
      ...(node.name ? { name: node.name } : {}),
      ...(node.execution_kind ? { execution_kind: node.execution_kind as TemplateStageDto['execution_kind'] } : {}),
      ...(node.allowed_actions ? { allowed_actions: node.allowed_actions as NonNullable<TemplateStageDto['allowed_actions']> } : {}),
      ...(node.roster ? { roster: node.roster as NonNullable<TemplateStageDto['roster']> } : {}),
      ...(node.gate ? { gate: node.gate as NonNullable<TemplateStageDto['gate']> } : {}),
      ...(rejectEdgesByFrom.get(node.id) ? { reject_target: rejectEdgesByFrom.get(node.id)! } : {}),
      mode: resolveStageMode(node),
    }));
}

export function normalizeTemplateGraph(template: TemplateDetailDto): TemplateDetailDto {
  const graph = template.graph ?? deriveGraphFromStages(template.stages ?? []);
  const stages = template.graph
    ? deriveStagesFromGraph(graph)
    : (template.stages ?? deriveStagesFromGraph(graph));
  return {
    ...template,
    stages,
    graph,
  };
}

export function validateTemplateGraph(graph: TemplateGraphDto): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const advanceByFrom = new Map<string, number>();
  const branchByFrom = new Map<string, number>();
  const rejectByFrom = new Map<string, number>();
  const timeoutByFrom = new Map<string, number>();
  const completeByFrom = new Map<string, number>();
  if (graph.nodes.length === 0) {
    errors.push('graph must include at least one node');
  }
  if (graph.entry_nodes.length === 0) {
    errors.push('graph must declare at least one entry node');
  }
  for (const node of graph.nodes) {
    if (node.kind !== 'stage' && node.kind !== 'terminal') {
      errors.push(`unsupported graph node kind: ${node.kind}`);
    }
  }
  for (const entryId of graph.entry_nodes) {
    if (!nodeIds.has(entryId)) {
      errors.push(`unknown graph entry node: ${entryId}`);
    }
  }
  for (const edge of graph.edges) {
    if (edge.kind !== 'advance' && edge.kind !== 'reject' && edge.kind !== 'timeout' && edge.kind !== 'branch' && edge.kind !== 'complete') {
      errors.push(`unsupported graph edge kind: ${edge.kind}`);
      continue;
    }
    if (!nodeIds.has(edge.from)) {
      errors.push(`unknown graph edge.from node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`unknown graph edge.to node: ${edge.to}`);
    }
    if (edge.kind === 'advance') {
      advanceByFrom.set(edge.from, (advanceByFrom.get(edge.from) ?? 0) + 1);
    }
    if (edge.kind === 'branch') {
      branchByFrom.set(edge.from, (branchByFrom.get(edge.from) ?? 0) + 1);
    }
    if (edge.kind === 'reject') {
      rejectByFrom.set(edge.from, (rejectByFrom.get(edge.from) ?? 0) + 1);
    }
    if (edge.kind === 'timeout') {
      timeoutByFrom.set(edge.from, (timeoutByFrom.get(edge.from) ?? 0) + 1);
    }
    if (edge.kind === 'complete') {
      completeByFrom.set(edge.from, (completeByFrom.get(edge.from) ?? 0) + 1);
    }
  }
  const nodeKindById = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  for (const [from, count] of advanceByFrom.entries()) {
    if (count > 1) {
      errors.push(`multiple advance edges from node: ${from}`);
    }
  }
  for (const [from, count] of rejectByFrom.entries()) {
    if (count > 1) {
      errors.push(`multiple reject edges from node: ${from}`);
    }
  }
  for (const [from, count] of timeoutByFrom.entries()) {
    if (count > 1) {
      errors.push(`multiple timeout edges from node: ${from}`);
    }
    if ((advanceByFrom.get(from) ?? 0) > 0 || (branchByFrom.get(from) ?? 0) > 0 || (completeByFrom.get(from) ?? 0) > 0) {
      errors.push(`cannot mix timeout edges with other forward edges from node: ${from}`);
    }
  }
  for (const [from, count] of branchByFrom.entries()) {
    if (count < 2) {
      errors.push(`branching node must declare at least two branch edges: ${from}`);
    }
    if ((advanceByFrom.get(from) ?? 0) > 0 || (timeoutByFrom.get(from) ?? 0) > 0) {
      errors.push(`cannot mix advance and branch edges from node: ${from}`);
    }
  }
  for (const edge of graph.edges) {
    if (edge.kind === 'timeout') {
      const fromNode = graph.nodes.find((node) => node.id === edge.from);
      const toNodeKind = nodeKindById.get(edge.to);
      if (fromNode?.gate?.type !== 'auto_timeout') {
        errors.push(`timeout edges require auto_timeout gate on source node: ${edge.from}`);
      }
      if (toNodeKind !== 'stage' && toNodeKind !== 'terminal') {
        errors.push(`timeout edges must target stage or terminal nodes: ${edge.from} -> ${edge.to}`);
      }
    }
    if (edge.kind !== 'complete') {
      continue;
    }
    if (nodeKindById.get(edge.to) !== 'terminal') {
      errors.push(`complete edges must target terminal nodes: ${edge.from} -> ${edge.to}`);
    }
  }
  errors.push(...validateRuntimeSupportedGraphSemantics(graph));
  return errors;
}

function resolveStageMode(node: TemplateGraphDto['nodes'][number]): TemplateStageDto['mode'] {
  if (node.execution_kind === 'citizen_execute' || node.execution_kind === 'craftsman_dispatch') {
    return 'execute';
  }
  return 'discuss';
}

export function orderedRuntimeGraphStageIds(graph: RuntimeGraphShape): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();
  const nextByFrom = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind === 'advance' && !nextByFrom.has(edge.from)) {
      nextByFrom.set(edge.from, edge.to);
    }
  }
  const walk = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    ordered.push(nodeId);
    const next = nextByFrom.get(nodeId);
    if (next) {
      walk(next);
    }
  };
  for (const entryId of graph.entry_nodes) {
    walk(entryId);
  }
  for (const node of graph.nodes) {
    walk(node.id);
  }
  return ordered;
}

export function validateRuntimeSupportedGraphSemantics(graph: RuntimeGraphShape): string[] {
  const errors: string[] = [];
  if (graph.entry_nodes.length !== 1) {
    errors.push('graph must declare exactly one entry node');
  }
  const nodeKindById = new Map(graph.nodes.map((node) => [node.id, node.kind ?? 'stage']));
  const branchByFrom = new Map<string, number>();
  const timeoutByFrom = new Map<string, number>();
  const orderedIds = orderedRuntimeGraphStageIds(graph);
  const stageIndex = new Map(orderedIds.map((id, index) => [id, index]));
  for (const edge of graph.edges) {
    if (edge.kind === 'branch') {
      branchByFrom.set(edge.from, (branchByFrom.get(edge.from) ?? 0) + 1);
    }
    if (edge.kind === 'timeout') {
      timeoutByFrom.set(edge.from, (timeoutByFrom.get(edge.from) ?? 0) + 1);
      const fromIndex = stageIndex.get(edge.from);
      const toIndex = stageIndex.get(edge.to);
      if (fromIndex !== undefined && toIndex !== undefined && nodeKindById.get(edge.to) !== 'terminal' && toIndex <= fromIndex) {
        errors.push(`timeout edge ${edge.from} -> ${edge.to} must reference a later stage`);
      }
    }
    if (edge.kind === 'complete' && nodeKindById.get(edge.to) !== 'terminal') {
      errors.push(`complete edges must target terminal nodes: ${edge.from} -> ${edge.to}`);
    }
    if (edge.kind !== 'reject') {
      continue;
    }
    const fromIndex = stageIndex.get(edge.from);
    const toIndex = stageIndex.get(edge.to);
    if (fromIndex === undefined || toIndex === undefined) {
      continue;
    }
    if (toIndex >= fromIndex) {
      errors.push(`reject edge ${edge.from} -> ${edge.to} must reference an earlier stage`);
    }
  }
  for (const [from, count] of branchByFrom.entries()) {
    if (count < 2) {
      errors.push(`branching node must declare at least two branch edges: ${from}`);
    }
  }
  for (const [from, count] of timeoutByFrom.entries()) {
    if (count > 1) {
      errors.push(`multiple timeout edges from node: ${from}`);
    }
  }
  return errors;
}

export function validateRuntimeWorkflowGraphAlignment(
  stages: WorkflowStageDto[] | TemplateStageDto[] | undefined,
  graph: RuntimeGraphShape | undefined,
): string[] {
  if (!graph) {
    return [];
  }
  if (!stages || stages.length === 0) {
    return ['graph-backed workflows must define explicit stages'];
  }
  const stageIds = stages.map((stage) => stage.id);
  const graphStageNodeIds = graph.nodes.filter((node) => (node.kind ?? 'stage') === 'stage').map((node) => node.id);
  const stageIdSet = new Set(stageIds);
  const graphNodeIdSet = new Set(graphStageNodeIds);
  const errors: string[] = [];
  for (const stageId of stageIds) {
    if (!graphNodeIdSet.has(stageId)) {
      errors.push(`workflow stage '${stageId}' is missing from graph nodes`);
    }
  }
  for (const nodeId of graphStageNodeIds) {
    if (!stageIdSet.has(nodeId)) {
      errors.push(`graph node '${nodeId}' is missing from workflow stages`);
    }
  }
  return errors;
}

function topologicallyOrderLinearGraph(graph: TemplateGraphDto): string[] {
  return orderedRuntimeGraphStageIds(graph);
}
