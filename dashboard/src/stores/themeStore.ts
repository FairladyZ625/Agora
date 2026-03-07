import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

const DARK_MEDIA = '(prefers-color-scheme: dark)';

interface ThemeStore {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia(DARK_MEDIA).matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system' as ThemeMode,
      resolved: resolveTheme('system'),
      setMode: (mode: ThemeMode) => {
        const resolved = resolveTheme(mode);
        applyTheme(resolved);
        set({ mode, resolved });
      },
    }),
    {
      name: 'agora-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.mode);
          applyTheme(resolved);
          state.resolved = resolved;
        }
      },
    },
  ),
);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia(DARK_MEDIA).addEventListener('change', () => {
    const { mode, setMode } = useThemeStore.getState();
    if (mode === 'system') {
      setMode('system');
    }
  });
}

