import { Menu, Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { useLocation } from 'react-router';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };
const themeLabels = { light: '浅色', dark: '深色', system: '跟随系统' };

function IconButton({
  onClick,
  label,
  children,
  spinning,
  mobileOnly,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  spinning?: boolean;
  mobileOnly?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={mobileOnly ? 'icon-button md:hidden' : 'icon-button'}
      aria-label={label}
      title={label}
    >
      <span className={spinning ? 'animate-spin text-[var(--color-primary)]' : ''}>{children}</span>
    </button>
  );
}

const pageMeta = {
  '/': {
    kicker: 'Operational Commons',
    title: 'Debate, decide, execute.',
    caption: 'Agora turns agent debate into governed delivery without losing operator context.',
  },
  '/tasks': {
    kicker: 'Task Workspace',
    title: 'Execution ledger and stage detail',
    caption: 'Browse live work, inspect stage movement, and keep the next action visible.',
  },
  '/reviews': {
    kicker: 'Decision Queue',
    title: 'Human judgment in the loop',
    caption: 'Prioritize approvals before orchestration stalls or risk compounds.',
  },
  '/settings': {
    kicker: 'System Preferences',
    title: 'Connectivity and operational guardrails',
    caption: 'Tune how the dashboard talks to the Agora core and how often it syncs.',
  },
} as const;

export function TopNav({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { mode, setMode } = useThemeStore();
  const { fetchTasks, loading, tasks } = useTaskStore();
  const location = useLocation();

  const nextTheme = () => {
    const idx = themeCycle.indexOf(mode);
    setMode(themeCycle[(idx + 1) % themeCycle.length]);
  };

  const ThemeIcon = themeIcons[mode];
  const meta = pageMeta[location.pathname as keyof typeof pageMeta] ?? pageMeta['/'];
  const activeCount = tasks.filter((task) => task.state === 'in_progress').length;
  const reviewCount = tasks.filter((task) => task.state === 'gate_waiting').length;

  return (
    <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: 'var(--color-border)', background: 'var(--color-panel-strong)' }}>
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <IconButton onClick={onOpenMobileNav} label="打开导航" mobileOnly>
            <Menu size={18} />
          </IconButton>
          <div className="min-w-0">
            <p className="page-kicker">{meta.kicker}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)] md:text-[20px]">
                {meta.title}
              </h1>
              <span className="topbar-chip">
                <span className="status-dot status-dot--success" />
                {reviewCount > 0 ? `${reviewCount} 待裁决` : 'System active'}
              </span>
            </div>
            <p className="mt-1 max-w-[640px] text-[13px] leading-5 text-[var(--color-text-secondary)]">
              {meta.caption}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border px-3 py-2 text-[12px] text-[var(--color-text-secondary)] md:flex" style={{ borderColor: 'var(--color-border)' }}>
            <span className="status-dot status-dot--info" />
            {activeCount > 0 ? `${activeCount} 正在编排` : 'All queues calm'}
          </div>
          <IconButton onClick={() => fetchTasks()} label="刷新" spinning={loading}>
            <RefreshCw size={16} />
          </IconButton>
          <IconButton onClick={nextTheme} label={themeLabels[mode]}>
            <ThemeIcon size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
