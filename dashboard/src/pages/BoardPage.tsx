import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTaskStore } from '@/stores/taskStore';
import { useProjectStore } from '@/stores/projectStore';
import { StateBadge, PriorityBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { useBoardPageCopy } from '@/lib/dashboardCopy';
import {
  ALL_PROJECTS_FILTER_VALUE,
  buildTaskProjectGroups,
  filterTasksByProject,
} from '@/lib/taskProjectPresentation';

export function BoardPage() {
  const boardCopy = useBoardPageCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS_FILTER_VALUE);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const visibleTasks = useMemo(() => filterTasksByProject(tasks, projectFilter), [projectFilter, tasks]);
  const availableProjectGroups = useMemo(
    () => buildTaskProjectGroups(tasks, projects, boardCopy.unassignedProjectLabel),
    [boardCopy.unassignedProjectLabel, projects, tasks],
  );

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
        groups: buildTaskProjectGroups(
          column.state === 'interrupted'
            ? visibleTasks.filter((task) => ['paused', 'blocked', 'cancelled'].includes(task.state))
            : visibleTasks.filter((task) => task.state === column.state),
          projects,
          boardCopy.unassignedProjectLabel,
        ),
      }));
    },
    [boardCopy, projects, visibleTasks],
  );
  const reviewColumn = columns.find((column) => column.state === 'gate_waiting');

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
                  <span className="inline-stat__value">{column.groups.reduce((sum, group) => sum + group.tasks.length, 0)}</span>
                </div>
              ))}
            </div>
            <label className="space-y-2">
              <span className="field-label">{boardCopy.projectFilterLabel}</span>
              <select
                aria-label={boardCopy.projectFilterLabel}
                className="input-shell board-toolbar__project-select"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
              >
                <option value={ALL_PROJECTS_FILTER_VALUE}>{boardCopy.allProjectsOption}</option>
                {availableProjectGroups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/tasks/new" className="button-primary">
              {boardCopy.createAction}
            </Link>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
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
                  <span className="status-pill status-pill--neutral">{column.groups.reduce((sum, group) => sum + group.tasks.length, 0)}</span>
                </div>

                <div className="board-grid-column__stack">
                  {column.groups.map((group) => (
                    <section key={group.key} className="board-task-group">
                      <div className="board-task-group__header">
                        <span className="field-label">{boardCopy.projectFilterLabel}</span>
                        <strong className="board-task-group__title">{group.label}</strong>
                      </div>

                      <div className="board-task-group__stack">
                        {group.tasks.map((task) => (
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
                              <span>{group.label}</span>
                              <span>{task.workflowLabel}</span>
                              <span>{task.teamLabel}</span>
                            </div>
                            <div className="board-task-card__footer">
                              <span className="board-task-card__timestamp">{formatRelativeTimestamp(task.updated_at)}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))}

                  {column.groups.length === 0 ? (
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

        <div className="surface-panel surface-panel--workspace" data-testid="board-review-focus">
          <div className="board-focus__head">
            <div>
              <p className="page-kicker">{boardCopy.reviewFocusKicker}</p>
              <h3 className="section-title">{boardCopy.columns.gateWaiting}</h3>
            </div>
            <span className="status-pill status-pill--neutral">
              {reviewColumn?.groups.reduce((sum, group) => sum + group.tasks.length, 0) ?? 0}
            </span>
          </div>

          <div className="board-focus__stack">
            {reviewColumn && reviewColumn.groups.length > 0 ? (
              reviewColumn.groups.map((group) => (
                <section key={group.key} className="board-task-group">
                  <div className="board-task-group__header">
                    <span className="field-label">{boardCopy.projectFilterLabel}</span>
                    <strong className="board-task-group__title">{group.label}</strong>
                  </div>
                  <div className="board-task-group__stack">
                    {group.tasks.map((task) => (
                      <Link key={task.id} to={`/reviews?selected=${task.id}`} className="decision-card board-task-card board-task-card--focus">
                        <div className="board-task-card__meta">
                          <span className="type-mono-sm board-task-card__id">{task.id}</span>
                          <div className="board-task-card__badges">
                            <StateBadge state={task.state} />
                            <PriorityBadge priority={task.priority} />
                          </div>
                        </div>
                        <h4 className="board-task-card__title">{task.title}</h4>
                        <div className="board-task-card__support">
                          <span>{group.label}</span>
                          <span>{task.workflowLabel}</span>
                          <span>{task.teamLabel}</span>
                        </div>
                        <div className="board-task-card__footer">
                          <span className="board-task-card__timestamp">{formatRelativeTimestamp(task.updated_at)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
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
