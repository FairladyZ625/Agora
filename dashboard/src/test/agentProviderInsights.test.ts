import { describe, expect, it } from 'vitest';
import type { AgentStatusItem } from '@/types/dashboard';
import { filterAgentsByView } from '@/lib/agentProviderInsights';

const agents: AgentStatusItem[] = [
  {
    id: 'main',
    role: null,
    status: 'busy',
    presence: 'online',
    presenceReason: 'live_session',
    channelProviders: ['discord'],
    hostFramework: 'openclaw',
    inventorySources: ['openclaw', 'discord'],
    primaryModel: 'openai-codex/gpt-5.3-codex',
    workspaceDir: '/tmp/main',
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
    channelProviders: ['discord'],
    hostFramework: null,
    inventorySources: ['discord'],
    primaryModel: null,
    workspaceDir: null,
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
    channelProviders: ['discord'],
    hostFramework: null,
    inventorySources: ['discord'],
    primaryModel: null,
    workspaceDir: null,
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
    channelProviders: [],
    hostFramework: 'openclaw',
    inventorySources: ['openclaw'],
    primaryModel: null,
    workspaceDir: null,
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
  it('filters agents by presence, channel, and host axes', () => {
    expect(filterAgentsByView(agents, 'all', null, null).map((item) => item.id)).toEqual([
      'main',
      'review',
      'writer',
      'ops',
    ]);
    expect(filterAgentsByView(agents, 'stale', null, null).map((item) => item.id)).toEqual(['review']);
    expect(filterAgentsByView(agents, 'disconnected', 'discord', null).map((item) => item.id)).toEqual(['writer']);
    expect(filterAgentsByView(agents, 'busy', 'discord', 'openclaw').map((item) => item.id)).toEqual(['main']);
    expect(filterAgentsByView(agents, 'offline', null, 'openclaw').map((item) => item.id)).toEqual(['ops']);
  });
});
