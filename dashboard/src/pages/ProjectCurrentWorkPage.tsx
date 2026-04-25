import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, Clock3, Link2, PanelRightOpen } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RuntimeLogViewer } from '@/components/ui/RuntimeLogViewer';
import { WorkflowGraphView } from '@/components/features/WorkflowGraphView';
import { useProjectCurrentWorkPageCopy, useTasksPageCopy } from '@/lib/dashboardCopy';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { normalizeCraftsmanId } from '@/lib/orchestrationRoles';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useTaskStore } from '@/stores/taskStore';
import type {
  CraftsmanExecution,
  Subtask,
  Task,
  TaskAction,
  TaskBlueprint,
  TaskConversationEntry,
  TaskStatus,
} from '@/types/task';
import type { ProjectWorkbench } from '@/types/project';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);

type TimelineItem = {
  key: string;
  label: string;
  detail: string;
  timestamp: string;
};

type CurrentWorkReferenceItem = {
  key: string;
  title: string;
  kind: string;
  path: string;
  updatedAt: string | null;
};

type CurrentWorkLifecycleStep = {
  key: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

function mapStatusEventTimelineItem(
  entry: TaskConversationEntry,
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
): TimelineItem | null {
  if (!entry.statusEvent) {
    return null;
  }
  const detailParts = [
    entry.statusEvent.taskState,
    entry.statusEvent.currentStage ? `${copy.stageEventPrefix} ${entry.statusEvent.currentStage}` : null,
    entry.statusEvent.executionKind ? `${copy.executionPrefix}: ${entry.statusEvent.executionKind}` : null,
    entry.statusEvent.controllerRef ? `${copy.controllerPrefix} ${entry.statusEvent.controllerRef}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    key: `status-${entry.id}`,
    label: entry.statusEvent.eventType,
    detail: [...detailParts, entry.body].filter((value): value is string => Boolean(value)).join(' / '),
    timestamp: entry.occurred_at,
  };
}

function buildTaskTimeline(
  status: TaskStatus | null | undefined,
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
): TimelineItem[] {
  if (!status) {
    return [];
  }
  const flowItems = (status.flow_log ?? []).map((entry) => ({
    key: `flow-${entry.id}`,
    label: entry.event,
    detail: entry.detail ?? '',
    timestamp: entry.created_at,
  }));
  const statusItems = (status.conversation ?? [])
    .map((entry) => mapStatusEventTimelineItem(entry, copy))
    .filter((entry): entry is TimelineItem => entry !== null);
  return [...flowItems, ...statusItems].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

function formatGovernanceMemoryValue(status: TaskStatus | null | undefined, fallback: string) {
  const host = status?.governanceSnapshot?.host;
  if (!host) {
    return fallback;
  }
  if (host.platform === 'darwin' && host.memoryPressure != null) {
    return `${Math.round(host.memoryPressure * 100)}% pressure`;
  }
  if (host.memoryUtilization != null) {
    return `${Math.round(host.memoryUtilization * 100)}%`;
  }
  return fallback;
}

function displayAgentId(agentId: string) {
  return normalizeCraftsmanId(agentId);
}

function compactText(value: string | null | undefined, maxLength: number) {
  const text = value?.trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function createFallbackTask(
  summary: { id: string; title: string; state: string; projectId: string | null },
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
): Task {
  return {
    id: summary.id,
    version: 0,
    projectId: summary.projectId,
    title: summary.title,
    description: null,
    type: 'workflow',
    priority: 'normal',
    creator: 'archon',
    state: (summary.state as Task['state']) ?? 'pending',
    archiveStatus: null,
    authority: null,
    controllerRef: null,
    current_stage: null,
    teamLabel: copy.fallbackTeamLabel,
    workflowLabel: copy.fallbackWorkflowLabel,
    memberCount: 0,
    isReviewStage: false,
    sourceState: summary.state,
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

function buildReferenceItems(
  project: ProjectWorkbench,
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
): CurrentWorkReferenceItem[] {
  const items: CurrentWorkReferenceItem[] = [];
  if (project.surfaces.index) {
    const indexTitle = project.surfaces.index.title ?? `${project.project.name} index`;
    items.push({
      key: 'index',
      title: indexTitle === project.project.name ? `${indexTitle} index` : indexTitle,
      kind: copy.referenceKindLabels.index,
      path: project.surfaces.index.path,
      updatedAt: project.surfaces.index.updatedAt,
    });
  }
  if (project.surfaces.timeline) {
    items.push({
      key: 'timeline',
      title: project.surfaces.timeline.title ?? `${project.project.name} timeline`,
      kind: copy.referenceKindLabels.timeline,
      path: project.surfaces.timeline.path,
      updatedAt: project.surfaces.timeline.updatedAt,
    });
  }
  for (const knowledge of project.work.knowledge.slice(0, 4)) {
    items.push({
      key: `knowledge-${knowledge.slug}`,
      title: knowledge.title ?? knowledge.slug,
      kind: knowledge.kind,
      path: knowledge.path,
      updatedAt: knowledge.updatedAt,
    });
  }
  for (const recap of project.work.recaps.slice(0, 2)) {
    items.push({
      key: `recap-${recap.taskId}`,
      title: recap.title ?? recap.taskId,
      kind: copy.referenceKindLabels.recap,
      path: recap.summaryPath,
      updatedAt: recap.updatedAt,
    });
  }
  return items;
}

function buildLifecycleSteps(
  task: Task | null,
  blueprint: TaskBlueprint | undefined,
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
): CurrentWorkLifecycleStep[] {
  const blueprintNodes = blueprint?.nodes.slice(0, 5).map((node) => node.name ?? node.id) ?? [];
  const fallbackNodes = [
    copy.lifecycle.briefing,
    task?.current_stage ?? copy.lifecycle.activeStage,
    copy.lifecycle.execution,
    copy.lifecycle.verification,
    copy.lifecycle.harvest,
  ];
  const labels = blueprintNodes.length >= 3 ? blueprintNodes : fallbackNodes;
  const activeIndex = Math.max(0, labels.findIndex((label) => label === (task?.current_stage ?? '')));
  return labels.slice(0, 5).map((label, index) => ({
    key: `${label}-${index}`,
    label,
    status: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
  }));
}

function getGovernancePosture(
  task: Task | null,
  warnings: number,
  copy: ReturnType<typeof useProjectCurrentWorkPageCopy>,
) {
  if (!task) {
    return { label: copy.noActiveTask, tone: 'neutral' };
  }
  if (warnings > 0 || task.priority === 'high' || task.gateType === 'approval' || task.gateType === 'quorum') {
    return { label: copy.highImpactChange, tone: 'critical' };
  }
  if (task.state === 'gate_waiting' || task.state === 'blocked' || task.state === 'paused') {
    return { label: copy.reviewNeeded, tone: 'warning' };
  }
  return { label: copy.executionReady, tone: 'healthy' };
}

function TaskBlueprintSection({
  blueprint,
  copy,
  currentStageId,
}: {
  blueprint: TaskBlueprint | undefined;
  copy: ReturnType<typeof useTasksPageCopy>;
  currentStageId?: string | null;
}) {
  return (
    <section className="task-authority__section task-flow__section">
      <h4 className="section-title">{copy.blueprintTitle}</h4>
      {!blueprint ? (
        <p className="type-body-sm mt-3">{copy.blueprintEmpty}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {blueprint.controllerRef ? (
            <div>
              <p className="field-label">{copy.blueprintControllerLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="choice-pill choice-pill--active">{blueprint.controllerRef}</span>
              </div>
            </div>
          ) : null}

          <div className="detail-card detail-card--graph">
            <WorkflowGraphView
              testId="project-task-blueprint-graph"
              currentNodeId={currentStageId ?? null}
              entryLabel={copy.blueprintEntryLabel}
              nodes={blueprint.nodes.map((node) => ({
                id: node.id,
                label: node.name ?? node.id,
                kindLabel: node.mode ?? 'stage',
                gateLabel: node.gateType ?? 'open',
                isEntry: blueprint.entryNodes.includes(node.id),
                layout: null,
              }))}
              edges={blueprint.edges}
              edgeKindLabels={{ advance: 'advance', reject: 'reject' }}
            />
          </div>

          {blueprint.artifactContracts.length > 0 ? (
            <div>
              <p className="field-label">{copy.blueprintArtifactsLabel}</p>
              <div className="mt-2 space-y-2">
                {blueprint.artifactContracts.map((artifact) => (
                  <div key={`${artifact.nodeId}-${artifact.artifactType}`} className="data-row">
                    <span className="type-mono-xs">{artifact.nodeId}</span>
                    <span className="status-pill status-pill--neutral">{artifact.artifactType}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function ProjectCurrentWorkPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId?: string }>();
  const { t } = useTranslation();
  const tasksPageCopy = useTasksPageCopy();
  const currentWorkCopy = useProjectCurrentWorkPageCopy();
  const navigate = useNavigate();

  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const projectError = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);

  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const selectedTaskStatus = useTaskStore((state) => state.selectedTaskStatus);
  const taskDetailLoading = useTaskStore((state) => state.detailLoading);
  const taskError = useTaskStore((state) => state.error);
  const selectTask = useTaskStore((state) => state.selectTask);
  const runTaskAction = useTaskStore((state) => state.runTaskAction);
  const observeCraftsmen = useTaskStore((state) => state.observeCraftsmen);
  const diagnoseRuntime = useTaskStore((state) => state.diagnoseRuntime);
  const probeCraftsmanExecution = useTaskStore((state) => state.probeCraftsmanExecution);
  const fetchCraftsmanExecutionTail = useTaskStore((state) => state.fetchCraftsmanExecutionTail);
  const executionTailById = useTaskStore((state) => state.executionTailById);
  const executionTailLoadingById = useTaskStore((state) => state.executionTailLoadingById);
  const restartRuntime = useTaskStore((state) => state.restartRuntime);
  const sendCraftsmanInputText = useTaskStore((state) => state.sendCraftsmanInputText);
  const sendCraftsmanInputKeys = useTaskStore((state) => state.sendCraftsmanInputKeys);
  const submitCraftsmanChoice = useTaskStore((state) => state.submitCraftsmanChoice);
  const stopCraftsmanExecution = useTaskStore((state) => state.stopCraftsmanExecution);
  const closeSubtask = useTaskStore((state) => state.closeSubtask);
  const archiveSubtask = useTaskStore((state) => state.archiveSubtask);
  const cancelSubtask = useTaskStore((state) => state.cancelSubtask);

  const sessionAccountId = useSessionStore((state) => state.accountId);
  const sessionUsername = useSessionStore((state) => state.username);
  const { showMessage } = useFeedbackStore();

  const [actionActor, setActionActor] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executionInputText, setExecutionInputText] = useState('');

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

  const projectTaskItems = useMemo(() => {
    const taskLookup = new Map(tasks.map((task) => [task.id, task]));
    return (selectedProject?.work.tasks ?? []).map((summary) => (
      taskLookup.get(summary.id) ?? createFallbackTask(summary, currentWorkCopy)
    ));
  }, [currentWorkCopy, selectedProject?.work.tasks, tasks]);

  const resolvedTaskId = taskId ?? selectedTaskId ?? projectTaskItems[0]?.id ?? null;

  useEffect(() => {
    if (taskId) {
      void selectTask(taskId);
      return;
    }
    if (!resolvedTaskId) {
      return;
    }
    if (selectedTaskId === resolvedTaskId) {
      return;
    }
    void selectTask(resolvedTaskId);
  }, [resolvedTaskId, selectTask, selectedTaskId, taskId]);

  const activeTask =
    (resolvedTaskId && selectedTaskStatus?.task.id === resolvedTaskId ? selectedTaskStatus.task : null)
    ?? projectTaskItems.find((task) => task.id === resolvedTaskId)
    ?? null;
  const activeStatus = activeTask && selectedTaskStatus?.task.id === activeTask.id ? selectedTaskStatus : null;
  const activeTimeline = useMemo(() => buildTaskTimeline(activeStatus, currentWorkCopy), [activeStatus, currentWorkCopy]);
  const activeBlueprint = activeStatus?.taskBlueprint;
  const activeSubtasks = activeStatus?.subtasks ?? [];
  const activeSubtaskExecutions = activeStatus?.subtaskExecutions ?? {};
  const activeGovernanceSnapshot = activeStatus?.governanceSnapshot ?? null;

  const resolvedSelectedSubtaskId =
    selectedSubtaskId && activeSubtasks.some((subtask) => subtask.id === selectedSubtaskId)
      ? selectedSubtaskId
      : activeSubtasks[0]?.id ?? null;
  const selectedSubtask =
    activeSubtasks.find((subtask) => subtask.id === resolvedSelectedSubtaskId) ??
    activeSubtasks[0] ??
    null;
  const selectedSubtaskExecutions =
    (selectedSubtask ? activeSubtaskExecutions[selectedSubtask.id] : undefined) ?? [];
  const resolvedSelectedExecutionId =
    selectedExecutionId && selectedSubtaskExecutions.some((execution) => execution.executionId === selectedExecutionId)
      ? selectedExecutionId
      : selectedSubtaskExecutions[0]?.executionId ?? null;
  const selectedExecution =
    selectedSubtaskExecutions.find((execution) => execution.executionId === resolvedSelectedExecutionId) ??
    selectedSubtaskExecutions[0] ??
    null;

  useEffect(() => {
    if (!selectedExecution) {
      return;
    }
    if (executionTailById[selectedExecution.executionId] || executionTailLoadingById[selectedExecution.executionId]) {
      return;
    }
    void fetchCraftsmanExecutionTail(selectedExecution.executionId);
  }, [executionTailById, executionTailLoadingById, fetchCraftsmanExecutionTail, selectedExecution]);

  useEffect(() => {
    if (!selectedExecution) {
      return;
    }
    if (!['running', 'needs_input', 'awaiting_choice'].includes(selectedExecution.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      if (executionTailLoadingById[selectedExecution.executionId]) {
        return;
      }
      void fetchCraftsmanExecutionTail(selectedExecution.executionId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [executionTailLoadingById, fetchCraftsmanExecutionTail, selectedExecution]);

  const selectedExecutionTail = selectedExecution ? executionTailById[selectedExecution.executionId] : null;
  const selectedExecutionTailLoading = selectedExecution ? !!executionTailLoadingById[selectedExecution.executionId] : false;
  const selectedExecutionTailMode = selectedExecution
    ? (['running', 'needs_input', 'awaiting_choice'].includes(selectedExecution.status)
        ? tasksPageCopy.executionTailLiveLabel
        : tasksPageCopy.executionTailSnapshotLabel)
    : null;

  const activeMembers = activeStatus?.task.teamMembers ?? [];
  const activeGateType = activeStatus?.task.gateType ?? null;
  const canRunGateActions = activeStatus?.task.sourceState === 'active';
  const canRunApprovalActions = canRunGateActions
    && activeGateType === 'approval'
    && (
      activeStatus.task.authority?.approverAccountId == null
      || (sessionAccountId != null && activeStatus.task.authority.approverAccountId === sessionAccountId)
    );
  const preferredActorId =
    !activeTask
      ? ''
      : (activeGateType === 'approval'
          ? activeMembers.find((member) => member.role === 'reviewer')?.agentId
          : activeMembers.find((member) => member.role === 'architect')?.agentId) ??
        activeMembers[0]?.agentId ??
        activeTask.creator;
  const resolvedActionActor = actionActor || preferredActorId;

  const runAction = async (
    action: TaskAction,
    overrides: { actorId?: string; note?: string; subtaskId?: string; vote?: 'approve' | 'reject' } = {},
  ) => {
    if (!activeTask) {
      return;
    }
    try {
      const isHumanReviewAction = action === 'approve' || action === 'reject';
      const dashboardActor = sessionUsername?.trim();
      if (isHumanReviewAction && !dashboardActor) {
        throw new Error('missing dashboard session actor');
      }
      const actorId = overrides.actorId ?? (isHumanReviewAction ? dashboardActor : resolvedActionActor);
      await runTaskAction(action, {
        taskId: activeTask.id,
        actorId,
        note: overrides.note ?? actionNote,
        subtaskId: overrides.subtaskId,
        vote: overrides.vote,
      });
      showMessage(
        t('feedback.taskActionSuccessTitle'),
        t('feedback.taskActionSuccessDetail', { id: activeTask.id }),
        'success',
      );
      setActionNote('');
    } catch (actionError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        actionError instanceof Error ? actionError.message : String(actionError),
        'warning',
      );
    }
  };

  const runObserve = async () => {
    try {
      await observeCraftsmen();
      showMessage(t('feedback.syncSuccessTitle'), tasksPageCopy.executionObserveSuccess, 'success');
    } catch (observeError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        observeError instanceof Error ? observeError.message : String(observeError),
        'warning',
      );
    }
  };

  const runProbe = async (executionId: string) => {
    try {
      await probeCraftsmanExecution(executionId);
      showMessage(t('feedback.syncSuccessTitle'), tasksPageCopy.executionProbeSuccess, 'success');
    } catch (probeError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        probeError instanceof Error ? probeError.message : String(probeError),
        'warning',
      );
    }
  };

  const runExecutionTextInput = async (executionId: string) => {
    if (!executionInputText.trim()) {
      return;
    }
    try {
      await sendCraftsmanInputText(executionId, executionInputText.trim(), true);
      showMessage(t('feedback.taskActionSuccessTitle'), tasksPageCopy.executionInputSuccess, 'success');
      setExecutionInputText('');
    } catch (inputError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        inputError instanceof Error ? inputError.message : String(inputError),
        'warning',
      );
    }
  };

  const runExecutionKeysInput = async (executionId: string, keys: string[], submitChoice = false) => {
    try {
      if (submitChoice) {
        await submitCraftsmanChoice(executionId, keys);
      } else {
        await sendCraftsmanInputKeys(executionId, keys);
      }
      showMessage(t('feedback.taskActionSuccessTitle'), tasksPageCopy.executionInputSuccess, 'success');
    } catch (inputError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        inputError instanceof Error ? inputError.message : String(inputError),
        'warning',
      );
    }
  };

  const runExecutionTailRefresh = async (executionId: string) => {
    try {
      await fetchCraftsmanExecutionTail(executionId);
      showMessage(t('feedback.syncSuccessTitle'), tasksPageCopy.executionTailRefreshAction, 'success');
    } catch (tailError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        tailError instanceof Error ? tailError.message : String(tailError),
        'warning',
      );
    }
  };

  const runRuntimeDiagnosis = async (agentRef: string) => {
    if (!activeTask) {
      return;
    }
    try {
      const result = await diagnoseRuntime(activeTask.id, agentRef, resolvedActionActor, actionNote);
      showMessage(t('feedback.syncSuccessTitle'), result.summary, result.status === 'accepted' ? 'success' : 'warning');
      if (result.detail) {
        setActionNote(result.detail);
      }
    } catch (runtimeError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        runtimeError instanceof Error ? runtimeError.message : String(runtimeError),
        'warning',
      );
    }
  };

  const runRuntimeRestart = async (agentRef: string) => {
    if (!activeTask) {
      return;
    }
    try {
      const result = await restartRuntime(activeTask.id, agentRef, resolvedActionActor, actionNote);
      showMessage(t('feedback.taskActionSuccessTitle'), result.summary, result.status === 'accepted' ? 'success' : 'warning');
      if (result.detail) {
        setActionNote(result.detail);
      }
    } catch (runtimeError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        runtimeError instanceof Error ? runtimeError.message : String(runtimeError),
        'warning',
      );
    }
  };

  const runExecutionStop = async (executionId: string) => {
    try {
      const result = await stopCraftsmanExecution(executionId, resolvedActionActor, actionNote);
      showMessage(t('feedback.taskActionSuccessTitle'), result.summary, result.status === 'accepted' ? 'success' : 'warning');
      if (result.detail) {
        setActionNote(result.detail);
      }
    } catch (stopError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        stopError instanceof Error ? stopError.message : String(stopError),
        'warning',
      );
    }
  };

  const runSubtaskLifecycle = async (action: 'close' | 'archive' | 'cancel', subtask: Subtask) => {
    if (!activeTask) {
      return;
    }
    try {
      if (action === 'close') {
        await closeSubtask(activeTask.id, subtask.id, resolvedActionActor, actionNote);
      } else if (action === 'archive') {
        await archiveSubtask(activeTask.id, subtask.id, resolvedActionActor, actionNote);
      } else {
        await cancelSubtask(activeTask.id, subtask.id, resolvedActionActor, actionNote);
      }
      showMessage(
        t('feedback.taskActionSuccessTitle'),
        t('feedback.taskActionSuccessDetail', { id: activeTask.id }),
        'success',
      );
      setActionNote('');
    } catch (subtaskError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        subtaskError instanceof Error ? subtaskError.message : String(subtaskError),
        'warning',
      );
    }
  };

  const scrollToWorkbenchSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function renderExecutionStatus(execution: CraftsmanExecution) {
    const inputRequest = execution.callbackPayload?.inputRequest;
    return (
      <button
        key={execution.executionId}
        type="button"
        onClick={() => setSelectedExecutionId(execution.executionId)}
        className={selectedExecution?.executionId === execution.executionId ? 'dense-row dense-row--active' : 'dense-row'}
      >
        <div className="min-w-0 flex-1">
          <p className="type-heading-xs">{execution.executionId}</p>
          <p className="type-text-xs mt-1">
            {execution.adapter}
            {' / '}
            {execution.status}
            {execution.workdir ? ` / ${execution.workdir}` : ''}
          </p>
          {inputRequest?.hint ? <p className="type-text-xs mt-1">{inputRequest.hint}</p> : null}
          {inputRequest?.choiceOptions?.length ? (
            <p className="type-text-xs mt-1">
              {tasksPageCopy.executionChoiceLabel}: {inputRequest.choiceOptions.map((option) => option.label).join(' / ')}
            </p>
          ) : null}
        </div>
        <span className="status-pill status-pill--neutral">{execution.status}</span>
      </button>
    );
  }

  function renderSubtaskCard(subtask: Subtask) {
    const executionCount = activeSubtaskExecutions[subtask.id]?.length ?? 0;
    return (
      <button
        key={subtask.id}
        type="button"
        onClick={() => setSelectedSubtaskId(subtask.id)}
        className={selectedSubtask?.id === subtask.id ? 'dense-row dense-row--active' : 'dense-row'}
      >
        <div className="dense-row__main">
          <div className="dense-row__titleblock">
            <span className="type-mono-xs">{subtask.id}</span>
            <strong className="dense-row__title">{subtask.title}</strong>
          </div>
          <div className="dense-row__meta">
            <span>{displayAgentId(subtask.assignee)}</span>
            <span>{subtask.stage_id}</span>
            <span>{executionCount} {tasksPageCopy.executionCountUnit}</span>
          </div>
        </div>
        <span className="dense-row__time">{subtask.status}</span>
      </button>
    );
  }

  const referenceItems = selectedProject ? buildReferenceItems(selectedProject, currentWorkCopy) : [];
  const referenceCoverage = Math.min(1, referenceItems.length / 6);
  const relatedTasks = activeTask ? projectTaskItems.filter((task) => task.id !== activeTask.id).slice(0, 4) : projectTaskItems.slice(0, 4);
  const lifecycleSteps = buildLifecycleSteps(activeTask, activeBlueprint, currentWorkCopy);
  const runtimeWarnings = activeGovernanceSnapshot?.warnings.length ?? 0;
  const governancePosture = getGovernancePosture(activeTask, runtimeWarnings, currentWorkCopy);
  const runtimeHealth = activeGovernanceSnapshot?.hostPressureStatus ?? 'unavailable';
  const participantItems = activeMembers.slice(0, 5);
  const executionTimeline = activeTimeline.slice(0, 5);
  const activeExecutionCount = activeGovernanceSnapshot?.activeExecutions ?? selectedSubtaskExecutions.length;
  const keyImpactAreas = [
    { label: currentWorkCopy.impactLabels.activeSubtasks, value: activeSubtasks.length },
    { label: currentWorkCopy.impactLabels.executions, value: selectedSubtaskExecutions.length },
    { label: currentWorkCopy.impactLabels.references, value: referenceItems.length },
    { label: currentWorkCopy.impactLabels.runtimeWarnings, value: runtimeWarnings },
  ];
  const runtimeSignalRows = [
    {
      label: currentWorkCopy.liveSessionsLabel,
      value: activeExecutionCount,
      fill: Math.min(1, activeExecutionCount / 4),
    },
    {
      label: currentWorkCopy.agentsActiveLabel,
      value: participantItems.length,
      fill: Math.min(1, participantItems.length / 5),
    },
    {
      label: currentWorkCopy.sloPostureLabel,
      value: runtimeWarnings === 0 ? currentWorkCopy.clearValue : runtimeWarnings,
      fill: runtimeWarnings === 0 ? 1 : Math.max(0.18, Math.min(1, runtimeWarnings / 5)),
    },
  ];

  if (detailLoading) {
    return (
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor current-work-mgo__loading">
        <p className="type-body-sm">{currentWorkCopy.loadingTitle}</p>
      </section>
    );
  }

  if (!selectedProject || !projectId) {
    return (
      <section className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{projectError ?? currentWorkCopy.unavailableTitle}</p>
      </section>
    );
  }

  return (
    <div className="current-work-mgo interior-page">
      <h2 className="sr-only">{currentWorkCopy.srTitle}</h2>
      <section className="current-work-mgo__command surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div className="current-work-mgo__command-cell">
          <span className="current-work-mgo__icon"><PanelRightOpen size={18} /></span>
          <div>
            <p className="page-kicker">{currentWorkCopy.commandProjectLabel}</p>
            <strong>{selectedProject.project.name}</strong>
          </div>
          <span className="status-pill status-pill--success">{selectedProject.overview.status}</span>
        </div>
        <div className="current-work-mgo__command-cell current-work-mgo__command-cell--wide">
          <div>
            <p className="page-kicker">{currentWorkCopy.workspaceLabel}</p>
            <strong>{currentWorkCopy.workspaceTitle}</strong>
          </div>
        </div>
        <div className="current-work-mgo__command-cell">
          <div>
            <p className="page-kicker">{currentWorkCopy.taskIdLabel}</p>
            <strong>{activeTask?.id ?? tasksPageCopy.stageFallback}</strong>
          </div>
        </div>
        <div className="current-work-mgo__command-cell">
          <div>
            <p className="page-kicker">{currentWorkCopy.stageLabel}</p>
            <strong>{activeTask?.current_stage ?? activeTask?.state ?? tasksPageCopy.stageFallback}</strong>
          </div>
        </div>
        <div className={`current-work-mgo__command-cell current-work-mgo__posture current-work-mgo__posture--${governancePosture.tone}`}>
          <div>
            <p className="page-kicker">{currentWorkCopy.governancePostureLabel}</p>
            <strong>{governancePosture.label}</strong>
          </div>
        </div>
      </section>

      <section className="current-work-mgo__tabs surface-panel surface-panel--workspace">
        {currentWorkCopy.tabs.map((label, index) => (
          <button
            key={label}
            type="button"
            className={index === 0 ? 'current-work-mgo__tab is-active' : 'current-work-mgo__tab'}
            aria-pressed={index === 0}
            onClick={() => scrollToWorkbenchSection(
              [
                'current-work-section-0',
                'current-work-section-1',
                'current-work-section-2',
                'current-work-section-3',
                'current-work-execution-console',
                'current-work-section-5',
                'current-work-section-6',
              ][index] ?? 'current-work-section-0',
            )}
          >
            {label}
            {label === currentWorkCopy.tabs[1] ? <b>{referenceItems.length}</b> : null}
            {label === currentWorkCopy.tabs[2] ? <b>{participantItems.length}</b> : null}
          </button>
        ))}
      </section>

      {taskError ? <div className="inline-alert inline-alert--danger">{taskError}</div> : null}

      <section className="current-work-mgo__layout">
        <aside className="current-work-mgo__left">
          <div id="current-work-section-1" className="surface-panel surface-panel--workspace current-work-mgo__panel current-work-mgo__reference">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{currentWorkCopy.referenceBundleLabel}</p>
                  <h3 className="section-title">{referenceItems[0]?.title ?? `${selectedProject.project.name} context`}</h3>
              </div>
              <span className={referenceItems.length > 0 ? 'status-pill status-pill--success' : 'status-pill status-pill--warning'}>
                {referenceItems.length > 0 ? currentWorkCopy.linkedLabel : currentWorkCopy.missingLabel}
              </span>
            </div>
            <div
              className="current-work-mgo__reference-meter"
              style={{ '--reference-meter-value': `${Math.round(referenceCoverage * 100)}%` } as CSSProperties}
            >
              <span />
            </div>
            <div className="current-work-mgo__reference-stats">
              <span>{referenceItems.length} {currentWorkCopy.itemsUnit}</span>
              <span>{selectedProject.work.knowledge.length} {currentWorkCopy.sourcesUnit}</span>
              <span>{selectedProject.work.recaps.length} {currentWorkCopy.recapsUnit}</span>
            </div>
            <div className="current-work-mgo__reference-list">
              {referenceItems.length === 0 ? (
                <p className="type-body-sm">{currentWorkCopy.noReferences}</p>
              ) : referenceItems.slice(0, 6).map((item) => (
                <div key={item.key} className="current-work-mgo__reference-row">
                  <Link2 size={14} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.kind} · {item.path}</small>
                  </span>
                </div>
              ))}
            </div>
            <Link className="text-action" to={`/projects/${projectId}/context`}>
              {currentWorkCopy.fullContextAction} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="surface-panel surface-panel--workspace current-work-mgo__panel">
            <div className="section-title-row">
              <h3 className="section-title">{currentWorkCopy.relatedWorkTitle}</h3>
              <span className="status-pill status-pill--neutral">{projectTaskItems.length}</span>
            </div>
            <div className="current-work-mgo__related-list">
              {projectTaskItems.length === 0 ? (
                <p className="type-body-sm">{currentWorkCopy.noProjectTasks}</p>
              ) : [activeTask, ...relatedTasks].filter((task): task is Task => Boolean(task)).slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  to={buildProjectTaskHref(task.id, projectId)}
                  className={task.id === activeTask?.id ? 'current-work-mgo__related-row is-active' : 'current-work-mgo__related-row'}
                  onClick={() => setActionActor('')}
                >
                  <Clock3 size={14} />
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.id} · {task.state}</small>
                  </span>
                  <b>{task.id === activeTask?.id ? currentWorkCopy.focusLabel : task.state}</b>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <main id="current-work-section-0" className="surface-panel surface-panel--workspace current-work-mgo__center">
          {activeTask ? (
            <>
              <div className="current-work-mgo__brief-head">
                <div>
                  <p className={`current-work-mgo__impact current-work-mgo__impact--${governancePosture.tone}`}>{governancePosture.label}</p>
                  <h1>{activeTask.title}</h1>
                  <p>{compactText(activeTask.description, 380) || tasksPageCopy.briefFallback}</p>
                </div>
                <button type="button" className="button-secondary" onClick={() => navigate(buildProjectTaskHref(activeTask.id, projectId))}>
                  {tasksPageCopy.detailAction}
                </button>
              </div>

              <div className="current-work-mgo__owners">
                <div>
                  <span>{currentWorkCopy.requestedByLabel}</span>
                  <strong>{activeTask.creator}</strong>
                  <small>{activeTask.teamLabel}</small>
                </div>
                <div>
                  <span>{currentWorkCopy.ownedByLabel}</span>
                  <strong>{activeTask.controllerRef ?? resolvedActionActor}</strong>
                  <small>{activeTask.workflowLabel}</small>
                </div>
                <div>
                  <span>{currentWorkCopy.reviewGateLabel}</span>
                  <strong>{activeGateType ?? currentWorkCopy.openGateLabel}</strong>
                  <small>{activeTask.isReviewStage ? currentWorkCopy.reviewStageLabel : activeTask.state}</small>
                </div>
                <div>
                  <span>{currentWorkCopy.updatedLabel}</span>
                  <strong>{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                  <small>{activeTask.current_stage ?? tasksPageCopy.stageFallback}</small>
                </div>
              </div>

              <section className="current-work-mgo__action-bar current-work-mgo__action-bar--primary">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => scrollToWorkbenchSection('current-work-execution-console')}
                >
                  {currentWorkCopy.consoleJumpAction}
                </button>
                {canRunApprovalActions ? (
                  <>
                    <button type="button" className="button-primary" onClick={() => void runAction('approve')}>
                      {tasksPageCopy.approveAction}
                    </button>
                    <button type="button" className="button-secondary" onClick={() => void runAction('reject')}>
                      {tasksPageCopy.rejectAction}
                    </button>
                  </>
                ) : null}
                {canRunGateActions && activeGateType === 'quorum' ? (
                  <>
                    <button type="button" className="button-primary" onClick={() => void runAction('confirm', { vote: 'approve' })}>
                      {tasksPageCopy.confirmApproveAction}
                    </button>
                    <button type="button" className="button-secondary" onClick={() => void runAction('confirm', { vote: 'reject' })}>
                      {tasksPageCopy.confirmRejectAction}
                    </button>
                  </>
                ) : null}
                {activeStatus?.task.sourceState === 'active' ? (
                  <>
                    <button type="button" className="button-primary" onClick={() => void runAction('advance')}>
                      {tasksPageCopy.advanceAction}
                    </button>
                    <button type="button" className="button-secondary" onClick={() => void runAction('pause')}>
                      {tasksPageCopy.pauseAction}
                    </button>
                    <button type="button" className="button-danger" onClick={() => void runAction('cancel')}>
                      {tasksPageCopy.cancelAction}
                    </button>
                  </>
                ) : null}
                {activeStatus?.task.sourceState === 'paused' ? (
                  <button type="button" className="button-primary" onClick={() => void runAction('resume')}>
                    {tasksPageCopy.resumeAction}
                  </button>
                ) : null}
                {activeStatus?.task.sourceState === 'blocked' ? (
                  <button type="button" className="button-primary" onClick={() => void runAction('unblock')}>
                    {tasksPageCopy.unblockAction}
                  </button>
                ) : null}
                {(activeStatus?.subtasks ?? []).some((subtask) => subtask.status !== 'done') ? (
                  (activeStatus?.subtasks ?? [])
                    .filter((subtask) => subtask.status !== 'done')
                    .map((subtask) => (
                      <button
                        key={subtask.id}
                        type="button"
                        className="button-secondary"
                        onClick={() =>
                          void runAction('subtask_done', {
                            subtaskId: subtask.id,
                            actorId: subtask.assignee,
                            note: actionNote || t('common.done'),
                          })
                        }
                      >
                        {t('common.markSubtaskDone', { id: subtask.id })}
                      </button>
                    ))
                ) : null}
              </section>

              <div className="current-work-mgo__lifecycle">
                {lifecycleSteps.map((step) => (
                  <span key={step.key} className={`current-work-mgo__step current-work-mgo__step--${step.status}`}>
                    <b>{step.status === 'done' ? '✓' : step.status === 'active' ? '•' : ''}</b>
                    {step.label}
                  </span>
                ))}
              </div>

              <section className="current-work-mgo__brief">
                <p className="page-kicker">{currentWorkCopy.briefLabel}</p>
                <p>
                  {activeTask.workflowLabel}
                  {' / '}
                  {activeTask.teamLabel}
                  {' / '}
                  {activeTask.current_stage ?? activeTask.state}
                </p>
              </section>

              <section className="current-work-mgo__rationale">
                <p className="page-kicker">{currentWorkCopy.runtimeRationaleLabel}</p>
                <p>
                  {activeTimeline[0]?.label || currentWorkCopy.runtimeRationaleEmpty}
                </p>
                <div
                  className="current-work-mgo__reference-meter"
                  style={{ '--reference-meter-value': `${Math.round(Math.min(1, activeTimeline.length / 5) * 100)}%` } as CSSProperties}
                >
                  <span />
                </div>
                <small>
                  {referenceItems.length} {currentWorkCopy.impactLabels.references} · {activeSubtasks.length} {currentWorkCopy.impactLabels.activeSubtasks} · {runtimeWarnings} {currentWorkCopy.impactLabels.runtimeWarnings}
                </small>
              </section>

              <section className="current-work-mgo__impact-grid">
                {keyImpactAreas.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </section>

              <section id="current-work-section-5" className="current-work-mgo__attachments">
                <p className="page-kicker">{currentWorkCopy.attachmentsLabel}</p>
                <div>
                  {referenceItems.slice(0, 4).map((item) => (
                    <span key={item.key}>
                      <Link2 size={14} />
                      {item.title}
                    </span>
                  ))}
                  {referenceItems.length === 0 ? <span>{currentWorkCopy.noAttachments}</span> : null}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <p className="type-heading-sm">{tasksPageCopy.emptyTitle}</p>
              <p className="type-body-sm mt-2">{tasksPageCopy.emptySummary}</p>
            </div>
          )}
        </main>

        <aside className="current-work-mgo__right">
          <section id="current-work-section-6" className="surface-panel surface-panel--workspace current-work-mgo__panel">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{currentWorkCopy.runtimeTruthLabel}</p>
                <h3 className="section-title">{currentWorkCopy.runtimeHealthTitle}</h3>
              </div>
              <span className={`status-pill ${runtimeHealth === 'healthy' ? 'status-pill--success' : 'status-pill--warning'}`}>{runtimeHealth}</span>
            </div>
            <div className="current-work-mgo__runtime-line">
              {runtimeSignalRows.map((item) => (
                <span
                  key={item.label}
                  style={{ '--runtime-signal-value': `${Math.round(item.fill * 100)}%` } as CSSProperties}
                >
                  <b>{item.value}</b>
                  <small>{item.label}</small>
                </span>
              ))}
            </div>
            <div className="current-work-mgo__runtime-metrics">
              <span><strong>{activeExecutionCount}</strong>{currentWorkCopy.liveSessionsLabel}</span>
              <span><strong>{participantItems.length}</strong>{currentWorkCopy.agentsActiveLabel}</span>
              <span><strong>{runtimeWarnings === 0 ? currentWorkCopy.clearValue : runtimeWarnings}</strong>{currentWorkCopy.sloPostureLabel}</span>
              <span><strong>{formatGovernanceMemoryValue(activeStatus, tasksPageCopy.stageFallback)}</strong>{currentWorkCopy.memoryLabel}</span>
            </div>
          </section>

          <section id="current-work-section-3" className="surface-panel surface-panel--workspace current-work-mgo__panel">
            <div className="section-title-row">
              <h3 className="section-title">{currentWorkCopy.executionTimelineTitle}</h3>
              <span className="status-pill status-pill--success">{currentWorkCopy.liveLabel}</span>
            </div>
            <div className="current-work-mgo__timeline">
              {executionTimeline.length === 0 ? (
                <p className="type-body-sm">{tasksPageCopy.timelineEmptyDetail}</p>
              ) : executionTimeline.map((entry) => (
                <div key={entry.key} className="current-work-mgo__timeline-row">
                  <time>{formatRelativeTimestamp(entry.timestamp)}</time>
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{compactText(entry.detail, 92) || tasksPageCopy.timelineEmptyDetail}</small>
                  </span>
                </div>
              ))}
            </div>
            {activeTask ? (
              <button
                type="button"
                className="text-action"
                onClick={() => navigate(buildProjectTaskHref(activeTask.id, projectId))}
              >
                {currentWorkCopy.fullTraceAction} <ArrowRight size={14} />
              </button>
            ) : null}
          </section>

          <section id="current-work-section-2" className="surface-panel surface-panel--workspace current-work-mgo__panel">
            <div className="section-title-row">
              <h3 className="section-title">{currentWorkCopy.currentParticipantsTitle}</h3>
              <span className="status-pill status-pill--neutral">{participantItems.length}</span>
            </div>
            <div className="current-work-mgo__participants">
              {participantItems.length === 0 ? (
                <p className="type-body-sm">{currentWorkCopy.noParticipants}</p>
              ) : participantItems.map((member) => (
                <div key={`${member.role}-${member.agentId}`} className="current-work-mgo__participant">
                  <span>{displayAgentId(member.agentId).slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{displayAgentId(member.agentId)}</strong>
                    <small>{member.role}</small>
                  </div>
                  <b>{member.runtime_flavor ?? member.runtime_target_ref ?? currentWorkCopy.activeValue}</b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section id="current-work-execution-console" className="surface-panel surface-panel--workspace current-work-mgo__execution-console">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{currentWorkCopy.executionConsoleLabel}</p>
            <h3 className="section-title">{tasksPageCopy.executionTitle}</h3>
          </div>
          <button type="button" className="button-secondary" onClick={() => void runObserve()}>
            {tasksPageCopy.executionObserveAction}
          </button>
        </div>

        {activeTask ? (
          <>
            <TaskBlueprintSection
              blueprint={activeBlueprint}
              copy={tasksPageCopy}
              currentStageId={activeStatus?.task.current_stage ?? null}
            />

            {!activeStatus && taskDetailLoading ? (
              <p className="type-body-sm mt-4">{currentWorkCopy.taskStatusLoading}</p>
            ) : activeSubtasks.length > 0 ? (
              <div className="task-runtime-grid">
                <div className="task-runtime-grid__column">
                  <div className="task-runtime-panel">
                    <p className="field-label">{tasksPageCopy.executionTitle}</p>
                    <div className="dense-list mt-3">
                      {activeSubtasks.map(renderSubtaskCard)}
                    </div>
                  </div>
                  <div className="task-runtime-panel">
                    <p className="field-label">{tasksPageCopy.executionListLabel}</p>
                    {selectedSubtaskExecutions.length > 0 ? (
                      <div className="space-y-2 mt-3">
                        {selectedSubtaskExecutions.map(renderExecutionStatus)}
                      </div>
                    ) : (
                      <p className="type-body-sm mt-3">{tasksPageCopy.executionEmpty}</p>
                    )}
                  </div>
                </div>

                <div className="task-runtime-grid__column">
                  {selectedSubtask ? (
                    <div className="task-runtime-panel task-runtime-panel--hero">
                      <span className="type-mono-sm">{selectedSubtask.id}</span>
                      <h4 className="type-heading-md mt-3">{selectedSubtask.title}</h4>
                      <p className="type-body-sm mt-3">
                        {displayAgentId(selectedSubtask.assignee)}
                        {' / '}
                        {selectedSubtask.stage_id}
                        {' / '}
                        {selectedSubtask.status}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className="button-secondary" onClick={() => void runRuntimeDiagnosis(selectedSubtask.assignee)}>
                          {tasksPageCopy.runtimeDiagnosisAction}
                        </button>
                        <button type="button" className="button-secondary" onClick={() => void runRuntimeRestart(selectedSubtask.assignee)}>
                          {tasksPageCopy.runtimeRestartAction}
                        </button>
                        {!TERMINAL_SUBTASK_STATES.has(selectedSubtask.status) ? (
                          <>
                            <button type="button" className="button-secondary" onClick={() => void runSubtaskLifecycle('close', selectedSubtask)}>
                              {tasksPageCopy.subtaskCloseAction}
                            </button>
                            <button type="button" className="button-secondary" onClick={() => void runSubtaskLifecycle('archive', selectedSubtask)}>
                              {tasksPageCopy.subtaskArchiveAction}
                            </button>
                            <button type="button" className="button-danger" onClick={() => void runSubtaskLifecycle('cancel', selectedSubtask)}>
                              {tasksPageCopy.subtaskCancelAction}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedExecution ? (
                    <>
                      <div className="task-runtime-panel task-runtime-panel--hero">
                        <span className="type-mono-sm">{selectedExecution.executionId}</span>
                        <h4 className="type-heading-md mt-3">{selectedExecution.adapter}</h4>
                        <p className="type-body-sm mt-3">
                          {selectedExecution.status}
                          {selectedExecution.sessionId ? ` / ${selectedExecution.sessionId}` : ''}
                          {selectedExecution.workdir ? ` / ${selectedExecution.workdir}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-4">
                          <button type="button" className="button-secondary" onClick={() => void runProbe(selectedExecution.executionId)}>
                            {tasksPageCopy.executionProbeAction}
                          </button>
                          <button type="button" className="button-secondary" onClick={() => void runExecutionTailRefresh(selectedExecution.executionId)}>
                            {executionTailById[selectedExecution.executionId] ? tasksPageCopy.executionTailRefreshAction : tasksPageCopy.executionTailAction}
                          </button>
                          <button type="button" className="button-danger" onClick={() => void runExecutionStop(selectedExecution.executionId)}>
                            {tasksPageCopy.executionStopAction}
                          </button>
                        </div>
                      </div>

                      <div className="task-runtime-panel">
                        <div className="flex items-center justify-between gap-3">
                          <p className="field-label">{tasksPageCopy.executionTailLabel}</p>
                          <div className="flex items-center gap-2">
                            {selectedExecutionTailMode ? <span className="status-pill status-pill--neutral">{selectedExecutionTailMode}</span> : null}
                            {selectedExecutionTailLoading ? <span className="type-text-xs">{tasksPageCopy.executionTailPollingLabel}...</span> : null}
                          </div>
                        </div>
                        {selectedExecutionTail?.fetchedAt ? (
                          <p className="type-text-xs mt-2">
                            {tasksPageCopy.executionTailUpdatedLabel}: {formatRelativeTimestamp(selectedExecutionTail.fetchedAt)}
                          </p>
                        ) : null}
                        <div className="task-tail-card mt-3">
                          <RuntimeLogViewer
                            output={
                              selectedExecutionTail
                                ? (
                                    selectedExecutionTail.available
                                      ? (selectedExecutionTail.output ?? tasksPageCopy.executionTailEmpty)
                                      : tasksPageCopy.executionTailUnavailable
                                  )
                                : tasksPageCopy.executionTailEmpty
                            }
                            loading={selectedExecutionTailLoading}
                          />
                        </div>
                      </div>

                      {selectedExecution.callbackPayload?.inputRequest?.hint ? (
                        <div className="task-runtime-panel">
                          <p className="type-body-sm">{selectedExecution.callbackPayload.inputRequest.hint}</p>
                        </div>
                      ) : null}

                      {selectedExecution.callbackPayload?.inputRequest?.transport === 'text' ? (
                        <div className="task-runtime-panel">
                          <label className="field-label" htmlFor="project-execution-input-text">
                            {tasksPageCopy.executionTextLabel}
                          </label>
                          <textarea
                            id="project-execution-input-text"
                            value={executionInputText}
                            onChange={(event) => setExecutionInputText(event.target.value)}
                            className="textarea-shell mt-3"
                            placeholder={selectedExecution.callbackPayload.inputRequest.textPlaceholder ?? tasksPageCopy.executionTextPlaceholder}
                          />
                          <button type="button" className="button-primary mt-3" onClick={() => void runExecutionTextInput(selectedExecution.executionId)}>
                            {tasksPageCopy.executionTextAction}
                          </button>
                        </div>
                      ) : null}

                      {selectedExecution.callbackPayload?.inputRequest?.transport === 'choice' &&
                      selectedExecution.callbackPayload.inputRequest.choiceOptions.length > 0 ? (
                        <div className="task-runtime-panel">
                          <p className="field-label">{tasksPageCopy.executionChoiceLabel}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {selectedExecution.callbackPayload.inputRequest.choiceOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className="button-secondary"
                                onClick={() => void runExecutionKeysInput(selectedExecution.executionId, option.keys, true)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {selectedExecution.callbackPayload?.inputRequest?.transport === 'keys' &&
                      selectedExecution.callbackPayload.inputRequest.keys.length > 0 ? (
                        <div className="task-runtime-panel">
                          <p className="field-label">{tasksPageCopy.executionKeysLabel}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {selectedExecution.callbackPayload.inputRequest.keys.map((key) => (
                              <button
                                key={key}
                                type="button"
                                className="button-secondary"
                                onClick={() => void runExecutionKeysInput(selectedExecution.executionId, [key])}
                              >
                                {key}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="type-body-sm mt-4">{tasksPageCopy.executionEmpty}</p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
