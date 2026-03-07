import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ExperienceNotice } from '@/components/ui/ExperienceNotice';
import { useShellCopy } from '@/lib/dashboardCopy';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const shellCopy = useShellCopy();

  return (
    <div className="app-shell app-shell-tone">
      <ExperienceNotice />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={isMobile && mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        isMobile={isMobile}
      />

      <div className="app-shell__main">
        <TopNav isMobile={isMobile} onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="flex-1 overflow-hidden">
          <div className="app-frame app-frame--page px-4 py-6 md:px-6">
            {children}
          </div>
        </main>

        <footer
          className="app-shell__footer border-t"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel-strong)' }}
        >
          <div className="app-frame app-shell__footer-inner flex items-center justify-between px-4 py-3 type-footer-meta md:px-6">
            <span className="flex items-center gap-2">
              <span className="status-dot status-dot--info" />
              {shellCopy.footerTagline}
            </span>
            <span className="type-footer-code">{shellCopy.footerVersion}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
