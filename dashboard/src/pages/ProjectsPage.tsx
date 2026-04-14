import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import * as api from '@/lib/api';
import { useProjectsPageCopy } from '@/lib/dashboardCopy';
import {
  filterProjectsForWorkbench,
  pickProjectsPageSelection,
  sortProjectsForWorkbench,
  type ProjectsPageSortKey,
  writeProjectsPageSelection,
} from '@/lib/projectsWorkbenchList';
import { mapProjectWorkbenchDto, mapWorkspaceBootstrapStatusDto } from '@/lib/projectMappers';
import { useProjectStore } from '@/stores/projectStore';
import type { ProjectWorkbench, WorkspaceBootstrapStatus } from '@/types/project';

function parseAccountIds(value: string) {
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function formatUpdatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

function buildProjectCache(workbench: ProjectWorkbench | null) {
  if (!workbench) {
    return null;
  }
  return {
    ...workbench,
    nomos: workbench.nomos ?? null,
  };
}

export function ProjectsPage() {
  const copy = useProjectsPageCopy();
  const navigate = useNavigate();
  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const creating = useProjectStore((state) => state.creating);
  const error = useProjectStore((state) => state.error);
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const createProject = useProjectStore((state) => state.createProject);
  const selectProject = useProjectStore((state) => state.selectProject);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [adminAccountIds, setAdminAccountIds] = useState('');
  const [memberAccountIds, setMemberAccountIds] = useState('');
  const [workspaceBootstrap, setWorkspaceBootstrap] = useState<WorkspaceBootstrapStatus | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ProjectsPageSortKey>('updated');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => pickProjectsPageSelection(projects, 'updated'));
  const [briefingsByProject, setBriefingsByProject] = useState<Record<string, ProjectWorkbench>>({});
  const prefetchingProjectIdsRef = useRef<Set<string>>(new Set());
  const projectsPageMountedRef = useRef(true);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    let active = true;
    void api.getWorkspaceBootstrapStatus()
      .then((response) => {
        if (!active) {
          return;
        }
        setWorkspaceBootstrap(mapWorkspaceBootstrapStatusDto(response));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setWorkspaceBootstrap(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    projectsPageMountedRef.current = false;
  }, []);

  useEffect(() => {
    const cachedProject = buildProjectCache(selectedProject);
    if (!cachedProject) {
      return;
    }
    setBriefingsByProject((current) => {
      if (current[cachedProject.project.id] === cachedProject) {
        return current;
      }
      return {
        ...current,
        [cachedProject.project.id]: cachedProject,
      };
    });
  }, [selectedProject]);

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }

    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) {
        return current;
      }
      return pickProjectsPageSelection(projects, sortKey, briefingsByProject);
    });
  }, [briefingsByProject, projects, sortKey]);

  const filteredProjects = useMemo(
    () => filterProjectsForWorkbench(projects, query),
    [projects, query],
  );
  const visibleProjects = useMemo(
    () => sortProjectsForWorkbench(filteredProjects, sortKey, briefingsByProject),
    [briefingsByProject, filteredProjects, sortKey],
  );

  useEffect(() => {
    if (!visibleProjects.length) {
      return;
    }
    if (!selectedProjectId || !visibleProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(visibleProjects[0].id);
    }
  }, [selectedProjectId, visibleProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      void selectProject(null);
      writeProjectsPageSelection(null);
      return;
    }
    writeProjectsPageSelection(selectedProjectId);
    void selectProject(selectedProjectId);
  }, [selectedProjectId, selectProject]);

  useEffect(() => {
    const projectsToPrefetch = projects.filter((project) => (
      !briefingsByProject[project.id] && !prefetchingProjectIdsRef.current.has(project.id)
    ));
    if (!projectsToPrefetch.length) {
      return;
    }

    for (const project of projectsToPrefetch) {
      prefetchingProjectIdsRef.current.add(project.id);
    }

    void Promise.allSettled(projectsToPrefetch.map(async (project) => ({
      projectId: project.id,
      workbench: buildProjectCache(mapProjectWorkbenchDto(await api.getProjectWorkbench(project.id))),
    }))).then((results) => {
      if (!projectsPageMountedRef.current) {
        return;
      }

      setBriefingsByProject((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.workbench) {
            next[result.value.projectId] = result.value.workbench;
            continue;
          }

          if (result.status === 'fulfilled') {
            prefetchingProjectIdsRef.current.delete(result.value.projectId);
          }
        }
        return next;
      });

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          prefetchingProjectIdsRef.current.delete(projectsToPrefetch[index]?.id ?? '');
          return;
        }
        if (!result.value.workbench) {
          prefetchingProjectIdsRef.current.delete(result.value.projectId);
        }
      });
    }).catch(() => {
      for (const project of projectsToPrefetch) {
        prefetchingProjectIdsRef.current.delete(project.id);
      }
    });
  }, [briefingsByProject, projects]);

  const previewProject = selectedProjectId
    ? (selectedProject?.project.id === selectedProjectId
        ? selectedProject
        : briefingsByProject[selectedProjectId] ?? null)
    : null;
  const previewLoading = Boolean(selectedProjectId) && (detailLoading || !previewProject);

  const submitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      const adminIds = parseAccountIds(adminAccountIds);
      const memberIds = parseAccountIds(memberAccountIds);
      await createProject({
        name: name.trim(),
        owner: 'archon',
        summary: summary.trim() || null,
        admins: adminIds.map((account_id) => ({ account_id })),
        members: memberIds
          .filter((account_id) => !adminIds.includes(account_id))
          .map((account_id) => ({ account_id, role: 'member' as const })),
      });
      setName('');
      setSummary('');
      setAdminAccountIds('');
      setMemberAccountIds('');
      setShowCreate(false);
    } catch {
      // visible error is handled by the store state
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals projects-page__masthead-signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.countLabel}</span>
              <span className="inline-stat__value">{projects.length}</span>
            </div>
            {workspaceBootstrap && !workspaceBootstrap.bootstrapCompleted ? (
              <button
                type="button"
                className="button-secondary projects-page__bootstrap-action"
                onClick={() => navigate('/workspace/bootstrap')}
              >
                {copy.workspaceBootstrapAction}
              </button>
            ) : null}
            <button type="button" className="button-secondary" onClick={() => setShowCreate((value) => !value)}>
              {copy.createToggleAction}
            </button>
          </div>
        </div>
        {workspaceBootstrap && !workspaceBootstrap.bootstrapCompleted ? (
          <div className="projects-page__bootstrap-hint">
            <span className="status-pill status-pill--neutral">{copy.workspaceBootstrapHintLabel}</span>
            <p className="type-body-sm">{copy.workspaceBootstrapSummary}</p>
          </div>
        ) : null}
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      {showCreate ? (
        <section className="surface-panel surface-panel--workspace" data-testid="projects-create-panel">
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitProject}>
            <label className="space-y-2">
              <span className="field-label">{copy.nameLabel}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input-shell"
                placeholder={copy.namePlaceholder}
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="field-label">{copy.summaryLabel}</span>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="input-shell min-h-24"
                placeholder={copy.summaryPlaceholder}
              />
            </label>
            <label className="space-y-2">
              <span className="field-label">{copy.adminAccountsLabel}</span>
              <input
                value={adminAccountIds}
                onChange={(event) => setAdminAccountIds(event.target.value)}
                className="input-shell"
                placeholder={copy.adminAccountsPlaceholder}
              />
            </label>
            <label className="space-y-2">
              <span className="field-label">{copy.memberAccountsLabel}</span>
              <input
                value={memberAccountIds}
                onChange={(event) => setMemberAccountIds(event.target.value)}
                className="input-shell"
                placeholder={copy.memberAccountsPlaceholder}
              />
            </label>
            <div className="lg:col-span-2">
              <button type="submit" className="button-primary" disabled={creating}>
                {creating ? copy.creatingAction : copy.confirmAction}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="workbench-grid workbench-grid--page projects-page__grid">
        <section className="workbench-pane" data-testid="projects-list-panel">
          <div className="projects-page__pane-header">
            <div>
              <h3 className="section-title">{copy.poolTitle}</h3>
              <p className="page-summary">{copy.poolSummary}</p>
            </div>
            <div className="projects-page__controls">
              <label className="space-y-2">
                <span className="field-label">{copy.searchLabel}</span>
                <input
                  aria-label={copy.searchLabel}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="input-shell"
                  placeholder={copy.searchPlaceholder}
                />
              </label>
              <label className="space-y-2">
                <span className="field-label">{copy.sortLabel}</span>
                <select
                  aria-label={copy.sortLabel}
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as ProjectsPageSortKey)}
                  className="input-shell"
                >
                  <option value="updated">{copy.sortOptions.updated}</option>
                  <option value="tasks">{copy.sortOptions.tasks}</option>
                  <option value="todos">{copy.sortOptions.todos}</option>
                  <option value="name">{copy.sortOptions.name}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="workbench-scroll workbench-scroll--list projects-page__pool-scroll">
            {loading ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.loadingTitle}</p>
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{query ? copy.filteredEmptyTitle : copy.emptyTitle}</p>
              </div>
            ) : (
              <div className="dense-list">
                {visibleProjects.map((project) => {
                  const stats = briefingsByProject[project.id]?.overview.stats ?? null;
                  const isActive = project.id === selectedProjectId;

                  return (
                    <article key={project.id} className={`dense-row${isActive ? ' dense-row--active' : ''}`}>
                      <button
                        type="button"
                        className="projects-page__row-button"
                        aria-label={copy.selectProjectAction(project.name)}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <div className="dense-row__main">
                          <div className="dense-row__titleblock">
                            <span className="dense-row__title">{project.name}</span>
                            <span className="status-pill status-pill--neutral">{project.status}</span>
                            <span className="status-pill status-pill--neutral">
                              {project.repoPath ? copy.repoBoundLabel : copy.noRepoLabel}
                            </span>
                            <span className="status-pill status-pill--neutral">
                              {project.nomosId ? `${copy.nomosLabel}: ${project.nomosId}` : copy.noNomosLabel}
                            </span>
                          </div>
                          <div className="dense-row__meta">
                            <span>{project.id}</span>
                            <span>{project.owner || copy.ownerFallback}</span>
                            <span>{formatUpdatedAt(project.updatedAt)}</span>
                          </div>
                          <p className="projects-page__row-summary">{project.summary || copy.summaryFallback}</p>
                          <div className="projects-page__row-signals">
                            <span>{stats ? copy.metricValues.tasks(stats.taskCount) : copy.metricValues.tasksPending}</span>
                            <span>{stats ? copy.metricValues.active(stats.activeTaskCount) : copy.metricValues.activePending}</span>
                            <span>{stats ? copy.metricValues.review(stats.reviewTaskCount) : copy.metricValues.reviewPending}</span>
                            <span>{stats ? copy.metricValues.todos(stats.pendingTodoCount) : copy.metricValues.todosPending}</span>
                          </div>
                        </div>
                      </button>
                      <div className="projects-page__row-aside">
                        <Link to={`/projects/${project.id}`} className="button-secondary">
                          {copy.openWorkspaceAction}
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="workbench-pane workbench-pane--inspector" data-testid="projects-preview-pane">
          {previewLoading ? (
            <div className="empty-state projects-page__preview-empty">
              <p className="type-body-sm">{copy.previewLoadingTitle}</p>
            </div>
          ) : previewProject ? (
            <div className="projects-page__preview">
              <div className="inspector-hero">
                <div className="space-y-3">
                  <div className="dense-row__titleblock">
                    <h3 className="section-title projects-page__preview-title">{previewProject.project.name}</h3>
                    <span className="status-pill status-pill--neutral">{previewProject.project.status}</span>
                  </div>
                  <p className="type-body-sm">{previewProject.project.summary || copy.summaryFallback}</p>
                  <div className="dense-row__meta">
                    <span>{copy.ownerLabel}: {previewProject.project.owner || copy.ownerFallback}</span>
                    <span>{copy.updatedLabel}: {formatUpdatedAt(previewProject.overview.updatedAt)}</span>
                  </div>
                  <div className="projects-page__binding-signals">
                    <span className="status-pill status-pill--neutral">
                      {previewProject.project.repoPath ? `${copy.repoPathLabel}: ${previewProject.project.repoPath}` : copy.noRepoLabel}
                    </span>
                    <span className="status-pill status-pill--neutral">
                      {previewProject.project.nomosId ? `${copy.nomosLabel}: ${previewProject.project.nomosId}` : copy.noNomosLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="projects-page__preview-stats">
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.tasks}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.taskCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.activeTasks}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.activeTaskCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.reviewTasks}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.reviewTaskCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.pendingTodos}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.pendingTodoCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.knowledge}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.knowledgeCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{copy.statsLabels.citizens}</span>
                  <span className="inline-stat__value">{previewProject.overview.stats.citizenCount}</span>
                </div>
              </div>

              <section className="sheet-section">
                <h4 className="section-title">{copy.currentWorkBriefTitle}</h4>
                <div className="projects-page__brief-grid">
                  <div className="sheet-summary">
                    <div className="dense-row__meta">
                      <span>{copy.metricValues.tasks(previewProject.overview.stats.taskCount)}</span>
                      <span>{copy.metricValues.todos(previewProject.overview.stats.pendingTodoCount)}</span>
                    </div>
                    <div className="dense-list projects-page__brief-list">
                      {previewProject.work.tasks.slice(0, 5).map((task) => (
                        <div key={task.id} className="projects-page__brief-item">
                          <strong>{task.title}</strong>
                          <span>{task.state}</span>
                        </div>
                      ))}
                      {previewProject.work.tasks.length === 0 ? (
                        <p className="type-body-sm">{copy.emptyTasksTitle}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="sheet-summary">
                    <div className="dense-list projects-page__brief-list">
                      {previewProject.work.todos.slice(0, 3).map((todo) => (
                        <div key={todo.id} className="projects-page__brief-item">
                          <strong>{todo.text}</strong>
                          <span>{todo.status}</span>
                        </div>
                      ))}
                      {previewProject.work.todos.length === 0 ? (
                        <p className="type-body-sm">{copy.emptyTodosTitle}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className="sheet-section">
                <h4 className="section-title">{copy.projectSurfacesBriefTitle}</h4>
                <div className="projects-page__brief-grid">
                  <div className="sheet-summary">
                    <div className="dense-row__meta">
                      <span>{copy.surfaceSignals.index(previewProject.surfaces.index !== null)}</span>
                      <span>{copy.surfaceSignals.timeline(previewProject.surfaces.timeline !== null)}</span>
                    </div>
                    <p className="type-body-sm">{copy.surfaceSignals.recaps(previewProject.recaps.length)}</p>
                    <p className="type-body-sm">{copy.surfaceSignals.knowledge(previewProject.knowledge.length)}</p>
                  </div>
                  <div className="sheet-summary">
                    <p className="type-body-sm">{copy.surfaceSignals.citizens(previewProject.citizens.length)}</p>
                    <p className="type-body-sm">{copy.surfaceSignals.pendingTodos(previewProject.overview.stats.pendingTodoCount)}</p>
                  </div>
                </div>
              </section>

              <div className="projects-page__preview-actions">
                <Link to={`/projects/${previewProject.project.id}`} className="button-primary">
                  {copy.openProjectWorkspaceAction}
                </Link>
                <Link to={`/projects/${previewProject.project.id}/brain`} className="button-secondary">
                  {copy.openBrainAction}
                </Link>
                <Link to="/tasks/new" className="button-secondary">
                  {copy.createTaskAction}
                </Link>
              </div>
            </div>
          ) : (
            <div className="empty-state projects-page__preview-empty">
              <p className="type-body-sm">{copy.previewEmptyTitle}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
