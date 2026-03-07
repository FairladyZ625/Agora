import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Settings,
  PanelLeftOpen,
  X,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { shellCopy } from '@/lib/dashboardCopy';
import { BrandLogo } from '../ui/BrandLogo';
import { cn } from '@/lib/cn';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isMobile: boolean;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '概览', hint: '品牌主舞台' },
  { to: '/tasks', icon: ListTodo, label: '任务', hint: '执行工作区' },
  { to: '/reviews', icon: ShieldCheck, label: '审批', hint: '裁决队列' },
  { to: '/settings', icon: Settings, label: '设置', hint: '连接与偏好' },
];

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  isMobile,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label="关闭导航"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'app-sidebar fixed inset-y-3 left-3 z-40 flex transition-[transform,width,opacity] duration-300 md:static md:inset-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{
          background: 'var(--color-panel)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-lg)',
          width: collapsed ? 88 : 284,
        }}
      >
        <div className="flex h-full w-full flex-col">
          <div
            className="flex items-start gap-3 border-b px-4 py-4"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <BrandLogo collapsed={collapsed} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
                      {shellCopy.brandRail}
                    </p>
                    <h1 className="mt-1 text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                      {shellCopy.brandName}
                    </h1>
                  </div>
                  {isMobile && mobileOpen && (
                    <button
                      type="button"
                      onClick={onCloseMobile}
                      className="icon-button"
                      aria-label="关闭侧边栏"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
                  {shellCopy.brandSummary}
                </p>
              </div>
            )}
            {collapsed && isMobile && mobileOpen && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="icon-button"
                aria-label="关闭侧边栏"
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
              {navItems.map(({ to, icon: Icon, label, hint }) => (
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
                      <div className="text-[14px] font-medium">{label}</div>
                      <div className="nav-meta">{hint}</div>
                    </div>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div
            className="border-t px-3 py-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {!collapsed && (
              <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-text-primary)]">
                  <PanelLeftOpen size={14} />
                  {shellCopy.railStatement}
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--color-text-tertiary)]">
                  {shellCopy.railSummary}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onToggle}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-xl border text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              style={{ borderColor: 'var(--color-border)' }}
              aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
