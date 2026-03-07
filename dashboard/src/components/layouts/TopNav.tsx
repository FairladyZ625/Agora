import { Sun, Moon, Monitor, RefreshCw } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useTaskStore } from '@/stores/taskStore';
import { motion } from 'framer-motion';

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
    <motion.button
      whileHover={{ scale: 1.05, backgroundColor: 'var(--color-surface-hover)' }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150"
      style={{
        color: 'var(--color-text-secondary)',
        background: 'transparent',
        cursor: 'pointer',
        border: 'none',
      }}
      aria-label={label}
      title={label}
    >
      <span className={spinning ? 'animate-spin text-[var(--color-primary)]' : ''}>{children}</span>
    </motion.button>
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
    <header className="px-6 py-4 shrink-0 relative z-20">
      <div 
        className="glass-panel flex items-center justify-between h-[52px] px-5 w-full shadow-sm"
        style={{ borderRadius: '14px' }}
      >
        {/* Left: title */}
        <div className="flex items-center gap-4">
          <h1
            className="text-[15px] font-semibold tracking-wide"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Mission Control
          </h1>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="badge-glass"
            style={{
              color: 'var(--color-success-text)',
              borderColor: 'var(--color-success-border)',
              background: 'var(--color-success-bg)',
            }}
          >
            <span
              className="animate-pulse shadow-[0_0_8px_var(--color-success)]"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-success)',
                display: 'inline-block',
              }}
            />
            <span className="tracking-wide">Online</span>
          </motion.div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <IconButton onClick={() => fetchTasks()} label="刷新" spinning={loading}>
            <RefreshCw size={16} />
          </IconButton>

          <div className="w-[1px] h-4 bg-[var(--color-border)] mx-1" />

          <IconButton onClick={nextTheme} label={themeLabels[mode]}>
            <ThemeIcon size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
