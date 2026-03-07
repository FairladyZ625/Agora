import { Sun, Moon, Monitor, RefreshCw } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';

const themeCycle: ThemeMode[] = ['light', 'dark', 'system'];
const themeIcons = { light: Sun, dark: Moon, system: Monitor };
const themeLabels = { light: '浅色', dark: '深色', system: '跟随系统' };

function IconButton({
  onClick,
  label,
  children,
  spinning,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-100"
      style={{
        color: 'var(--color-text-tertiary)',
        background: 'transparent',
        cursor: 'pointer',
        border: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-muted)';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-text-tertiary)';
      }}
      aria-label={label}
      title={label}
    >
      <span className={spinning ? 'animate-spin' : ''}>{children}</span>
    </button>
  );
}

export function TopNav() {
  const { mode, setMode } = useThemeStore();
  const { fetchTasks, loading } = useTaskStore();

  const nextTheme = () => {
    const idx = themeCycle.indexOf(mode);
    setMode(themeCycle[(idx + 1) % themeCycle.length]);
  };

  const ThemeIcon = themeIcons[mode];

  return (
    <header
      className="flex items-center justify-between h-[52px] px-5 shrink-0"
      style={{
        background: 'var(--color-bg-base)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Left: title */}
      <div className="flex items-center gap-3">
        <h1
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Dashboard
        </h1>
        <div
          className="badge"
          style={{
            background: 'var(--color-success-bg)',
            color: 'var(--color-success-text)',
            border: '1px solid var(--color-success-border)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-success)',
              display: 'inline-block',
            }}
          />
          在线
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-0.5">
        <IconButton onClick={() => fetchTasks()} label="刷新" spinning={loading}>
          <RefreshCw size={15} />
        </IconButton>

        <IconButton onClick={nextTheme} label={themeLabels[mode]}>
          <ThemeIcon size={15} />
        </IconButton>
      </div>
    </header>
  );
}
