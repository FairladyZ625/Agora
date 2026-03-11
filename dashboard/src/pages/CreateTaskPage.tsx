import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { buildCreateTaskInput, buildInitialRoleAssignments } from '@/lib/createTaskDraft';
import { buildCraftsmanInventory, isCraftsmanRole } from '@/lib/orchestrationRoles';
import { getPriorityMeta } from '@/lib/taskMeta';
import { useCreateTaskPageCopy } from '@/lib/dashboardCopy';
import { useAgentStore } from '@/stores/agentStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useTemplateStore } from '@/stores/templateStore';

function haveSameAssignments(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

function reconcileAssignments(
  current: Record<string, string>,
  nextDefaults: Record<string, string>,
  roles: string[],
  availableAgentIds: Set<string>,
) {
  return roles.reduce<Record<string, string>>((acc, role) => {
    const currentAgentId = current[role];
    if (currentAgentId && availableAgentIds.has(currentAgentId)) {
      acc[role] = currentAgentId;
      return acc;
    }
    const defaultAgentId = nextDefaults[role];
    if (defaultAgentId && availableAgentIds.has(defaultAgentId)) {
      acc[role] = defaultAgentId;
    }
    return acc;
  }, {});
}

export function CreateTaskPage() {
  const { t } = useTranslation();
  const createTaskCopy = useCreateTaskPageCopy();
  const createTask = useTaskStore((state) => state.createTask);
  const templates = useTemplateStore((state) => state.templates);
  const selectedTemplateId = useTemplateStore((state) => state.selectedTemplateId);
  const selectedTemplate = useTemplateStore((state) => state.selectedTemplate);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const selectTemplate = useTemplateStore((state) => state.selectTemplate);
  const agents = useAgentStore((state) => state.agents);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const tmuxRuntime = useAgentStore((state) => state.tmuxRuntime);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>(selectedTemplateId ?? 'coding');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const priorities = ['low', 'normal', 'high'] as const;
  const visibility = 'private' as const;

  useEffect(() => {
    void fetchTemplates();
    void fetchStatus();
  }, [fetchStatus, fetchTemplates]);

  useEffect(() => {
    if (!templates.length) {
      return;
    }
    const matchingTemplate = templates.find((template) => template.id === type || template.type === type);
    if (!matchingTemplate) {
      setType(templates[0].id);
      return;
    }
    if (matchingTemplate && selectedTemplateId !== matchingTemplate.id) {
      void selectTemplate(matchingTemplate.id);
    }
  }, [selectedTemplateId, selectTemplate, templates, type]);

  useEffect(() => {
    const craftsmanInventory = buildCraftsmanInventory(tmuxRuntime);
    const nextAssignments = buildInitialRoleAssignments(selectedTemplate, {
      agents,
      craftsmen: craftsmanInventory.map((id) => ({ id })),
    });
    const availableAgentIds = new Set(agents.map((agent) => agent.id));
    const availableCraftsmanIds = new Set(craftsmanInventory);
    const nextState = reconcileAssignments(
      assignments,
      nextAssignments,
      selectedTemplate?.defaultTeamRoles ?? [],
      new Set([...availableAgentIds, ...availableCraftsmanIds]),
    );
    if (!haveSameAssignments(assignments, nextState)) {
      setAssignments(nextState);
    }
  }, [agents, assignments, selectedTemplate, tmuxRuntime]);

  const availableAgents = agents.filter((agent) => agent.presence !== 'offline' && agent.presence !== 'disconnected');
  const availableCraftsmen = buildCraftsmanInventory(tmuxRuntime);
  const controllerRole = selectedTemplate?.defaultTeam.find((member) => member.memberKind === 'controller') ?? null;
  const controllerRef = controllerRole ? assignments[controllerRole.role] ?? null : null;
  const templateChoices = templates.length > 0
    ? templates.map((template) => ({
        value: template.id,
        label: template.name,
      }))
    : createTaskCopy.taskTypes;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const task = await createTask(selectedTemplate
        ? buildCreateTaskInput({
            title,
            description,
            priority,
            template: selectedTemplate,
            type,
            visibility,
            assignments,
          })
        : {
            title: title.trim(),
            type,
            creator: 'archon',
            description: description.trim(),
            priority,
          });
      showMessage(
        t('feedback.taskCreatedTitle'),
        t('feedback.taskCreatedDetail', { id: task.id }),
        'success',
      );
      navigate(`/tasks/${task.id}`);
    } catch (error) {
      showMessage(
        t('feedback.taskCreateFailureTitle'),
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{createTaskCopy.kicker}</p>
            <h2 className="page-title">{createTaskCopy.title}</h2>
            <p className="page-summary">{createTaskCopy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{createTaskCopy.templateLabel}</span>
              <span className="inline-stat__value">{selectedTemplate?.name ?? type}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{createTaskCopy.teamLabel}</span>
              <span className="inline-stat__value">{selectedTemplate?.defaultTeam.length ?? 0}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{createTaskCopy.threadLabel}</span>
              <span className="inline-stat__value">{createTaskCopy.privateThreadLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <div className="surface-panel surface-panel--workspace" data-testid="create-task-composer">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2">
              <span className="field-label">{createTaskCopy.titleLabel}</span>
              <input
                aria-label={createTaskCopy.titleLabel}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="input-shell"
                placeholder={createTaskCopy.titlePlaceholder}
              />
            </label>

            <label className="space-y-2">
              <span className="field-label">{createTaskCopy.descriptionLabel}</span>
              <textarea
                aria-label={createTaskCopy.descriptionLabel}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="textarea-shell"
                placeholder={createTaskCopy.descriptionPlaceholder}
              />
            </label>

            <div>
              <span className="field-label">{createTaskCopy.typeLabel}</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {templateChoices.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setType(item.value)}
                    className={type === item.value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="field-label">{createTaskCopy.priorityLabel}</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {priorities.map((value) => {
                  const meta = getPriorityMeta(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPriority(value)}
                      className={priority === value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="button-primary" disabled={submitting || title.trim().length === 0}>
                {submitting ? createTaskCopy.submittingAction : createTaskCopy.submitAction}
              </button>
              <button type="button" className="button-secondary" onClick={() => navigate('/board')}>
                {createTaskCopy.backAction}
              </button>
            </div>
          </form>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="create-task-provisioning">
          <div className="section-title-row">
            <h3 className="section-title">{createTaskCopy.templateLabel}</h3>
            <span className="status-pill status-pill--neutral">{selectedTemplate?.type ?? type}</span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="detail-card">
              <span className="detail-card__label">{createTaskCopy.templateLabel}</span>
              <div className="space-y-1">
                <strong className="type-heading-sm">{selectedTemplate?.name ?? type}</strong>
                <p className="type-body-sm">{selectedTemplate?.description ?? createTaskCopy.summary}</p>
              </div>
            </div>

            <div className="detail-card">
              <span className="detail-card__label">{createTaskCopy.threadLabel}</span>
              <span className="type-body-sm">{createTaskCopy.privateThreadLabel}</span>
            </div>
            {controllerRef ? (
              <div className="detail-card">
                <span className="detail-card__label">{createTaskCopy.controllerLabel}</span>
                <span className="type-body-sm">{controllerRef}</span>
              </div>
            ) : null}

            {selectedTemplate?.defaultTeam.length ? (
              <div className="space-y-3">
                <div>
                  <span className="field-label">{createTaskCopy.teamLabel}</span>
                  <p className="type-body-sm mt-2">{createTaskCopy.teamSummary}</p>
                </div>
                {selectedTemplate.defaultTeam.map((member) => (
                  <div key={member.role} className="detail-card">
                    <div className="w-full">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="type-heading-sm">{member.role}</strong>
                        {member.modelPreference ? <span className="type-text-xs">{member.modelPreference}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(isCraftsmanRole(member.role, member.memberKind ?? null) ? availableCraftsmen : availableAgents.map((agent) => agent.id)).length > 0
                          ? (isCraftsmanRole(member.role, member.memberKind ?? null) ? availableCraftsmen : availableAgents.map((agent) => agent.id)).map((agentId) => (
                              <button
                                key={`${member.role}-${agentId}`}
                                type="button"
                                aria-pressed={assignments[member.role] === agentId}
                                onClick={() => setAssignments((current) => ({ ...current, [member.role]: agentId }))}
                                className={assignments[member.role] === agentId ? 'choice-pill choice-pill--active' : 'choice-pill'}
                              >
                                {agentId}
                              </button>
                            ))
                          : <span className="type-body-sm">{createTaskCopy.noAgentLabel}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
