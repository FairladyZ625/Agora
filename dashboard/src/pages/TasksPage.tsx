import { useDeferredValue, useEffect, useState } from 'react';
import { Clock3, Filter, Layers3, Link2, Workflow } from 'lucide-react';
import { tasksPageCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp, MOCK_TASK_STATUS, MOCK_TASKS } from '@/lib/mockDashboard';
import type { Task } from '@/types/task';

const taskStates = [
  { value: 'all', label: '全部' },
  { value: 'in_progress', label: '进行中' },
  { value: 'gate_waiting', label: '待审批' },
  { value: 'completed', label: '已完成' },
];

function buildTaskList(tasks: Task[]) {
  return tasks.length > 0 ? tasks : MOCK_TASKS;
}

export function TasksPage() {
  const {
    tasks,
    selectedTaskId,
    selectedTaskStatus,
    fetchTasks,
    selectTask,
  } = useTaskStore();
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const taskList = buildTaskList(tasks);
  const lowered = deferredQuery.trim().toLowerCase();
  const filteredTasks = taskList.filter((task) => {
    const matchesState = stateFilter === 'all' || task.state === stateFilter;
    const matchesQuery =
      lowered.length === 0 ||
      task.id.toLowerCase().includes(lowered) ||
      task.title.toLowerCase().includes(lowered) ||
      task.creator.toLowerCase().includes(lowered);
    return matchesState && matchesQuery;
  });

  useEffect(() => {
    if (filteredTasks.length === 0) {
      return;
    }
    if (selectedTaskId && filteredTasks.some((task) => task.id === selectedTaskId)) {
      return;
    }
    void selectTask(filteredTasks[0].id);
  }, [filteredTasks, selectedTaskId, selectTask]);

  const activeTask =
    filteredTasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null;
  const activeStatus =
    activeTask && selectedTaskStatus?.task.id === activeTask.id
      ? selectedTaskStatus
      : activeTask
        ? MOCK_TASK_STATUS[activeTask.id]
        : null;

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--intro space-y-2">
        <p className="page-kicker">{tasksPageCopy.kicker}</p>
        <h2 className="page-title">{tasksPageCopy.title}</h2>
        <p className="page-summary">{tasksPageCopy.summary}</p>
      </section>

      <section className="surface-panel surface-panel--toolbar">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="input-shell flex-1">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tasksPageCopy.searchPlaceholder}
              className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--color-text-tertiary)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-[12px] font-medium text-[var(--color-text-tertiary)] md:inline-flex">
              <Filter size={14} className="mr-1.5" />
              {tasksPageCopy.filterLabel}
            </span>
            {taskStates.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStateFilter(item.value)}
                className={stateFilter === item.value ? 'choice-pill choice-pill--active' : 'choice-pill'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
        <section className="surface-panel surface-panel--workspace">
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

          <div className="mt-5 space-y-3">
            {filteredTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => void selectTask(task.id)}
                className={task.id === activeTask?.id ? 'task-row task-row--active' : 'task-row'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{task.id}</span>
                      <h4 className="truncate text-[15px] font-medium text-[var(--color-text-primary)]">
                        {task.title}
                      </h4>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StateBadge state={task.state} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">
                    {formatRelativeTimestamp(task.updated_at)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
                  <span>{task.creator}</span>
                  <span>{task.team}</span>
                  <span>{task.workflow}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel surface-panel--workspace">
          {activeTask ? (
            <div className="space-y-6">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{tasksPageCopy.detailKicker}</p>
                  <h3 className="section-title">{tasksPageCopy.detailTitle}</h3>
                </div>
                <StateBadge state={activeTask.state} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="detail-card">
                  <Layers3 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{tasksPageCopy.stageLabel}</span>
                  <strong className="detail-card__value">{activeTask.current_stage ?? tasksPageCopy.stageFallback}</strong>
                </div>
                <div className="detail-card">
                  <Workflow size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{tasksPageCopy.workflowLabel}</span>
                  <strong className="detail-card__value">{activeTask.workflow}</strong>
                </div>
                <div className="detail-card">
                  <Link2 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{tasksPageCopy.teamLabel}</span>
                  <strong className="detail-card__value">{activeTask.team}</strong>
                </div>
                <div className="detail-card">
                  <Clock3 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{tasksPageCopy.updatedLabel}</span>
                  <strong className="detail-card__value">{formatRelativeTimestamp(activeTask.updated_at)}</strong>
                </div>
              </div>

              <div className="rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--color-border)' }}>
                <p className="page-kicker">{tasksPageCopy.briefKicker}</p>
                <p className="mt-2 text-[15px] font-medium text-[var(--color-text-primary)]">{activeTask.title}</p>
                <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                  {activeTask.description ?? tasksPageCopy.briefFallback}
                </p>
              </div>

              <div>
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
              </div>

              <div>
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
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{tasksPageCopy.emptyTitle}</p>
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{tasksPageCopy.emptySummary}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
