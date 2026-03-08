import { describe, expect, it } from 'vitest';
import type { AgentStatusItem } from '@/types/dashboard';
import { buildProviderSummaries, filterAgentsByView } from '@/lib/agentProviderInsights';

const agents: AgentStatusItem[] = [
  {
    id: 'main',
    role: null,
    status: 'busy',
    presence: 'online',
    presenceReason: 'live_session',
    source: 'openclaw+discord',
    primaryModel: 'openai-codex/gpt-5.3-codex',
    workspaceDir: '/tmp/main',
    provider: 'discord',
    accountId: 'main',
    activeTaskIds: ['OC-1'],
    activeSubtaskIds: [],
    taskCount: 1,
    subtaskCount: 0,
    load: 1,
    lastActiveAt: '2026-03-08T10:00:00.000Z',
    lastSeenAt: '2026-03-08T10:00:00.000Z',
  },
  {
    id: 'review',
    role: null,
    status: 'idle',
    presence: 'stale',
    presenceReason: 'stale_gateway_log',
    source: 'discord',
    primaryModel: null,
    workspaceDir: null,
    provider: 'discord',
    accountId: 'review',
    activeTaskIds: [],
    activeSubtaskIds: [],
    taskCount: 0,
    subtaskCount: 0,
    load: 0,
    lastActiveAt: null,
    lastSeenAt: '2026-03-08T09:40:00.000Z',
  },
  {
    id: 'writer',
    role: null,
    status: 'idle',
    presence: 'disconnected',
    presenceReason: 'health_monitor_restart',
    source: 'discord',
    primaryModel: null,
    workspaceDir: null,
    provider: 'discord',
    accountId: 'writer',
    activeTaskIds: [],
    activeSubtaskIds: [],
    taskCount: 0,
    subtaskCount: 0,
    load: 0,
    lastActiveAt: null,
    lastSeenAt: '2026-03-08T09:20:00.000Z',
  },
  {
    id: 'ops',
    role: null,
    status: 'idle',
    presence: 'offline',
    presenceReason: 'inventory_only',
    source: 'openclaw',
    primaryModel: null,
    workspaceDir: null,
    provider: 'openclaw',
    accountId: null,
    activeTaskIds: [],
    activeSubtaskIds: [],
    taskCount: 0,
    subtaskCount: 0,
    load: 0,
    lastActiveAt: null,
    lastSeenAt: null,
  },
];

describe('agent provider insights', () => {
  it('builds provider summaries from the agent inventory', () => {
    expect(buildProviderSummaries(agents)).toEqual([
      {
        provider: 'discord',
        totalAgents: 3,
        busyAgents: 1,
        onlineAgents: 1,
        staleAgents: 1,
        disconnectedAgents: 1,
        offlineAgents: 0,
        overallPresence: 'disconnected',
        lastSeenAt: '2026-03-08T10:00:00.000Z',
        presenceReason: 'health_monitor_restart',
        affectedAgents: [
          expect.objectContaining({ id: 'writer', presence: 'disconnected' }),
          expect.objectContaining({ id: 'review', presence: 'stale' }),
          expect.objectContaining({ id: 'main', presence: 'online' }),
        ],
      },
      {
        provider: 'openclaw',
        totalAgents: 1,
        busyAgents: 0,
        onlineAgents: 0,
        staleAgents: 0,
        disconnectedAgents: 0,
        offlineAgents: 1,
        overallPresence: 'offline',
        lastSeenAt: null,
        presenceReason: null,
        affectedAgents: [
          expect.objectContaining({ id: 'ops', presence: 'offline' }),
        ],
      },
    ]);
  });

  it('filters agents by presence view and provider', () => {
    expect(filterAgentsByView(agents, 'all', null).map((item) => item.id)).toEqual([
      'main',
      'review',
      'writer',
      'ops',
    ]);
    expect(filterAgentsByView(agents, 'stale', null).map((item) => item.id)).toEqual(['review']);
    expect(filterAgentsByView(agents, 'disconnected', 'discord').map((item) => item.id)).toEqual(['writer']);
    expect(filterAgentsByView(agents, 'busy', 'discord').map((item) => item.id)).toEqual(['main']);
    expect(filterAgentsByView(agents, 'offline', 'openclaw').map((item) => item.id)).toEqual(['ops']);
  });
});
