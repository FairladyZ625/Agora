import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Filter, Link2, PanelRightOpen, Search, Workflow } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { tasksPageCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp, getMockTaskStatus, MOCK_TASK_STATUS, MOCK_TASKS } from '@/lib/mockDashboard';
import type { Task } from '@/types/task';
import { ControlGlass } from '@/components/ui/ControlGlass';
import { WorkbenchFilterPopover } from '@/components/ui/WorkbenchFilterPopover';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';

const taskStates = [
  { value: 'in_progress', label: '进行中' },
  { value: 'gate_waiting', label: '待审批' },
  { value: 'completed', label: '已完成' },
  { value: 'pending', label: '等待中' },
] as const;

const priorities = [
  { value: 'critical', label: '关键' },
  { value: 'high', label: '高' },
  { value: 'normal', label: '标准' },
  { value: 'low', label: '低' },
] as const;

function buildTaskList(tasks: Task[]) {
  return tasks.length > 0 ? tasks : MOCK_TASKS;
}

function toggleValue(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function TasksPage() {
  const {
    tasks,
    selectedTaskId,
    selectedTaskStatus,
    fetchTasks,
    selectTask,
  } = useTaskStore();
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const taskList = buildTaskList(tasks);
  const availableTeams = useMemo(() => [...new Set(taskList.map((task) => task.team))], [taskList]);
  const availableWorkflows = useMemo(() => [...new Set(taskList.map((task) => task.workflow))], [taskList]);

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
      const matchesTeam = teamFilter.length === 0 || teamFilter.includes(task.team);
      const matchesWorkflow = workflowFilter.length === 0 || workflowFilter.includes(task.workflow);
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
    filteredTasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0] ??
    null;

  const activeStatus =
    activeTask && selectedTaskStatus?.task.id === activeTask.id
      ? selectedTaskStatus
      : activeTask
        ? MOCK_TASK_STATUS[activeTask.id] ?? getMockTaskStatus(activeTask.id)
        : null;

  const activeFilterCount = stateFilter.length + priorityFilter.length + teamFilter.length + workflowFilter.length;

  const taskSections = [
    {
      label: tasksPageCopy.filterSectionLabels.state,
      options: taskStates.map((item) => ({
        value: item.value,
        label: item.label,
        count: taskList.filter((task) => task.state === item.value).length,
      })),
      selected: stateFilter,
      onToggle: (value: string) => setStateFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.priority,
      options: priorities.map((item) => ({
        value: item.value,
        label: item.label,
        count: taskList.filter((task) => task.priority === item.value).length,
      })),
      selected: priorityFilter,
      onToggle: (value: string) => setPriorityFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.team,
      options: availableTeams.map((item) => ({
        value: item,
        label: item,
        count: taskList.filter((task) => task.team === item).length,
      })),
      selected: teamFilter,
      onToggle: (value: string) => setTeamFilter((current) => toggleValue(current, value)),
    },
    {
      label: tasksPageCopy.filterSectionLabels.workflow,
      options: availableWorkflows.map((item) => ({
        value: item,
        label: item,
        count: taskList.filter((task) => task.workflow === item).length,
      })),
      selected: workflowFilter,
      onToggle: (value: string) => setWorkflowFilter((current) => toggleValue(current, value)),
    },
  ];

  const clearFilters = () => {
    setStateFilter([]);
    setPriorityFilter([]);
    setTeamFilter([]);
    setWorkflowFilter([]);
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
                <span className="inline-stat__label">当前命中</span>
                <span className="inline-stat__value">{filteredTasks.length}</span>
              </div>
              <div className="inline-stat">
                <span className="inline-stat__label">待审批</span>
                <span className="inline-stat__value">{filteredTasks.filter((task) => task.state === 'gate_waiting').length}</span>
              </div>
              <div className="inline-stat">
                <span className="inline-stat__label">当前焦点</span>
                <span className="inline-stat__value">{activeTask?.current_stage ?? tasksPageCopy.stageFallback}</span>
              </div>
            </div>
          </div>

          <div className="workbench-header__center">
            <div className="workbench-header__search-container">
              <label className="input-shell--centered">
                <Search size={18} className="text-[var(--color-text-tertiary)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tasksPageCopy.searchPlaceholder}
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--color-text-tertiary)]"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="workbench-toolbar">
          <div className="workbench-toolbar__actions">
            <div className="workbench-toolbar__filter-anchor">
              <ControlGlass className="glass-control" padding="0px" cornerRadius={18}>
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
                    onClick={() => void selectTask(task.id)}
                    className={task.id === activeTask?.id ? 'dense-row dense-row--active' : 'dense-row'}
                  >
                    <div className="dense-row__main">
                      <div className="dense-row__titleblock">
                        <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">{task.id}</span>
                        <strong className="dense-row__title">{task.title}</strong>
                      </div>
                      <div className="dense-row__meta">
                        <StateBadge state={task.state} />
                        <PriorityBadge priority={task.priority} />
                        <span>{task.team}</span>
                        <span>{task.workflow}</span>
                      </div>
                    </div>
                    <span className="dense-row__time">{formatRelativeTimestamp(task.updated_at)}</span>
                  </button>
                ))}

                {filteredTasks.length === 0 ? (
                  <div className="empty-state">
                    <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{tasksPageCopy.emptyTitle}</p>
                    <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{tasksPageCopy.emptySummary}</p>
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
                  <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{activeTask.id}</span>
                  <h4 className="mt-3 text-[22px] font-semibold tracking-[-0.04em] text-[var(--color-text-primary)]">
                    {activeTask.title}
                  </h4>
                  <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
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
                    <strong className="detail-card__value">{activeTask.workflow}</strong>
                  </div>
                  <div className="detail-card">
                    <PanelRightOpen size={16} className="detail-card__icon" />
                    <span className="detail-card__label">{tasksPageCopy.teamLabel}</span>
                    <strong className="detail-card__value">{activeTask.team}</strong>
                  </div>
                  <div className="detail-card">
                    <Clock3 size={16} className="detail-card__icon" />
                    <span className="detail-card__label">{tasksPageCopy.updatedLabel}</span>
                    <strong className="detail-card__value">{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                  </div>
                </div>

                <div>
                  <h4 className="section-title">{tasksPageCopy.timelineTitle}</h4>
                  <div className="mt-4 space-y-3">
                    {(activeStatus?.flow_log ?? []).slice(0, 3).map((entry) => (
                      <div key={entry.id} className="timeline-item">
                        <div className="timeline-item__rail" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{entry.event}</span>
                            <span className="text-[12px] text-[var(--color-text-tertiary)]">
                              {formatRelativeTimestamp(entry.created_at)}
                            </span>
                          </div>
                          <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
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
                <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{tasksPageCopy.emptyTitle}</p>
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{tasksPageCopy.emptySummary}</p>
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
            <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{activeTask.id}</span>
            <h4 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[var(--color-text-primary)]">
              {activeTask.title}
            </h4>
            <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
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
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{entry.event}</span>
                      <span className="text-[12px] text-[var(--color-text-tertiary)]">
                        {formatRelativeTimestamp(entry.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
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
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{entry.actor}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">{entry.content}</p>
                  </div>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">{formatRelativeTimestamp(entry.created_at)}</span>
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
                    <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{subtask.title}</p>
                    <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
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
