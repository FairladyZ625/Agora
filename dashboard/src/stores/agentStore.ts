import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api';
import { mapAgentsStatusDto } from '@/lib/dashboardExpansionMappers';
import type { AgentChannelSummary, AgentHostSummary, AgentStatusItem, AgentStatusSummary, CraftsmanStatusItem, TmuxRuntimeStatus } from '@/types/dashboard';
import type { AgentPresenceFilter } from '@/lib/agentProviderInsights';

export type CraftsmenFilter = 'all' | 'failures' | 'running';

interface AgentStore {
  summary: AgentStatusSummary | null;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  channelSummaries: AgentChannelSummary[];
  hostSummaries: AgentHostSummary[];
  tmuxRuntime: TmuxRuntimeStatus | null;
  presenceFilter: AgentPresenceFilter;
  craftsmenFilter: CraftsmenFilter;
  channelFilter: string | null;
  hostFilter: string | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<'live' | 'error'>;
  setPresenceFilter: (filter: AgentPresenceFilter) => void;
  setCraftsmenFilter: (filter: CraftsmenFilter) => void;
  setChannelFilter: (channel: string | null) => void;
  setHostFilter: (host: string | null) => void;
  clearError: () => void;
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      summary: null,
      agents: [],
      craftsmen: [],
      channelSummaries: [],
      hostSummaries: [],
      tmuxRuntime: null,
      presenceFilter: 'all',
      craftsmenFilter: 'all',
      channelFilter: null,
      hostFilter: null,
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
            channelSummaries: payload.channelSummaries,
            hostSummaries: payload.hostSummaries,
            tmuxRuntime: payload.tmuxRuntime,
            loading: false,
          });
          return 'live';
        } catch (error) {
          set({
            summary: null,
            agents: [],
            craftsmen: [],
            channelSummaries: [],
            hostSummaries: [],
            tmuxRuntime: null,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return 'error';
        }
      },

      setPresenceFilter: (presenceFilter) => set({ presenceFilter }),
      setCraftsmenFilter: (craftsmenFilter) => set({ craftsmenFilter }),
      setChannelFilter: (channelFilter) => set({ channelFilter }),
      setHostFilter: (hostFilter) => set({ hostFilter }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'agora-agent-filters',
      partialize: (state) => ({
        presenceFilter: state.presenceFilter,
        craftsmenFilter: state.craftsmenFilter,
        channelFilter: state.channelFilter,
        hostFilter: state.hostFilter,
      }),
    },
  ),
);
