import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '概览' },
  { to: '/tasks', icon: ListTodo, label: '任务' },
  { to: '/reviews', icon: ShieldCheck, label: '审批' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className="flex flex-col shrink-0 transition-all duration-200 ease-out"
      style={{
        width: collapsed ? 56 : 220,
        background: 'var(--color-sidebar-bg)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 h-[52px] shrink-0"
        style={{
          padding: collapsed ? '0 14px' : '0 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold shrink-0"
          style={{
            background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
            color: '#fff',
            letterSpacing: '-0.02em',
          }}
        >
          A
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span
              className="font-semibold text-sm leading-tight tracking-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Agora
            </span>
            <span
              className="text-[10px] leading-tight"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Control Panel
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 py-3 space-y-0.5"
        style={{ padding: collapsed ? '12px 8px' : '12px 10px' }}
      >
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: collapsed ? '8px 0' : '7px 10px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: isActive ? 500 : 400,
              color: isActive
                ? 'var(--color-sidebar-active-text)'
                : 'var(--color-text-secondary)',
              background: isActive
                ? 'var(--color-sidebar-active-bg)'
                : 'transparent',
              borderLeft: isActive && !collapsed
                ? '2px solid var(--color-sidebar-active-border)'
                : '2px solid transparent',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              transition: 'all 0.12s ease-out',
              cursor: 'pointer',
            })}
            onMouseEnter={(e) => {
              const target = e.currentTarget;
              if (!target.classList.contains('active')) {
                target.style.background = 'var(--color-sidebar-hover)';
              }
            }}
            onMouseLeave={(e) => {
              const target = e.currentTarget;
              // Reset — NavLink re-renders will fix active state
              const isActive = target.getAttribute('aria-current') === 'page';
              target.style.background = isActive
                ? 'var(--color-sidebar-active-bg)'
                : 'transparent';
            }}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center h-10 shrink-0 transition-colors duration-100"
        style={{
          borderTop: '1px solid var(--color-border)',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          borderTopStyle: 'solid',
          borderTopWidth: '1px',
          borderTopColor: 'var(--color-border)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-sidebar-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
      </button>
    </aside>
  );
}
