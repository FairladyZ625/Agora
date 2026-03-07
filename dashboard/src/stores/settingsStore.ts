import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  apiBase: string;
  apiToken: string;
  refreshInterval: number; // seconds
  pauseOnHidden: boolean;
  setApiConfig: (base: string, token: string) => void;
  setRefreshInterval: (sec: number) => void;
  setPauseOnHidden: (pause: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiBase: '/api',
      apiToken: '',
      refreshInterval: 5,
      pauseOnHidden: true,
      setApiConfig: (apiBase, apiToken) => set({ apiBase, apiToken }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
      setPauseOnHidden: (pauseOnHidden) => set({ pauseOnHidden }),
    }),
    { name: 'agora-settings' },
  ),
);
