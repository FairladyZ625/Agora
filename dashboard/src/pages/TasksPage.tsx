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
import type { TaskAction, TaskBlueprint, TaskConversationEntry, TaskStatus } from '@/types/task';

const TASK_STATE_VALUES = ['in_progress', 'gate_waiting', 'completed', 'pending', 'paused', 'blocked', 'cancelled'] as const;
const TASK_PRIORITY_VALUES = ['high', 'normal', 'low'] as const;

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
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const selectTask = useTaskStore((state) => state.selectTask);
  const runTaskAction = useTaskStore((state) => state.runTaskAction);
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
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

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

  const activeFilterCount = stateFilter.length + priorityFilter.length + teamFilter.length + workflowFilter.length;
  const activeMembers = activeStatus?.task.teamMembers ?? activeTask?.teamMembers ?? [];
  const activeGateType = activeStatus?.task.gateType ?? activeTask?.gateType ?? null;
  const activeBlueprint = activeStatus?.taskBlueprint;
  const activeTimeline = useMemo(() => buildTaskTimeline(activeStatus), [activeStatus]);
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

      {taskId && activeTask ? (
        <WorkbenchDetailSheet
          label={tasksPageCopy.detailDialogLabel}
          title={tasksPageCopy.detailDialogTitle}
          onClose={() => navigate('/tasks')}
        >
          <div className="sheet-summary">
            <span className="type-mono-sm">{activeTask.id}</span>
            <h4 className="type-heading-lg mt-3">
              {activeTask.title}
            </h4>
            <p className="type-body-sm mt-3">
              {activeTask.description ?? tasksPageCopy.briefFallback}
            </p>
          </div>

          <section className="sheet-section">
            <TaskBlueprintSection blueprint={activeBlueprint} copy={tasksPageCopy} />
          </section>

          <section className="sheet-section">
            <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
            <div className="mt-4 space-y-3">
              {activeTimeline.map((entry) => (
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
              {(activeStatus?.conversation ?? []).length > 0 ? (
                (activeStatus?.conversation ?? []).map((entry) => (
                  <div key={entry.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <p className="type-label-sm">
                        {entry.display_name ?? entry.author_ref ?? entry.author_kind}
                        {' / '}
                        {entry.provider}
                      </p>
                      {entry.statusEvent ? (
                        <div className="mt-2 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-3">
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
              {(activeStatus?.progress_log ?? []).map((entry) => (
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
              {(activeStatus?.subtasks ?? []).map((subtask) => (
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
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
