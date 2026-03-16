import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useProjectStore } from '@/stores/projectStore';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const error = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

  if (detailLoading) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">Loading project…</p>
      </div>
    );
  }

  if (!selectedProject || !projectId) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{error ?? 'Project not found.'}</p>
      </div>
    );
  }

  const { project, recaps, knowledge, citizens } = selectedProject;

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">PROJECT DETAIL</p>
            <h2 className="page-title">{project.name}</h2>
            <p className="page-summary">{project.summary ?? 'No project summary yet.'}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">Knowledge</span>
              <span className="inline-stat__value">{knowledge.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">Citizens</span>
              <span className="inline-stat__value">{citizens.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">Recaps</span>
              <span className="inline-stat__value">{recaps.length}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-recaps-panel">
            <div className="section-title-row">
              <h3 className="section-title">Recent Recaps</h3>
            </div>
            <div className="mt-5 space-y-3">
              {recaps.length === 0 ? <p className="type-body-sm">No recaps yet.</p> : recaps.map((recap) => (
                <div key={recap.taskId} className="data-row">
                  <div className="min-w-0 flex-1">
                    <strong className="type-heading-sm">{recap.title ?? recap.taskId}</strong>
                    <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                      <span>{recap.taskId}</span>
                      <span>{recap.updatedAt ?? '-'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-knowledge-panel">
            <div className="section-title-row">
              <h3 className="section-title">Knowledge</h3>
            </div>
            <div className="mt-5 space-y-3">
              {knowledge.length === 0 ? <p className="type-body-sm">No knowledge docs yet.</p> : knowledge.map((doc) => (
                <div key={`${doc.kind}:${doc.slug}`} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{doc.title ?? doc.slug}</strong>
                      <span className="status-pill status-pill--neutral">{doc.kind}</span>
                    </div>
                    <p className="type-body-sm mt-3 line-clamp-3">{doc.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-citizens-panel">
            <div className="section-title-row">
              <h3 className="section-title">Citizens</h3>
              <Link className="button-secondary" to={`/tasks/new?project=${project.id}`}>Create Task In Project</Link>
            </div>
            <div className="mt-5 space-y-3">
              {citizens.length === 0 ? <p className="type-body-sm">No citizens yet.</p> : citizens.map((citizen) => (
                <div key={citizen.citizenId} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{citizen.displayName}</strong>
                      <span className="status-pill status-pill--neutral">{citizen.status}</span>
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                      <span>{citizen.citizenId}</span>
                      <span>{citizen.roleId}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
