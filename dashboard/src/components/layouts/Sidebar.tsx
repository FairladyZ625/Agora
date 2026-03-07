import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { BrandLogo } from '../ui/BrandLogo';

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
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col shrink-0 glass-panel m-3 mr-0 overflow-hidden relative z-20"
      style={{
        borderRight: '1px solid var(--color-glass-border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Subtle ambient gradient overlay for sidebar specifically */}
      <div className="absolute inset-0 pointer-events-none opacity-20"
           style={{ background: 'linear-gradient(to bottom, var(--color-primary-bg), transparent)' }} />

      {/* Header / Logo */}
      <div
        className="flex items-center gap-3 h-[60px] shrink-0 relative z-10"
        style={{
          padding: collapsed ? '0 16px' : '0 20px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <BrandLogo collapsed={collapsed} />
        {!collapsed && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col overflow-hidden"
          >
            <span
              className="font-bold text-base leading-tight tracking-tight text-glow"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Agora
            </span>
            <span
              className="text-[10px] leading-tight font-medium uppercase tracking-widest"
              style={{ color: 'var(--color-primary)' }}
            >
               Control
            </span>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 py-4 space-y-1 relative z-10"
        style={{ padding: collapsed ? '16px 8px' : '16px 12px' }}
      >
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `
              relative flex items-center gap-3 rounded-[10px] font-medium transition-all duration-300
              ${collapsed ? 'justify-center py-2.5' : 'justify-start px-3 py-2.5'}
              ${isActive ? 'active-nav-item' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-text-primary)]'}
            `}
          >
            {({ isActive }) => (
              <>
                {/* Active Indicator Glow */}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-[10px] bg-[var(--color-sidebar-active-bg)] border border-[var(--color-glass-border-strong)]"
                    style={{ boxShadow: 'var(--shadow-glow)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="sidebar-active-bar"
                    className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-[var(--color-primary)] rounded-r-md shadow-[0_0_8px_var(--color-primary)]"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <Icon size={18} className="shrink-0 relative z-10" style={{ color: isActive ? 'var(--color-primary)' : 'inherit' }} />
                {!collapsed && <span className="relative z-10 text-[13.5px] tracking-wide" style={{ color: isActive ? 'var(--color-text-primary)' : 'inherit' }}>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <motion.button
        whileHover={{ scale: 1.02, backgroundColor: 'var(--color-sidebar-hover)' }}
        whileTap={{ scale: 0.98 }}
        onClick={onToggle}
        className="flex items-center justify-center h-12 shrink-0 relative z-10"
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
        aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
      </motion.button>
    </motion.aside>
  );
}
