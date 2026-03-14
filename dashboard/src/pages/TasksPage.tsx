import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Filter, Link2, PanelRightOpen, Search, Workflow } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTasksPageCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { WorkbenchFilterPopover } from '@/components/ui/WorkbenchFilterPopover';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { StaggeredItem } from '@/components/ui/StaggeredItem';
import { toggleValue } from '@/lib/utils';
import { getPriorityMeta, getStateMeta } from '@/lib/taskMeta';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { CraftsmanExecution, Subtask, TaskAction, TaskBlueprint, TaskConversationEntry, TaskStatus } from '@/types/task';

const TASK_STATE_VALUES = ['in_progress', 'gate_waiting', 'completed', 'pending', 'paused', 'blocked', 'cancelled'] as const;
const TASK_PRIORITY_VALUES = ['high', 'normal', 'low'] as const;
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
    entry.statusEvent.executionKind ? `execution ${entry.statusEvent.executionKind}` : null,
    entry.statusEvent.controllerRef ? `controller ${entry.statusEvent.controllerRef}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    key: `status-${entry.id}`,
    label: entry.statusEvent.eventType,
    detail: detailParts.join(' / ') || entry.body,
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

function TaskBlueprintSection({
  blueprint,
  copy,
}: {
  blueprint: TaskBlueprint | undefined;
  copy: ReturnType<typeof useTasksPageCopy>;
}) {
  return (
    <section className="task-authority__section">
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
          <div>
            <p className="field-label">{copy.blueprintEntryLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {blueprint.entryNodes.map((nodeId) => (
                <span key={nodeId} className="choice-pill choice-pill--active">
                  {nodeId}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label">{copy.blueprintNodesLabel}</p>
            <div className="mt-2 space-y-2">
              {blueprint.nodes.map((node) => (
                <div key={node.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <p className="type-heading-xs">{node.name ?? node.id}</p>
                    <p className="type-text-xs mt-1">
                      {node.id}
                      {' / '}
                      {node.mode ?? 'stage'}
                    </p>
                  </div>
                  {node.gateType ? <span className="status-pill status-pill--neutral">{node.gateType}</span> : null}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label">{copy.blueprintEdgesLabel}</p>
            <div className="mt-2 space-y-2">
              {blueprint.edges.map((edge, index) => (
                <div key={`${edge.from}-${edge.to}-${edge.kind}-${index}`} className="data-row">
                  <span className="type-mono-xs">{`${edge.from} -> ${edge.to}`}</span>
                  <span className={edge.kind === 'reject' ? 'status-pill status-pill--warning' : 'status-pill status-pill--info'}>
                    {edge.kind}
                  </span>
                </div>
              ))}
            </div>
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

export function TasksPage() {
  const { t } = useTranslation();
  const tasksPageCopy = useTasksPageCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const selectedTaskStatus = useTaskStore((state) => state.selectedTaskStatus);
  const detailLoading = useTaskStore((state) => state.detailLoading);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
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
  const stopCraftsmanExecution = useTaskStore((state) => state.stopCraftsmanExecution);
  const submitCraftsmanChoice = useTaskStore((state) => state.submitCraftsmanChoice);
  const closeSubtask = useTaskStore((state) => state.closeSubtask);
  const archiveSubtask = useTaskStore((state) => state.archiveSubtask);
  const cancelSubtask = useTaskStore((state) => state.cancelSubtask);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<string[]>([]);
  const [actionActor, setActionActor] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executionInputText, setExecutionInputText] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!selectedExecutionId) {
      return;
    }
    if (executionTailById[selectedExecutionId] || executionTailLoadingById[selectedExecutionId]) {
      return;
    }
    void fetchCraftsmanExecutionTail(selectedExecutionId);
  }, [selectedExecutionId, executionTailById, executionTailLoadingById, fetchCraftsmanExecutionTail]);

  const taskList = tasks;
  const availableTeams = useMemo(() => [...new Set(taskList.map((task) => task.teamLabel))], [taskList]);
  const availableWorkflows = useMemo(() => [...new Set(taskList.map((task) => task.workflowLabel))], [taskList]);

  const filteredTasks = useMemo(() => {
    const lowered = deferredQuery.trim().toLowerCase();
    return taskList.filter((task) => {
      const matchesQuery =
        lowered.length === 0 ||
        task.id.toLowerCase().includes(lowered) ||
        task.title.toLowerCase().includes(lowered) ||
        task.creator.toLowerCase().includes(lowered);
      const matchesState = stateFilter.length === 0 || stateFilter.includes(task.state);
      const matchesPriority = priorityFilter.length === 0 || priorityFilter.includes(task.priority);
      const matchesTeam = teamFilter.length === 0 || teamFilter.includes(task.teamLabel);
      const matchesWorkflow = workflowFilter.length === 0 || workflowFilter.includes(task.workflowLabel);
      return matchesQuery && matchesState && matchesPriority && matchesTeam && matchesWorkflow;
    });
  }, [deferredQuery, priorityFilter, stateFilter, taskList, teamFilter, workflowFilter]);

  useEffect(() => {
    if (taskId) {
      void selectTask(taskId);
      return;
    }
    if (filteredTasks.length === 0) {
      void selectTask(null);
      return;
    }
    if (selectedTaskId && filteredTasks.some((task) => task.id === selectedTaskId)) {
      return;
    }
    void selectTask(filteredTasks[0].id);
  }, [filteredTasks, selectedTaskId, selectTask, taskId]);

  const activeTask =
    filteredTasks.find((task) => task.id === (taskId ?? selectedTaskId)) ??
    ((taskId || selectedTaskId) && selectedTaskStatus?.task.id === (taskId ?? selectedTaskId)
      ? selectedTaskStatus.task
      : null) ??
    filteredTasks[0] ??
    null;

  const activeStatus =
    activeTask && selectedTaskStatus?.task.id === activeTask.id
      ? selectedTaskStatus
      : null;
  const routeTaskStatus =
    taskId && selectedTaskStatus?.task.id === taskId
      ? selectedTaskStatus
      : null;
  const routeTask =
    routeTaskStatus?.task ??
    (taskId ? filteredTasks.find((task) => task.id === taskId) ?? null : null);
  const routeTimeline = useMemo(() => buildTaskTimeline(routeTaskStatus), [routeTaskStatus]);
  const shouldShowDetailLoading = Boolean(taskId && detailLoading && !routeTaskStatus);
  const shouldShowDetailError = Boolean(taskId && !detailLoading && !routeTaskStatus && !routeTask && error);
  const shouldShowDetailEmpty = Boolean(taskId && !detailLoading && !routeTaskStatus && !routeTask && !error);

  const activeFilterCount = stateFilter.length + priorityFilter.length + teamFilter.length + workflowFilter.length;
  const activeMembers = activeStatus?.task.teamMembers ?? activeTask?.teamMembers ?? [];
  const activeGateType = activeStatus?.task.gateType ?? activeTask?.gateType ?? null;
  const activeBlueprint = activeStatus?.taskBlueprint;
  const activeTimeline = useMemo(() => buildTaskTimeline(activeStatus), [activeStatus]);
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
  const preferredActorId =
    !activeTask
      ? ''
      : (activeGateType === 'approval'
          ? activeMembers.find((member) => member.role === 'reviewer')?.agentId
          : activeMembers.find((member) => member.role === 'architect')?.agentId) ??
        activeMembers[0]?.agentId ??
        activeTask.creator;
  const resolvedActionActor = actionActor || preferredActorId;

  const taskSections = useMemo(() => [
    {
      label: tasksPageCopy.filterSectionLabels.state,
      options: TASK_STATE_VALUES.map((value) => ({
        value,
        label: getStateMeta(value).label,
        count: taskList.filter((task) => task.state === value).length,
      })),
      selected: stateFilter,
      onToggle: (value: string) => setStateFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.priority,
      options: TASK_PRIORITY_VALUES.map((value) => ({
        value,
        label: getPriorityMeta(value).label,
        count: taskList.filter((task) => task.priority === value).length,
      })),
      selected: priorityFilter,
      onToggle: (value: string) => setPriorityFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.team,
      options: availableTeams.map((item) => ({
        value: item,
        label: item,
        count: taskList.filter((task) => task.teamLabel === item).length,
      })),
      selected: teamFilter,
      onToggle: (value: string) => setTeamFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.workflow,
      options: availableWorkflows.map((item) => ({
        value: item,
        label: item,
        count: taskList.filter((task) => task.workflowLabel === item).length,
      })),
      selected: workflowFilter,
      onToggle: (value: string) => setWorkflowFilter((current) => toggleValue(current, value)),
    },
  ], [taskList, stateFilter, priorityFilter, teamFilter, workflowFilter, availableTeams, availableWorkflows, tasksPageCopy]);

  const clearFilters = () => {
    setStateFilter([]);
    setPriorityFilter([]);
    setTeamFilter([]);
    setWorkflowFilter([]);
  };

  const runAction = async (
    action: TaskAction,
    overrides: { actorId?: string; note?: string; subtaskId?: string; vote?: 'approve' | 'reject' } = {},
  ) => {
    if (!activeTask) return;
    const actorId = overrides.actorId ?? resolvedActionActor;
    const note = overrides.note ?? actionNote;
    try {
      await runTaskAction(action, {
        taskId: activeTask.id,
        actorId,
        note,
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
      showMessage(
        t('feedback.syncSuccessTitle'),
        tasksPageCopy.executionObserveSuccess,
        'success',
      );
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

  const runSubtaskLifecycle = async (
    action: 'close' | 'archive' | 'cancel',
    subtask: Subtask,
  ) => {
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
            <span>{subtask.assignee}</span>
            <span>{subtask.stage_id}</span>
            <span>{executionCount} {tasksPageCopy.executionCountUnit}</span>
          </div>
        </div>
        <span className="dense-row__time">{subtask.status}</span>
      </button>
    );
  }

  return (
    <div className="workspace-page workspace-page--locked">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div className="space-y-3">
            <p className="page-kicker">{tasksPageCopy.kicker}</p>
            <h2 className="page-title">{tasksPageCopy.title}</h2>
            <p className="page-summary">{tasksPageCopy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.currentMatches}</span>
              <span className="inline-stat__value">{filteredTasks.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.awaitingReview}</span>
              <span className="inline-stat__value">{filteredTasks.filter((task) => task.state === 'gate_waiting').length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{tasksPageCopy.stats.currentFocus}</span>
              <span className="inline-stat__value">{activeTask?.current_stage ?? tasksPageCopy.stageFallback}</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="inline-alert inline-alert--danger">{error}</div>
        ) : null}
      </section>

      <div className="workbench-grid workbench-grid--page">
        <section className="workbench-pane task-pane task-pane--queue">
          <div className="task-pane__header">
            <div>
              <p className="page-kicker">{tasksPageCopy.listKicker}</p>
              <h3 className="section-title">{tasksPageCopy.listTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">
              {filteredTasks.length}
              {tasksPageCopy.listCountUnit}
            </span>
          </div>

          <div className="task-pane__filters">
            <div className="workbench-toolbar__filter-anchor">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setFilterOpen((current) => !current)}
              >
                <Filter size={14} />
                {tasksPageCopy.filterAction}
                {activeFilterCount > 0 ? (
                  <span className="status-pill status-pill--info">{activeFilterCount}</span>
                ) : null}
              </button>

              {filterOpen ? (
                <WorkbenchFilterPopover
                  title={tasksPageCopy.filterAction}
                  emptyLabel={tasksPageCopy.filterEmpty}
                  sections={taskSections}
                  onClear={clearFilters}
                  onClose={() => setFilterOpen(false)}
                  footer={
                    <button type="button" className="button-primary" onClick={() => setFilterOpen(false)}>
                      {tasksPageCopy.applyFiltersAction}
                    </button>
                  }
                />
              ) : null}
            </div>

            {activeFilterCount > 0 ? (
              <span className="topbar-chip">
                {tasksPageCopy.activeFilterPrefix} {activeFilterCount}
              </span>
            ) : null}

            <label className="input-shell--centered task-pane__search">
              <Search size={18} className="icon-muted" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tasksPageCopy.searchPlaceholder}
                className="input-text"
              />
            </label>
          </div>

          <div className="workbench-scroll workbench-scroll--list task-pane__scroll">
            <div className="dense-list">
              {filteredTasks.map((task, index) => (
                <StaggeredItem key={task.id} index={index}>
                  <button
                    type="button"
                    onClick={() => {
                      setActionActor('');
                      if (isMobile) {
                        navigate(`/tasks/${task.id}`);
                        return;
                      }
                      void selectTask(task.id);
                    }}
                    className={task.id === activeTask?.id ? 'dense-row dense-row--active' : 'dense-row'}
                  >
                    <div className="dense-row__main">
                      <div className="dense-row__titleblock">
                        <span className="type-mono-xs">{task.id}</span>
                        <strong className="dense-row__title">{task.title}</strong>
                      </div>
                      <div className="dense-row__meta">
                        <StateBadge state={task.state} />
                        <PriorityBadge priority={task.priority} />
                        <span>{task.teamLabel}</span>
                        <span>{task.workflowLabel}</span>
                      </div>
                    </div>
                    <span className="dense-row__time">{formatRelativeTimestamp(task.updated_at)}</span>
                  </button>
                </StaggeredItem>
              ))}

              {filteredTasks.length === 0 ? (
                <div className="empty-state">
                  <p className="type-heading-sm">{tasksPageCopy.emptyTitle}</p>
                  <p className="type-body-sm mt-2">{tasksPageCopy.emptySummary}</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {!isMobile ? (
        <aside className="workbench-pane workbench-pane--inspector task-pane task-pane--authority">
          {activeTask ? (
            <div className="task-authority__stack">
              <div className="task-pane__header task-pane__header--authority">
                <div>
                  <p className="page-kicker">{tasksPageCopy.detailKicker}</p>
                  <h3 className="section-title">{tasksPageCopy.quickViewTitle}</h3>
                </div>
                <StateBadge state={activeTask.state} />
              </div>

                <div className="inspector-hero">
                  <span className="type-mono-sm">{activeTask.id}</span>
                  <h4 className="type-heading-md mt-3">
                    {activeTask.title}
                  </h4>
                  <p className="type-body-sm mt-3">
                    {activeTask.description ?? tasksPageCopy.briefFallback}
                  </p>
                </div>

                <div className="task-authority__section">
                  <div className="task-authority__facts">
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
                    <div className="detail-card">
                      <Clock3 size={16} className="detail-card__icon" />
                      <span className="detail-card__label">{tasksPageCopy.updatedLabel}</span>
                      <strong className="detail-card__value">{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                    </div>
                  </div>
                </div>

                <TaskBlueprintSection blueprint={activeBlueprint} copy={tasksPageCopy} />

                <div className="task-authority__section">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="section-title">{tasksPageCopy.executionTitle}</h4>
                    <button type="button" className="button-secondary" onClick={() => void runObserve()}>
                      {tasksPageCopy.executionObserveAction}
                    </button>
                  </div>

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

                  {activeSubtasks.length > 0 ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="dense-list">
                        {activeSubtasks.map(renderSubtaskCard)}
                      </div>
                      <div className="space-y-3">
                        {selectedSubtask ? (
                          <div className="inspector-hero">
                            <span className="type-mono-sm">{selectedSubtask.id}</span>
                            <h4 className="type-heading-md mt-3">{selectedSubtask.title}</h4>
                            <p className="type-body-sm mt-3">
                              {selectedSubtask.assignee}
                              {' / '}
                              {selectedSubtask.stage_id}
                              {' / '}
                              {selectedSubtask.status}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {!TERMINAL_SUBTASK_STATES.has(selectedSubtask.status) ? (
                                <>
                                  <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => void runSubtaskLifecycle('close', selectedSubtask)}
                                  >
                                    {tasksPageCopy.subtaskCloseAction}
                                  </button>
                                  <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => void runSubtaskLifecycle('archive', selectedSubtask)}
                                  >
                                    {tasksPageCopy.subtaskArchiveAction}
                                  </button>
                                  <button
                                    type="button"
                                    className="button-danger"
                                    onClick={() => void runSubtaskLifecycle('cancel', selectedSubtask)}
                                  >
                                    {tasksPageCopy.subtaskCancelAction}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <p className="field-label">{tasksPageCopy.executionListLabel}</p>
                          {selectedSubtaskExecutions.length > 0 ? (
                            <div className="space-y-2">
                              {selectedSubtaskExecutions.map(renderExecutionStatus)}
                            </div>
                          ) : (
                            <p className="type-body-sm">{tasksPageCopy.executionEmpty}</p>
                          )}
                        </div>
                        {selectedExecution ? (
                          <div className="space-y-3">
                            <div className="inspector-hero">
                              <span className="type-mono-sm">{selectedExecution.executionId}</span>
                              <h4 className="type-heading-md mt-3">{selectedExecution.adapter}</h4>
                              <p className="type-body-sm mt-3">
                                {selectedExecution.status}
                                {selectedExecution.sessionId ? ` / ${selectedExecution.sessionId}` : ''}
                                {selectedExecution.workdir ? ` / ${selectedExecution.workdir}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => void runProbe(selectedExecution.executionId)}
                              >
                                {tasksPageCopy.executionProbeAction}
                              </button>
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => void runExecutionTailRefresh(selectedExecution.executionId)}
                              >
                                {executionTailById[selectedExecution.executionId]
                                  ? tasksPageCopy.executionTailRefreshAction
                                  : tasksPageCopy.executionTailAction}
                              </button>
                              <button
                                type="button"
                                className="button-danger"
                                onClick={() => void runExecutionStop(selectedExecution.executionId)}
                              >
                                {tasksPageCopy.executionStopAction}
                              </button>
                            </div>
                            {selectedExecution.callbackPayload?.inputRequest?.hint ? (
                              <p className="type-body-sm">{selectedExecution.callbackPayload.inputRequest.hint}</p>
                            ) : null}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="field-label">{tasksPageCopy.executionTailLabel}</p>
                                {executionTailLoadingById[selectedExecution.executionId] ? (
                                  <span className="type-text-xs">{tasksPageCopy.executionTailRefreshAction}…</span>
                                ) : null}
                              </div>
                              <div className="rounded-2xl border border-[rgba(148,163,184,0.22)] bg-[rgba(15,23,42,0.94)] p-3">
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-slate-100">
                                  {executionTailById[selectedExecution.executionId]
                                    ? (
                                        executionTailById[selectedExecution.executionId]?.available
                                          ? (executionTailById[selectedExecution.executionId]?.output ?? tasksPageCopy.executionTailEmpty)
                                          : tasksPageCopy.executionTailUnavailable
                                      )
                                    : tasksPageCopy.executionTailEmpty}
                                </pre>
                              </div>
                            </div>
                            {selectedExecution.callbackPayload?.inputRequest?.transport === 'text' ? (
                              <div className="space-y-2">
                                <label className="field-label" htmlFor="execution-input-text">
                                  {tasksPageCopy.executionTextLabel}
                                </label>
                                <textarea
                                  id="execution-input-text"
                                  value={executionInputText}
                                  onChange={(event) => setExecutionInputText(event.target.value)}
                                  className="textarea-shell"
                                  placeholder={selectedExecution.callbackPayload.inputRequest.textPlaceholder ?? tasksPageCopy.executionTextPlaceholder}
                                />
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={() => void runExecutionTextInput(selectedExecution.executionId)}
                                >
                                  {tasksPageCopy.executionTextAction}
                                </button>
                              </div>
                            ) : null}
                            {selectedExecution.callbackPayload?.inputRequest?.transport === 'choice' &&
                            selectedExecution.callbackPayload.inputRequest.choiceOptions.length > 0 ? (
                              <div className="space-y-2">
                                <p className="field-label">{tasksPageCopy.executionChoiceLabel}</p>
                                <div className="flex flex-wrap gap-2">
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
                              <div className="space-y-2">
                                <p className="field-label">{tasksPageCopy.executionKeysLabel}</p>
                                <div className="flex flex-wrap gap-2">
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
                          </div>
                        ) : null}
                        {activeGovernanceSnapshot?.activeByAssignee.length ? (
                          <div className="space-y-2">
                            <p className="field-label">{tasksPageCopy.governanceAssigneeLabel}</p>
                            <div className="space-y-2">
                              {activeGovernanceSnapshot.activeByAssignee.map((item) => (
                                <div key={item.assignee} className="data-row">
                                  <span className="type-mono-xs">{item.assignee}</span>
                                  <span className="status-pill status-pill--neutral">{item.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {(activeGovernanceSnapshot?.warnings ?? []).length ? (
                          <div className="space-y-2">
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
                          <div className="space-y-2">
                            <p className="field-label">{tasksPageCopy.governanceExecutionDetailsLabel}</p>
                            <div className="space-y-2">
                              {(activeGovernanceSnapshot?.activeExecutionDetails ?? []).map((detail) => (
                                <div key={detail.executionId} className="data-row">
                                  <div className="min-w-0 flex-1">
                                    <p className="type-mono-xs">{detail.executionId}</p>
                                    <p className="type-text-xs mt-1">
                                      {detail.assignee}
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
                    </div>
                  ) : (
                    <p className="type-body-sm mt-4">{tasksPageCopy.executionEmpty}</p>
                  )}
                </div>

                <div className="task-authority__section">
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
                          {member.agentId}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="field-label" htmlFor="task-action-note">
                      {tasksPageCopy.noteLabel}
                    </label>
                    <textarea
                      id="task-action-note"
                      value={actionNote}
                      onChange={(event) => setActionNote(event.target.value)}
                      className="textarea-shell"
                      placeholder={tasksPageCopy.notePlaceholder}
                    />
                  </div>

                  <div className="task-authority__actions">
                    {selectedSubtask ? (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void runRuntimeDiagnosis(selectedSubtask.assignee)}
                        >
                          {tasksPageCopy.runtimeDiagnosisAction}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void runRuntimeRestart(selectedSubtask.assignee)}
                        >
                          {tasksPageCopy.runtimeRestartAction}
                        </button>
                      </>
                    ) : null}
                    {activeGateType === 'approval' ? (
                      <>
                        <button type="button" className="button-primary" onClick={() => void runAction('approve')}>
                          {tasksPageCopy.approveAction}
                        </button>
                        <button type="button" className="button-danger" onClick={() => void runAction('reject')}>
                          {tasksPageCopy.rejectAction}
                        </button>
                      </>
                    ) : null}

                    {activeGateType === 'quorum' ? (
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

                <div className="task-authority__section task-authority__section--meta">
                  <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
                  <div className="mt-4 space-y-3">
                    {activeTimeline.slice(0, 3).map((entry) => (
                      <div key={entry.key} className="timeline-item">
                        <div className="timeline-item__rail" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="type-label-sm">{entry.label}</span>
                            <span className="type-text-xs">
                              {formatRelativeTimestamp(entry.timestamp)}
                            </span>
                          </div>
                          <p className="type-body-sm mt-2">
                            {entry.detail || tasksPageCopy.timelineEmptyDetail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="button-primary w-full justify-center"
                    onClick={() => navigate(`/tasks/${activeTask.id}`)}
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
        ) : null}
      </div>

      {taskId ? (
        <WorkbenchDetailSheet
          label={tasksPageCopy.detailDialogLabel}
          title={tasksPageCopy.detailDialogTitle}
          onClose={() => navigate('/tasks')}
        >
          {shouldShowDetailLoading ? (
            <div className="empty-state">
              <p className="type-heading-sm">{tasksPageCopy.detailLoadingTitle}</p>
              <p className="type-body-sm mt-2">{tasksPageCopy.detailLoadingSummary}</p>
            </div>
          ) : shouldShowDetailError ? (
            <div className="empty-state">
              <p className="type-heading-sm">{tasksPageCopy.detailErrorTitle}</p>
              <div className="inline-alert inline-alert--danger mt-4">{error}</div>
            </div>
          ) : shouldShowDetailEmpty || !routeTask ? (
            <div className="empty-state">
              <p className="type-heading-sm">{tasksPageCopy.detailEmptyTitle}</p>
              <p className="type-body-sm mt-2">{tasksPageCopy.detailEmptySummary}</p>
            </div>
          ) : (
            <>
              <div className="sheet-summary">
                <span className="type-mono-sm">{routeTask.id}</span>
                <h4 className="type-heading-lg mt-3">
                  {routeTask.title}
                </h4>
                <p className="type-body-sm mt-3">
                  {routeTask.description ?? tasksPageCopy.briefFallback}
                </p>
              </div>

              <section className="sheet-section">
                <TaskBlueprintSection blueprint={routeTaskStatus?.taskBlueprint} copy={tasksPageCopy} />
              </section>

              <section className="sheet-section">
                <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
                <div className="mt-4 space-y-3">
                  {routeTimeline.map((entry) => (
                    <div key={entry.key} className="timeline-item">
                      <div className="timeline-item__rail" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="type-label-sm">{entry.label}</span>
                          <span className="type-text-xs">
                            {formatRelativeTimestamp(entry.timestamp)}
                          </span>
                        </div>
                        <p className="type-body-sm mt-2">
                          {entry.detail || tasksPageCopy.timelineEmptyDetail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sheet-section">
                <h4 className="section-title">{tasksPageCopy.conversationTitle}</h4>
                <div className="mt-4 space-y-3">
                  {(routeTaskStatus?.conversation ?? []).length > 0 ? (
                    (routeTaskStatus?.conversation ?? []).map((entry) => (
                      <div key={entry.id} className="data-row">
                        <div className="min-w-0 flex-1">
                          <p className="type-label-sm">
                            {entry.display_name ?? entry.author_ref ?? entry.author_kind}
                            {' / '}
                            {entry.provider}
                          </p>
                          {entry.statusEvent ? (
                            <div className="timeline-status-card">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="status-pill status-pill--neutral">{entry.statusEvent.eventType}</span>
                                <span className="type-text-xs">{entry.statusEvent.taskState}</span>
                                {entry.statusEvent.currentStage ? (
                                  <span className="type-text-xs">stage: {entry.statusEvent.currentStage}</span>
                                ) : null}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                                {entry.statusEvent.executionKind ? (
                                  <span className="type-text-xs">execution: {entry.statusEvent.executionKind}</span>
                                ) : null}
                                {entry.statusEvent.controllerRef ? (
                                  <span className="type-text-xs">controller: {entry.statusEvent.controllerRef}</span>
                                ) : null}
                                {entry.statusEvent.allowedActions.length > 0 ? (
                                  <span className="type-text-xs">actions: {entry.statusEvent.allowedActions.join(', ')}</span>
                                ) : null}
                              </div>
                              {entry.statusEvent.workspacePath ? (
                                <p className="type-text-xs mt-2 break-all">
                                  workspace: {entry.statusEvent.workspacePath}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="type-body-sm mt-2 whitespace-pre-wrap">{entry.body}</p>
                        </div>
                        <span className="type-text-xs">{formatRelativeTimestamp(entry.occurred_at)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="type-body-sm">{tasksPageCopy.conversationEmpty}</p>
                  )}
                </div>
              </section>

              <section className="sheet-section">
                <h4 className="section-title">{tasksPageCopy.progressTitle}</h4>
                <div className="mt-4 space-y-3">
                  {(routeTaskStatus?.progress_log ?? []).map((entry) => (
                    <div key={entry.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <p className="type-label-sm">{entry.actor}</p>
                        <p className="type-body-sm mt-2">{entry.content}</p>
                      </div>
                      <span className="type-text-xs">{formatRelativeTimestamp(entry.created_at)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sheet-section">
                <h4 className="section-title">{tasksPageCopy.subtasksTitle}</h4>
                <div className="mt-4 space-y-3">
                  {(routeTaskStatus?.subtasks ?? []).map((subtask) => (
                    <div key={subtask.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <p className="type-heading-xs">{subtask.title}</p>
                        <p className="type-text-xs mt-2">
                          {subtask.assignee} / {subtask.craftsman_type ?? tasksPageCopy.subtaskFallbackType}
                        </p>
                      </div>
                      <span className="status-pill status-pill--neutral">{subtask.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
