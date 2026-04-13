import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { formatSelectabilityReason, isSelectableAgent, resolveAgentSelectability } from '@/lib/agentSelectability';
import { buildCreateTaskInput, buildInitialRoleAssignments } from '@/lib/createTaskDraft';
import { listSkills } from '@/lib/api';
import { buildCraftsmanInventory, isCraftsmanRole, normalizeRoleBindingId } from '@/lib/orchestrationRoles';
import { buildProjectBrainDraftPreamble, parseProjectBrainSourceContext } from '@/lib/projectBrainContext';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import { getPriorityMeta } from '@/lib/taskMeta';
import { useCreateTaskPageCopy } from '@/lib/dashboardCopy';
import { useLocale } from '@/lib/i18n';
import { useAgentStore } from '@/stores/agentStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useTemplateStore } from '@/stores/templateStore';
import type { AgentStatusItem } from '@/types/dashboard';
import type { ProjectMembership } from '@/types/project';

const SKILL_USAGE_STORAGE_KEY = 'agora-create-task-skill-usage';
const MAX_SKILL_USAGE_ENTRIES = 50;

type SkillUsageEntry = {
  skillRef: string;
  surface: 'global' | 'role';
  templateType: string;
  role: string | null;
  lastUsedAt: string;
};

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

function toggleSkillRef(current: string[], skillRef: string) {
  return current.includes(skillRef)
    ? current.filter((item) => item !== skillRef)
    : [...current, skillRef];
}

function toggleRoleSkillRef(
  current: Record<string, string[]>,
  role: string,
  skillRef: string,
) {
  const nextRefs = toggleSkillRef(current[role] ?? [], skillRef);
  if (nextRefs.length === 0) {
    return Object.fromEntries(Object.entries(current).filter(([key]) => key !== role));
  }
  return {
    ...current,
    [role]: nextRefs,
  };
}

function filterSkills(
  skills: Array<{ skill_ref: string; resolved_path: string }>,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return skills;
  }
  return skills.filter((skill) =>
    `${skill.skill_ref} ${skill.resolved_path}`.toLowerCase().includes(normalizedQuery));
}

function readSkillUsageHistory(): SkillUsageEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = window.localStorage.getItem(SKILL_USAGE_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`[CreateTaskPage] Invalid skill usage payload for storage key "${SKILL_USAGE_STORAGE_KEY}"`);
      return [];
    }
    return parsed.filter((entry): entry is SkillUsageEntry =>
      Boolean(
        entry
        && typeof entry === 'object'
        && typeof entry.skillRef === 'string'
        && typeof entry.surface === 'string'
        && typeof entry.templateType === 'string'
        && (typeof entry.role === 'string' || entry.role === null)
        && typeof entry.lastUsedAt === 'string',
      ));
  } catch (error) {
    console.warn(`[CreateTaskPage] Failed to parse storage key "${SKILL_USAGE_STORAGE_KEY}"`, error);
    return [];
  }
}

function writeSkillUsageHistory(entries: SkillUsageEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(SKILL_USAGE_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_SKILL_USAGE_ENTRIES)));
  } catch (error) {
    console.warn(`[CreateTaskPage] Failed to persist storage key "${SKILL_USAGE_STORAGE_KEY}"`, error);
  }
}

function getRecentTimestamps(
  history: SkillUsageEntry[],
  context: { surface: 'global' | 'role'; templateType: string; role: string | null },
) {
  const exact = new Map<string, number>();
  const overall = new Map<string, number>();

  for (const entry of history) {
    const timestamp = Date.parse(entry.lastUsedAt);
    if (Number.isNaN(timestamp)) {
      continue;
    }
    const previousOverall = overall.get(entry.skillRef) ?? -Infinity;
    if (timestamp > previousOverall) {
      overall.set(entry.skillRef, timestamp);
    }
    const isExactMatch = entry.surface === context.surface
      && entry.templateType === context.templateType
      && entry.role === context.role;
    if (!isExactMatch) {
      continue;
    }
    const previousExact = exact.get(entry.skillRef) ?? -Infinity;
    if (timestamp > previousExact) {
      exact.set(entry.skillRef, timestamp);
    }
  }

  return { exact, overall };
}

function resolveSkillSignal(
  skillRef: string,
  signals: ReturnType<typeof getRecentTimestamps>,
): 'recommended' | 'recent' | null {
  if ((signals.exact.get(skillRef) ?? -Infinity) > -Infinity) {
    return 'recommended';
  }
  if ((signals.overall.get(skillRef) ?? -Infinity) > -Infinity) {
    return 'recent';
  }
  return null;
}

function sortSkillsForPicker(
  skills: Array<{ skill_ref: string; resolved_path: string }>,
  selectedRefs: string[],
  history: SkillUsageEntry[],
  context: { surface: 'global' | 'role'; templateType: string; role: string | null },
) {
  const selected = new Set(selectedRefs);
  const { exact, overall } = getRecentTimestamps(history, context);
  return [...skills].sort((left, right) => {
    const leftSelected = selected.has(left.skill_ref);
    const rightSelected = selected.has(right.skill_ref);
    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }

    const leftExact = exact.get(left.skill_ref) ?? -Infinity;
    const rightExact = exact.get(right.skill_ref) ?? -Infinity;
    if (leftExact !== rightExact) {
      return rightExact - leftExact;
    }

    const leftRecent = overall.get(left.skill_ref) ?? -Infinity;
    const rightRecent = overall.get(right.skill_ref) ?? -Infinity;
    if (leftRecent !== rightRecent) {
      return rightRecent - leftRecent;
    }

    return left.skill_ref.localeCompare(right.skill_ref);
  });
}

export function CreateTaskPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const createTaskCopy = useCreateTaskPageCopy();
  const createTask = useTaskStore((state) => state.createTask);
  const templates = useTemplateStore((state) => state.templates);
  const selectedTemplateId = useTemplateStore((state) => state.selectedTemplateId);
  const selectedTemplate = useTemplateStore((state) => state.selectedTemplate);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const selectTemplate = useTemplateStore((state) => state.selectTemplate);
  const agents = useAgentStore((state) => state.agents);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const craftsmanRuntime = useAgentStore((state) => state.craftsmanRuntime);
  const projects = useProjectStore((state) => state.projects);
  const projectMembershipsByProject = useProjectStore((state) => state.projectMembershipsByProject);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const fetchProjectMembers = useProjectStore((state) => state.fetchProjectMembers);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>(selectedTemplateId ?? 'coding');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [projectId, setProjectId] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [availableSkills, setAvailableSkills] = useState<Array<{ skill_ref: string; resolved_path: string }>>([]);
  const [globalSkillRefs, setGlobalSkillRefs] = useState<string[]>([]);
  const [roleSkillRefs, setRoleSkillRefs] = useState<Record<string, string[]>>({});
  const [globalSkillsOpen, setGlobalSkillsOpen] = useState(true);
  const [globalSkillSearch, setGlobalSkillSearch] = useState('');
  const [globalSkillFilter, setGlobalSkillFilter] = useState<'all' | 'selected' | 'recommended'>('all');
  const [roleSkillPickerOpen, setRoleSkillPickerOpen] = useState<Record<string, boolean>>({});
  const [roleSkillSearch, setRoleSkillSearch] = useState<Record<string, string>>({});
  const [skillUsageHistory, setSkillUsageHistory] = useState<SkillUsageEntry[]>(() => readSkillUsageHistory());
  const [submitting, setSubmitting] = useState(false);
  const [ownerAccountId, setOwnerAccountId] = useState('');
  const [assigneeAccountId, setAssigneeAccountId] = useState('');
  const [approverAccountId, setApproverAccountId] = useState('');
  const priorities = ['low', 'normal', 'high'] as const;
  const visibility = 'private' as const;
  const sourceContext = useMemo(() => parseProjectBrainSourceContext(location.search), [location.search]);
  const sourceContextPreamble = useMemo(() => {
    if (!sourceContext) {
      return '';
    }
    return buildProjectBrainDraftPreamble(sourceContext, {
      sourceContextTitle: createTaskCopy.sourceContextTitle,
      sourceKindLabel: createTaskCopy.sourceKindLabel,
      sourceTitleLabel: createTaskCopy.sourceTitleFieldLabel,
      sourceRefLabel: createTaskCopy.sourceRefLabel,
      sourceTaskIdsLabel: createTaskCopy.sourceTaskIdsLabel,
      sourceSnippetLabel: createTaskCopy.sourceSnippetLabel,
      sourceKindLabels: {
        knowledge: createTaskCopy.sourceKindLabels.knowledge,
        recap: createTaskCopy.sourceKindLabels.recap,
        citizen: createTaskCopy.sourceKindLabels.citizen,
      },
    });
  }, [
    createTaskCopy.sourceContextTitle,
    createTaskCopy.sourceKindLabel,
    createTaskCopy.sourceKindLabels.citizen,
    createTaskCopy.sourceKindLabels.knowledge,
    createTaskCopy.sourceKindLabels.recap,
    createTaskCopy.sourceRefLabel,
    createTaskCopy.sourceSnippetLabel,
    createTaskCopy.sourceTaskIdsLabel,
    createTaskCopy.sourceTitleFieldLabel,
    sourceContext,
  ]);

  useEffect(() => {
    void fetchTemplates();
    void fetchStatus();
    void fetchProjects();
    void listSkills().then((skills) => {
      setAvailableSkills(skills.map((item) => ({
        skill_ref: item.skill_ref,
        resolved_path: item.resolved_path,
      })));
    }).catch(() => {
      setAvailableSkills([]);
    });
  }, [fetchProjects, fetchStatus, fetchTemplates]);

  useEffect(() => {
    const nextProjectId = new URLSearchParams(location.search).get('project') ?? '';
    setProjectId(nextProjectId);
    setDescription(sourceContextPreamble);
  }, [location.search, sourceContextPreamble]);

  useEffect(() => {
    if (!projectId || projectMembershipsByProject[projectId]) {
      return;
    }
    void fetchProjectMembers(projectId).catch(() => undefined);
  }, [fetchProjectMembers, projectId, projectMembershipsByProject]);

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
    const craftsmanInventory = buildCraftsmanInventory(craftsmanRuntime);
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
  }, [agents, assignments, craftsmanRuntime, selectedTemplate]);

  const availableAgents = agents.filter(isSelectableAgent);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const skillCatalog = useMemo(
    () => [...availableSkills].sort((left, right) => left.skill_ref.localeCompare(right.skill_ref)),
    [availableSkills],
  );
  const currentTemplateType = selectedTemplate?.type ?? type;
  const globalSkillSignals = useMemo(
    () => getRecentTimestamps(skillUsageHistory, {
      surface: 'global',
      templateType: currentTemplateType,
      role: null,
    }),
    [currentTemplateType, skillUsageHistory],
  );
  const filteredGlobalSkills = useMemo(
    () => {
      const sorted = sortSkillsForPicker(
        filterSkills(skillCatalog, globalSkillSearch),
        globalSkillRefs,
        skillUsageHistory,
        {
          surface: 'global',
          templateType: currentTemplateType,
          role: null,
        },
      );
      if (globalSkillFilter === 'selected') {
        return sorted.filter((skill) => globalSkillRefs.includes(skill.skill_ref));
      }
      if (globalSkillFilter === 'recommended') {
        return sorted.filter((skill) => resolveSkillSignal(skill.skill_ref, globalSkillSignals) === 'recommended');
      }
      return sorted;
    },
    [currentTemplateType, globalSkillFilter, globalSkillRefs, globalSkillSearch, globalSkillSignals, skillCatalog, skillUsageHistory],
  );
  const restrictedSuggestedByRole = useMemo(() => {
    if (!selectedTemplate) {
      return {} as Record<string, Array<{ id: string; reason: string }>>;
    }
    return Object.fromEntries(selectedTemplate.defaultTeam.map((member) => {
      if (isCraftsmanRole(member.role, member.memberKind ?? null)) {
        return [member.role, []];
      }
      const restricted = member.suggested
        .map((agentId) => normalizeRoleBindingId(member.role, agentId, member.memberKind))
        .map((agentId) => agentById.get(agentId))
        .filter((agent): agent is AgentStatusItem => Boolean(agent))
        .filter((agent) => !isSelectableAgent(agent))
        .map((agent) => ({
          id: agent.id,
          reason: formatSelectabilityReason(
            resolveAgentSelectability(agent).reason,
            createTaskCopy.selectabilityReasonLabels,
          ),
        }));
      return [member.role, restricted];
    }));
  }, [agentById, createTaskCopy.selectabilityReasonLabels, selectedTemplate]);
  const availableCraftsmen = buildCraftsmanInventory(craftsmanRuntime);
  const controllerRole = selectedTemplate?.defaultTeam.find((member) => member.memberKind === 'controller') ?? null;
  const controllerRef = controllerRole ? assignments[controllerRole.role] ?? null : null;
  const activeProjectMembers = (projectId ? projectMembershipsByProject[projectId] ?? [] : []).filter((entry) => entry.status === 'active');
  const sortedProjectMembers = [...activeProjectMembers].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === 'admin' ? -1 : 1;
    }
    return left.accountId - right.accountId;
  });
  const templateChoices = templates.length > 0
    ? templates.map((template) => ({
        value: template.id,
        label: template.name,
      }))
    : createTaskCopy.taskTypes;

  const recordSkillUsage = (
    skillRef: string,
    context: { surface: 'global' | 'role'; role: string | null },
  ) => {
    const nextEntry: SkillUsageEntry = {
      skillRef,
      surface: context.surface,
      templateType: currentTemplateType,
      role: context.role,
      lastUsedAt: new Date().toISOString(),
    };
    setSkillUsageHistory((current) => {
      const next = [
        nextEntry,
        ...current.filter((entry) => !(
          entry.skillRef === nextEntry.skillRef
          && entry.surface === nextEntry.surface
          && entry.templateType === nextEntry.templateType
          && entry.role === nextEntry.role
        )),
      ];
      writeSkillUsageHistory(next);
      return next;
    });
  };

  const taskAuthority = (() => {
    const owner = ownerAccountId ? Number(ownerAccountId) : null;
    const assignee = assigneeAccountId ? Number(assigneeAccountId) : null;
    const approver = approverAccountId ? Number(approverAccountId) : null;
    if (!owner && !assignee && !approver) {
      return undefined;
    }
    return {
      ...(owner ? { owner_account_id: owner } : {}),
      ...(assignee ? { assignee_account_id: assignee } : {}),
      ...(approver ? { approver_account_id: approver } : {}),
      ...(controllerRef ? { controller_agent_ref: controllerRef } : {}),
    };
  })();

  const renderProjectMemberOptionLabel = (membership: ProjectMembership) =>
    `#${membership.accountId} · ${membership.role}`;

  const toggleGlobalSkill = (skillRef: string) => {
    const adding = !globalSkillRefs.includes(skillRef);
    setGlobalSkillRefs((current) => toggleSkillRef(current, skillRef));
    if (adding) {
      recordSkillUsage(skillRef, { surface: 'global', role: null });
    }
  };

  const toggleRoleSkill = (role: string, skillRef: string) => {
    const adding = !(roleSkillRefs[role] ?? []).includes(skillRef);
    setRoleSkillRefs((current) => toggleRoleSkillRef(current, role, skillRef));
    if (adding) {
      recordSkillUsage(skillRef, { surface: 'role', role });
    }
  };

  const renderSkillOptionList = (
    skills: Array<{ skill_ref: string; resolved_path: string }>,
    selectedRefs: string[],
    signals: ReturnType<typeof getRecentTimestamps>,
    onToggle: (skillRef: string) => void,
  ) => {
    if (availableSkills.length === 0) {
      return <span className="type-body-sm">{createTaskCopy.noSkillsLabel}</span>;
    }
    if (skills.length === 0) {
      return <span className="type-body-sm">{createTaskCopy.noSkillResultsLabel}</span>;
    }
    return (
      <div className="skill-picker__results">
        {skills.map((skill) => {
          const selected = selectedRefs.includes(skill.skill_ref);
          const signal = resolveSkillSignal(skill.skill_ref, signals);
          return (
            <button
              key={skill.skill_ref}
              type="button"
              aria-label={skill.skill_ref}
              aria-pressed={selected}
              onClick={() => onToggle(skill.skill_ref)}
              className={selected ? 'skill-picker__option skill-picker__option--active' : 'skill-picker__option'}
            >
              {signal ? (
                <span className="skill-picker__option-signal" aria-hidden="true">
                  {createTaskCopy.skillSignalLabels[signal]}
                </span>
              ) : null}
              <span className="skill-picker__option-name">{skill.skill_ref}</span>
            </button>
          );
        })}
      </div>
    );
  };

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
            locale,
            projectId: projectId || null,
            globalSkillRefs,
            roleSkillRefs,
            authority: taskAuthority,
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
            ...(taskAuthority ? { authority: taskAuthority } : {}),
            ...(globalSkillRefs.length > 0 || Object.keys(roleSkillRefs).length > 0
              ? {
                  skill_policy: {
                    global_refs: globalSkillRefs,
                    role_refs: roleSkillRefs,
                    enforcement: 'required' as const,
                  },
                }
              : {}),
          });
      showMessage(
        t('feedback.taskCreatedTitle'),
        t('feedback.taskCreatedDetail', { id: task.id }),
        'success',
      );
      navigate(buildProjectTaskHref(task.id, projectId || null));
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

      <section className="create-task-workbench-grid">
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
              <span className="field-label">{createTaskCopy.projectLabel}</span>
              <select
                aria-label={createTaskCopy.projectLabel}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="input-shell"
              >
                <option value="">{createTaskCopy.noProjectOption}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="field-label">{createTaskCopy.ownerAccountLabel}</span>
                <select
                  aria-label={createTaskCopy.ownerAccountLabel}
                  value={ownerAccountId}
                  onChange={(event) => setOwnerAccountId(event.target.value)}
                  className="input-shell"
                  disabled={!projectId}
                >
                  <option value="">{createTaskCopy.noHumanAuthorityOption}</option>
                  {sortedProjectMembers.map((membership) => (
                    <option key={`owner-${membership.id}`} value={membership.accountId}>
                      {renderProjectMemberOptionLabel(membership)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="field-label">{createTaskCopy.assigneeAccountLabel}</span>
                <select
                  aria-label={createTaskCopy.assigneeAccountLabel}
                  value={assigneeAccountId}
                  onChange={(event) => setAssigneeAccountId(event.target.value)}
                  className="input-shell"
                  disabled={!projectId}
                >
                  <option value="">{createTaskCopy.noHumanAuthorityOption}</option>
                  {sortedProjectMembers.map((membership) => (
                    <option key={`assignee-${membership.id}`} value={membership.accountId}>
                      {renderProjectMemberOptionLabel(membership)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="field-label">{createTaskCopy.approverAccountLabel}</span>
                <select
                  aria-label={createTaskCopy.approverAccountLabel}
                  value={approverAccountId}
                  onChange={(event) => setApproverAccountId(event.target.value)}
                  className="input-shell"
                  disabled={!projectId}
                >
                  <option value="">{createTaskCopy.noHumanAuthorityOption}</option>
                  {sortedProjectMembers.map((membership) => (
                    <option key={`approver-${membership.id}`} value={membership.accountId}>
                      {renderProjectMemberOptionLabel(membership)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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

            {sourceContext ? (
              <section className="detail-card" aria-label={createTaskCopy.sourceContextTitle}>
                <div className="space-y-1">
                  <strong className="type-heading-sm">{createTaskCopy.sourceContextTitle}</strong>
                  <p className="type-body-sm">{createTaskCopy.sourceContextSummary}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="type-text-xs">
                    <span className="field-label">{createTaskCopy.sourceKindLabel}</span>
                    {' '}
                    {createTaskCopy.sourceKindLabels[sourceContext.kind]}
                  </p>
                  <p className="type-text-xs">
                    <span className="field-label">{createTaskCopy.sourceTitleFieldLabel}</span>
                    {' '}
                    {sourceContext.title}
                  </p>
                  {sourceContext.sourceTaskIds.length > 0 ? (
                    <p className="type-text-xs">
                      <span className="field-label">{createTaskCopy.sourceTaskIdsLabel}</span>
                      {' '}
                      {sourceContext.sourceTaskIds.join(', ')}
                    </p>
                  ) : null}
                  <p className="type-text-xs break-all">
                    <span className="field-label">{createTaskCopy.sourceRefLabel}</span>
                    {' '}
                    {sourceContext.sourceRef}
                  </p>
                  {sourceContext.snippet ? (
                    <p className="type-body-sm whitespace-pre-wrap">{sourceContext.snippet}</p>
                  ) : null}
                </div>
              </section>
            ) : null}

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

            <div>
              <div className="skill-picker">
                <div className="skill-picker__header">
                  <span className="field-label">{createTaskCopy.globalSkillsLabel}</span>
                  <div className="skill-picker__actions">
                    <span className="status-pill status-pill--neutral">{createTaskCopy.selectedSkillsCount(globalSkillRefs.length)}</span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setGlobalSkillsOpen((current) => !current)}
                    >
                      {globalSkillsOpen ? createTaskCopy.closeGlobalSkillsAction : createTaskCopy.openGlobalSkillsAction}
                    </button>
                  </div>
                </div>

                {globalSkillRefs.length > 0 ? (
                  <div className="skill-picker__selected">
                    {globalSkillRefs.map((skillRef) => (
                      <button
                        key={skillRef}
                        type="button"
                        aria-pressed="true"
                        data-skill-tooltip={createTaskCopy.deselectSkillTitle(skillRef)}
                        onClick={() => toggleGlobalSkill(skillRef)}
                        className="choice-pill choice-pill--active skill-picker__selected-chip"
                      >
                        {skillRef}
                      </button>
                    ))}
                  </div>
                ) : null}
                {globalSkillRefs.length > 0 ? (
                  <p className="type-text-xs skill-picker__hint">{createTaskCopy.selectedSkillToggleHint}</p>
                ) : null}

                {globalSkillsOpen ? (
                  <div className="skill-picker__panel">
                    <label className="input-shell--centered skill-picker__search">
                      <Search size={16} className="icon-muted" />
                      <input
                        type="text"
                        value={globalSkillSearch}
                        onChange={(event) => setGlobalSkillSearch(event.target.value)}
                        placeholder={createTaskCopy.globalSkillsSearchPlaceholder}
                        aria-label={createTaskCopy.globalSkillsSearchLabel}
                        className="input-text"
                      />
                    </label>
                    <div className="skill-picker__filters">
                      {(['all', 'selected', 'recommended'] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setGlobalSkillFilter(filter)}
                          className={globalSkillFilter === filter ? 'choice-pill choice-pill--active' : 'choice-pill'}
                        >
                          {createTaskCopy.globalSkillFilterLabels[filter]}
                        </button>
                      ))}
                    </div>
                    <div data-testid="global-skill-picker-results">
                      {renderSkillOptionList(
                        filteredGlobalSkills,
                        globalSkillRefs,
                        globalSkillSignals,
                        toggleGlobalSkill,
                      )}
                    </div>
                  </div>
                ) : null}
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
            {globalSkillRefs.length > 0 ? (
              <div className="detail-card">
                <span className="detail-card__label">{createTaskCopy.globalSkillsLabel}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {globalSkillRefs.map((skillRef) => (
                    <span key={skillRef} className="choice-pill choice-pill--active">{skillRef}</span>
                  ))}
                </div>
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
                      {(restrictedSuggestedByRole[member.role] ?? []).length > 0 ? (
                        <div className="mt-3">
                          <span className="detail-card__label">{createTaskCopy.restrictedSuggestedLabel}</span>
                          <div className="mt-2 space-y-2">
                            {(restrictedSuggestedByRole[member.role] ?? []).map((item) => (
                              <div key={`${member.role}-restricted-${item.id}`} className="type-body-sm">
                                <strong>{item.id}</strong>
                                {' · '}
                                <span>{item.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <div className="skill-picker">
                          <div className="skill-picker__header">
                            <span className="detail-card__label">{createTaskCopy.roleSkillsLabel}</span>
                            <div className="skill-picker__actions">
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => setRoleSkillPickerOpen((current) => ({
                                  ...current,
                                  [member.role]: !current[member.role],
                                }))}
                              >
                                {roleSkillPickerOpen[member.role]
                                  ? createTaskCopy.closeRoleSkillsAction(member.role)
                                  : createTaskCopy.openRoleSkillsAction(member.role)}
                              </button>
                            </div>
                          </div>

                          {(roleSkillRefs[member.role] ?? []).length > 0 ? (
                            <div className="skill-picker__selected">
                              {(roleSkillRefs[member.role] ?? []).map((skillRef) => (
                                <button
                                  key={`${member.role}-selected-${skillRef}`}
                                  type="button"
                                  aria-pressed="true"
                                  data-skill-tooltip={createTaskCopy.deselectSkillTitle(skillRef)}
                                  onClick={() => toggleRoleSkill(member.role, skillRef)}
                                  className="choice-pill choice-pill--active skill-picker__selected-chip"
                                >
                                  {skillRef}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="type-body-sm">{createTaskCopy.noRoleSkillsSelectedLabel}</span>
                          )}
                          {(roleSkillRefs[member.role] ?? []).length > 0 ? (
                            <p className="type-text-xs skill-picker__hint">{createTaskCopy.selectedSkillToggleHint}</p>
                          ) : null}

                          {roleSkillPickerOpen[member.role] ? (
                            <div className="skill-picker__panel">
                              <label className="input-shell--centered skill-picker__search">
                                <Search size={16} className="icon-muted" />
                                <input
                                  type="text"
                                  value={roleSkillSearch[member.role] ?? ''}
                                  onChange={(event) => setRoleSkillSearch((current) => ({
                                    ...current,
                                    [member.role]: event.target.value,
                                  }))}
                                  placeholder={createTaskCopy.roleSkillsSearchPlaceholder}
                                  aria-label={createTaskCopy.roleSkillsSearchLabel(member.role)}
                                  className="input-text"
                                />
                              </label>
                              {renderSkillOptionList(
                                sortSkillsForPicker(
                                  filterSkills(skillCatalog, roleSkillSearch[member.role] ?? ''),
                                  roleSkillRefs[member.role] ?? [],
                                  skillUsageHistory,
                                  {
                                    surface: 'role',
                                    templateType: currentTemplateType,
                                    role: member.role,
                                  },
                                ),
                                roleSkillRefs[member.role] ?? [],
                                getRecentTimestamps(skillUsageHistory, {
                                  surface: 'role',
                                  templateType: currentTemplateType,
                                  role: member.role,
                                }),
                                (skillRef) => toggleRoleSkill(member.role, skillRef),
                              )}
                            </div>
                          ) : null}
                        </div>
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
