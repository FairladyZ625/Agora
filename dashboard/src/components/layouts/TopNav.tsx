import { Languages, Menu, Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageMetaCopy } from '@/lib/dashboardCopy';
import { useLocale } from '@/lib/i18n';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useLocation } from 'react-router';
import { BrandLogo } from '@/components/ui/BrandLogo';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };

function IconButton({
  onClick,
  label,
  children,
  spinning,
}: {
  onClick: () => void | Promise<void>;
  label: string;
  children: React.ReactNode;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="icon-button"
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
  const pageMetaCopy = usePageMetaCopy();
  const { locale, setLocale } = useLocale();
  const { mode, setMode } = useThemeStore();
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const loading = useTaskStore((state) => state.loading);
  const tasks = useTaskStore((state) => state.tasks);
  const error = useTaskStore((state) => state.error);
  const { showMessage } = useFeedbackStore();
  const location = useLocation();
  const themeLabels = {
    light: t('settings.appearanceLabels.light'),
    dark: t('settings.appearanceLabels.dark'),
    system: t('settings.appearanceLabels.system'),
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

  const ThemeIcon = themeIcons[mode];
  const meta = (() => {
    if (location.pathname.startsWith('/tasks/new')) return pageMetaCopy['/tasks/new'];
    if (location.pathname.startsWith('/tasks')) return pageMetaCopy['/tasks'];
    if (location.pathname.startsWith('/agents')) return pageMetaCopy['/agents'];
    if (location.pathname.startsWith('/todos')) return pageMetaCopy['/todos'];
    if (location.pathname.startsWith('/archive')) return pageMetaCopy['/archive'];
    if (location.pathname.startsWith('/templates')) return pageMetaCopy['/templates'];
    if (location.pathname.startsWith('/reviews')) return pageMetaCopy['/reviews'];
    if (location.pathname.startsWith('/settings')) return pageMetaCopy['/settings'];
    if (location.pathname.startsWith('/board')) return pageMetaCopy['/board'];
    return pageMetaCopy['/'];
  })();
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

  return (
    <header className="app-topbar sticky top-0 z-20" style={{ background: 'var(--color-panel-strong)' }}>
      <div className="app-frame flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          {isMobile ? (
            <IconButton onClick={onOpenMobileNav} label={t('common.openNavigation')}>
              <Menu size={18} />
            </IconButton>
          ) : (
            <BrandLogo collapsed className="topbar-brand-mark" />
          )}
          <div className="flex items-center gap-2">
            <h1 className="type-heading-nav">
              {meta.title}
            </h1>
            <span className="topbar-chip">
              <span className="status-dot status-dot--success" />
              {reviewCount > 0 ? t('common.reviewWaitingCount', { count: reviewCount }) : t('common.systemOnline')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="topbar-status hidden md:flex" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}>
            <span className="status-dot status-dot--info" />
            {error
              ? t('common.apiError')
              : activeCount > 0
                ? t('common.orchestratingCount', { count: activeCount })
                : t('common.queueStable')}
          </div>

          <div className="topbar-actions-group">
            <IconButton onClick={refreshWorkspace} label={t('common.refreshWorkspace')} spinning={loading}>
              <RefreshCw size={16} />
            </IconButton>
            <div className="topbar-separator" />
            <IconButton onClick={() => void toggleLocale()} label={t('common.switchLanguage')}>
              <span className="flex items-center gap-1">
                <Languages size={16} />
                <span className="type-label-sm">{locale === 'zh-CN' ? t('common.localeShort.zh') : t('common.localeShort.en')}</span>
              </span>
            </IconButton>
            <div className="topbar-separator" />
            <IconButton onClick={nextTheme} label={themeLabels[mode]}>
              <ThemeIcon size={16} />
            </IconButton>
          </div>
        </div>
      </div>
    </header>
  );
}
