import type { TemplateDetailDto, TemplateGraphDto, TemplateStageDto } from '@agora-ts/contracts';

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
      ...(node.gate ? { gate: node.gate as NonNullable<TemplateStageDto['gate']> } : {}),
      ...(rejectEdgesByFrom.get(node.id) ? { reject_target: rejectEdgesByFrom.get(node.id)! } : {}),
      mode: resolveStageMode(node),
    }));
}

export function normalizeTemplateGraph(template: TemplateDetailDto): TemplateDetailDto {
  const graph = template.graph ?? deriveGraphFromStages(template.stages ?? []);
  const stages = (template.stages?.length ?? 0) > 0
    ? template.stages!
    : deriveStagesFromGraph(graph);
  return {
    ...template,
    stages,
    graph,
  };
}

export function validateTemplateGraph(graph: TemplateGraphDto): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (graph.nodes.length === 0) {
    errors.push('graph must include at least one node');
  }
  if (graph.entry_nodes.length === 0) {
    errors.push('graph must declare at least one entry node');
  }
  for (const entryId of graph.entry_nodes) {
    if (!nodeIds.has(entryId)) {
      errors.push(`unknown graph entry node: ${entryId}`);
    }
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`unknown graph edge.from node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`unknown graph edge.to node: ${edge.to}`);
    }
  }
  for (const node of graph.nodes) {
    if (node.kind === 'stage' && !graph.edges.some((edge) => edge.from === node.id) && !graph.entry_nodes.includes(node.id)) {
      errors.push(`graph node has no outgoing edge: ${node.id}`);
    }
  }
  return errors;
}

function resolveStageMode(node: TemplateGraphDto['nodes'][number]): TemplateStageDto['mode'] {
  if (node.execution_kind === 'citizen_execute' || node.execution_kind === 'craftsman_dispatch') {
    return 'execute';
  }
  return 'discuss';
}

function topologicallyOrderLinearGraph(graph: TemplateGraphDto): string[] {
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
