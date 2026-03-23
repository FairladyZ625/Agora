import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useProjectsPageCopy } from '@/lib/dashboardCopy';
import { useProjectStore } from '@/stores/projectStore';

export function ProjectsPage() {
  const copy = useProjectsPageCopy();
  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const creating = useProjectStore((state) => state.creating);
  const error = useProjectStore((state) => state.error);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const createProject = useProjectStore((state) => state.createProject);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const submitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      await createProject({
        name: name.trim(),
        owner: 'archon',
        summary: summary.trim() || null,
      });
      setName('');
      setSummary('');
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
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.countLabel}</span>
              <span className="inline-stat__value">{projects.length}</span>
            </div>
            <button type="button" className="button-secondary" onClick={() => setShowCreate((value) => !value)}>
              {copy.createToggleAction}
            </button>
          </div>
        </div>
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
            <div className="lg:col-span-2">
              <button type="submit" className="button-primary" disabled={creating}>
                {creating ? copy.creatingAction : copy.confirmAction}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="surface-panel surface-panel--workspace" data-testid="projects-list-panel">
        {loading ? (
          <div className="empty-state">
            <p className="type-body-sm">{copy.loadingTitle}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <p className="type-body-sm">{copy.emptyTitle}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="data-row block">
                <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="type-heading-sm">{project.name}</strong>
                  <span className="status-pill status-pill--neutral">{project.status}</span>
                  {project.nomosId ? <span className="status-pill status-pill--neutral">{`${copy.nomosLabel}: ${project.nomosId}`}</span> : null}
                  <span className="status-pill status-pill--neutral">{project.repoPath ? copy.repoBoundLabel : copy.noRepoLabel}</span>
                </div>
                  <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                    <span>{project.id}</span>
                    {project.owner ? <span>{project.owner}</span> : null}
                  </div>
                  {project.summary ? <p className="type-body-sm mt-3">{project.summary}</p> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
