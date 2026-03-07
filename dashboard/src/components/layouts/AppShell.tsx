import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { motion, AnimatePresence } from 'framer-motion';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden text-[var(--color-text-primary)]"
      style={{
        background: 'var(--color-bg-base)',
        backgroundImage: 'var(--app-bg-gradient)',
        backgroundAttachment: 'fixed',
      }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0 relative z-10">
        <TopNav />

        <main className="flex-1 overflow-x-hidden overflow-y-auto w-full relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={window.location.pathname}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="max-w-[1400px] mx-auto w-full"
              style={{ padding: '24px 32px' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Status bar */}
        <footer
          className="flex items-center justify-between px-8 py-2 text-[11px] shrink-0 font-medium"
          style={{
            color: 'var(--color-text-tertiary)',
            borderTop: '1px solid var(--color-glass-border)',
            background: 'var(--color-surface)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_8px_var(--color-primary)] animate-pulse" />
            Agora Orchestration Layer
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            System Core v0.1.0-alpha
          </span>
        </footer>
      </div>
    </div>
  );
}
