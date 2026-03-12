import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
import { buildCraftsmanInventory, isCraftsmanRole, normalizeRoleBindingId } from '@/lib/orchestrationRoles';
import { evaluateTemplateControllerTopology, evaluateTemplateRuntimeCompatibility } from '@/lib/templateRuntimeCompatibility';
import { useAgentStore } from '@/stores/agentStore';
import { useTemplateStore } from '@/stores/templateStore';
import type { TemplateDetail, TemplateGraph } from '@/types/dashboard';

function cloneTemplateDetail(template: TemplateDetail): TemplateDetail {
  const graph = template.graph ?? deriveTemplateGraphFromStages(template.stages);
  return {
    ...template,
    defaultTeamRoles: [...template.defaultTeamRoles],
    defaultTeam: template.defaultTeam.map((member) => ({
      ...member,
      suggested: [...member.suggested],
    })),
    stages: template.stages.map((stage) => ({ ...stage })),
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

function validateTemplateGraphDraft(graph: TemplateGraph) {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
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

function normalizeStageForGateType(stage: TemplateDetail['stages'][number], gateType: string | null) {
  return {
    ...stage,
    gateType,
    gateApprover: gateType === 'approval' ? stage.gateApprover ?? null : null,
    gateRequired: gateType === 'quorum' ? stage.gateRequired ?? null : null,
    gateTimeoutSec: gateType === 'auto_timeout' ? stage.gateTimeoutSec ?? null : null,
  };
}

function createNextStageId(stages: TemplateDetail['stages']) {
  const usedIds = new Set(stages.map((stage) => stage.id));
  let index = stages.length + 1;
  while (usedIds.has(`stage_${index}`)) {
    index += 1;
  }
  return `stage_${index}`;
}

function moveStage(stages: TemplateDetail['stages'], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= stages.length) {
    return stages;
  }
  const nextStages = [...stages];
  const [stage] = nextStages.splice(index, 1);
  nextStages.splice(nextIndex, 0, stage);
  return nextStages;
}

function removeStage(stages: TemplateDetail['stages'], stageId: string) {
  return stages
    .filter((stage) => stage.id !== stageId)
    .map((stage) => (
      stage.rejectTarget === stageId
        ? {
            ...stage,
            rejectTarget: null,
          }
        : stage
    ));
}

const STAGE_MODE_OPTIONS = ['discuss', 'execute'] as const;
const STAGE_GATE_OPTIONS = ['none', 'command', 'approval', 'archon_review', 'all_subtasks_done', 'auto_timeout', 'quorum'] as const;
const TEAM_MEMBER_KIND_OPTIONS = ['controller', 'citizen', 'craftsman'] as const;
const TEAM_ROLE_OPTIONS = ['architect', 'developer', 'reviewer', 'writer', 'researcher', 'analyst', 'executor', 'craftsman'] as const;

export function TemplatesPage() {
  const copy = useTemplatesPageCopy();
  const templates = useTemplateStore((state) => state.templates);
  const selectedTemplateId = useTemplateStore((state) => state.selectedTemplateId);
  const selectedTemplate = useTemplateStore((state) => state.selectedTemplate);
  const error = useTemplateStore((state) => state.error);
  const saving = useTemplateStore((state) => state.saving);
  const validationResult = useTemplateStore((state) => state.validationResult);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const selectTemplate = useTemplateStore((state) => state.selectTemplate);
  const saveSelectedTemplate = useTemplateStore((state) => state.saveSelectedTemplate);
  const validateSelectedTemplate = useTemplateStore((state) => state.validateSelectedTemplate);
  const duplicateSelectedTemplate = useTemplateStore((state) => state.duplicateSelectedTemplate);
  const agents = useAgentStore((state) => state.agents);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const tmuxRuntime = useAgentStore((state) => state.tmuxRuntime);
  const [draftState, setDraftState] = useState<TemplateDetail | null>(null);
  const [duplicateDraft, setDuplicateDraft] = useState<{ templateId: string | null; value: string }>({ templateId: null, value: '' });
  const [roleSelection, setRoleSelection] = useState<{ templateId: string | null; value: string }>({ templateId: null, value: '' });
  const [compatibilitySaveErrorState, setCompatibilitySaveErrorState] = useState<{ templateId: string | null; value: boolean }>({ templateId: null, value: false });
  const [controllerSaveErrorState, setControllerSaveErrorState] = useState<{ templateId: string | null; value: boolean }>({ templateId: null, value: false });
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [selectedGraphEdgeId, setSelectedGraphEdgeId] = useState<string | null>(null);
  const currentTemplateId = selectedTemplate?.id ?? null;

  useEffect(() => {
    void fetchTemplates();
    void fetchStatus();
  }, [fetchStatus, fetchTemplates]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      void selectTemplate(templates[0].id);
    }
  }, [selectedTemplateId, selectTemplate, templates]);

  const draft = useMemo(
    () => {
      if (draftState && draftState.id === currentTemplateId) {
        return draftState;
      }
      return selectedTemplate ? cloneTemplateDetail(selectedTemplate) : null;
    },
    [currentTemplateId, draftState, selectedTemplate],
  );
  const duplicateId = duplicateDraft.templateId === currentTemplateId
    ? duplicateDraft.value
    : (selectedTemplate ? `${selectedTemplate.id}_copy` : '');
  const roleToAdd = roleSelection.templateId === currentTemplateId ? roleSelection.value : '';
  const showCompatibilitySaveError = compatibilitySaveErrorState.templateId === currentTemplateId
    ? compatibilitySaveErrorState.value
    : false;
  const showControllerSaveError = controllerSaveErrorState.templateId === currentTemplateId
    ? controllerSaveErrorState.value
    : false;

  const updateDraft = (transform: (current: TemplateDetail) => TemplateDetail) => {
    if (!draft || !currentTemplateId) {
      return;
    }
    setDraftState(transform(draft));
  };

  const updateDraftFromStages = (transform: (current: TemplateDetail) => TemplateDetail) => {
    updateDraft((current) => {
      const next = transform(current);
      return {
        ...next,
        graph: deriveTemplateGraphFromStages(next.stages, next.graph),
      };
    });
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

  const setDuplicateId = (value: string) => {
    setDuplicateDraft({ templateId: currentTemplateId, value });
  };

  const setRoleToAdd = (value: string) => {
    setRoleSelection({ templateId: currentTemplateId, value });
  };

  const setShowCompatibilitySaveError = (value: boolean) => {
    setCompatibilitySaveErrorState({ templateId: currentTemplateId, value });
  };

  const setShowControllerSaveError = (value: boolean) => {
    setControllerSaveErrorState({ templateId: currentTemplateId, value });
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    if (controllerTopology.isMissingController || controllerTopology.hasDuplicateControllers) {
      setShowControllerSaveError(true);
      return;
    }
    if (compatibility.some((item) => item.missingSuggested.length > 0 || item.unavailableSuggested.length > 0)) {
      setShowCompatibilitySaveError(true);
      return;
    }
    setShowCompatibilitySaveError(false);
    setShowControllerSaveError(false);
    await saveSelectedTemplate(draft);
  };

  const handleValidate = async () => {
    if (!draft) {
      return;
    }
    await validateSelectedTemplate(draft);
  };

  const handleDuplicate = async () => {
    if (!draft || duplicateId.trim().length === 0) {
      return;
    }
    await duplicateSelectedTemplate({
      templateId: draft.id,
      newId: duplicateId.trim(),
      name: `${draft.name} Copy`,
    });
  };

  const craftsmanInventory = buildCraftsmanInventory(tmuxRuntime);
  const compatibility = draft ? evaluateTemplateRuntimeCompatibility(draft.defaultTeam, agents, craftsmanInventory) : [];
  const controllerTopology = draft
    ? evaluateTemplateControllerTopology(draft.defaultTeam)
    : { controllerRoles: [], isMissingController: false, hasDuplicateControllers: false };
  const compatibilityByRole = new Map(compatibility.map((item) => [item.role, item]));
  const knownAgentIds = new Set(agents.map((agent) => agent.id));
  const draftGraph = draft ? (draft.graph ?? deriveTemplateGraphFromStages(draft.stages)) : null;
  const graphNodes = useMemo<Node[]>(() => (
    draftGraph?.nodes.map((node) => ({
      id: node.id,
      position: node.layout ?? { x: 0, y: 0 },
      data: { label: node.name },
      type: 'default',
    })) ?? []
  ), [draftGraph]);
  const graphCanvasEdges = useMemo<Edge[]>(() => (
    draftGraph?.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.kind,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: edge.kind === 'reject',
    })) ?? []
  ), [draftGraph]);
  const availableRoleOptions = draft
    ? TEAM_ROLE_OPTIONS.filter((role) => !draft.defaultTeam.some((member) => member.role === role))
    : TEAM_ROLE_OPTIONS;
  const selectedGraphNode = draftGraph?.nodes.find((node) => node.id === selectedGraphNodeId) ?? null;
  const selectedGraphEdge = draftGraph?.edges.find((edge) => edge.id === selectedGraphEdgeId) ?? null;
  const graphValidationErrors = draftGraph ? validateTemplateGraphDraft(draftGraph) : [];

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

  const toggleSuggestedAgent = (role: string, agentId: string) => {
    updateDraft((current) => ({
      ...current,
      defaultTeam: current.defaultTeam.map((item) => {
        if (item.role !== role) {
          return item;
        }
        const alreadySelected = item.suggested.some((value) => (
          normalizeRoleBindingId(item.role, value, item.memberKind) === normalizeRoleBindingId(item.role, agentId, item.memberKind)
        ));
        return {
          ...item,
          suggested: alreadySelected
            ? item.suggested.filter((value) => normalizeRoleBindingId(item.role, value, item.memberKind) !== normalizeRoleBindingId(item.role, agentId, item.memberKind))
            : [...item.suggested, normalizeRoleBindingId(item.role, agentId, item.memberKind)],
        };
      }),
    }));
  };

  const removeMissingSuggestedAgent = (role: string, agentId: string) => {
    updateDraft((current) => ({
      ...current,
      defaultTeam: current.defaultTeam.map((item) => (
        item.role === role
          ? {
              ...item,
              suggested: item.suggested.filter((value) => value !== agentId),
            }
          : item
      )),
    }));
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.listTitle}</span>
              <span className="inline-stat__value">{templates.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.detailTitle}</span>
              <span className="inline-stat__value">{selectedTemplate?.type ?? 'n/a'}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stagesTitle}</span>
              <span className="inline-stat__value">{selectedTemplate?.stages.length ?? 0}</span>
            </div>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace" data-testid="templates-library">
          <div className="section-title-row">
            <h3 className="section-title">{copy.listTitle}</h3>
            <span className="status-pill status-pill--neutral">{templates.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => void selectTemplate(template.id)}
                className={template.id === selectedTemplateId ? 'dense-row dense-row--active' : 'dense-row'}
              >
                <div className="dense-row__main">
                  <div className="dense-row__titleblock">
                    <strong className="dense-row__title">{template.name}</strong>
                  </div>
                  <div className="dense-row__meta">
                    <span>{template.type}</span>
                    <span>{template.stageCountLabel}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="templates-detail-panel">
          <div className="section-title-row">
            <h3 className="section-title">{copy.detailTitle}</h3>
            <button
              type="button"
              className="button-primary"
              onClick={() => void handleSave()}
              disabled={!draft || saving}
            >
              {saving ? copy.savingAction : copy.saveAction}
            </button>
          </div>
          {draft ? (
            <div className="mt-5 space-y-5">
              <div>
                <h4 className="type-heading-sm">{draft.name}</h4>
                <label className="mt-3 block space-y-2">
                  <span className="field-label">{copy.descriptionLabel}</span>
                  <textarea
                    aria-label={copy.descriptionLabel}
                    className="textarea-shell"
                    value={draft.description}
                    onChange={(event) => updateDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))}
                  />
                </label>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.governanceLabel}</span>
                <span className="type-body-sm">{draft.governance}</span>
              </div>
              <div className="template-actions-grid">
                <label className="space-y-2">
                  <span className="field-label">{copy.duplicateIdLabel}</span>
                  <input
                    aria-label={copy.duplicateIdLabel}
                    className="input-shell"
                    type="text"
                    value={duplicateId}
                    onChange={(event) => setDuplicateId(event.target.value)}
                  />
                </label>
                <button type="button" className="button-secondary self-end" onClick={() => void handleValidate()}>
                  {copy.validateAction}
                </button>
                <button type="button" className="button-secondary self-end" onClick={() => void handleDuplicate()}>
                  {copy.duplicateAction}
                </button>
              </div>
              {validationResult ? (
                <div className={validationResult.valid ? 'inline-alert inline-alert--success' : 'inline-alert inline-alert--danger'}>
                  {validationResult.valid ? copy.validationPassed : validationResult.errors.join(' / ')}
                </div>
              ) : null}
              {showCompatibilitySaveError ? (
                <div className="inline-alert inline-alert--danger">
                  {copy.compatibilitySaveBlocked}
                </div>
              ) : null}
              {showControllerSaveError ? (
                <div className="inline-alert inline-alert--danger">
                  {copy.controllerSaveBlocked}
                </div>
              ) : null}
              <div className="space-y-3">
                <div className="section-title-row">
                  <p className="page-kicker">{copy.teamLabel}</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-2">
                      <span className="field-label">{copy.teamRoleSelectLabel}</span>
                      <select
                        aria-label={copy.teamRoleSelectLabel}
                        className="input-shell"
                        value={roleToAdd}
                        onChange={(event) => setRoleToAdd(event.target.value)}
                      >
                        <option value="">-</option>
                        {availableRoleOptions.map((role) => (
                          <option key={`add-role-${role}`} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={!draft || roleToAdd.length === 0}
                      onClick={() => {
                        updateDraft((current) => {
                          if (roleToAdd.length === 0 || current.defaultTeam.some((member) => member.role === roleToAdd)) {
                            return current;
                          }
                          const hasController = current.defaultTeam.some((member) => member.memberKind === 'controller');
                          const memberKind = roleToAdd === 'craftsman'
                            ? 'craftsman'
                            : (hasController ? 'citizen' : 'controller');
                          return {
                            ...current,
                            defaultTeamRoles: [...current.defaultTeamRoles, roleToAdd],
                            defaultTeam: [
                              ...current.defaultTeam,
                              {
                                role: roleToAdd,
                                memberKind,
                                modelPreference: null,
                                suggested: [],
                              },
                            ],
                          };
                        });
                        setRoleToAdd('');
                      }}
                    >
                      {copy.addRoleAction}
                    </button>
                  </div>
                </div>
                {controllerTopology.isMissingController || controllerTopology.hasDuplicateControllers ? (
                  <div className="inline-alert inline-alert--warning">
                    <strong>{copy.missingControllerLabel}</strong>
                    {controllerTopology.hasDuplicateControllers ? ` ${copy.duplicateControllersLabel}: ${controllerTopology.controllerRoles.join(', ')}` : ''}
                  </div>
                ) : null}
                {draft.defaultTeam.map((member) => (
                  <div key={member.role} className="detail-card space-y-3">
                    <div className="section-title-row">
                      <strong className="type-heading-sm">{member.role}</strong>
                      <button
                        type="button"
                        className="button-secondary"
                        aria-label={copy.removeRoleAria(member.role)}
                        onClick={() => updateDraft((current) => ({
                          ...current,
                          defaultTeamRoles: current.defaultTeamRoles.filter((role) => role !== member.role),
                          defaultTeam: current.defaultTeam.filter((item) => item.role !== member.role),
                        }))}
                      >
                        {copy.deleteRoleAction}
                      </button>
                    </div>
                    <label className="space-y-2">
                      <span className="field-label">{copy.memberKindLabel}</span>
                      <select
                        aria-label={`${member.role} ${copy.memberKindLabel}`}
                        className="input-shell"
                        value={member.memberKind ?? 'citizen'}
                        onChange={(event) => updateDraft((current) => ({
                          ...current,
                          defaultTeam: current.defaultTeam.map((item) => (
                            item.role === member.role
                              ? {
                                  ...item,
                                  memberKind: event.target.value as TemplateDetail['defaultTeam'][number]['memberKind'],
                                }
                              : item
                          )),
                        }))}
                      >
                        {TEAM_MEMBER_KIND_OPTIONS.map((option) => (
                          <option key={`${member.role}-member-kind-${option}`} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="field-label">{copy.modelPreferenceLabel}</span>
                      <input
                        aria-label={`${member.role} ${copy.modelPreferenceLabel}`}
                        className="input-shell"
                        type="text"
                        value={member.modelPreference ?? ''}
                        onChange={(event) => updateDraft((current) => ({
                          ...current,
                          defaultTeam: current.defaultTeam.map((item) => (
                            item.role === member.role
                              ? {
                                  ...item,
                                  modelPreference: event.target.value.trim().length > 0 ? event.target.value : null,
                                }
                              : item
                          )),
                        }))}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="field-label">{copy.suggestedAgentsLabel}</span>
                      <div className="flex flex-wrap gap-2">
                        {(isCraftsmanRole(member.role, member.memberKind ?? null) ? craftsmanInventory : agents.map((agent) => agent.id)).map((agentId) => (
                          <button
                            key={`${member.role}-${agentId}`}
                            type="button"
                            aria-label={agentId}
                            aria-pressed={member.suggested.some((suggested) => normalizeRoleBindingId(member.role, suggested, member.memberKind) === agentId)}
                            className={member.suggested.some((suggested) => normalizeRoleBindingId(member.role, suggested, member.memberKind) === agentId) ? 'choice-pill choice-pill--active' : 'choice-pill'}
                            onClick={() => toggleSuggestedAgent(member.role, agentId)}
                          >
                            {agentId}
                          </button>
                        ))}
                      </div>
                      {member.suggested.some((suggested) => (
                        isCraftsmanRole(member.role, member.memberKind ?? null)
                          ? !craftsmanInventory.includes(normalizeRoleBindingId(member.role, suggested, member.memberKind))
                          : !knownAgentIds.has(normalizeRoleBindingId(member.role, suggested, member.memberKind))
                      )) ? (
                        <div className="flex flex-wrap gap-2">
                          {member.suggested
                            .filter((suggested) => (
                              isCraftsmanRole(member.role, member.memberKind ?? null)
                                ? !craftsmanInventory.includes(normalizeRoleBindingId(member.role, suggested, member.memberKind))
                                : !knownAgentIds.has(normalizeRoleBindingId(member.role, suggested, member.memberKind))
                            ))
                            .map((suggested) => (
                              <button
                                key={`${member.role}-missing-${normalizeRoleBindingId(member.role, suggested, member.memberKind)}`}
                                type="button"
                                aria-label={copy.removeSuggestedAgentAria(normalizeRoleBindingId(member.role, suggested, member.memberKind))}
                                className="choice-pill"
                                onClick={() => removeMissingSuggestedAgent(member.role, suggested)}
                              >
                                {normalizeRoleBindingId(member.role, suggested, member.memberKind)}
                              </button>
                            ))}
                        </div>
                      ) : null}
                    </label>
                    {(() => {
                      const status = compatibilityByRole.get(member.role);
                      if (!status || (status.missingSuggested.length === 0 && status.unavailableSuggested.length === 0)) {
                        return null;
                      }
                      return (
                        <div className="inline-alert inline-alert--warning">
                          <strong>{copy.compatibilityTitle}</strong>
                          {status.missingSuggested.length > 0 ? ` ${copy.missingSuggestedLabel}: ${status.missingSuggested.join(', ')}` : ''}
                          {status.unavailableSuggested.length > 0 ? ` ${copy.unavailableSuggestedLabel}: ${status.unavailableSuggested.join(', ')}` : ''}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
              <div>
                <div className="section-title-row">
                  <p className="page-kicker">{copy.stagesTitle}</p>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => updateDraftFromStages((current) => ({
                      ...current,
                      stages: [
                        ...current.stages,
                        {
                          id: createNextStageId(current.stages),
                          name: '新阶段',
                          mode: 'discuss',
                          gateType: null,
                          gateApprover: null,
                          gateRequired: null,
                          gateTimeoutSec: null,
                          rejectTarget: null,
                        },
                      ],
                    }))}
                  >
                    {copy.addStageAction}
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {draft.stages.map((stage, stageIndex) => (
                    <div key={stage.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="button-secondary"
                            aria-label={copy.stageMoveUpAria(stage.id)}
                            disabled={stageIndex === 0}
                            onClick={() => updateDraftFromStages((current) => ({
                              ...current,
                              stages: moveStage(current.stages, stageIndex, -1),
                            }))}
                          >
                            {copy.moveStageUpAction}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            aria-label={copy.stageMoveDownAria(stage.id)}
                            disabled={stageIndex === draft.stages.length - 1}
                            onClick={() => updateDraftFromStages((current) => ({
                              ...current,
                              stages: moveStage(current.stages, stageIndex, 1),
                            }))}
                          >
                            {copy.moveStageDownAction}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            aria-label={copy.stageDeleteAria(stage.id)}
                            disabled={draft.stages.length === 1}
                            onClick={() => updateDraftFromStages((current) => ({
                              ...current,
                              stages: removeStage(current.stages, stage.id),
                            }))}
                          >
                            {copy.deleteStageAction}
                          </button>
                        </div>
                        <label className="space-y-2">
                          <span className="field-label">{stage.id}</span>
                          <input
                            aria-label={copy.stageNameAria(stage.id)}
                            className="input-shell"
                            type="text"
                            value={stage.name}
                            onChange={(event) => updateDraftFromStages((current) => ({
                              ...current,
                              stages: current.stages.map((item) => (
                                item.id === stage.id
                                  ? {
                                      ...item,
                                      name: event.target.value,
                                    }
                                  : item
                              )),
                            }))}
                          />
                        </label>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <label className="space-y-2">
                            <span className="field-label">{copy.stageModeLabel}</span>
                            <select
                              aria-label={`阶段 ${stage.id} ${copy.stageModeLabel}`}
                              className="input-shell"
                              value={stage.mode}
                            onChange={(event) => updateDraftFromStages((current) => ({
                              ...current,
                              stages: current.stages.map((item) => (
                                  item.id === stage.id
                                    ? {
                                        ...item,
                                        mode: event.target.value,
                                      }
                                    : item
                                )),
                              }))}
                            >
                              {STAGE_MODE_OPTIONS.map((option) => (
                                <option key={`${stage.id}-mode-${option}`} value={option}>{option}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="field-label">{copy.stageGateLabel}</span>
                            <select
                              aria-label={`阶段 ${stage.id} ${copy.stageGateLabel}`}
                              className="input-shell"
                              value={stage.gateType ?? 'none'}
                            onChange={(event) => updateDraftFromStages((current) => ({
                              ...current,
                              stages: current.stages.map((item) => (
                                  item.id === stage.id
                                    ? {
                                        ...item,
                                        ...normalizeStageForGateType(
                                          item,
                                          event.target.value === 'none' ? null : event.target.value,
                                        ),
                                      }
                                    : item
                                )),
                              }))}
                            >
                              {STAGE_GATE_OPTIONS.map((option) => (
                                <option key={`${stage.id}-gate-${option}`} value={option}>{option}</option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="field-label">{copy.stageRejectTargetLabel}</span>
                            <select
                              aria-label={`阶段 ${stage.id} ${copy.stageRejectTargetLabel}`}
                              className="input-shell"
                              value={stage.rejectTarget ?? ''}
                            onChange={(event) => updateDraftFromStages((current) => ({
                              ...current,
                              stages: current.stages.map((item) => (
                                  item.id === stage.id
                                    ? {
                                        ...item,
                                        rejectTarget: event.target.value.length > 0 ? event.target.value : null,
                                      }
                                    : item
                                )),
                              }))}
                            >
                              <option value="">{copy.stageNoRejectTargetLabel}</option>
                              {draft.stages
                                .filter((candidate) => candidate.id !== stage.id)
                                .map((candidate) => (
                                  <option key={`${stage.id}-reject-${candidate.id}`} value={candidate.id}>{candidate.id}</option>
                                ))}
                            </select>
                          </label>
                        </div>
                        {stage.gateType === 'approval' ? (
                          <div className="mt-3">
                            <label className="space-y-2">
                              <span className="field-label">{copy.stageApproverLabel}</span>
                              <input
                                aria-label={`阶段 ${stage.id} ${copy.stageApproverLabel}`}
                                className="input-shell"
                                type="text"
                                value={stage.gateApprover ?? ''}
                                onChange={(event) => updateDraftFromStages((current) => ({
                                  ...current,
                                  stages: current.stages.map((item) => (
                                    item.id === stage.id
                                      ? {
                                          ...item,
                                          gateApprover: event.target.value.trim().length > 0 ? event.target.value : null,
                                        }
                                      : item
                                  )),
                                }))}
                              />
                            </label>
                          </div>
                        ) : null}
                        {stage.gateType === 'quorum' ? (
                          <div className="mt-3">
                            <label className="space-y-2">
                              <span className="field-label">{copy.stageRequiredLabel}</span>
                              <input
                                aria-label={`阶段 ${stage.id} ${copy.stageRequiredLabel}`}
                                className="input-shell"
                                type="number"
                                min={1}
                                value={stage.gateRequired ?? ''}
                                onChange={(event) => updateDraftFromStages((current) => ({
                                  ...current,
                                  stages: current.stages.map((item) => (
                                    item.id === stage.id
                                      ? {
                                          ...item,
                                          gateRequired: event.target.value.length > 0 ? Number(event.target.value) : null,
                                        }
                                      : item
                                  )),
                                }))}
                              />
                            </label>
                          </div>
                        ) : null}
                        {stage.gateType === 'auto_timeout' ? (
                          <div className="mt-3">
                            <label className="space-y-2">
                              <span className="field-label">{copy.stageTimeoutLabel}</span>
                              <input
                                aria-label={`阶段 ${stage.id} ${copy.stageTimeoutLabel}`}
                                className="input-shell"
                                type="number"
                                min={1}
                                value={stage.gateTimeoutSec ?? ''}
                                onChange={(event) => updateDraftFromStages((current) => ({
                                  ...current,
                                  stages: current.stages.map((item) => (
                                    item.id === stage.id
                                      ? {
                                          ...item,
                                          gateTimeoutSec: event.target.value.length > 0 ? Number(event.target.value) : null,
                                        }
                                      : item
                                  )),
                                }))}
                              />
                            </label>
                          </div>
                        ) : null}
                        <div className="type-text-xs mt-2 flex flex-wrap items-center gap-3">
                          <span>{stage.id}</span>
                          <span>{stage.mode}</span>
                          {stage.gateType ? <span>{stage.gateType}</span> : null}
                          {stage.rejectTarget ? <span>{`reject -> ${stage.rejectTarget}`}</span> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="page-kicker">{copy.graphTitle}</p>
                <div className="mt-3 space-y-4">
                  <div className="detail-card">
                    <div style={{ height: 420 }}>
                      <ReactFlow
                        fitView
                        nodes={graphNodes}
                        edges={graphCanvasEdges}
                        onNodesChange={handleGraphNodesChange}
                        onEdgesChange={handleGraphEdgesChange}
                        onConnect={handleGraphConnect}
                        onNodeClick={(_, node) => {
                          setSelectedGraphNodeId(node.id);
                          setSelectedGraphEdgeId(null);
                        }}
                        onEdgeClick={(_, edge) => {
                          setSelectedGraphEdgeId(edge.id);
                          setSelectedGraphNodeId(null);
                        }}
                      >
                        <Background />
                        <Controls />
                      </ReactFlow>
                    </div>
                  </div>
                  <div className="detail-card space-y-3">
                    <span className="detail-card__label">Graph inspector</span>
                    {graphValidationErrors.length > 0 ? (
                      <div className="inline-alert inline-alert--warning">
                        {graphValidationErrors.join(' / ')}
                      </div>
                    ) : null}
                    {selectedGraphNode ? (
                      <div className="space-y-3">
                        <p className="type-heading-xs">{selectedGraphNode.id}</p>
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
                            {STAGE_GATE_OPTIONS.filter((option) => option !== 'none').map((option) => (
                              <option key={`graph-node-gate-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
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
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="detail-card space-y-3">
                    <span className="detail-card__label">{copy.graphNodesLabel}</span>
                    <div className="space-y-2">
                      {(draftGraph?.nodes ?? []).map((node) => (
                        <button
                          key={`graph-node-${node.id}`}
                          type="button"
                          className="data-row w-full text-left"
                          onClick={() => {
                            setSelectedGraphNodeId(node.id);
                            setSelectedGraphEdgeId(null);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="type-heading-xs">{node.name}</p>
                            <p className="type-text-xs mt-1">
                              {node.id}
                              {' / '}
                              {node.kind}
                            </p>
                          </div>
                          {node.gateType ? <span className="status-pill status-pill--neutral">{node.gateType}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="detail-card space-y-3">
                    <span className="detail-card__label">{copy.graphEdgesLabel}</span>
                    <div className="space-y-2">
                      {(draftGraph?.edges ?? []).map((edge) => (
                        <button
                          key={`graph-edge-${edge.id}`}
                          type="button"
                          aria-label={`graph edge ${edge.from} ${edge.to}`}
                          className="data-row w-full text-left"
                          onClick={() => {
                            setSelectedGraphEdgeId(edge.id);
                            setSelectedGraphNodeId(null);
                          }}
                        >
                          <span className="type-mono-xs">{`${edge.from} -> ${edge.to}`}</span>
                          <span className={edge.kind === 'reject' ? 'status-pill status-pill--warning' : 'status-pill status-pill--info'}>
                            {edge.kind}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state mt-5">
              <p className="type-body-sm">{copy.emptyTitle}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
