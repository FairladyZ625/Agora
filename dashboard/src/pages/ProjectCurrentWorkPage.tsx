import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Link2, PanelRightOpen, Workflow } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { RuntimeLogViewer } from '@/components/ui/RuntimeLogViewer';
import { WorkflowGraphView } from '@/components/features/WorkflowGraphView';
import { useTasksPageCopy } from '@/lib/dashboardCopy';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { normalizeCraftsmanId } from '@/lib/orchestrationRoles';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useTaskStore } from '@/stores/taskStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type {
  CraftsmanExecution,
  Subtask,
  Task,
  TaskAction,
  TaskBlueprint,
  TaskConversationEntry,
  TaskStatus,
} from '@/types/task';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);

type TimelineItem = {
  key: string;
  label: string;
  detail: string;
  timestamp: string;
};

function mapStatusEventTimelineItem(entry: TaskConversationEntry): TimelineItem | null {
  if (!entry.statusEvent) {
    return null;
  }
  const detailParts = [
    entry.statusEvent.taskState,
    entry.statusEvent.currentStage ? `stage ${entry.statusEvent.currentStage}` : null,
    entry.statusEvent.executionKind ? `execution: ${entry.statusEvent.executionKind}` : null,
    entry.statusEvent.controllerRef ? `controller ${entry.statusEvent.controllerRef}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    key: `status-${entry.id}`,
    label: entry.statusEvent.eventType,
    detail: [...detailParts, entry.body].filter((value): value is string => Boolean(value)).join(' / '),
    timestamp: entry.occurred_at,
  };
}

function buildTaskTimeline(status: TaskStatus | null | undefined): TimelineItem[] {
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
    .map(mapStatusEventTimelineItem)
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

function createFallbackTask(
  summary: { id: string; title: string; state: string; projectId: string | null },
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
    teamLabel: 'Project workspace',
    workflowLabel: 'project-workflow',
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
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');

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
    return (selectedProject?.work.tasks ?? []).map((summary) => taskLookup.get(summary.id) ?? createFallbackTask(summary));
  }, [selectedProject?.work.tasks, tasks]);

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
  const activeTimeline = useMemo(() => buildTaskTimeline(activeStatus), [activeStatus]);
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

  const activeMembers = activeStatus?.task.teamMembers ?? activeTask?.teamMembers ?? [];
  const activeGateType = activeStatus?.task.gateType ?? activeTask?.gateType ?? null;
  const canRunGateActions = activeTask?.sourceState === 'active';
  const canRunApprovalActions = canRunGateActions
    && activeGateType === 'approval'
    && (
      activeTask?.authority?.approverAccountId == null
      || (sessionAccountId != null && activeTask.authority.approverAccountId === sessionAccountId)
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
      await runTaskAction(action, {
        taskId: activeTask.id,
        actorId: overrides.actorId ?? resolvedActionActor,
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

  if (detailLoading) {
    return (
      <section className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">Loading current work…</p>
      </section>
    );
  }

  if (!selectedProject || !projectId) {
    return (
      <section className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{projectError ?? 'Current work is unavailable.'}</p>
      </section>
    );
  }

  return (
    <div className="workspace-page workspace-page--locked">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">PROJECT WORKSPACE</p>
            <h2 className="page-title">Current Work</h2>
            <p className="page-summary">{selectedProject.project.name}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.currentMatches}</span>
              <span className="inline-stat__value">{projectTaskItems.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.awaitingReview}</span>
              <span className="inline-stat__value">{projectTaskItems.filter((task) => task.state === 'gate_waiting').length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.currentFocus}</span>
              <span className="inline-stat__value">{activeTask?.current_stage ?? tasksPageCopy.stageFallback}</span>
            </div>
          </div>
        </div>

        {taskError ? (
          <div className="inline-alert inline-alert--danger">{taskError}</div>
        ) : null}
      </section>

      <div className={isMobile ? 'workbench-grid workbench-grid--page' : 'workbench-grid workbench-grid--tasks'}>
        <section className="workbench-pane task-pane task-pane--queue">
          <div className="task-pane__header">
            <div>
              <p className="page-kicker">PROJECT TASKS</p>
              <h3 className="section-title">{tasksPageCopy.listTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">
              {projectTaskItems.length}
              {tasksPageCopy.listCountUnit}
            </span>
          </div>

          <div className="workbench-scroll workbench-scroll--list task-pane__scroll">
            <div className="dense-list">
              {projectTaskItems.length === 0 ? (
                <div className="empty-state">
                  <p className="type-heading-sm">No project tasks yet.</p>
                  <p className="type-body-sm mt-2">Create or attach work to this project, then the execution surface will appear here.</p>
                </div>
              ) : (
                projectTaskItems.map((task) => (
                  <Link
                    key={task.id}
                    to={buildProjectTaskHref(task.id, projectId)}
                    className={task.id === activeTask?.id ? 'dense-row task-queue-row dense-row--active' : 'dense-row task-queue-row'}
                    onClick={() => setActionActor('')}
                  >
                    <div className="dense-row__main task-queue-row__main">
                      <div className="dense-row__titleblock">
                        <span className="type-mono-xs task-queue-row__id">{task.id}</span>
                        <strong className="dense-row__title task-queue-row__title">{task.title}</strong>
                      </div>
                      <div className="dense-row__meta task-queue-row__meta">
                        <StateBadge state={task.state} />
                        <PriorityBadge priority={task.priority} />
                        <span>{task.teamLabel}</span>
                        <span>{task.workflowLabel}</span>
                      </div>
                    </div>
                    <span className="dense-row__time task-queue-row__time">{formatRelativeTimestamp(task.updated_at)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="workbench-pane task-pane task-pane--flow">
              {activeTask ? (
                <div className="task-flow__stack">
                  <div className="task-pane__header task-pane__header--flow">
                    <div>
                      <p className="page-kicker">{tasksPageCopy.detailKicker}</p>
                      <h3 className="section-title">{tasksPageCopy.quickViewTitle}</h3>
                    </div>
                    <div className="task-flow__header-badges">
                      <StateBadge state={activeTask.state} />
                      <PriorityBadge priority={activeTask.priority} />
                    </div>
                  </div>

                  <div className="task-hero-card">
                    <span className="type-mono-sm task-hero-card__id">{activeTask.id}</span>
                    <h4 className="type-heading-md task-hero-card__title">{activeTask.title}</h4>
                    <p className="type-body-sm task-hero-card__summary">
                      {activeTask.description ?? tasksPageCopy.briefFallback}
                    </p>
                    <div className="task-hero-card__footer">
                      <div className="task-hero-card__metric">
                        <span className="field-label">{tasksPageCopy.stageLabel}</span>
                        <strong>{activeTask.current_stage ?? tasksPageCopy.stageFallback}</strong>
                      </div>
                      <div className="task-hero-card__metric">
                        <span className="field-label">{tasksPageCopy.workflowLabel}</span>
                        <strong>{activeTask.workflowLabel}</strong>
                      </div>
                      <div className="task-hero-card__metric">
                        <span className="field-label">{tasksPageCopy.updatedLabel}</span>
                        <strong>{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="task-authority__section task-flow__section">
                    <div className="task-flow__facts">
                      <div className="detail-card">
                        <Workflow size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.stageLabel}</span>
                        <strong className="detail-card__value">{activeTask.current_stage ?? tasksPageCopy.stageFallback}</strong>
                      </div>
                      <div className="detail-card">
                        <Link2 size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.workflowLabel}</span>
                        <strong className="detail-card__value">{activeTask.workflowLabel}</strong>
                      </div>
                      <div className="detail-card">
                        <PanelRightOpen size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.teamLabel}</span>
                        <strong className="detail-card__value">{activeTask.teamLabel}</strong>
                      </div>
                      <div className="detail-card">
                        <PanelRightOpen size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.controllerLabel}</span>
                        <strong className="detail-card__value">{activeTask.controllerRef ?? tasksPageCopy.stageFallback}</strong>
                      </div>
                    </div>
                  </div>

                  <TaskBlueprintSection
                    blueprint={activeBlueprint}
                    copy={tasksPageCopy}
                    currentStageId={activeStatus?.task.current_stage ?? null}
                  />

                  <div className="task-authority__section task-flow__section">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="section-title">执行控制面</h4>
                      <button type="button" className="button-secondary" onClick={() => void runObserve()}>
                        {tasksPageCopy.executionObserveAction}
                      </button>
                    </div>

                    {!activeStatus && taskDetailLoading ? (
                      <p className="type-body-sm mt-4">Loading live task status…</p>
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
                                    {selectedExecutionTailLoading ? <span className="type-text-xs">{tasksPageCopy.executionTailPollingLabel}…</span> : null}
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
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p className="type-heading-sm">{tasksPageCopy.emptyTitle}</p>
                  <p className="type-body-sm mt-2">{tasksPageCopy.emptySummary}</p>
                </div>
              )}
        </section>

        <aside className="workbench-pane workbench-pane--inspector task-pane task-pane--ops">
              {activeTask ? (
                <div className="task-ops__stack">
                  <div className="task-authority__section task-ops__section">
                    <h4 className="section-title">{tasksPageCopy.governanceTitle}</h4>
                    <div className="task-authority__facts mt-4">
                      <div className="detail-card">
                        <PanelRightOpen size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.governanceActiveLabel}</span>
                        <strong className="detail-card__value">{activeGovernanceSnapshot?.activeExecutions ?? 0}</strong>
                      </div>
                      <div className="detail-card">
                        <PanelRightOpen size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.governancePerAgentLabel}</span>
                        <strong className="detail-card__value">
                          {activeGovernanceSnapshot?.limits.maxConcurrentPerAgent ?? tasksPageCopy.stageFallback}
                        </strong>
                      </div>
                      <div className="detail-card">
                        <Clock3 size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.governanceMemoryLabel}</span>
                        <strong className="detail-card__value">
                          {formatGovernanceMemoryValue(activeStatus, tasksPageCopy.stageFallback)}
                        </strong>
                      </div>
                      <div className="detail-card">
                        <Clock3 size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{tasksPageCopy.governanceLoadLabel}</span>
                        <strong className="detail-card__value">
                          {activeGovernanceSnapshot?.host?.load1m != null
                            ? activeGovernanceSnapshot.host.load1m.toFixed(2)
                            : tasksPageCopy.stageFallback}
                        </strong>
                      </div>
                    </div>

                    {activeGovernanceSnapshot?.activeByAssignee.length ? (
                      <div className="space-y-2 mt-4">
                        <p className="field-label">{tasksPageCopy.governanceAssigneeLabel}</p>
                        <div className="space-y-2">
                          {activeGovernanceSnapshot.activeByAssignee.map((item) => (
                            <div key={item.assignee} className="data-row">
                              <span className="type-mono-xs">{displayAgentId(item.assignee)}</span>
                              <span className="status-pill status-pill--neutral">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(activeGovernanceSnapshot?.warnings ?? []).length ? (
                      <div className="space-y-2 mt-4">
                        <p className="field-label">{tasksPageCopy.governanceWarningsLabel}</p>
                        <div className="space-y-2">
                          {(activeGovernanceSnapshot?.warnings ?? []).map((warning) => (
                            <div key={warning} className="data-row">
                              <span className="type-body-sm">{warning}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(activeGovernanceSnapshot?.activeExecutionDetails ?? []).length ? (
                      <div className="space-y-2 mt-4">
                        <p className="field-label">{tasksPageCopy.governanceExecutionDetailsLabel}</p>
                        <div className="space-y-2">
                          {(activeGovernanceSnapshot?.activeExecutionDetails ?? []).map((detail) => (
                            <div key={detail.executionId} className="data-row">
                              <div className="min-w-0 flex-1">
                                <p className="type-mono-xs">{detail.executionId}</p>
                                <p className="type-text-xs mt-1">
                                  {displayAgentId(detail.assignee)}
                                  {' / '}
                                  {detail.adapter}
                                  {' / '}
                                  {detail.status}
                                </p>
                              </div>
                              <span className="status-pill status-pill--neutral">{detail.subtaskId}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="task-authority__section task-ops__section">
                    <h4 className="section-title">{tasksPageCopy.actionsTitle}</h4>
                    <div>
                      <span className="field-label">{tasksPageCopy.actorLabel}</span>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeMembers.map((member) => (
                          <button
                            key={`${member.role}-${member.agentId}`}
                            type="button"
                            onClick={() => setActionActor(member.agentId)}
                            className={resolvedActionActor === member.agentId ? 'choice-pill choice-pill--active' : 'choice-pill'}
                          >
                            {displayAgentId(member.agentId)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="field-label" htmlFor="project-task-action-note">
                        {tasksPageCopy.noteLabel}
                      </label>
                      <textarea
                        id="project-task-action-note"
                        value={actionNote}
                        onChange={(event) => setActionNote(event.target.value)}
                        className="textarea-shell"
                        placeholder={tasksPageCopy.notePlaceholder}
                      />
                    </div>

                    <div className="task-authority__actions">
                      {selectedSubtask ? (
                        <>
                          <button type="button" className="button-secondary" onClick={() => void runRuntimeDiagnosis(selectedSubtask.assignee)}>
                            {tasksPageCopy.runtimeDiagnosisAction}
                          </button>
                          <button type="button" className="button-secondary" onClick={() => void runRuntimeRestart(selectedSubtask.assignee)}>
                            {tasksPageCopy.runtimeRestartAction}
                          </button>
                        </>
                      ) : null}

                      {canRunApprovalActions ? (
                        <>
                          <button type="button" className="button-primary" onClick={() => void runAction('approve')}>
                            {tasksPageCopy.approveAction}
                          </button>
                          <button type="button" className="button-danger" onClick={() => void runAction('reject')}>
                            {tasksPageCopy.rejectAction}
                          </button>
                        </>
                      ) : null}

                      {canRunGateActions && activeGateType === 'quorum' ? (
                        <>
                          <button type="button" className="button-primary" onClick={() => void runAction('confirm', { vote: 'approve' })}>
                            {tasksPageCopy.confirmApproveAction}
                          </button>
                          <button type="button" className="button-danger" onClick={() => void runAction('confirm', { vote: 'reject' })}>
                            {tasksPageCopy.confirmRejectAction}
                          </button>
                        </>
                      ) : null}

                      {activeTask.sourceState === 'active' ? (
                        <>
                          <button type="button" className="button-secondary" onClick={() => void runAction('advance')}>
                            {tasksPageCopy.advanceAction}
                          </button>
                          <button type="button" className="button-secondary" onClick={() => void runAction('pause')}>
                            {tasksPageCopy.pauseAction}
                          </button>
                          <button type="button" className="button-danger" onClick={() => void runAction('cancel')}>
                            {tasksPageCopy.cancelAction}
                          </button>
                          <button type="button" className="button-secondary" onClick={() => void runAction('force_advance')}>
                            {tasksPageCopy.forceAdvanceAction}
                          </button>
                        </>
                      ) : null}

                      {activeTask.sourceState === 'paused' ? (
                        <button type="button" className="button-primary" onClick={() => void runAction('resume')}>
                          {tasksPageCopy.resumeAction}
                        </button>
                      ) : null}

                      {activeTask.sourceState === 'blocked' ? (
                        <button type="button" className="button-primary" onClick={() => void runAction('unblock')}>
                          {tasksPageCopy.unblockAction}
                        </button>
                      ) : null}
                    </div>

                    {(activeStatus?.subtasks ?? []).some((subtask) => subtask.status !== 'done') ? (
                      <div className="flex flex-wrap gap-2">
                        {(activeStatus?.subtasks ?? [])
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
                          ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="task-authority__section task-authority__section--meta task-ops__section">
                    <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
                    <div className="mt-4 space-y-3">
                      {activeTimeline.length > 0 ? activeTimeline.slice(0, 4).map((entry) => (
                        <div key={entry.key} className="timeline-item">
                          <div className="timeline-item__rail" />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="type-label-sm">{entry.label}</span>
                              <span className="type-text-xs">{formatRelativeTimestamp(entry.timestamp)}</span>
                            </div>
                            <p className="type-body-sm mt-2">
                              {entry.detail || tasksPageCopy.timelineEmptyDetail}
                            </p>
                          </div>
                        </div>
                      )) : (
                        <p className="type-body-sm">{tasksPageCopy.timelineEmptyDetail}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className="button-primary w-full justify-center"
                      onClick={() => navigate(buildProjectTaskHref(activeTask.id, projectId))}
                    >
                      <ArrowRight size={16} />
                      {tasksPageCopy.detailAction}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p className="type-heading-sm">{tasksPageCopy.emptyTitle}</p>
                  <p className="type-body-sm mt-2">{tasksPageCopy.emptySummary}</p>
                </div>
              )}
        </aside>
      </div>
    </div>
  );
}
