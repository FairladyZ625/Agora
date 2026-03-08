import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api';
import { mapAgentsStatusDto } from '@/lib/dashboardExpansionMappers';
import type { AgentStatusItem, AgentStatusSummary, AgentProviderSummary, CraftsmanStatusItem, TmuxRuntimeStatus } from '@/types/dashboard';
import type { AgentPresenceFilter } from '@/lib/agentProviderInsights';

export type CraftsmenFilter = 'all' | 'failures' | 'running';

interface AgentStore {
  summary: AgentStatusSummary | null;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  providerSummaries: AgentProviderSummary[];
  tmuxRuntime: TmuxRuntimeStatus | null;
  presenceFilter: AgentPresenceFilter;
  craftsmenFilter: CraftsmenFilter;
  providerFilter: string | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<'live' | 'error'>;
  setPresenceFilter: (filter: AgentPresenceFilter) => void;
  setCraftsmenFilter: (filter: CraftsmenFilter) => void;
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
      tmuxRuntime: null,
      presenceFilter: 'all',
      craftsmenFilter: 'all',
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
            tmuxRuntime: payload.tmuxRuntime,
            loading: false,
          });
          return 'live';
        } catch (error) {
          set({
            summary: null,
            agents: [],
            craftsmen: [],
            providerSummaries: [],
            tmuxRuntime: null,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return 'error';
        }
      },

      setPresenceFilter: (presenceFilter) => set({ presenceFilter }),
      setCraftsmenFilter: (craftsmenFilter) => set({ craftsmenFilter }),
      setProviderFilter: (providerFilter) => set({ providerFilter }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'agora-agent-filters',
      partialize: (state) => ({
        presenceFilter: state.presenceFilter,
        craftsmenFilter: state.craftsmenFilter,
        providerFilter: state.providerFilter,
      }),
    },
  ),
);
