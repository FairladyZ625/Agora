import { NavLink } from 'react-router';
import {
  Archive,
  Bot,
  LayoutDashboard,
  Columns3,
  ListTodo,
  ShieldCheck,
  Settings,
  SquarePen,
  Workflow,
  PanelLeftOpen,
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
        className={cn(
          'app-sidebar fixed inset-y-3 left-3 z-40 flex transition-[transform,width,opacity] duration-300 md:static md:inset-auto md:translate-x-0',
          collapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{
          background: 'var(--color-panel)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="flex h-full w-full flex-col">
          <div
            className="relative flex items-center justify-center border-b px-3 py-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <BrandLogo
              collapsed={collapsed}
              className={!collapsed ? "absolute left-3 top-1/2 -translate-y-1/2" : ''}
            />

            {!collapsed && (
              <div className="flex-1 text-center">
                <h1 className="sidebar-brand-title">
                  {shellCopy.brandName}
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
            {!collapsed && (
              <p className="nav-section-label">
                {shellCopy.workspaceLabel}
              </p>
            )}
            <nav className="space-y-1.5">
              {shellCopy.navItems.map(({ to, key, label, hint }) => {
                const Icon = navIcons[key as keyof typeof navIcons];

                return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    isActive ? 'nav-link nav-link--active' : 'nav-link'
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && (
                    <div className="min-w-0">
                      <div className="sidebar-nav-title">{label}</div>
                      <div className="nav-meta">{hint}</div>
                    </div>
                  )}
                </NavLink>
                );
              })}
            </nav>
          </div>

          <div
            className="border-t px-3 py-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {!collapsed && (
              <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="sidebar-rail-title">
                  <PanelLeftOpen size={14} />
                  {shellCopy.railStatement}
                </div>
                <p className="sidebar-rail-copy mt-2">
                  {shellCopy.railSummary}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="sidebar-toggle-button mt-3"
              style={{ borderColor: 'var(--color-border)' }}
              aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
