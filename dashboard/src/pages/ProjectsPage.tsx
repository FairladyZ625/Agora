import { useEffect } from 'react';
import { Link } from 'react-router';
import { useProjectStore } from '@/stores/projectStore';

export function ProjectsPage() {
  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const error = useProjectStore((state) => state.error);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">PROJECT WORKBENCH</p>
            <h2 className="page-title">Projects</h2>
            <p className="page-summary">Browse project namespaces, brain context, recent recaps, and citizens from the dashboard.</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">Projects</span>
              <span className="inline-stat__value">{projects.length}</span>
            </div>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="projects-list-panel">
        {loading ? (
          <div className="empty-state">
            <p className="type-body-sm">Loading projects…</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <p className="type-body-sm">No projects yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="data-row block">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{project.name}</strong>
                    <span className="status-pill status-pill--neutral">{project.status}</span>
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
