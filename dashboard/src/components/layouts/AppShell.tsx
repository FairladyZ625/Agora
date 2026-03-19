import { useState } from 'react';
import { useLocation } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ExperienceNotice } from '@/components/ui/ExperienceNotice';
import { useShellCopy } from '@/lib/dashboardCopy';

interface AppShellProps {
  children: React.ReactNode;
}

function usePageTitle(): string {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[0] ?? 'overview';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const shellCopy = useShellCopy();
  const pageTitle = usePageTitle();
  const shouldRenderSidebar = !isMobile || mobileNavOpen;

  return (
    <div className="app-shell app-shell-tone">
      {/* M4: skip-to-content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded"
      >
        Skip to content
      </a>

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

        <main id="main-content" className="flex-1 overflow-hidden">
          {/* C1: visually-hidden h1 for screen readers */}
          <h1 className="sr-only">{pageTitle}</h1>
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
