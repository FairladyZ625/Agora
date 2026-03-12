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
  const shouldRenderSidebar = !isMobile || mobileNavOpen;

  return (
    <div className="app-shell app-shell-tone">
      <ExperienceNotice />
      {shouldRenderSidebar ? (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          mobileOpen={isMobile && mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          isMobile={isMobile}
        />
      ) : null}

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
          <div className="app-frame app-shell__footer-inner px-4 py-3 md:px-6">
            <div className="footer-plaque">
              <span className="footer-plaque__label">{shellCopy.footerProjectLabel}</span>
              <span className="footer-plaque__value">{shellCopy.footerProjectValue}</span>
            </div>
            <div className="footer-plaque">
              <span className="footer-plaque__label">{shellCopy.footerRevisionLabel}</span>
              <span className="footer-plaque__value">{shellCopy.footerRevisionValue}</span>
            </div>
            <div className="footer-plaque footer-plaque--status">
              <span className="footer-plaque__label">{shellCopy.footerStatusLabel}</span>
              <span className="footer-plaque__value footer-plaque__value--status">{shellCopy.footerStatusValue}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
