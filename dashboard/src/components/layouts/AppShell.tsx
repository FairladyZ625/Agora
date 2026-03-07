import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { useLocation } from 'react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ExperienceNotice } from '@/components/ui/ExperienceNotice';
import { AgoraIntro } from '@/components/ui/AgoraIntro';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [introActive, setIntroActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('agora-intro-seen');
  });
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    if (!introActive) return;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem('agora-intro-seen', '1');
      setIntroActive(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [introActive]);

  const handleReplayIntro = useCallback(() => {
    setIntroActive(true);
  }, []);

  return (
    <div className="app-shell text-[var(--color-text-primary)]">
      <AgoraIntro active={introActive} />
      <ExperienceNotice />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={isMobile && mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        isMobile={isMobile}
      />

      <div className="app-shell__main">
        <TopNav
          isMobile={isMobile}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onReplayIntro={handleReplayIntro}
        />

        <main className="flex-1 overflow-hidden">
          <div
            key={location.pathname}
            className="page-enter app-frame app-frame--page px-4 py-6 md:px-6"
          >
            {children}
          </div>
        </main>

        <footer
          className="app-shell__footer border-t"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel-strong)' }}
        >
          <div className="app-frame app-shell__footer-inner flex items-center justify-between px-4 py-3 text-[11px] font-medium text-[var(--color-text-tertiary)] md:px-6">
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
