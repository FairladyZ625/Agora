import { NavLink, Outlet, useParams } from 'react-router';
import { useProjectWorkspaceCopy } from '@/lib/dashboardCopy';

export function ProjectWorkspaceShell() {
  const { projectId } = useParams<{ projectId: string }>();
  const copy = useProjectWorkspaceCopy();

  if (!projectId) {
    return <Outlet />;
  }

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <nav aria-label={copy.ariaLabel} className="flex flex-wrap gap-2">
          {copy.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to.replace(':projectId', projectId)}
              end={item.end}
              className={({ isActive }) => (isActive ? 'choice-pill choice-pill--active' : 'choice-pill')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </section>

      <Outlet />
    </div>
  );
}
