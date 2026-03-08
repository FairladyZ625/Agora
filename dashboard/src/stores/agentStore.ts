import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api';
import { mapAgentsStatusDto } from '@/lib/dashboardExpansionMappers';
import type { AgentStatusItem, AgentStatusSummary, AgentProviderSummary, CraftsmanStatusItem } from '@/types/dashboard';
import type { AgentPresenceFilter } from '@/lib/agentProviderInsights';

interface AgentStore {
  summary: AgentStatusSummary | null;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  providerSummaries: AgentProviderSummary[];
  presenceFilter: AgentPresenceFilter;
  providerFilter: string | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<'live' | 'error'>;
  setPresenceFilter: (filter: AgentPresenceFilter) => void;
  setProviderFilter: (provider: string | null) => void;
  clearError: () => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      summary: null,
      agents: [],
      craftsmen: [],
      providerSummaries: [],
      presenceFilter: 'all',
      providerFilter: null,
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
            providerSummaries: payload.providerSummaries,
            loading: false,
          });
          return 'live';
        } catch (error) {
          set({
            summary: null,
            agents: [],
            craftsmen: [],
            providerSummaries: [],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return 'error';
        }
      },

      setPresenceFilter: (presenceFilter) => set({ presenceFilter }),
      setProviderFilter: (providerFilter) => set({ providerFilter }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'agora-agent-filters',
      partialize: (state) => ({
        presenceFilter: state.presenceFilter,
        providerFilter: state.providerFilter,
      }),
    },
  ),
);
