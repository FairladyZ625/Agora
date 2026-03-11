import { useEffect, useState } from 'react';
import { Gauge, Languages, LogOut, Menu, Monitor, Moon, RefreshCw, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useShellCopy } from '@/lib/dashboardCopy';
import { useLocale } from '@/lib/i18n';
import { useMotionStore } from '@/stores/motionStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useSessionStore } from '@/stores/sessionStore';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };

function formatClockValue() {
  return `${new Date().toISOString().slice(11, 19)} UTC`;
}

function TopbarClock({ label }: { label: string }) {
  const [clock, setClock] = useState(() => formatClockValue());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClock(formatClockValue());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  return (
    <div className="topbar-clock-inline">
      <span className="topbar-clock-label">{label}</span>
      <span className="topbar-clock-value">{clock}</span>
    </div>
  );
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
  children: React.ReactNode;
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
  const motionShortLabels = {
    full: t('common.motionShort.full'),
    lite: t('common.motionShort.lite'),
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
    <header className="app-topbar sticky top-0 z-20" style={{ background: 'var(--color-panel-strong)' }}>
      <div className="app-frame app-topbar__frame px-4 py-4 md:px-6">
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
            <div className="topbar-intelligence" aria-hidden="true">
              <span className="topbar-intelligence__dot topbar-intelligence__dot--1 signal-pulse" />
              <span className="topbar-intelligence__dot topbar-intelligence__dot--2" />
              <span className="topbar-intelligence__dot topbar-intelligence__dot--3" />
              <span className="topbar-intelligence__rail topbar-intelligence__rail--left flow-shift" />
              <span className="topbar-intelligence__rail topbar-intelligence__rail--right" />
              <span className="topbar-intelligence__carrier signal-travel" />
            </div>
          )}
        </div>

        <div className="app-topbar__cluster app-topbar__cluster--controls">
          <div className="topbar-ops__row">
            <span className="topbar-chip topbar-chip--status">
              <span className="status-dot status-dot--success" />
              {reviewCount > 0 ? t('common.reviewWaitingCount', { count: reviewCount }) : t('common.systemOnline')}
            </span>
            <div className="topbar-status hidden md:flex" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}>
              <span className="status-dot status-dot--info" />
              {error
                ? t('common.apiError')
                : activeCount > 0
                  ? t('common.orchestratingCount', { count: activeCount })
                  : t('common.queueStable')}
            </div>
            <TopbarClock label={shellCopy.systemClockLabel} />

            <div className="topbar-user-chip">
              <span className="topbar-user-chip__identity">
                <UserRound size={14} />
                <span className="topbar-user-chip__name">{username ?? 'unknown'}</span>
                <span className="topbar-user-chip__role">{role ?? 'member'}</span>
              </span>
              <button type="button" className="topbar-user-chip__action" onClick={() => void handleLogout()}>
                <LogOut size={14} />
                <span>{t('common.logout')}</span>
              </button>
            </div>

            <div className="topbar-actions-group">
              <IconButton onClick={refreshWorkspace} label={t('common.refreshWorkspace')} spinning={loading}>
                <RefreshCw size={16} />
              </IconButton>
              <div className="topbar-separator" />
              <IconButton onClick={() => void toggleLocale()} label={t('common.switchLanguage')} compact={false}>
                <span className="flex items-center gap-1">
                  <Languages size={16} />
                  <span className="type-label-sm">{locale === 'zh-CN' ? t('common.localeShort.zh') : t('common.localeShort.en')}</span>
                </span>
              </IconButton>
              <div className="topbar-separator" />
              <IconButton onClick={toggleMotionMode} label={motionToggleLabel} compact={false}>
                <span className="flex items-center gap-1">
                  <Gauge size={16} />
                  <span className="type-label-sm">{motionShortLabels[motionMode]}</span>
                </span>
              </IconButton>
              <IconButton onClick={nextTheme} label={themeLabels[mode]}>
                <ThemeIcon size={16} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
