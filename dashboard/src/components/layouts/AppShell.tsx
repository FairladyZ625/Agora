import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--color-bg-base)' }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopNav />

        <main
          className="flex-1 overflow-auto"
          style={{
            background: 'var(--color-bg-subtle)',
            padding: '24px 28px',
          }}
        >
          <div className="max-w-[1200px]">{children}</div>
        </main>

        {/* Status bar */}
        <footer
          className="flex items-center justify-between px-5 py-1 text-[11px] shrink-0"
          style={{
            background: 'var(--color-bg-base)',
            color: 'var(--color-text-tertiary)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span>Agora Dashboard</span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>
            v0.1.0
          </span>
        </footer>
      </div>
    </div>
  );
}
