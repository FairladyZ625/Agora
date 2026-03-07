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
      ] as const;

      return boardColumns.map((column) => ({
        ...column,
        tasks: tasks.filter((task) => task.state === column.state),
      }));
    },
    [boardCopy, tasks],
  );

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--workspace space-y-4">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{boardCopy.kicker}</p>
            <h2 className="page-title">{boardCopy.title}</h2>
            <p className="page-summary">{boardCopy.summary}</p>
          </div>
          <Link to="/tasks/new" className="button-primary">
            {boardCopy.createAction}
          </Link>
        </div>
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="grid gap-4 lg:grid-cols-4">
          {columns.map((column) => (
            <div key={column.state} className="surface-panel surface-panel--muted space-y-3">
              <div className="section-title-row">
                <h3 className="section-title">{column.label}</h3>
                <span className="status-pill status-pill--neutral">{column.tasks.length}</span>
              </div>

              <div className="space-y-3">
                {column.tasks.map((task) => (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="decision-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="type-mono-sm">{task.id}</p>
                        <h4 className="type-heading-sm mt-1">{task.title}</h4>
                      </div>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StateBadge state={task.state} />
                      <span className="type-text-xs">{task.teamLabel}</span>
                    </div>
                    <p className="type-text-xs mt-3">{formatRelativeTimestamp(task.updated_at)}</p>
                  </Link>
                ))}

                {column.tasks.length === 0 ? (
                  <div className="empty-state">
                    <p className="type-heading-sm">{boardCopy.emptyTitle}</p>
                    <p className="type-body-sm mt-2">{boardCopy.emptySummary}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
