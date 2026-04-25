import type { ReactNode } from 'react';
import { Gauge, Languages, LogOut, Menu, Monitor, Moon, RefreshCw, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useShellCopy } from '@/lib/dashboardCopy';
import { useLocale } from '@/lib/i18n';
import { useMotionStore } from '@/stores/motionStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { BrandLogo } from '@/components/ui/BrandLogo';
import IntelligenceCanvas from '@/components/ui/IntelligenceCanvas';
import { useSessionStore } from '@/stores/sessionStore';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };

function isShellNavItemActive(key: string, to: string, pathname: string, isActive: boolean) {
  if (key === 'projects') {
    return pathname === '/projects' || pathname.startsWith('/projects/');
  }

  if (key === 'reviews') {
    return pathname === '/reviews' || pathname.startsWith('/reviews/');
  }

  if (key === 'participants') {
    return pathname === '/participants' || pathname === '/agents';
  }

  if (key === 'system') {
    return pathname === '/system' || pathname === '/runtime-targets' || pathname === '/bridges' || pathname === '/templates' || pathname.startsWith('/templates/');
  }

  return isActive || pathname === to;
}

function IconButton({
  onClick,
  label,
  children,
  spinning,
  compact = true,
}: {
  onClick: () => void | Promise<void>;
  label: string;
  children: ReactNode;
  spinning?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={compact ? 'icon-button' : 'icon-button icon-button--compound'}
      aria-label={label}
      title={label}
    >
      <span className={spinning ? 'animate-spin icon-accent-primary' : ''}>{children}</span>
    </button>
  );
}

export function TopNav({
  isMobile,
  onOpenMobileNav,
}: {
  isMobile: boolean;
  onOpenMobileNav: () => void;
}) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const shellCopy = useShellCopy();
  const location = useLocation();
  const motionMode = useMotionStore((state) => state.mode);
  const setMotionMode = useMotionStore((state) => state.setMode);
  const { mode, setMode } = useThemeStore();
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const loading = useTaskStore((state) => state.loading);
  const tasks = useTaskStore((state) => state.tasks);
  const error = useTaskStore((state) => state.error);
  const username = useSessionStore((state) => state.username);
  const role = useSessionStore((state) => state.role);
  const logout = useSessionStore((state) => state.logout);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const themeLabels = {
    light: t('settings.appearanceLabels.light'),
    dark: t('settings.appearanceLabels.dark'),
    system: t('settings.appearanceLabels.system'),
  };
  const motionLabels = {
    full: t('common.motionModes.full'),
    lite: t('common.motionModes.lite'),
  };

  const nextTheme = () => {
    const idx = themeCycle.indexOf(mode);
    const nextMode = themeCycle[(idx + 1) % themeCycle.length];
    setMode(nextMode);
    showMessage(
      t('feedback.themeChangedTitle'),
      t('feedback.themeChangedDetail', { label: themeLabels[nextMode] }),
      'info',
    );
  };

  const toggleLocale = async () => {
    const nextLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    const nextLabel = nextLocale === 'zh-CN' ? t('common.localeName.zh') : t('common.localeName.en');
    await setLocale(nextLocale);
    showMessage(
      t('feedback.localeChangedTitle'),
      t('feedback.localeChangedDetail', { label: nextLabel }),
      'info',
    );
  };

  const nextMotion = motionMode === 'full' ? 'lite' : 'full';
  const motionToggleLabel = t('common.motionToggleAction', { label: motionLabels[nextMotion] });
  const themeToggleLabel = `${t('login.themeAction')} (${themeLabels[mode]})`;

  const toggleMotionMode = () => {
    setMotionMode(nextMotion);
    showMessage(
      t('feedback.motionChangedTitle'),
      t('feedback.motionChangedDetail', { label: motionLabels[nextMotion] }),
      'info',
    );
  };

  const ThemeIcon = themeIcons[mode];

  const activeCount = tasks.filter((task) => task.state === 'in_progress').length;
  const reviewCount = tasks.filter((task) => task.state === 'gate_waiting').length;
  const refreshWorkspace = async () => {
    const source = await fetchTasks();
    const latestError = useTaskStore.getState().error;
    showMessage(
      source === 'live' ? t('feedback.syncSuccessTitle') : t('feedback.syncFailureTitle'),
      source === 'live'
        ? t('feedback.syncSuccessDetail')
        : latestError ?? t('feedback.syncFailureDetail'),
      source === 'live' ? 'success' : 'warning',
    );
  };

  const handleLogout = async () => {
    await logout();
    showMessage(
      t('feedback.logoutSuccessTitle'),
      t('feedback.logoutSuccessDetail'),
      'success',
    );
    navigate('/login');
  };

  return (
    <header className="app-topbar sticky top-0 z-20">
      {!isMobile ? (
        <div className="app-topbar__intelligence-layer" data-testid="topbar-intelligence-layer" aria-hidden="true">
          <IntelligenceCanvas
            activeCount={activeCount}
            reviewCount={reviewCount}
            hasError={!!error}
            animated={motionMode === 'full'}
            className="topbar-intelligence--bar topbar-intelligence--ambient"
            testId="topbar-intelligence-bar"
          />
        </div>
      ) : null}
      <div className={isMobile ? 'app-frame app-topbar__frame app-topbar__frame--mobile px-3 py-3 md:px-5' : 'app-frame app-topbar__frame px-3 py-2 md:px-5'}>
        <div className="app-topbar__cluster app-topbar__cluster--brand">
          {isMobile ? (
            <>
              <IconButton onClick={onOpenMobileNav} label={t('common.openNavigation')}>
                <Menu size={18} />
              </IconButton>
              <BrandLogo collapsed className="topbar-brand-mark" />
              <div className="topbar-brand-copy">
                <div className="topbar-system-name">{shellCopy.brandSystemName}</div>
              </div>
            </>
          ) : (
            <>
              <BrandLogo className="topbar-brand-mark" />
              <div className="topbar-brand-copy topbar-brand-copy--desktop">
                <div className="topbar-system-name">{shellCopy.brandSystemName}</div>
              </div>
            </>
          )}
        </div>

        {!isMobile ? (
          <nav aria-label="Global navigation" className="topbar-nav">
            {shellCopy.navItems.map(({ to, key, label, hint }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => (
                  isShellNavItemActive(key, to, location.pathname, isActive)
                    ? 'topbar-nav__link topbar-nav__link--active'
                    : 'topbar-nav__link'
                )}
              >
                <span className="topbar-nav__label">{label}</span>
                <span className="topbar-nav__hint">{hint}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}

        <div className="app-topbar__cluster app-topbar__cluster--controls">
          {isMobile ? (
            <div className="topbar-ops__row topbar-ops__row--mobile">
              <div className="topbar-user-chip topbar-user-chip--compact">
                <span className="topbar-user-chip__identity">
                  <UserRound size={14} />
                  <span className="topbar-user-chip__name">{username ?? 'unknown'}</span>
                </span>
              </div>

              <div className="topbar-actions-group topbar-actions-group--mobile">
                <IconButton onClick={refreshWorkspace} label={t('common.refreshWorkspace')} spinning={loading}>
                  <RefreshCw size={16} />
                </IconButton>
                <IconButton
                  onClick={() => void toggleLocale()}
                  label={`${t('common.switchLanguage')} (${locale === 'zh-CN' ? t('common.localeName.zh') : t('common.localeName.en')})`}
                >
                  <Languages size={16} />
                </IconButton>
                <IconButton onClick={() => void handleLogout()} label={t('common.logout')}>
                  <LogOut size={16} />
                </IconButton>
              </div>
            </div>
          ) : (
            <div className="topbar-ops__row">
              <div className="topbar-user-chip">
                <span className="topbar-user-chip__identity">
                  <UserRound size={14} />
                  <span className="topbar-user-chip__name">{username ?? 'unknown'}</span>
                  <span className="topbar-user-chip__role">{role ?? 'member'}</span>
                </span>
              </div>

              <div className="topbar-actions-group">
                <IconButton onClick={refreshWorkspace} label={t('common.refreshWorkspace')} spinning={loading}>
                  <RefreshCw size={16} />
                </IconButton>
                <div className="topbar-separator" />
                <IconButton
                  onClick={() => void toggleLocale()}
                  label={`${t('common.switchLanguage')} (${locale === 'zh-CN' ? t('common.localeName.zh') : t('common.localeName.en')})`}
                >
                  <Languages size={16} />
                </IconButton>
                <IconButton onClick={toggleMotionMode} label={motionToggleLabel}>
                  <Gauge size={16} />
                </IconButton>
                <IconButton onClick={nextTheme} label={themeToggleLabel}>
                  <ThemeIcon size={16} />
                </IconButton>
                <div className="topbar-separator" />
                <IconButton onClick={() => void handleLogout()} label={t('common.logout')}>
                  <LogOut size={16} />
                </IconButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
