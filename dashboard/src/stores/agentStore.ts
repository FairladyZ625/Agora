import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as api from '@/lib/api';
import { mapAgentsStatusDto } from '@/lib/dashboardExpansionMappers';
import type { AgentChannelSummary, AgentHostSummary, AgentStatusItem, AgentStatusSummary, CraftsmanRuntimeStatus, CraftsmanStatusItem } from '@/types/dashboard';
import type { AgentPresenceFilter } from '@/lib/agentProviderInsights';

export type CraftsmenFilter = 'all' | 'failures' | 'running';

interface AgentStore {
  summary: AgentStatusSummary | null;
  agents: AgentStatusItem[];
  craftsmen: CraftsmanStatusItem[];
  channelSummaries: AgentChannelSummary[];
  channelDetails: Record<string, AgentChannelSummary>;
  channelDetailFetchedAt: Record<string, number>;
  hostSummaries: AgentHostSummary[];
  craftsmanRuntime: CraftsmanRuntimeStatus | null;
  runtimeTailByAgent: Record<string, string | null>;
  presenceFilter: AgentPresenceFilter;
  craftsmenFilter: CraftsmenFilter;
  channelFilter: string | null;
  hostFilter: string | null;
  loading: boolean;
  channelDetailLoading: boolean;
  runtimeTailLoadingByAgent: Record<string, boolean>;
  error: string | null;
  channelDetailError: string | null;
  fetchStatus: () => Promise<'live' | 'error'>;
  fetchChannelDetail: (channel: string) => Promise<'live' | 'error'>;
  fetchRuntimeTail: (agent: string, lines?: number) => Promise<'live' | 'error'>;
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
      channelDetails: {},
      channelDetailFetchedAt: {},
      hostSummaries: [],
      craftsmanRuntime: null,
      runtimeTailByAgent: {},
      presenceFilter: 'all',
      craftsmenFilter: 'all',
      channelFilter: null,
      hostFilter: null,
      loading: false,
      channelDetailLoading: false,
      runtimeTailLoadingByAgent: {},
      error: null,
      channelDetailError: null,

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
            craftsmanRuntime: payload.craftsmanRuntime,
            runtimeTailByAgent: Object.fromEntries(
              Object.entries((payload.craftsmanRuntime?.slots ?? []).reduce<Record<string, string | null>>((acc, pane) => {
                acc[pane.agent] = pane.tailPreview;
                return acc;
              }, {}) ?? {}).map(([agent, tail]) => [agent, tail]),
            ),
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
            craftsmanRuntime: null,
            runtimeTailByAgent: {},
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return 'error';
        }
      },

      fetchChannelDetail: async (channel) => {
        set({ channelDetailLoading: true, channelDetailError: null });
        try {
          const detail = mapAgentsStatusDto({
            summary: {
              active_tasks: 0,
              active_agents: 0,
              total_agents: 0,
              online_agents: 0,
              stale_agents: 0,
              disconnected_agents: 0,
              busy_craftsmen: 0,
            },
            agents: [],
            craftsmen: [],
            channel_summaries: [await api.getAgentChannelDetail(channel)],
            host_summaries: [],
            craftsman_runtime: null,
          }).channelSummaries[0];
          if (!detail) {
            throw new Error(`Missing channel detail for ${channel}`);
          }
          set((state) => ({
            channelDetails: {
              ...state.channelDetails,
              [channel]: detail,
            },
            channelDetailFetchedAt: {
              ...state.channelDetailFetchedAt,
              [channel]: Date.now(),
            },
            channelDetailLoading: false,
          }));
          return 'live';
        } catch (error) {
          set({
            channelDetailLoading: false,
            channelDetailError: error instanceof Error ? error.message : String(error),
          });
          return 'error';
        }
      },

      fetchRuntimeTail: async (agent, lines = 20) => {
        set((state) => ({
          runtimeTailLoadingByAgent: {
            ...state.runtimeTailLoadingByAgent,
            [agent]: true,
          },
        }));
        try {
          const payload = await api.getCraftsmanRuntimeTail(agent, lines);
          set((state) => ({
            runtimeTailByAgent: {
              ...state.runtimeTailByAgent,
              [agent]: payload.output,
            },
            runtimeTailLoadingByAgent: {
              ...state.runtimeTailLoadingByAgent,
              [agent]: false,
            },
          }));
          return 'live';
        } catch (error) {
          set((state) => ({
            runtimeTailLoadingByAgent: {
              ...state.runtimeTailLoadingByAgent,
              [agent]: false,
            },
            error: error instanceof Error ? error.message : String(error),
          }));
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
