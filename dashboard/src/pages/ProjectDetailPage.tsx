import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import {
  formatWorkspaceTimestamp,
  humanizeWorkspaceFallback,
  summarizeProjectDocument,
} from '@/lib/projectWorkspaceUtils';
import { useProjectStore } from '@/stores/projectStore';
import { useTodoStore } from '@/stores/todoStore';

const ACTIVE_TASK_STATES = ['active', 'in_progress', 'gate_waiting', 'paused', 'blocked'];

export function ProjectDetailPage() {
  const copy = useProjectDetailPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const projectMembershipsByProject = useProjectStore((state) => state.projectMembershipsByProject ?? {});
  const fetchProjectMembers = useProjectStore((state) => state.fetchProjectMembers ?? (async () => undefined));
  const updateTodo = useTodoStore((state) => state.updateTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const promoteTodo = useTodoStore((state) => state.promoteTodo);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'review'>('all');
  const [todoFilter, setTodoFilter] = useState<'all' | 'pending'>('all');

  useEffect(() => {
    if (!projectId || projectMembershipsByProject[projectId]) {
      return;
    }
    void fetchProjectMembers(projectId).catch(() => undefined);
  }, [fetchProjectMembers, projectId, projectMembershipsByProject]);

  if (detailLoading) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{copy.loadingTitle}</p>
      </div>
    );
  }

  if (!selectedProject || !projectId) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{error ?? copy.notFoundTitle}</p>
      </div>
    );
  }

  const { project, overview, surfaces, work, operator } = selectedProject;
  const memberships = (projectMembershipsByProject[projectId] ?? []).filter((entry) => entry.status === 'active');
  const activeTasks = overview.stats.activeTaskCount;
  const waitingReviewTasks = overview.stats.reviewTaskCount;
  const pendingTodos = overview.stats.pendingTodoCount;
  const visibleTasks = taskFilter === 'review'
    ? work.tasks.filter((task) => task.state === 'gate_waiting')
    : taskFilter === 'active'
      ? work.tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state))
      : work.tasks;
  const visibleTodos = todoFilter === 'pending'
    ? work.todos.filter((todo) => todo.status === 'pending')
    : work.todos;
  const formatTaskState = (state: string) => copy.taskStateLabels[state as keyof typeof copy.taskStateLabels] ?? humanizeWorkspaceFallback(state);
  const formatTodoStatus = (status: string) => copy.todoStatusLabels[status as keyof typeof copy.todoStatusLabels] ?? humanizeWorkspaceFallback(status);

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{project.name}</h2>
            <p className="page-summary">{project.summary ?? copy.emptySummary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}/brain`}>{copy.openBrainAction}</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/knowledge`}>Knowledge</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/archive`}>Archive</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/operator`}>Operator</Link>
              <Link className="button-secondary" to={`/tasks/new?project=${project.id}`}>{copy.createTaskAction}</Link>
              <Link className="button-secondary" to={`/todos?project=${project.id}`}>{copy.createTodoAction}</Link>
            </div>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.knowledge}</span>
              <span className="inline-stat__value">{overview.stats.knowledgeCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.citizens}</span>
              <span className="inline-stat__value">{overview.stats.citizenCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.recaps}</span>
              <span className="inline-stat__value">{overview.stats.recapCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.activeTasks}</span>
              <span className="inline-stat__value">{activeTasks}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.waitingReview}</span>
              <span className="inline-stat__value">{waitingReviewTasks}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.pendingTodos}</span>
              <span className="inline-stat__value">{pendingTodos}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-overview-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.overviewTitle}</h3>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="field-label">{copy.ownerLabel}</p>
            <p className="type-body-sm">{overview.owner ?? copy.noneLabel}</p>
          </div>
          <div className="space-y-2">
            <p className="field-label">{copy.statusLabel}</p>
            <p className="type-body-sm">{humanizeWorkspaceFallback(overview.status)}</p>
          </div>
          <div className="space-y-2">
            <p className="field-label">{copy.updatedLabel}</p>
            <p className="type-body-sm">{formatWorkspaceTimestamp(overview.updatedAt)}</p>
          </div>
          <div className="space-y-2">
            <p className="field-label">{copy.repoBoundLabel}</p>
            <p className="type-body-sm">{operator.repoPath ? copy.yesLabel : copy.noLabel}</p>
          </div>
          <div className="space-y-2 lg:col-span-2" data-testid="project-members-panel">
            <p className="field-label">{copy.membersTitle}</p>
            {memberships.length === 0 ? (
              <p className="type-body-sm">{copy.membersEmpty}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {memberships.map((membership) => (
                  <span key={membership.id} className="status-pill status-pill--neutral">
                    {`#${membership.accountId} · ${membership.role}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-surfaces-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.surfacesTitle}</h3>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{surfaces.index?.title ?? 'Project Index'}</strong>
            <p className="type-body-sm">{summarizeProjectDocument(surfaces.index?.content ?? '', copy.emptySurface)}</p>
            <p className="type-text-xs break-all">{copy.surfacePathLabel}: {surfaces.index?.path ?? copy.noneLabel}</p>
            <p className="type-text-xs">{copy.surfaceUpdatedLabel}: {formatWorkspaceTimestamp(surfaces.index?.updatedAt)}</p>
          </div>
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{surfaces.timeline?.title ?? 'Project Timeline'}</strong>
            <p className="type-body-sm">{summarizeProjectDocument(surfaces.timeline?.content ?? '', copy.emptySurface)}</p>
            <p className="type-text-xs break-all">{copy.surfacePathLabel}: {surfaces.timeline?.path ?? copy.noneLabel}</p>
            <p className="type-text-xs">{copy.surfaceSourceTasksLabel}: {surfaces.timeline?.sourceTaskIds.join(', ') || copy.noSourceTasks}</p>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-current-work-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.workTitle}</h3>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <section data-testid="project-related-tasks-panel">
              <div className="section-title-row">
                <h4 className="section-title">{copy.relatedTasksTitle}</h4>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={taskFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('all')}>{copy.taskFilters.all}</button>
                  <button type="button" className={taskFilter === 'active' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('active')}>{copy.taskFilters.active}</button>
                  <button type="button" className={taskFilter === 'review' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('review')}>{copy.taskFilters.review}</button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {visibleTasks.length === 0 ? <p className="type-body-sm">{copy.relatedTasksEmpty}</p> : visibleTasks.map((task) => (
                  <div key={task.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="type-heading-sm" to={buildProjectTaskHref(task.id, project.id)}>{task.title}</Link>
                        <span className="status-pill status-pill--neutral">{formatTaskState(task.state)}</span>
                      </div>
                      <div className="type-text-xs mt-3">
                        <span>{task.id}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section data-testid="project-related-todos-panel">
              <div className="section-title-row">
                <h4 className="section-title">{copy.relatedTodosTitle}</h4>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={todoFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTodoFilter('all')}>{copy.todoFilters.all}</button>
                  <button type="button" className={todoFilter === 'pending' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTodoFilter('pending')}>{copy.todoFilters.pending}</button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {visibleTodos.length === 0 ? <p className="type-body-sm">{copy.relatedTodosEmpty}</p> : visibleTodos.map((todo) => (
                  <div key={todo.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="type-heading-sm">{todo.text}</strong>
                        <span className="status-pill status-pill--neutral">{formatTodoStatus(todo.status)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="button-secondary" aria-label={copy.markTodoDoneAction} onClick={() => void updateTodo(todo.id, { status: todo.status === 'done' ? 'pending' : 'done' })}>
                        {todo.status === 'done' ? copy.reopenTodoAction : copy.markTodoDoneAction}
                      </button>
                      <button type="button" className="button-secondary" aria-label={copy.promoteTodoAction} onClick={() => void promoteTodo(todo.id, { type: 'quick', creator: 'archon', priority: 'normal' })}>
                        {copy.promoteTodoAction}
                      </button>
                      <button type="button" className="button-secondary" aria-label={copy.deleteTodoAction} onClick={() => void deleteTodo(todo.id)}>
                        {copy.deleteTodoAction}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section data-testid="project-workspace-handoffs-panel">
              <div className="section-title-row">
                <h4 className="section-title">Workspace Handoffs</h4>
              </div>
              <div className="mt-5 grid gap-3">
                <Link className="selection-card text-left" to={`/projects/${project.id}/knowledge`}>
                  <strong className="type-heading-sm">Knowledge</strong>
                  <p className="type-body-sm mt-3">{overview.stats.knowledgeCount} durable knowledge documents and project surfaces.</p>
                </Link>
                <Link className="selection-card text-left" to={`/projects/${project.id}/archive`}>
                  <strong className="type-heading-sm">Archive</strong>
                  <p className="type-body-sm mt-3">{overview.stats.recapCount} recap artifacts ready for closeout and archive review.</p>
                </Link>
                <Link className="selection-card text-left" to={`/projects/${project.id}/operator`}>
                  <strong className="type-heading-sm">Operator</strong>
                  <p className="type-body-sm mt-3">{operator.citizens.length} citizens and Nomos controls moved into the operator workspace.</p>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
