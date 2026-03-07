import { create } from 'zustand';
import * as api from '@/lib/api';
import { mapAgentsStatusDto } from '@/lib/dashboardExpansionMappers';
import type { AgentStatusItem, AgentStatusSummary, CraftsmanStatusItem } from '@/types/dashboard';

interface AgentStore {
  summary: AgentStatusSummary | null;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<'live' | 'error'>;
  clearError: () => void;
}

export const useAgentStore = create<AgentStore>()((set) => ({
  summary: null,
  agents: [],
  craftsmen: [],
  loading: false,
  error: null,

  fetchStatus: async () => {
    set({ loading: true, error: null });
    try {
      const payload = mapAgentsStatusDto(await api.getAgentsStatus());
      set({
        summary: payload.summary,
        agents: payload.agents,
        craftsmen: payload.craftsmen,
        loading: false,
      });
      return 'live';
    } catch (error) {
      set({
        summary: null,
        agents: [],
        craftsmen: [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  clearError: () => set({ error: null }),
}));
