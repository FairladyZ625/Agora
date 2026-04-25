import { NavLink, Outlet, useParams } from 'react-router';
import { useProjectWorkspaceCopy } from '@/lib/dashboardCopy';

export function ProjectWorkspaceShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const copy = useProjectWorkspaceCopy();

  if (!projectId) {
    return <Outlet />;
  }

  return (
    <div className="project-workspace-shell interior-page interior-page--project">
      <section className="project-workspace-shell__nav project-workspace-shell__nav--compact surface-panel surface-panel--workspace">
        <nav aria-label={copy.ariaLabel} className="project-workspace-shell__tabs">
          {copy.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to.replace(':projectId', projectId)}
              end={item.end}
              className={({ isActive }) => (isActive ? 'project-workspace-tab project-workspace-tab--active' : 'project-workspace-tab')}
            >
              <span className="project-workspace-tab__label">{item.label}</span>
              <span className="project-workspace-tab__hint" aria-hidden="true">{item.hint}</span>
            </NavLink>
          ))}
        </nav>
      </section>

      <Outlet />
    </div>
  );
}
