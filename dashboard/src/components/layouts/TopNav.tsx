import { Menu, Monitor, Moon, RefreshCw, Sparkles, Sun } from 'lucide-react';
import { pageMetaCopy } from '@/lib/dashboardCopy';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useLocation } from 'react-router';

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
      <span className={spinning ? 'animate-spin text-[var(--color-primary)]' : ''}>{children}</span>
    </button>
  );
}

export function TopNav({
  isMobile,
  onOpenMobileNav,
  onReplayIntro,
}: {
  isMobile: boolean;
  onOpenMobileNav: () => void;
  onReplayIntro: () => void;
}) {
  const { mode, setMode } = useThemeStore();
  const { fetchTasks, loading, tasks, dataSource } = useTaskStore();
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
    showMessage(
      source === 'live' ? '已同步真实任务' : '已切回演示态势',
      source === 'live'
        ? 'Agora 已从真实接口刷新当前工作区。'
        : '后端暂不可达，当前按钮和页面继续使用可交互的 mock 工作流。',
      source === 'live' ? 'success' : 'warning',
    );
  };

  return (
    <header className="app-topbar sticky top-0 z-20 backdrop-blur-md" style={{ background: 'var(--color-panel-strong)' }}>
      <div className="app-frame flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          {isMobile ? (
            <IconButton onClick={onOpenMobileNav} label="打开导航">
              <Menu size={18} />
            </IconButton>
          ) : (
            <button
              type="button"
              className="topbar-sigil"
              onClick={onReplayIntro}
              aria-label="重播 Agora 入场动效"
              title="重播 Agora 入场动效"
            >
              <Sparkles size={16} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">
              {meta.title}
            </h1>
            <span className="topbar-chip">
              <span className="status-dot status-dot--success" />
              {reviewCount > 0 ? `${reviewCount} 待裁决` : '系统在线'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border px-3 py-2 text-[12px] text-[var(--color-text-secondary)] md:flex" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-subtle)' }}>
            <span className="status-dot status-dot--info" />
            {dataSource === 'live'
              ? activeCount > 0 ? `${activeCount} 正在编排` : '队列平稳'
              : '演示态势已接管'}
          </div>

          <div className="topbar-actions-group">
            <IconButton onClick={refreshWorkspace} label="刷新" spinning={loading}>
              <RefreshCw size={16} />
            </IconButton>
            <div className="mx-1 h-4 w-[1px] bg-[var(--color-border)]" />
            <IconButton onClick={nextTheme} label={themeLabels[mode]}>
              <ThemeIcon size={16} />
            </IconButton>
          </div>
        </div>
      </div>
    </header>
  );
}
