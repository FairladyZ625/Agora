import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import * as api from '@/lib/api';
import { useProjectsPageCopy } from '@/lib/dashboardCopy';
import {
  filterProjectsForWorkbench,
  pickProjectsPageSelection,
  readProjectsPageSelection,
  sortProjectsForWorkbench,
  type ProjectsPageSortKey,
  writeProjectsPageSelection,
} from '@/lib/projectsWorkbenchList';
import { mapProjectWorkbenchDto, mapWorkspaceBootstrapStatusDto } from '@/lib/projectMappers';
import { useProjectStore } from '@/stores/projectStore';
import type { ProjectWorkbench, WorkspaceBootstrapStatus } from '@/types/project';

const DEFAULT_PROJECT_NOMOS_ID = 'agora/default';
type ProjectScopeFilter = 'all' | 'active' | 'review';

function parseAccountIds(value: string) {
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function formatRelativeActivity(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function getProjectPriority(workbench: ProjectWorkbench | null) {
  const stats = workbench?.overview.stats;
  if (!stats) {
    return 'Low';
  }
  if (stats.reviewTaskCount > 0 || stats.activeTaskCount >= 3) {
    return 'High';
  }
  if (stats.pendingTodoCount > 0 || stats.taskCount > 0) {
    return 'Medium';
  }
  return 'Low';
}

function getProjectHealth(workbench: ProjectWorkbench | null) {
  const stats = workbench?.overview.stats;
  if (!stats) {
    return 'Unknown';
  }
  if (stats.reviewTaskCount > 0) {
    return 'At Risk';
  }
  if (stats.pendingTodoCount > 4) {
    return 'Degraded';
  }
  return 'Healthy';
}

function getProjectProgress(workbench: ProjectWorkbench | null) {
  const stats = workbench?.overview.stats;
  if (!stats || stats.taskCount === 0) {
    return 0;
  }
  const completed = Math.max(0, stats.taskCount - stats.activeTaskCount - stats.reviewTaskCount);
  return Math.round((completed / stats.taskCount) * 100);
}

function fillStyle(percent: number): CSSProperties {
  return { '--fill': `${percent}%` } as CSSProperties;
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
  const [scopeFilter, setScopeFilter] = useState<ProjectScopeFilter>('all');
  const [sortKey, setSortKey] = useState<ProjectsPageSortKey>('updated');
  const [requestedSelectedProjectId, setRequestedSelectedProjectId] = useState<string | null>(() => readProjectsPageSelection());
  const [prefetchedBriefingsByProject, setPrefetchedBriefingsByProject] = useState<Record<string, ProjectWorkbench>>({});
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

  useEffect(() => {
    projectsPageMountedRef.current = true;
    return () => {
      projectsPageMountedRef.current = false;
    };
  }, []);

  const briefingsByProject = useMemo(() => {
    const cachedProject = buildProjectCache(selectedProject);
    if (!cachedProject) {
      return prefetchedBriefingsByProject;
    }
    if (prefetchedBriefingsByProject[cachedProject.project.id] === cachedProject) {
      return prefetchedBriefingsByProject;
    }
    return {
      ...prefetchedBriefingsByProject,
      [cachedProject.project.id]: cachedProject,
    };
  }, [prefetchedBriefingsByProject, selectedProject]);

  const filteredProjects = useMemo(
    () => filterProjectsForWorkbench(projects, query),
    [projects, query],
  );
  const scopedProjects = useMemo(() => {
    if (scopeFilter === 'active') {
      return filteredProjects.filter((project) => project.status === 'active');
    }
    if (scopeFilter === 'review') {
      return filteredProjects.filter((project) => {
        const briefing = briefingsByProject[project.id] ?? null;
        return (briefing?.overview.stats.reviewTaskCount ?? 0) > 0;
      });
    }
    return filteredProjects;
  }, [briefingsByProject, filteredProjects, scopeFilter]);
  const visibleProjects = useMemo(
    () => sortProjectsForWorkbench(scopedProjects, sortKey, briefingsByProject),
    [briefingsByProject, scopedProjects, sortKey],
  );
  const preferredSelectedProjectId = useMemo(
    () => (requestedSelectedProjectId && projects.some((project) => project.id === requestedSelectedProjectId)
      ? requestedSelectedProjectId
      : null),
    [projects, requestedSelectedProjectId],
  );

  const selectedProjectId = useMemo(() => {
    if (projects.length === 0 || visibleProjects.length === 0) {
      return null;
    }
    if (preferredSelectedProjectId && visibleProjects.some((project) => project.id === preferredSelectedProjectId)) {
      return preferredSelectedProjectId;
    }
    return pickProjectsPageSelection(visibleProjects, sortKey, briefingsByProject);
  }, [briefingsByProject, preferredSelectedProjectId, projects.length, sortKey, visibleProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      void selectProject(null);
      writeProjectsPageSelection(preferredSelectedProjectId);
      return;
    }
    writeProjectsPageSelection(preferredSelectedProjectId ?? selectedProjectId);
    void selectProject(selectedProjectId);
  }, [preferredSelectedProjectId, selectedProjectId, selectProject]);

  useEffect(() => {
    const projectsToPrefetch = [
      ...new Set([
        selectedProjectId,
        preferredSelectedProjectId,
        ...visibleProjects.slice(0, 6).map((project) => project.id),
      ].filter((value): value is string => Boolean(value))),
    ]
      .map((projectId) => projects.find((project) => project.id === projectId) ?? null)
      .filter((project): project is (typeof projects)[number] => project !== null)
      .filter((project) => (
        !briefingsByProject[project.id]
        && !prefetchingProjectIdsRef.current.has(project.id)
      ));
    if (!projectsToPrefetch.length) {
      return;
    }

    for (const project of projectsToPrefetch) {
      prefetchingProjectIdsRef.current.add(project.id);
      void api.getProjectWorkbench(project.id)
        .then((response) => {
          if (!projectsPageMountedRef.current) {
            return;
          }
          const workbench = buildProjectCache(mapProjectWorkbenchDto(response));
          setPrefetchedBriefingsByProject((current) => (
            workbench ? { ...current, [project.id]: workbench } : current
          ));
        })
        .catch(() => {
          // Leave the row in a pending state for this cycle.
        })
        .finally(() => {
          prefetchingProjectIdsRef.current.delete(project.id);
        });
    }
  }, [briefingsByProject, preferredSelectedProjectId, projects, selectedProjectId, visibleProjects]);

  const previewProject = selectedProjectId
    ? (selectedProject?.project.id === selectedProjectId
        ? selectedProject
        : briefingsByProject[selectedProjectId] ?? null)
    : null;
  const previewLoading = Boolean(selectedProjectId) && (detailLoading || !previewProject);
  const featuredProject = previewProject;
  const projectRows = visibleProjects.slice(0, 6);
  const prefetchedProjectCount = Object.keys(briefingsByProject).length;
  const totalKnownTasks = Object.values(briefingsByProject).reduce(
    (sum, briefing) => sum + (briefing?.overview.stats.taskCount ?? 0),
    0,
  );
  const totalReviewTasks = Object.values(briefingsByProject).reduce(
    (sum, briefing) => sum + (briefing?.overview.stats.reviewTaskCount ?? 0),
    0,
  );
  const totalPendingTodos = Object.values(briefingsByProject).reduce(
    (sum, briefing) => sum + (briefing?.overview.stats.pendingTodoCount ?? 0),
    0,
  );
  const totalKnowledge = Object.values(briefingsByProject).reduce(
    (sum, briefing) => sum + (briefing?.overview.stats.knowledgeCount ?? 0),
    0,
  );
  const riskProjects = Object.values(briefingsByProject).filter((briefing) => (
    briefing && getProjectHealth(briefing) !== 'Healthy'
  )).length;
  const healthyProjects = Math.max(0, projects.length - riskProjects);
  const activeProjectCount = projects.filter((project) => project.status === 'active').length;
  const reviewProjectCount = Object.values(briefingsByProject).filter((briefing) => (
    (briefing?.overview.stats.reviewTaskCount ?? 0) > 0
  )).length;

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
        nomos_id: DEFAULT_PROJECT_NOMOS_ID,
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
    <div className="projects-mgo projects-page interior-page interior-page--projects">
      <section className="projects-mgo__masthead">
        <div className="projects-mgo__title-row">
          <div>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="projects-mgo__top-actions">
            {workspaceBootstrap && !workspaceBootstrap.bootstrapCompleted ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate('/workspace/bootstrap')}
              >
                {copy.workspaceBootstrapAction}
              </button>
            ) : null}
            <button type="button" className="button-primary" onClick={() => setShowCreate((value) => !value)}>
              {copy.createToggleAction}
            </button>
          </div>
        </div>

        <div className="projects-mgo__controls">
          <div className="projects-mgo__tabs" role="list" aria-label={copy.scopeLabel}>
            <button
              type="button"
              className={`projects-mgo__tab${scopeFilter === 'all' ? ' projects-mgo__tab--active' : ''}`}
              aria-pressed={scopeFilter === 'all'}
              onClick={() => setScopeFilter('all')}
            >
              {copy.scopeAll} <span>{projects.length}</span>
            </button>
            <button
              type="button"
              className={`projects-mgo__tab${scopeFilter === 'active' ? ' projects-mgo__tab--active' : ''}`}
              aria-pressed={scopeFilter === 'active'}
              onClick={() => setScopeFilter('active')}
            >
              {copy.scopeActive} <span>{activeProjectCount}</span>
            </button>
            <button
              type="button"
              className={`projects-mgo__tab${scopeFilter === 'review' ? ' projects-mgo__tab--active' : ''}`}
              aria-pressed={scopeFilter === 'review'}
              onClick={() => setScopeFilter('review')}
            >
              {copy.scopeReview} <span>{reviewProjectCount}</span>
            </button>
          </div>
          <label className="projects-mgo__search">
            <span className="field-label">{copy.searchLabel}</span>
            <input
              aria-label={copy.searchLabel}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="input-shell"
              placeholder={copy.searchPlaceholder}
            />
          </label>
          <label className="projects-mgo__sort">
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
            <div className="space-y-2 lg:col-span-2">
              <span className="field-label">{copy.createNomosLabel}</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="status-pill status-pill--neutral">
                  {copy.createNomosValueLabel}: {DEFAULT_PROJECT_NOMOS_ID}
                </span>
                <p className="type-body-sm">{copy.createNomosHint}</p>
              </div>
            </div>
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

      <div className="projects-mgo__layout">
        <div className="projects-mgo__main">
          <section className="projects-mgo__featured surface-panel surface-panel--workspace" data-testid="projects-preview-pane">
          {previewLoading ? (
            <div className="empty-state projects-page__preview-empty">
              <p className="type-body-sm">{copy.previewLoadingTitle}</p>
            </div>
          ) : previewProject ? (
            <div className="projects-page__preview">
              <div className="projects-mgo__featured-grid">
                <div className="projects-mgo__featured-copy">
                  <p className="page-kicker">{copy.featuredProjectTitle}</p>
                  <h3 className="projects-page__preview-title">{previewProject.project.name}</h3>
                  <div className="dense-row__meta">
                    <span>{previewProject.project.status}</span>
                    <span>{copy.ownerLabel}: {previewProject.project.owner || copy.ownerFallback}</span>
                    <span>{formatRelativeActivity(previewProject.overview.updatedAt)}</span>
                  </div>
                  <p className="type-body-sm">{previewProject.project.summary || copy.summaryFallback}</p>
                  <div className="projects-mgo__current-work">
                    <p className="page-kicker">{copy.currentWorkBriefTitle}</p>
                    <strong>{previewProject.work.tasks[0]?.title ?? copy.emptyTasksTitle}</strong>
                    <span>{previewProject.work.tasks[0]?.state ?? previewProject.overview.status}</span>
                    <span>{copy.metricValues.tasks(previewProject.overview.stats.taskCount)}</span>
                    <span>{copy.metricValues.todos(previewProject.overview.stats.pendingTodoCount)}</span>
                    <div className="home-mgo__progress-bar home-mgo__progress-bar--compact">
                      <span style={fillStyle(getProjectProgress(previewProject))} />
                    </div>
                  </div>
                  <div className="projects-mgo__stat-row">
                    <div className="inline-stat">
                      <span className="inline-stat__label">{copy.statsLabels.tasks}</span>
                      <span className="inline-stat__value">{previewProject.overview.stats.taskCount}</span>
                    </div>
                    <div className="inline-stat">
                      <span className="inline-stat__label">{copy.statsLabels.reviewTasks}</span>
                      <span className="inline-stat__value">{previewProject.overview.stats.reviewTaskCount}</span>
                    </div>
                    <div className="inline-stat">
                      <span className="inline-stat__label">{copy.statsLabels.citizens}</span>
                      <span className="inline-stat__value">{previewProject.overview.stats.citizenCount}</span>
                    </div>
                    <div className="inline-stat">
                      <span className="inline-stat__label">{copy.runtimeLabel}</span>
                      <span className="inline-stat__value">{getProjectHealth(previewProject)}</span>
                    </div>
                  </div>
                </div>
                <div className="projects-mgo__governance-card">
                  <p className="page-kicker">{copy.governanceStatusTitle}</p>
                  <div className="data-row">
                    <span>{copy.approvalGateLabel}</span>
                    <strong>{previewProject.overview.stats.reviewTaskCount > 0 ? copy.approvalRequiredValue : copy.approvalClearValue}</strong>
                  </div>
                  <div className="data-row">
                    <span>{copy.policyCheckLabel}</span>
                    <strong>{copy.policyPassedValue}</strong>
                  </div>
                  <div className="data-row">
                    <span>{copy.evidenceLabel}</span>
                    <strong>{previewProject.overview.stats.knowledgeCount > 0 ? copy.evidenceCompleteValue : copy.evidenceMissingValue}</strong>
                  </div>
                </div>
                <div className="projects-mgo__pending-card">
                  <div className="home-mgo__section-head home-mgo__section-head--compact">
                    <p className="page-kicker">{copy.pendingActionsTitle}</p>
                    <Link className="text-action" to={`/projects/${previewProject.project.id}/work`}>
                      {copy.viewAllAction}
                    </Link>
                  </div>
                  {previewProject.work.tasks.slice(0, 3).map((task) => (
                    <div key={task.id} className="projects-mgo__pending-item">
                      <strong>{task.title}</strong>
                      <span>{task.state}</span>
                    </div>
                  ))}
                  {previewProject.work.tasks.length === 0 ? <p className="type-body-sm">{copy.emptyTasksTitle}</p> : null}
                  <Link to={`/projects/${previewProject.project.id}`} className="button-secondary">
                    {copy.openWorkQueueAction}
                  </Link>
                </div>
              </div>

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
                <Link to={`/projects/${previewProject.project.id}/context`} className="button-secondary">
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
          </section>

          <section className="projects-mgo__table surface-panel surface-panel--workspace" data-testid="projects-list-panel">
            <div className="home-mgo__section-head home-mgo__section-head--compact">
              <div>
                <p className="page-kicker">{copy.allProjectsTitle}</p>
                <h3 className="section-title">{copy.poolTitle}</h3>
              </div>
              <span className="type-text-sm">{copy.poolSummary}</span>
            </div>
            {loading ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.loadingTitle}</p>
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{query ? copy.filteredEmptyTitle : copy.emptyTitle}</p>
              </div>
            ) : (
              <div className="projects-mgo__table-grid">
                <div className="projects-mgo__table-head">
                  <span>{copy.tableProjectLabel}</span>
                  <span>{copy.tableStatusLabel}</span>
                  <span>{copy.tablePriorityLabel}</span>
                  <span>{copy.ownerLabel}</span>
                  <span>{copy.tableHealthLabel}</span>
                  <span>{copy.tableLastActivityLabel}</span>
                  <span>{copy.tableNextActionLabel}</span>
                </div>
                {projectRows.map((project) => {
                  const briefing = briefingsByProject[project.id] ?? null;
                  const isActive = project.id === selectedProjectId;
                  const health = getProjectHealth(briefing);
                  const priority = getProjectPriority(briefing);

                  return (
                    <article key={project.id} className={`projects-mgo__table-row${isActive ? ' is-selected' : ''}`}>
                      <button
                        type="button"
                        className="projects-page__row-button projects-mgo__project-cell"
                        aria-label={copy.selectProjectAction(project.name)}
                        onClick={() => setRequestedSelectedProjectId(project.id)}
                      >
                        <strong>{project.name}</strong>
                        <span>{project.id}</span>
                        <span>
                          {briefing ? copy.metricValues.tasks(briefing.overview.stats.taskCount) : copy.metricValues.tasksPending}
                        </span>
                        <span>
                          {briefing ? copy.metricValues.todos(briefing.overview.stats.pendingTodoCount) : copy.metricValues.todosPending}
                        </span>
                      </button>
                      <span className="status-pill status-pill--neutral">{project.status}</span>
                      <span className={`projects-mgo__priority projects-mgo__priority--${priority.toLowerCase()}`}>{priority}</span>
                      <span>{project.owner || copy.ownerFallback}</span>
                      <span className={`projects-mgo__health projects-mgo__health--${health.toLowerCase().replace(/\s+/g, '-')}`}>{health}</span>
                      <span>{formatRelativeActivity(project.updatedAt)}</span>
                      <Link to={`/projects/${project.id}`} className="text-action">{copy.openWorkspaceAction}</Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="projects-mgo__rail">
          <section className="projects-mgo__rail-panel surface-panel surface-panel--workspace">
            <p className="page-kicker">{copy.projectPostureTitle}</p>
            <div className="projects-mgo__donut">
              <strong>{projects.length}</strong>
              <span>{copy.totalLabel}</span>
            </div>
            <div className="projects-mgo__rail-list">
              <div className="data-row"><span>{copy.healthyLabel}</span><strong>{healthyProjects}</strong></div>
              <div className="data-row"><span>{copy.atRiskLabel}</span><strong>{riskProjects}</strong></div>
              <div className="data-row"><span>{copy.knownTasksLabel}</span><strong>{totalKnownTasks}</strong></div>
            </div>
          </section>
          <section className="projects-mgo__rail-panel surface-panel surface-panel--workspace">
            <div className="home-mgo__section-head home-mgo__section-head--compact">
              <p className="page-kicker">{copy.governanceQueueTitle}</p>
              <Link className="text-action" to="/reviews">{copy.viewAllAction}</Link>
            </div>
            <div className="projects-mgo__rail-list">
              <div className="data-row"><span>{copy.reviewTasksLabel}</span><strong>{totalReviewTasks}</strong></div>
              <div className="data-row"><span>{copy.pendingTodosLabel}</span><strong>{totalPendingTodos}</strong></div>
              <div className="data-row"><span>{copy.knowledgeNotesLabel}</span><strong>{totalKnowledge}</strong></div>
            </div>
          </section>
          <section className="projects-mgo__rail-panel surface-panel surface-panel--workspace">
            <p className="page-kicker">{copy.recentlyActiveTitle}</p>
            <div className="projects-mgo__activity-list">
              {visibleProjects.slice(0, 5).map((project) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="projects-mgo__activity-item">
                  <span>{project.name.replace(/^Project\s+/u, '')}</span>
                  <strong>{formatRelativeActivity(project.updatedAt)}</strong>
                </Link>
              ))}
            </div>
          </section>
          <section className="projects-mgo__rail-panel surface-panel surface-panel--workspace">
            <p className="page-kicker">{copy.referenceHealthTitle}</p>
            <div className="projects-mgo__rail-list">
              <div className="data-row"><span>{copy.referencesLabel}</span><strong>{totalKnowledge}</strong></div>
              <div className="data-row"><span>{copy.reviewTasksLabel}</span><strong>{totalReviewTasks}</strong></div>
              <div className="data-row"><span>{copy.workbenchCoverageLabel}</span><strong>{prefetchedProjectCount}/{projects.length}</strong></div>
            </div>
            {featuredProject ? (
              <Link to={`/projects/${featuredProject.project.id}/context`} className="button-secondary">{copy.openBrainAction}</Link>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
