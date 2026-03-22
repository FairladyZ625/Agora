import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useTaskStore } from '@/stores/taskStore';
import { StateBadge, PriorityBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { useBoardPageCopy } from '@/lib/dashboardCopy';

export function BoardPage() {
  const boardCopy = useBoardPageCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const columns = useMemo(
    () => {
      const boardColumns = [
        { state: 'pending', label: boardCopy.columns.pending },
        { state: 'in_progress', label: boardCopy.columns.inProgress },
        { state: 'gate_waiting', label: boardCopy.columns.gateWaiting },
        { state: 'completed', label: boardCopy.columns.completed },
        { state: 'interrupted', label: boardCopy.columns.interrupted },
      ] as const;

      return boardColumns.map((column) => ({
        ...column,
        tasks:
          column.state === 'interrupted'
            ? tasks.filter((task) => ['paused', 'blocked', 'cancelled'].includes(task.state))
            : tasks.filter((task) => task.state === column.state),
      }));
    },
    [boardCopy, tasks],
  );
  const interruptedColumn = columns.find((column) => column.state === 'interrupted');

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{boardCopy.kicker}</p>
            <h2 className="page-title">{boardCopy.title}</h2>
            <p className="page-summary">{boardCopy.summary}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="workbench-masthead__signals">
              {columns.slice(0, 3).map((column) => (
                <div key={column.state} className="inline-stat">
                  <span className="inline-stat__label">{column.label}</span>
                  <span className="inline-stat__value">{column.tasks.length}</span>
                </div>
              ))}
            </div>
            <Link to="/tasks/new" className="button-primary">
              {boardCopy.createAction}
            </Link>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" data-testid="board-state-summary">
        {columns.map((column) => (
          <div key={column.state} className="surface-panel surface-panel--workspace">
            <p className="metric-label">{column.label}</p>
            <p className="metric-value">{column.tasks.length}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="surface-panel surface-panel--workspace xl:col-span-2" data-testid="board-state-grid">
          <div className="workbench-scroll board-grid-scroll">
            <div className="board-grid-columns">
            {columns.map((column) => (
              <div
                key={column.state}
                className={
                  column.state === 'gate_waiting'
                    ? 'board-grid-column board-grid-column--review'
                    : column.state === 'in_progress'
                      ? 'board-grid-column board-grid-column--active'
                      : 'board-grid-column'
                }
              >
                <div className="board-grid-column__head">
                  <div className="board-grid-column__titleblock">
                    <h4 className="section-title">{column.label}</h4>
                  </div>
                  <span className="status-pill status-pill--neutral">{column.tasks.length}</span>
                </div>

                <div className="board-grid-column__stack">
                  {column.tasks.map((task) => (
                    <Link key={task.id} to={`/tasks/${task.id}`} className="decision-card board-task-card">
                      <div className="board-task-card__meta">
                        <span className="type-mono-sm board-task-card__id">{task.id}</span>
                        <div className="board-task-card__badges">
                          <StateBadge state={task.state} />
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </div>
                      <h5 className="board-task-card__title">{task.title}</h5>
                      <div className="board-task-card__support">
                        <span>{task.workflowLabel}</span>
                        <span>{task.teamLabel}</span>
                      </div>
                      <div className="board-task-card__footer">
                        <span className="board-task-card__timestamp">{formatRelativeTimestamp(task.updated_at)}</span>
                      </div>
                    </Link>
                  ))}

                  {column.tasks.length === 0 ? (
                    <div className="empty-state board-grid-column__empty">
                      <p className="type-heading-sm">{boardCopy.emptyTitle}</p>
                      <p className="type-body-sm">{boardCopy.emptySummary}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="board-interrupted-focus">
          <div className="board-focus__head">
            <div>
              <p className="page-kicker">{boardCopy.kicker}</p>
              <h3 className="section-title">{boardCopy.columns.interrupted}</h3>
            </div>
            <span className="status-pill status-pill--neutral">{interruptedColumn?.tasks.length ?? 0}</span>
          </div>

          <div className="board-focus__stack">
            {interruptedColumn && interruptedColumn.tasks.length > 0 ? (
              interruptedColumn.tasks.map((task) => (
                <Link key={task.id} to={`/tasks/${task.id}`} className="decision-card board-task-card board-task-card--focus">
                  <div className="board-task-card__meta">
                    <span className="type-mono-sm board-task-card__id">{task.id}</span>
                    <div className="board-task-card__badges">
                      <StateBadge state={task.state} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                  <h4 className="board-task-card__title">{task.title}</h4>
                  <div className="board-task-card__support">
                    <span>{task.workflowLabel}</span>
                    <span>{task.teamLabel}</span>
                  </div>
                  <div className="board-task-card__footer">
                    <span className="board-task-card__timestamp">{formatRelativeTimestamp(task.updated_at)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                <p className="type-heading-sm">{boardCopy.emptyTitle}</p>
                <p className="type-body-sm mt-2">{boardCopy.emptySummary}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
