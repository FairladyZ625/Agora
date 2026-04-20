import { describe, expect, it } from 'vitest';
import {
  CompositeAgentInventorySource,
  CompositePresenceSource,
  InventoryBackedAgentRuntimePort,
} from './runtime-ports.js';

describe('runtime ports', () => {
  it('resolves runtime participants from inventory', () => {
    const port = new InventoryBackedAgentRuntimePort({
      listAgents: () => [
        {
          id: 'opus',
          host_framework: 'acpx',
          channel_providers: ['discord'],
          inventory_sources: ['registry'],
          primary_model: 'sonnet',
          workspace_dir: '/tmp/project',
          agent_origin: 'agora_managed',
          briefing_mode: 'overlay_delta',
        },
      ],
    });

    expect(port.resolveAgent('opus')).toEqual({
      agent_ref: 'opus',
      runtime_provider: 'acpx',
      runtime_actor_ref: 'opus',
      agent_origin: 'agora_managed',
      briefing_mode: 'overlay_delta',
    });
    expect(port.resolveAgent('missing')).toBeNull();
  });

  it('merges provider inventories without leaking provider logic into callers', () => {
    const source = new CompositeAgentInventorySource([
      {
        listAgents: () => [
          {
            id: 'shared',
            host_framework: 'openclaw',
            channel_providers: ['discord'],
            inventory_sources: ['openclaw'],
            primary_model: 'sonnet',
            workspace_dir: '/tmp/openclaw',
          },
        ],
      },
      {
        listAgents: () => [
          {
            id: 'shared',
            host_framework: null,
            channel_providers: ['slack'],
            inventory_sources: ['cc-connect'],
            primary_model: null,
            workspace_dir: null,
          },
          {
            id: 'cc-connect:codex',
            inventory_kind: 'runtime_target',
            host_framework: 'cc-connect',
            runtime_provider: 'cc-connect',
            runtime_flavor: 'codex',
            runtime_target_ref: 'cc-connect:codex',
            channel_providers: ['discord'],
            inventory_sources: ['cc-connect'],
            primary_model: 'gpt-5.4',
            workspace_dir: '/tmp/cc-connect',
            discord_bot_user_ids: ['1491781344664227942'],
          },
        ],
      },
    ]);

    expect(source.listAgents()).toEqual([
      {
        id: 'cc-connect:codex',
        inventory_kind: 'runtime_target',
        host_framework: 'cc-connect',
        runtime_provider: 'cc-connect',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:codex',
        channel_providers: ['discord'],
        inventory_sources: ['cc-connect'],
        primary_model: 'gpt-5.4',
        workspace_dir: '/tmp/cc-connect',
        discord_bot_user_ids: ['1491781344664227942'],
      },
      {
        id: 'shared',
        host_framework: 'openclaw',
        channel_providers: ['discord', 'slack'],
        inventory_sources: ['cc-connect', 'openclaw'],
        primary_model: 'sonnet',
        workspace_dir: '/tmp/openclaw',
      },
    ]);
  });

  it('merges presence/history/signals from multiple sources', () => {
    const source = new CompositePresenceSource([
      {
        listPresence: () => [{
          agent_id: 'openclaw:opus',
          presence: 'online',
          provider: 'discord',
          account_id: 'opus',
          last_seen_at: '2026-04-09T10:00:00.000Z',
          reason: 'provider_ready',
        }],
        listHistory: () => [{
          occurred_at: '2026-04-09T10:00:00.000Z',
          agent_id: 'openclaw:opus',
          provider: 'discord',
          account_id: 'opus',
          presence: 'online',
          reason: 'provider_ready',
        }],
      },
      {
        listPresence: () => [{
          agent_id: 'cc-connect:codex',
          presence: 'disconnected',
          provider: 'discord',
          account_id: null,
          last_seen_at: '2026-04-09T10:02:00.000Z',
          reason: 'management_disconnected',
        }],
        listSignals: () => [{
          occurred_at: '2026-04-09T10:02:00.000Z',
          provider: 'discord',
          agent_id: 'cc-connect:codex',
          account_id: null,
          kind: 'transport_error',
          severity: 'error',
          detail: 'platform disconnected',
        }],
      },
    ]);

    expect(source.listPresence()).toEqual([
      {
        agent_id: 'openclaw:opus',
        presence: 'online',
        provider: 'discord',
        account_id: 'opus',
        last_seen_at: '2026-04-09T10:00:00.000Z',
        reason: 'provider_ready',
      },
      {
        agent_id: 'cc-connect:codex',
        presence: 'disconnected',
        provider: 'discord',
        account_id: null,
        last_seen_at: '2026-04-09T10:02:00.000Z',
        reason: 'management_disconnected',
      },
    ]);
    expect(source.listHistory?.()).toEqual([
      {
        occurred_at: '2026-04-09T10:00:00.000Z',
        agent_id: 'openclaw:opus',
        provider: 'discord',
        account_id: 'opus',
        presence: 'online',
        reason: 'provider_ready',
      },
    ]);
    expect(source.listSignals?.()).toEqual([
      {
        occurred_at: '2026-04-09T10:02:00.000Z',
        provider: 'discord',
        agent_id: 'cc-connect:codex',
        account_id: null,
        kind: 'transport_error',
        severity: 'error',
        detail: 'platform disconnected',
      },
    ]);
  });
});
