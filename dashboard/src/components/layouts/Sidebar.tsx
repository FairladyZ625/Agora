import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  Archive,
  Bot,
  LayoutDashboard,
  Columns3,
  FolderKanban,
  ListTodo,
  ShieldCheck,
  Settings,
  SquarePen,
  Workflow,
  X,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShellCopy } from '@/lib/dashboardCopy';
import { BrandLogo } from '../ui/BrandLogo';
import { cn } from '@/lib/cn';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isMobile: boolean;
}

const navIcons = {
  overview: LayoutDashboard,
  board: Columns3,
  projects: FolderKanban,
  tasks: ListTodo,
  agents: Bot,
  todos: ListTodo,
  archive: Archive,
  templates: Workflow,
  create: SquarePen,
  reviews: ShieldCheck,
  settings: Settings,
} as const;

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  isMobile,
}: SidebarProps) {
  const { t } = useTranslation();
  const shellCopy = useShellCopy();
  const location = useLocation();
  const effectiveCollapsed = isMobile ? false : collapsed;
  const sidebarRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isNavItemActive = (key: string, to: string, isActive: boolean) => {
    const pathname = location.pathname;

    if (key === 'create') {
      return pathname === '/tasks/new';
    }

    if (key === 'tasks') {
      return pathname === '/tasks' || (/^\/tasks\/[^/]+$/.test(pathname) && pathname !== '/tasks/new');
    }

    if (key === 'projects') {
      return pathname === '/projects' || pathname.startsWith('/projects/');
    }

    if (key === 'reviews') {
      return pathname === '/reviews' || pathname.startsWith('/reviews/');
    }

    return isActive || pathname === to;
  };

  // M5: focus trap for mobile sidebar overlay
  useEffect(() => {
    if (!isMobile) return;

    if (mobileOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      const sidebar = sidebarRef.current;
      if (!sidebar) return;

      const focusableSelector =
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

      const getFocusable = () =>
        Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector));

      // Focus first element when sidebar opens
      const focusable = getFocusable();
      if (focusable.length > 0) focusable[0].focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    } else {
      // Restore focus when sidebar closes
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }
  }, [mobileOpen, isMobile]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label={t('common.closeNavigation')}
          onClick={onCloseMobile}
        />
      )}

      <aside
        ref={sidebarRef}
        className={cn(
          'app-sidebar fixed inset-y-3 left-3 z-40 flex transition-[transform,width,opacity] duration-300 md:static md:inset-auto md:translate-x-0',
          isMobile ? 'app-sidebar--mobile' : effectiveCollapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{
          background: 'var(--color-panel)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {!isMobile ? (
          <div className="sidebar-telemetry-seam" aria-hidden="true" />
        ) : null}
        <div className="flex h-full w-full flex-col">
          <div
            className={cn(
              'sidebar-brand-shell relative flex items-center border-b px-4 py-2',
              effectiveCollapsed ? 'justify-center' : 'justify-start',
            )}
            style={{ borderColor: 'var(--color-border)' }}
          >
            <BrandLogo collapsed={effectiveCollapsed} />

            {!effectiveCollapsed && (
              <div className="sidebar-brand-panel">
                <h1 className="sidebar-brand-title">
                  {shellCopy.brandSystemName}
                </h1>
              </div>
            )}

            {isMobile && mobileOpen && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="icon-button absolute right-3 top-1/2 -translate-y-1/2"
                aria-label={t('common.closeSidebar')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-5">
            <nav className="space-y-1.5">
              {shellCopy.navItems.map(({ to, key, label, hint }) => {
                const Icon = navIcons[key as keyof typeof navIcons];

                return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) => (
                    isNavItemActive(key, to, isActive) ? 'nav-link nav-link--active' : 'nav-link'
                  )}
                >
                  <span className="nav-link__rail" aria-hidden="true" />
                  <Icon size={18} className="shrink-0" />
                  {!effectiveCollapsed && (
                    <div className="min-w-0">
                      <div className="sidebar-nav-title">{label}</div>
                      <div className="nav-meta">{hint}</div>
                    </div>
                  )}
                  <span className="nav-link__connector" aria-hidden="true" />
                  <span className="nav-link__pulse" aria-hidden="true" />
                </NavLink>
                );
              })}
            </nav>
          </div>

          {!isMobile ? (
            <div
              className="border-t px-3 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={onToggle}
                className="sidebar-toggle-button"
                style={{ borderColor: 'var(--color-border)' }}
                aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
              >
                {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
