import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useLocation } from 'react-router';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopNav onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <div key={location.pathname} className="page-enter mx-auto w-full max-w-[1320px] px-4 py-6 md:px-6">
            {children}
          </div>
        </main>

        <footer className="border-t px-4 py-3 md:px-6" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel-strong)' }}>
          <div className="mx-auto flex max-w-[1320px] items-center justify-between text-[11px] font-medium text-[var(--color-text-tertiary)]">
            <span className="flex items-center gap-2">
              <span className="status-dot status-dot--info" />
              Agora orchestration layer
            </span>
            <span className="font-mono tracking-[0.18em]">SYSTEM CORE v0.1.0-alpha</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
