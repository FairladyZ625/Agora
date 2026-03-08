import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Filter, Link2, PanelRightOpen, Search, Workflow } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTasksPageCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { ControlGlass } from '@/components/ui/ControlGlass';
import { WorkbenchFilterPopover } from '@/components/ui/WorkbenchFilterPopover';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { toggleValue } from '@/lib/utils';
import { getPriorityMeta, getStateMeta } from '@/lib/taskMeta';
import type { TaskAction } from '@/types/task';

const TASK_STATE_VALUES = ['in_progress', 'gate_waiting', 'completed', 'pending', 'paused', 'blocked', 'cancelled'] as const;
const TASK_PRIORITY_VALUES = ['high', 'normal', 'low'] as const;


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
      <section className="surface-panel surface-panel--workspace workbench-shell">
        <div className="workbench-header">
          <div className="workbench-header__top">
            <div className="space-y-3">
              <p className="page-kicker">{tasksPageCopy.kicker}</p>
              <h2 className="page-title">{tasksPageCopy.workbenchTitle}</h2>
              <p className="page-summary">{tasksPageCopy.workbenchSummary}</p>
            </div>
            <div className="workbench-hero__stats">
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

          <div className="workbench-header__center">
            <div className="workbench-header__search-container">
              <label className="input-shell--centered">
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
          </div>
        </div>

        {error ? (
          <div className="inline-alert inline-alert--danger">{error}</div>
        ) : null}

        <div className="workbench-toolbar">
          <div className="workbench-toolbar__actions">
            <div className="workbench-toolbar__filter-anchor">
              <ControlGlass className="glass-control" density="flush" radius="lg">
                <button
                  type="button"
                  className="glass-control__button"
                  onClick={() => setFilterOpen((current) => !current)}
                >
                  <Filter size={14} />
                  {tasksPageCopy.filterAction}
                  {activeFilterCount > 0 ? (
                    <span className="status-pill status-pill--info">{activeFilterCount}</span>
                  ) : null}
                </button>
              </ControlGlass>

              {filterOpen ? (
                <WorkbenchFilterPopover
                  title={tasksPageCopy.filterAction}
                  emptyLabel={tasksPageCopy.filterEmpty}
                  sections={taskSections}
                  align="end"
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
          </div>
        </div>

        <div className="workbench-grid">
          <section className="workbench-pane">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{tasksPageCopy.listKicker}</p>
                <h3 className="section-title">{tasksPageCopy.listTitle}</h3>
              </div>
              <span className="status-pill status-pill--neutral">
                {filteredTasks.length}
                {tasksPageCopy.listCountUnit}
              </span>
            </div>

            <div className="workbench-scroll workbench-scroll--list">
              <div className="dense-list">
                {filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      setActionActor('');
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

          <aside className="workbench-pane workbench-pane--inspector">
            {activeTask ? (
              <div className="space-y-5">
                <div className="section-title-row">
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

                <div className="grid gap-3 md:grid-cols-2">
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
                    <Clock3 size={16} className="detail-card__icon" />
                    <span className="detail-card__label">{tasksPageCopy.updatedLabel}</span>
                    <strong className="detail-card__value">{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                  </div>
                </div>

                <div className="space-y-3">
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

                  <div className="flex flex-wrap gap-3">
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

                <div>
                  <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
                  <div className="mt-4 space-y-3">
                    {(activeStatus?.flow_log ?? []).slice(0, 3).map((entry) => (
                      <div key={entry.id} className="timeline-item">
                        <div className="timeline-item__rail" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="type-label-sm">{entry.event}</span>
                            <span className="type-text-xs">
                              {formatRelativeTimestamp(entry.created_at)}
                            </span>
                          </div>
                          <p className="type-body-sm mt-2">
                            {entry.detail ?? tasksPageCopy.timelineEmptyDetail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
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
            ) : (
              <div className="empty-state">
                <p className="type-heading-sm">{tasksPageCopy.emptyTitle}</p>
                <p className="type-body-sm mt-2">{tasksPageCopy.emptySummary}</p>
              </div>
            )}
          </aside>
        </div>
      </section>

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
            <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
            <div className="mt-4 space-y-3">
              {(activeStatus?.flow_log ?? []).map((entry) => (
                <div key={entry.id} className="timeline-item">
                  <div className="timeline-item__rail" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-label-sm">{entry.event}</span>
                      <span className="type-text-xs">
                        {formatRelativeTimestamp(entry.created_at)}
                      </span>
                    </div>
                    <p className="type-body-sm mt-2">
                      {entry.detail ?? tasksPageCopy.timelineEmptyDetail}
                    </p>
                  </div>
                </div>
              ))}
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
