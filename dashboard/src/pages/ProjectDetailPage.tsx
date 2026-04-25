import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { ProjectRuntimePolicyPanel } from '@/components/project/ProjectRuntimePolicyPanel';
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
import type { ProjectKnowledgeDoc, ProjectRecap, ProjectTaskSummary, ProjectTodoSummary } from '@/types/project';

const ACTIVE_TASK_STATES = ['active', 'in_progress', 'gate_waiting', 'paused', 'blocked'];

function fillStyle(percent: number): CSSProperties {
  return { '--fill': `${percent}%` } as CSSProperties;
}

function clampMetric(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function buildPosture(activeTasks: number, waitingReviewTasks: number, pendingTodos: number) {
  if (waitingReviewTasks > 0) {
    return {
      label: 'Review pending',
      tone: 'warn',
      summary: `${waitingReviewTasks} task${waitingReviewTasks === 1 ? '' : 's'} waiting for governance review.`,
    };
  }
  if (pendingTodos > 0) {
    return {
      label: 'Action needed',
      tone: 'info',
      summary: `${pendingTodos} todo${pendingTodos === 1 ? '' : 's'} still open in the project queue.`,
    };
  }
  if (activeTasks > 0) {
    return {
      label: 'On track',
      tone: 'good',
      summary: `${activeTasks} active task${activeTasks === 1 ? '' : 's'} moving through the orchestrator.`,
    };
  }
  return {
    label: 'Quiet',
    tone: 'neutral',
    summary: 'No active tasks are currently attached to this project.',
  };
}

function pickPrimaryTask(tasks: ProjectTaskSummary[]) {
  return tasks.find((task) => task.state === 'gate_waiting')
    ?? tasks.find((task) => ACTIVE_TASK_STATES.includes(task.state))
    ?? tasks[0]
    ?? null;
}

function buildWorkstreams(tasks: ProjectTaskSummary[]) {
  const groups = new Map<string, ProjectTaskSummary[]>();
  for (const task of tasks) {
    const label = humanizeWorkspaceFallback(task.state);
    groups.set(label, [...(groups.get(label) ?? []), task]);
  }
  return Array.from(groups.entries()).slice(0, 4).map(([label, entries]) => ({
    label,
    count: entries.length,
    sample: entries[0]?.title ?? label,
  }));
}

function buildRecentEvents(
  projectUpdatedAt: string,
  tasks: ProjectTaskSummary[],
  todos: ProjectTodoSummary[],
  knowledge: ProjectKnowledgeDoc[],
  recaps: ProjectRecap[],
) {
  const events = [
    ...tasks.slice(0, 2).map((task) => ({
      title: task.title,
      meta: `Task ${humanizeWorkspaceFallback(task.state)}`,
    })),
    ...todos.slice(0, 1).map((todo) => ({
      title: `Todo: ${todo.text}`,
      meta: `Todo ${humanizeWorkspaceFallback(todo.status)}`,
    })),
    ...knowledge.slice(0, 1).map((doc) => ({
      title: doc.title,
      meta: `Knowledge ${humanizeWorkspaceFallback(doc.kind)}`,
    })),
    ...recaps.slice(0, 1).map((recap) => ({
      title: recap.title,
      meta: `Recap ${formatWorkspaceTimestamp(recap.updatedAt)}`,
    })),
  ];

  if (events.length > 0) {
    return events.slice(0, 5);
  }

  return [{
    title: 'Project workbench synced',
    meta: formatWorkspaceTimestamp(projectUpdatedAt),
  }];
}

export function ProjectDetailPage() {
  const copy = useProjectDetailPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const projectMembershipsByProject = useProjectStore((state) => state.projectMembershipsByProject ?? {});
  const fetchProjectMembers = useProjectStore((state) => state.fetchProjectMembers ?? (async () => undefined));
  const selectProject = useProjectStore((state) => state.selectProject);
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
      <div className="surface-panel surface-panel--workspace surface-panel--context-anchor">
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
  const projectRoles = Array.from(new Set(operator.citizens.map((citizen) => citizen.roleId)));
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
  const totalWorkSignals = Math.max(overview.stats.taskCount + overview.stats.todoCount + overview.stats.knowledgeCount + overview.stats.recapCount, 1);
  const posture = buildPosture(activeTasks, waitingReviewTasks, pendingTodos);
  const primaryTask = pickPrimaryTask(work.tasks);
  const governanceQueue = work.tasks.filter((task) => task.state === 'gate_waiting').slice(0, 4);
  const keyReferences = [
    surfaces.index,
    surfaces.timeline,
    ...work.knowledge,
    ...work.recaps.map((recap) => ({
      kind: 'recap' as const,
      slug: recap.taskId,
      title: recap.title,
      path: recap.summaryPath,
      content: recap.content,
      sourceTaskIds: [recap.taskId],
      updatedAt: recap.updatedAt,
    })),
  ].filter(Boolean).slice(0, 5);
  const workstreams = buildWorkstreams(work.tasks);
  const recentEvents = buildRecentEvents(overview.updatedAt, work.tasks, work.todos, work.knowledge, work.recaps);
  const healthMetrics = [
    { label: copy.executionLabel, value: activeTasks, percent: clampMetric(activeTasks, Math.max(overview.stats.taskCount, 1)) },
    { label: copy.governanceQueueTitle, value: waitingReviewTasks, percent: clampMetric(waitingReviewTasks, Math.max(overview.stats.taskCount, 1)) },
    { label: copy.contextLabel, value: overview.stats.knowledgeCount + overview.stats.recapCount, percent: clampMetric(overview.stats.knowledgeCount + overview.stats.recapCount, totalWorkSignals) },
    { label: copy.stats.pendingTodos, value: pendingTodos, percent: clampMetric(pendingTodos, Math.max(overview.stats.todoCount, 1)) },
  ];
  const refreshProject = () => selectProject(project.id).catch(() => undefined);
  const toggleTodoStatus = async (todo: ProjectTodoSummary) => {
    await updateTodo(todo.id, { status: todo.status === 'done' ? 'pending' : 'done' });
    await refreshProject();
  };
  const promoteProjectTodo = async (todo: ProjectTodoSummary) => {
    await promoteTodo(todo.id, { type: 'quick', creator: 'archon', priority: 'normal' });
    await refreshProject();
  };
  const deleteProjectTodo = async (todo: ProjectTodoSummary) => {
    await deleteTodo(todo.id);
    await refreshProject();
  };

  return (
    <div className="project-overview-page project-workspace-mgo interior-page">
      <section className="project-workspace-mgo__hero surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div className="project-workspace-mgo__hero-grid">
          <div className="project-workspace-mgo__hero-copy">
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{project.name}</h2>
            <p className="page-summary">{project.summary ?? copy.emptySummary}</p>
            <div className="project-workspace-mgo__meta">
              <span>{copy.ownerLabel}: {overview.owner ?? copy.noneLabel}</span>
              <span>{copy.statusLabel}: {humanizeWorkspaceFallback(overview.status)}</span>
              <span>{copy.updatedLabel}: {formatWorkspaceTimestamp(overview.updatedAt)}</span>
            </div>
            <div className="project-overview-actions">
              <Link className="button-secondary" to={`/projects/${project.id}/context`}>{copy.openBrainAction}</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/knowledge`}>{copy.openKnowledgeAction}</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/archive`}>{copy.openArchiveAction}</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/operator`}>{copy.openOperatorAction}</Link>
              <Link className="button-secondary" to={`/tasks/new?project=${project.id}`}>{copy.createTaskAction}</Link>
              <Link className="button-secondary" to={`/todos?project=${project.id}`}>{copy.createTodoAction}</Link>
            </div>
          </div>

          <div className="project-workspace-mgo__orbit" aria-label={copy.signalMapLabel}>
            <div className="project-workspace-mgo__orbit-ring project-workspace-mgo__orbit-ring--outer" aria-hidden="true" />
            <div className="project-workspace-mgo__orbit-ring project-workspace-mgo__orbit-ring--middle" aria-hidden="true" />
            <div className="project-workspace-mgo__orbit-core">
              <strong>{overview.stats.taskCount}</strong>
              <span>{copy.tasksOrbitLabel}</span>
            </div>
            <span className="project-workspace-mgo__orbit-dot project-workspace-mgo__orbit-dot--task" aria-label={copy.stats.activeTasks}>{activeTasks}</span>
            <span className="project-workspace-mgo__orbit-dot project-workspace-mgo__orbit-dot--review" aria-label={copy.stats.waitingReview}>{waitingReviewTasks}</span>
            <span className="project-workspace-mgo__orbit-dot project-workspace-mgo__orbit-dot--context" aria-label={copy.stats.knowledge}>{overview.stats.knowledgeCount}</span>
          </div>

          <aside className={`project-workspace-mgo__posture project-workspace-mgo__posture--${posture.tone}`}>
            <p className="field-label">{copy.projectPostureTitle}</p>
            <strong>{posture.label}</strong>
            <p>{posture.summary}</p>
            <div className="project-workspace-mgo__posture-grid">
              <span>
                <small>{copy.riskLabel}</small>
                <b>{waitingReviewTasks}</b>
              </span>
              <span>
                <small>{copy.executionLabel}</small>
                <b>{activeTasks}</b>
              </span>
              <span>
                <small>{copy.contextLabel}</small>
                <b>{overview.stats.knowledgeCount + overview.stats.recapCount}</b>
              </span>
            </div>
            <div className="project-workspace-mgo__next">
              <span>{copy.nextMilestoneLabel}</span>
              <strong>{primaryTask?.title ?? copy.relatedTasksEmpty}</strong>
            </div>
          </aside>
        </div>

        <div className="workbench-masthead__signals project-overview-signals project-workspace-mgo__signals">
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
      </section>

      <section className="project-workspace-mgo__overview-grid" data-testid="project-overview-panel">
        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__queue">
          <div className="section-title-row">
            <h3 className="section-title">{copy.governanceQueueTitle}</h3>
            <span className="status-pill status-pill--neutral">{waitingReviewTasks}</span>
          </div>
          <div className="project-list-stack">
            {governanceQueue.length === 0 ? (
              <p className="type-body-sm">{copy.governanceQueueEmpty}</p>
            ) : governanceQueue.map((task) => (
              <Link
                key={task.id}
                className="data-row project-workspace-mgo__queue-row"
                to={buildProjectTaskHref(task.id, project.id)}
                aria-label={`Open governance task ${task.title}`}
              >
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.id}</small>
                </span>
                <b>{humanizeWorkspaceFallback(task.state)}</b>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__current">
          <div className="section-title-row">
            <h3 className="section-title">{copy.workTitle}</h3>
            <span className="status-pill status-pill--neutral">{copy.activeCountLabel(activeTasks)}</span>
          </div>
          {primaryTask ? (
            <div className="project-workspace-mgo__active-task">
              <p className="field-label">{copy.primaryThreadLabel}</p>
              <Link
                className="type-heading-sm"
                to={buildProjectTaskHref(primaryTask.id, project.id)}
                aria-label={`Open primary task ${primaryTask.title}`}
              >
                {primaryTask.title}
              </Link>
              <span className="status-pill status-pill--neutral">{humanizeWorkspaceFallback(primaryTask.state)}</span>
              <div className="project-workspace-mgo__progress">
                <span style={fillStyle(clampMetric(activeTasks + waitingReviewTasks, Math.max(overview.stats.taskCount, 1)))} />
              </div>
              <p className="type-text-xs">{copy.currentWorkSummary(overview.stats.taskCount, pendingTodos)}</p>
            </div>
          ) : (
            <p className="type-body-sm">{copy.relatedTasksEmpty}</p>
          )}
          <div className="project-workspace-mgo__workstream-list">
            {workstreams.length === 0 ? (
              <p className="type-text-xs">{copy.workstreamsEmpty}</p>
            ) : workstreams.map((stream) => (
              <div key={stream.label} className="project-workspace-mgo__workstream">
                <span>
                  <strong>{stream.label}</strong>
                  <small>{stream.sample}</small>
                </span>
                <b>{stream.count}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__health">
          <div className="section-title-row">
            <h3 className="section-title">{copy.signalCompositionTitle}</h3>
          </div>
          <div className="project-workspace-mgo__health-bars">
            {healthMetrics.map((metric) => (
              <div key={metric.label} className="project-workspace-mgo__health-row">
                <span>{metric.label}</span>
                <div><i style={fillStyle(metric.percent)} data-empty={metric.percent === 0 ? 'true' : 'false'} /></div>
                <b>{metric.value}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__refs" data-testid="project-surfaces-panel">
          <div className="section-title-row">
            <h3 className="section-title">{copy.surfacesTitle}</h3>
          </div>
          <div className="project-list-stack">
            {keyReferences.length === 0 ? (
              <p className="type-body-sm">{copy.emptySurface}</p>
            ) : keyReferences.map((reference, index) => (
              <div key={`${reference?.title ?? 'reference'}-${index}`} className="selection-card space-y-2">
                <strong className="type-heading-sm">{reference?.title ?? copy.documentFallback}</strong>
                <p className="type-body-sm">{summarizeProjectDocument(reference?.content ?? '', copy.emptySurface)}</p>
                <p className="type-text-xs break-all">{copy.surfacePathLabel}: {reference?.path ?? copy.noneLabel}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__events">
          <div className="section-title-row">
            <h3 className="section-title">{copy.recentSignalsTitle}</h3>
          </div>
          <div className="project-workspace-mgo__timeline">
            {recentEvents.map((event, index) => (
              <div key={`${event.title}-${index}`} className="project-workspace-mgo__timeline-row">
                <span />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace project-workspace-mgo__card project-workspace-mgo__runtime">
          <div className="section-title-row">
            <h3 className="section-title">{copy.runtimeTruthTitle}</h3>
          </div>
          <div className="project-workspace-mgo__truth-grid">
            <span>
              <small>{copy.repoBoundLabel}</small>
              <b>{operator.repoPath ? copy.yesLabel : copy.noLabel}</b>
            </span>
            <span>
              <small>{copy.nomosIdLabel}</small>
              <b>{operator.nomosId ?? copy.noneLabel}</b>
            </span>
            <span>
              <small>{copy.citizenCountLabel}</small>
              <b>{operator.citizens.length}</b>
            </span>
            <span>
              <small>{copy.membersTitle}</small>
              <b>{memberships.length}</b>
            </span>
          </div>
          <div className="project-inline-actions" data-testid="project-members-panel">
            {memberships.length === 0 ? (
              <span className="type-body-sm">{copy.membersEmpty}</span>
            ) : memberships.map((membership) => (
              <span key={membership.id} className="status-pill status-pill--neutral">
                {`#${membership.accountId} · ${membership.role}`}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace project-workspace-mgo__bottom" data-testid="project-current-work-panel">
        <div>
          <p className="field-label">{copy.nextUpLabel}</p>
          <strong>{primaryTask?.title ?? copy.relatedTasksEmpty}</strong>
        </div>
        <div>
          <p className="field-label">{copy.focusContextLabel}</p>
          <strong>{surfaces.index?.title ?? surfaces.timeline?.title ?? copy.emptySurface}</strong>
        </div>
        <div>
          <p className="field-label">{copy.activeAgentsLabel}</p>
          <strong>{operator.citizens.filter((citizen) => citizen.status === 'active').length} / {operator.citizens.length}</strong>
        </div>
        <div>
          <p className="field-label">{copy.projectTimeLabel}</p>
          <strong>{formatWorkspaceTimestamp(overview.updatedAt)}</strong>
        </div>
        <Link className="button-primary" to={`/projects/${project.id}/work`}>{copy.openCurrentWorkAction}</Link>
      </section>

      <section className="surface-panel surface-panel--workspace project-workspace-mgo__legacy-work">
        <div className="section-title-row">
          <h3 className="section-title">{copy.overviewTitle}</h3>
        </div>
        <div className="project-current-work-grid">
          <div className="space-y-6">
            <section data-testid="project-related-tasks-panel">
              <div className="section-title-row">
                <h4 className="section-title">{copy.relatedTasksTitle}</h4>
                <div className="project-inline-actions">
                  <button type="button" className={taskFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('all')}>{copy.taskFilters.all}</button>
                  <button type="button" className={taskFilter === 'active' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('active')}>{copy.taskFilters.active}</button>
                  <button type="button" className={taskFilter === 'review' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTaskFilter('review')}>{copy.taskFilters.review}</button>
                </div>
              </div>
              <div className="project-list-stack">
                {visibleTasks.length === 0 ? <p className="type-body-sm">{copy.relatedTasksEmpty}</p> : visibleTasks.map((task) => (
                  <div key={task.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="project-row-titleline">
                        <Link className="type-heading-sm" to={buildProjectTaskHref(task.id, project.id)}>{task.title}</Link>
                        <span className="status-pill status-pill--neutral">{formatTaskState(task.state)}</span>
                      </div>
                      <div className="type-text-xs project-row-meta">
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
                <div className="project-inline-actions">
                  <button type="button" className={todoFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTodoFilter('all')}>{copy.todoFilters.all}</button>
                  <button type="button" className={todoFilter === 'pending' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setTodoFilter('pending')}>{copy.todoFilters.pending}</button>
                </div>
              </div>
              <div className="project-list-stack">
                {visibleTodos.length === 0 ? <p className="type-body-sm">{copy.relatedTodosEmpty}</p> : visibleTodos.map((todo) => (
                  <div key={todo.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="project-row-titleline">
                        <strong className="type-heading-sm">{todo.text}</strong>
                        <span className="status-pill status-pill--neutral">{formatTodoStatus(todo.status)}</span>
                      </div>
                    </div>
                    <div className="project-inline-actions">
                      <button type="button" className="button-secondary" aria-label={copy.markTodoDoneAction} onClick={() => void toggleTodoStatus(todo)}>
                        {todo.status === 'done' ? copy.reopenTodoAction : copy.markTodoDoneAction}
                      </button>
                      <button type="button" className="button-secondary" aria-label={copy.promoteTodoAction} onClick={() => void promoteProjectTodo(todo)}>
                        {copy.promoteTodoAction}
                      </button>
                      <button type="button" className="button-secondary" aria-label={copy.deleteTodoAction} onClick={() => void deleteProjectTodo(todo)}>
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
                <h4 className="section-title">{copy.workspaceHandoffsTitle}</h4>
              </div>
              <div className="project-list-stack">
                <Link className="selection-card text-left" to={`/projects/${project.id}/knowledge`}>
                  <strong className="type-heading-sm">{copy.knowledgeSurfaceTitle}</strong>
                  <p className="type-body-sm project-card-copy">{copy.workspaceHandoffsKnowledgeSummary(overview.stats.knowledgeCount)}</p>
                </Link>
                <Link className="selection-card text-left" to={`/projects/${project.id}/archive`}>
                  <strong className="type-heading-sm">{copy.archiveSurfaceTitle}</strong>
                  <p className="type-body-sm project-card-copy">{copy.workspaceHandoffsArchiveSummary(overview.stats.recapCount)}</p>
                </Link>
                <Link className="selection-card text-left" to={`/projects/${project.id}/operator`}>
                  <strong className="type-heading-sm">{copy.operatorSurfaceTitle}</strong>
                  <p className="type-body-sm project-card-copy">{copy.workspaceHandoffsOperatorSummary(operator.citizens.length)}</p>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </section>

      <ProjectRuntimePolicyPanel projectId={project.id} roles={projectRoles} />
    </div>
  );
}
