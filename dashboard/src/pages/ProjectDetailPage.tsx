import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import * as api from '@/lib/api';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import { useProjectStore } from '@/stores/projectStore';
import { useTodoStore } from '@/stores/todoStore';
import type { ProjectCitizen, ProjectKnowledgeDoc, ProjectRecap } from '@/types/project';

type ProjectDetailSelection =
  | { kind: 'recap'; item: ProjectRecap }
  | { kind: 'knowledge'; item: ProjectKnowledgeDoc }
  | { kind: 'citizen'; item: ProjectCitizen };

const ACTIVE_TASK_STATES = ['active', 'in_progress', 'gate_waiting', 'paused', 'blocked'];

function summarizeDocument(content: string, fallback: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '---' && !line.startsWith('title:') && !line.startsWith('updated_at:'));
  return lines.find((line) => !line.startsWith('#')) ?? lines[0] ?? fallback;
}

function renderJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function ProjectDetailPage() {
  const copy = useProjectDetailPageCopy();
  const { projectId } = useParams<{ projectId: string }>();
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const error = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);
  const updateTodo = useTodoStore((state) => state.updateTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const promoteTodo = useTodoStore((state) => state.promoteTodo);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'review'>('all');
  const [todoFilter, setTodoFilter] = useState<'all' | 'pending'>('all');
  const [detailState, setDetailState] = useState<{
    projectId: string | null;
    selection: ProjectDetailSelection | null;
  }>({
    projectId: null,
    selection: null,
  });
  const [nomosActionPending, setNomosActionPending] = useState(false);
  const [nomosActionMessage, setNomosActionMessage] = useState<string | null>(null);

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

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

  const { project, recaps, knowledge, citizens } = selectedProject;
  const activeTasks = selectedProject.tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state)).length;
  const waitingReviewTasks = selectedProject.tasks.filter((task) => task.state === 'gate_waiting').length;
  const pendingTodos = selectedProject.todos.filter((todo) => todo.status === 'pending').length;
  const visibleTasks = taskFilter === 'review'
    ? selectedProject.tasks.filter((task) => task.state === 'gate_waiting')
    : taskFilter === 'active'
      ? selectedProject.tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state))
      : selectedProject.tasks;
  const visibleTodos = todoFilter === 'pending'
    ? selectedProject.todos.filter((todo) => todo.status === 'pending')
    : selectedProject.todos;
  const detailSelection = detailState.projectId === (projectId ?? null) ? detailState.selection : null;
  const nomos = selectedProject.nomos;

  const runNomosAction = async (mode: 'reinstall' | 'bootstrap') => {
    if (!projectId) {
      return;
    }
    setNomosActionPending(true);
    setNomosActionMessage(null);
    try {
      await api.installProjectNomos(projectId, {
        skip_bootstrap_task: mode === 'reinstall',
      });
      await selectProject(projectId);
      setNomosActionMessage(mode === 'reinstall' ? copy.nomosReinstallSuccess : copy.nomosBootstrapSuccess);
    } catch (error) {
      setNomosActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setNomosActionPending(false);
    }
  };

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
            </div>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.knowledge}</span>
              <span className="inline-stat__value">{knowledge.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.citizens}</span>
              <span className="inline-stat__value">{citizens.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.recaps}</span>
              <span className="inline-stat__value">{recaps.length}</span>
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

      {nomos ? (
        <section className="surface-panel surface-panel--workspace" data-testid="project-nomos-panel">
          <div className="section-title-row">
            <h3 className="section-title">{copy.nomosTitle}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('reinstall')}
              >
                {copy.reinstallNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('bootstrap')}
              >
                {copy.rerunBootstrapAction}
              </button>
            </div>
          </div>
          {nomosActionPending ? <div className="inline-alert mt-4">{copy.nomosActionPending}</div> : null}
          {nomosActionMessage ? <div className="inline-alert mt-4">{nomosActionMessage}</div> : null}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="field-label">{copy.nomosIdLabel}</p>
              <p className="type-body-sm break-all">{nomos.nomosId}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.repoPathLabel}</p>
              <p className="type-body-sm break-all">{nomos.repoPath ?? copy.emptySummary}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.projectStateRootLabel}</p>
              <p className="type-body-sm break-all">{nomos.projectStateRoot}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.bootstrapPromptsLabel}</p>
              <p className="type-body-sm break-all">{nomos.bootstrapPromptsDir}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.repoShimInstalledLabel}</p>
              <p className="type-body-sm">{nomos.repoShimInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.profileInstalledLabel}</p>
              <p className="type-body-sm">{nomos.profileInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <p className="field-label">{copy.lifecycleModulesLabel}</p>
              <p className="type-body-sm">{nomos.lifecycleModules.join(', ')}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-recaps-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.recapsTitle}</h3>
            </div>
            <div className="mt-5 space-y-3">
              {recaps.length === 0 ? <p className="type-body-sm">{copy.recapsEmpty}</p> : recaps.map((recap) => (
                <button
                  key={recap.taskId}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openRecapAria(recap.title ?? recap.taskId)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'recap', item: recap } })}
                >
                  <strong className="type-heading-sm">{recap.title ?? recap.taskId}</strong>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{recap.taskId}</span>
                    <span>{recap.updatedAt ?? '-'}</span>
                  </div>
                  <p className="type-body-sm mt-3 line-clamp-3">{summarizeDocument(recap.content, copy.documentFallback)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-knowledge-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.knowledgeTitle}</h3>
            </div>
            <div className="mt-5 space-y-3">
              {knowledge.length === 0 ? <p className="type-body-sm">{copy.knowledgeEmpty}</p> : knowledge.map((doc) => (
                <button
                  key={`${doc.kind}:${doc.slug}`}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openKnowledgeAria(doc.title ?? doc.slug)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'knowledge', item: doc } })}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{doc.title ?? doc.slug}</strong>
                    <span className="status-pill status-pill--neutral">{doc.kind}</span>
                  </div>
                  <p className="type-body-sm mt-3 line-clamp-3">{summarizeDocument(doc.content, copy.documentFallback)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-related-tasks-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.relatedTasksTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={taskFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('all')}
                >
                  {copy.taskFilters.all}
                </button>
                <button
                  type="button"
                  className={taskFilter === 'active' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('active')}
                >
                  {copy.taskFilters.active}
                </button>
                <button
                  type="button"
                  className={taskFilter === 'review' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('review')}
                >
                  {copy.taskFilters.review}
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {visibleTasks.length === 0 ? <p className="type-body-sm">{copy.relatedTasksEmpty}</p> : visibleTasks.map((task) => (
                <div key={task.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="type-heading-sm" to={`/tasks/${task.id}`}>{task.title}</Link>
                      <span className="status-pill status-pill--neutral">{task.state}</span>
                    </div>
                    <div className="type-text-xs mt-3">
                      <span>{task.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-citizens-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.citizensTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <Link className="button-secondary" to={`/tasks/new?project=${project.id}`}>{copy.createTaskAction}</Link>
                <Link className="button-secondary" to={`/todos?project=${project.id}`}>{copy.createTodoAction}</Link>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {citizens.length === 0 ? <p className="type-body-sm">{copy.citizensEmpty}</p> : citizens.map((citizen) => (
                <button
                  key={citizen.citizenId}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openCitizenAria(citizen.displayName)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'citizen', item: citizen } })}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{citizen.displayName}</strong>
                    <span className="status-pill status-pill--neutral">{citizen.status}</span>
                  </div>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{citizen.citizenId}</span>
                    <span>{citizen.roleId}</span>
                    <span>{citizen.runtimeAdapter}</span>
                    <span>{citizen.brainScaffoldMode}</span>
                  </div>
                  <p className="field-label mt-3">{copy.citizenPreviewLabel}</p>
                  {citizen.persona ? <p className="type-body-sm mt-3">{citizen.persona}</p> : null}
                  {citizen.boundaries.length > 0 ? (
                    <p className="type-text-xs mt-3">{citizen.boundaries.join(' / ')}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-related-todos-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.relatedTodosTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={todoFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTodoFilter('all')}
                >
                  {copy.todoFilters.all}
                </button>
                <button
                  type="button"
                  className={todoFilter === 'pending' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTodoFilter('pending')}
                >
                  {copy.todoFilters.pending}
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {visibleTodos.length === 0 ? <p className="type-body-sm">{copy.relatedTodosEmpty}</p> : visibleTodos.map((todo) => (
                <div key={todo.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{todo.text}</strong>
                      <span className="status-pill status-pill--neutral">{todo.status}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.markTodoDoneAction}
                      onClick={() => void updateTodo(todo.id, { status: todo.status === 'done' ? 'pending' : 'done' })}
                    >
                      {todo.status === 'done' ? copy.reopenTodoAction : copy.markTodoDoneAction}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.promoteTodoAction}
                      onClick={() => void promoteTodo(todo.id, { type: 'quick', creator: 'archon', priority: 'normal' })}
                    >
                      {copy.promoteTodoAction}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.deleteTodoAction}
                      onClick={() => void deleteTodo(todo.id)}
                    >
                      {copy.deleteTodoAction}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      {detailSelection?.kind === 'recap' ? (
        <WorkbenchDetailSheet
          label={copy.recapDialogLabel}
          title={detailSelection.item.title ?? detailSelection.item.taskId}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <span className="type-mono-sm">{detailSelection.item.taskId}</span>
            <p className="type-body-sm mt-3 break-all">{detailSelection.item.summaryPath}</p>
            <p className="type-text-xs mt-3">{detailSelection.item.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.recapContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{detailSelection.item.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}

      {detailSelection?.kind === 'knowledge' ? (
        <WorkbenchDetailSheet
          label={copy.knowledgeDialogLabel}
          title={detailSelection.item.title ?? detailSelection.item.slug}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-pill status-pill--neutral">{detailSelection.item.kind}</span>
              <span className="type-mono-sm">{detailSelection.item.slug}</span>
            </div>
            <p className="type-body-sm mt-3 break-all">{detailSelection.item.path}</p>
            <p className="type-text-xs mt-3">{detailSelection.item.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeSourceTasksTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.sourceTaskIds.join(', ') || copy.noSourceTasks}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{detailSelection.item.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}

      {detailSelection?.kind === 'citizen' ? (
        <WorkbenchDetailSheet
          label={copy.citizenDialogLabel}
          title={detailSelection.item.displayName}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-mono-sm">{detailSelection.item.citizenId}</span>
              <span className="status-pill status-pill--neutral">{detailSelection.item.status}</span>
            </div>
            <p className="type-body-sm mt-3">
              {detailSelection.item.roleId}
              {' / '}
              {detailSelection.item.runtimeAdapter}
              {' / '}
              {detailSelection.item.brainScaffoldMode}
            </p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.personaTitle}</h4>
            <p className="type-body-sm mt-4">{detailSelection.item.persona ?? copy.noPersona}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.boundariesTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.boundaries.join(' / ') || copy.noBoundaries}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.skillsTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.skillsRef.join(', ') || copy.noSkills}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.channelPoliciesTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(detailSelection.item.channelPolicies)}</pre>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.runtimeMetadataTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(detailSelection.item.runtimeMetadata)}</pre>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
