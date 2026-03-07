import { Menu, Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { pageMetaCopy } from '@/lib/dashboardCopy';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useLocation } from 'react-router';
import { BrandLogo } from '@/components/ui/BrandLogo';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };
const themeLabels = { light: '浅色', dark: '深色', system: '跟随系统' };

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
  const { mode, setMode } = useThemeStore();
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const loading = useTaskStore((state) => state.loading);
  const tasks = useTaskStore((state) => state.tasks);
  const error = useTaskStore((state) => state.error);
  const { showMessage } = useFeedbackStore();
  const location = useLocation();

  const nextTheme = () => {
    const idx = themeCycle.indexOf(mode);
    const nextMode = themeCycle[(idx + 1) % themeCycle.length];
    setMode(nextMode);
    showMessage('外观已切换', `当前主题切换到${themeLabels[nextMode]}。`, 'info');
  };

  const ThemeIcon = themeIcons[mode];
  const meta =
    pageMetaCopy[location.pathname as keyof typeof pageMetaCopy] ?? pageMetaCopy['/'];
  const activeCount = tasks.filter((task) => task.state === 'in_progress').length;
  const reviewCount = tasks.filter((task) => task.state === 'gate_waiting').length;

  const refreshWorkspace = async () => {
    const source = await fetchTasks();
    const latestError = useTaskStore.getState().error;
    showMessage(
      source === 'live' ? '已同步真实任务' : '同步失败',
      source === 'live'
        ? 'Agora 已从真实接口刷新当前工作区。'
        : latestError ?? '任务接口暂不可达。',
      source === 'live' ? 'success' : 'warning',
    );
  };

  return (
    <header className="app-topbar sticky top-0 z-20" style={{ background: 'var(--color-panel-strong)' }}>
      <div className="app-frame flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          {isMobile ? (
            <IconButton onClick={onOpenMobileNav} label="打开导航">
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
              {reviewCount > 0 ? `${reviewCount} 待裁决` : '系统在线'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="topbar-status hidden md:flex" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}>
            <span className="status-dot status-dot--info" />
            {error ? '接口异常' : activeCount > 0 ? `${activeCount} 正在编排` : '队列平稳'}
          </div>

          <div className="topbar-actions-group">
            <IconButton onClick={refreshWorkspace} label="刷新" spinning={loading}>
              <RefreshCw size={16} />
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
