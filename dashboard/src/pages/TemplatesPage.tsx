import { useEffect, useState } from 'react';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
import { buildCraftsmanInventory, isCraftsmanRole, normalizeRoleBindingId } from '@/lib/orchestrationRoles';
import { evaluateTemplateRuntimeCompatibility } from '@/lib/templateRuntimeCompatibility';
import { useAgentStore } from '@/stores/agentStore';
import { useTemplateStore } from '@/stores/templateStore';
import type { TemplateDetail } from '@/types/dashboard';

function cloneTemplateDetail(template: TemplateDetail): TemplateDetail {
  return {
    ...template,
    defaultTeamRoles: [...template.defaultTeamRoles],
    defaultTeam: template.defaultTeam.map((member) => ({
      ...member,
      suggested: [...member.suggested],
    })),
    stages: template.stages.map((stage) => ({ ...stage })),
  };
}

function buildTemplateEdges(template: TemplateDetail) {
  const edges: Array<{ from: string; to: string; kind: 'advance' | 'reject' }> = [];

  template.stages.forEach((stage, index) => {
    const nextStage = template.stages[index + 1];
    if (nextStage) {
      edges.push({ from: stage.id, to: nextStage.id, kind: 'advance' });
    }
    if (stage.rejectTarget) {
      edges.push({ from: stage.id, to: stage.rejectTarget, kind: 'reject' });
    }
  });

  return edges;
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

const STAGE_MODE_OPTIONS = ['discuss', 'execute'] as const;
const STAGE_GATE_OPTIONS = ['none', 'command', 'approval', 'archon_review', 'all_subtasks_done', 'auto_timeout', 'quorum'] as const;
const TEAM_MEMBER_KIND_OPTIONS = ['controller', 'citizen', 'craftsman'] as const;

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
  const [draft, setDraft] = useState<TemplateDetail | null>(null);
  const [duplicateId, setDuplicateId] = useState('');
  const [showCompatibilitySaveError, setShowCompatibilitySaveError] = useState(false);

  useEffect(() => {
    void fetchTemplates();
    void fetchStatus();
  }, [fetchStatus, fetchTemplates]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      void selectTemplate(templates[0].id);
    }
  }, [selectedTemplateId, selectTemplate, templates]);

  useEffect(() => {
    setDraft(selectedTemplate ? cloneTemplateDetail(selectedTemplate) : null);
    setDuplicateId(selectedTemplate ? `${selectedTemplate.id}_copy` : '');
    setShowCompatibilitySaveError(false);
  }, [selectedTemplate]);

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    if (compatibility.some((item) => item.missingSuggested.length > 0 || item.unavailableSuggested.length > 0)) {
      setShowCompatibilitySaveError(true);
      return;
    }
    setShowCompatibilitySaveError(false);
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
  const compatibilityByRole = new Map(compatibility.map((item) => [item.role, item]));
  const knownAgentIds = new Set(agents.map((agent) => agent.id));
  const graphEdges = draft ? buildTemplateEdges(draft) : [];

  const toggleSuggestedAgent = (role: string, agentId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
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
      };
    });
  };

  const removeMissingSuggestedAgent = (role: string, agentId: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        defaultTeam: current.defaultTeam.map((item) => (
          item.role === role
            ? {
                ...item,
                suggested: item.suggested.filter((value) => value !== agentId),
              }
            : item
        )),
      };
    });
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
                    onChange={(event) => setDraft((current) => (
                      current
                        ? {
                            ...current,
                            description: event.target.value,
                          }
                        : current
                    ))}
                  />
                </label>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.governanceLabel}</span>
                <span className="type-body-sm">{draft.governance}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
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
              <div className="space-y-3">
                <p className="page-kicker">{copy.teamLabel}</p>
                {draft.defaultTeam.map((member) => (
                  <div key={member.role} className="detail-card space-y-3">
                    <strong className="type-heading-sm">{member.role}</strong>
                    <label className="space-y-2">
                      <span className="field-label">{copy.memberKindLabel}</span>
                      <select
                        aria-label={`${member.role} ${copy.memberKindLabel}`}
                        className="input-shell"
                        value={member.memberKind ?? 'citizen'}
                        onChange={(event) => setDraft((current) => (
                          current
                            ? {
                                ...current,
                                defaultTeam: current.defaultTeam.map((item) => (
                                  item.role === member.role
                                    ? {
                                        ...item,
                                        memberKind: event.target.value as TemplateDetail['defaultTeam'][number]['memberKind'],
                                      }
                                    : item
                                )),
                              }
                            : current
                        ))}
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
                        onChange={(event) => setDraft((current) => (
                          current
                            ? {
                                ...current,
                                defaultTeam: current.defaultTeam.map((item) => (
                                  item.role === member.role
                                    ? {
                                        ...item,
                                        modelPreference: event.target.value.trim().length > 0 ? event.target.value : null,
                                      }
                                    : item
                                )),
                              }
                            : current
                        ))}
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
                <p className="page-kicker">{copy.stagesTitle}</p>
                <div className="mt-3 space-y-3">
                  {draft.stages.map((stage) => (
                    <div key={stage.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <label className="space-y-2">
                          <span className="field-label">{stage.id}</span>
                          <input
                            aria-label={copy.stageNameAria(stage.id)}
                            className="input-shell"
                            type="text"
                            value={stage.name}
                            onChange={(event) => setDraft((current) => (
                              current
                                ? {
                                    ...current,
                                    stages: current.stages.map((item) => (
                                      item.id === stage.id
                                        ? {
                                            ...item,
                                            name: event.target.value,
                                          }
                                        : item
                                    )),
                                  }
                                : current
                            ))}
                          />
                        </label>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <label className="space-y-2">
                            <span className="field-label">{copy.stageModeLabel}</span>
                            <select
                              aria-label={`阶段 ${stage.id} ${copy.stageModeLabel}`}
                              className="input-shell"
                              value={stage.mode}
                              onChange={(event) => setDraft((current) => (
                                current
                                  ? {
                                      ...current,
                                      stages: current.stages.map((item) => (
                                        item.id === stage.id
                                          ? {
                                              ...item,
                                              mode: event.target.value,
                                            }
                                          : item
                                      )),
                                    }
                                  : current
                              ))}
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
                              onChange={(event) => setDraft((current) => (
                                current
                                  ? {
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
                                    }
                                  : current
                              ))}
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
                              onChange={(event) => setDraft((current) => (
                                current
                                  ? {
                                      ...current,
                                      stages: current.stages.map((item) => (
                                        item.id === stage.id
                                          ? {
                                              ...item,
                                              rejectTarget: event.target.value.length > 0 ? event.target.value : null,
                                            }
                                          : item
                                      )),
                                    }
                                  : current
                              ))}
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
                                onChange={(event) => setDraft((current) => (
                                  current
                                    ? {
                                        ...current,
                                        stages: current.stages.map((item) => (
                                          item.id === stage.id
                                            ? {
                                                ...item,
                                                gateApprover: event.target.value.trim().length > 0 ? event.target.value : null,
                                              }
                                            : item
                                        )),
                                      }
                                    : current
                                ))}
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
                                onChange={(event) => setDraft((current) => (
                                  current
                                    ? {
                                        ...current,
                                        stages: current.stages.map((item) => (
                                          item.id === stage.id
                                            ? {
                                                ...item,
                                                gateRequired: event.target.value.length > 0 ? Number(event.target.value) : null,
                                              }
                                            : item
                                        )),
                                      }
                                    : current
                                ))}
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
                                onChange={(event) => setDraft((current) => (
                                  current
                                    ? {
                                        ...current,
                                        stages: current.stages.map((item) => (
                                          item.id === stage.id
                                            ? {
                                                ...item,
                                                gateTimeoutSec: event.target.value.length > 0 ? Number(event.target.value) : null,
                                              }
                                            : item
                                        )),
                                      }
                                    : current
                                ))}
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
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <div className="detail-card space-y-3">
                    <span className="detail-card__label">{copy.graphNodesLabel}</span>
                    <div className="space-y-2">
                      {draft.stages.map((stage) => (
                        <div key={`graph-node-${stage.id}`} className="data-row">
                          <div className="min-w-0 flex-1">
                            <p className="type-heading-xs">{stage.name}</p>
                            <p className="type-text-xs mt-1">
                              {stage.id}
                              {' / '}
                              {stage.mode}
                            </p>
                          </div>
                          {stage.gateType ? <span className="status-pill status-pill--neutral">{stage.gateType}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="detail-card space-y-3">
                    <span className="detail-card__label">{copy.graphEdgesLabel}</span>
                    <div className="space-y-2">
                      {graphEdges.map((edge, index) => (
                        <div key={`graph-edge-${edge.from}-${edge.to}-${index}`} className="data-row">
                          <span className="type-mono-xs">{`${edge.from} -> ${edge.to}`}</span>
                          <span className={edge.kind === 'reject' ? 'status-pill status-pill--warning' : 'status-pill status-pill--info'}>
                            {edge.kind}
                          </span>
                        </div>
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
