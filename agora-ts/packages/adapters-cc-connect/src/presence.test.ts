import { describe, expect, it, vi } from 'vitest';
import { CcConnectManagementPresenceSource } from './presence.js';
import type { CcConnectManagedProjectDetail } from './presence.js';

describe('CcConnectManagementPresenceSource', () => {
  it('synthesizes presence, history, and signals from management project detail', async () => {
    const detail: CcConnectManagedProjectDetail = {
      platforms: [{ type: 'discord', connected: true }],
    };
    const managementService = {
      getProject: vi.fn().mockResolvedValue(detail),
    };
    const source = new CcConnectManagementPresenceSource({
      autoStart: false,
      now: () => new Date('2026-04-09T13:00:00.000Z'),
      targets: [{
        configPath: '/tmp/cc-connect.toml',
        projectName: 'agora-codex',
        agentType: 'codex',
        workDir: '/repo/agora',
        primaryModel: 'gpt-5.4',
        channelProviders: ['discord'],
        management: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9820',
          token: 'secret',
        },
      }],
      managementService,
    });

    await source.refreshNow();

    expect(source.listPresence()).toEqual([{
      agent_id: 'cc-connect:agora-codex',
      presence: 'online',
      provider: 'discord',
      account_id: null,
      last_seen_at: '2026-04-09T13:00:00.000Z',
      reason: 'management_connected',
    }]);
    expect(source.listHistory()).toEqual([{
      occurred_at: '2026-04-09T13:00:00.000Z',
      agent_id: 'cc-connect:agora-codex',
      provider: 'discord',
      account_id: null,
      presence: 'online',
      reason: 'management_connected',
    }]);
    expect(source.listSignals()).toEqual([{
      occurred_at: '2026-04-09T13:00:00.000Z',
      provider: 'discord',
      agent_id: 'cc-connect:agora-codex',
      account_id: null,
      kind: 'provider_ready',
      severity: 'info',
      detail: 'management api reports platform connected',
    }]);
  });

  it('marks the agent disconnected when management reports a disconnected platform', async () => {
    const managementService = {
      getProject: vi.fn()
        .mockResolvedValueOnce({
          name: 'agora-codex',
          agent_type: 'codex',
          platforms: [{ type: 'discord', connected: true }],
          platform_configs: [],
          sessions_count: 1,
          active_session_keys: [],
          heartbeat: null,
          settings: {
            language: 'zh',
            admin_from: null,
            disabled_commands: [],
            quiet: false,
          },
          work_dir: '/repo/agora',
          agent_mode: 'full-auto',
          mode: 'full-auto',
          show_context_indicator: false,
        } satisfies CcConnectManagedProjectDetail)
        .mockResolvedValueOnce({
          platforms: [{ type: 'discord', connected: false }],
        } satisfies CcConnectManagedProjectDetail),
    };
    let now = new Date('2026-04-09T13:00:00.000Z');
    const source = new CcConnectManagementPresenceSource({
      autoStart: false,
      now: () => now,
      targets: [{
        configPath: '/tmp/cc-connect.toml',
        projectName: 'agora-codex',
        agentType: 'codex',
        workDir: '/repo/agora',
        primaryModel: 'gpt-5.4',
        channelProviders: ['discord'],
        management: {
          enabled: true,
          baseUrl: 'http://127.0.0.1:9820',
          token: 'secret',
        },
      }],
      managementService,
    });

    await source.refreshNow();
    now = new Date('2026-04-09T13:05:00.000Z');
    await source.refreshNow();

    expect(source.listPresence()).toEqual([{
      agent_id: 'cc-connect:agora-codex',
      presence: 'disconnected',
      provider: 'discord',
      account_id: null,
      last_seen_at: '2026-04-09T13:05:00.000Z',
      reason: 'management_disconnected',
    }]);
    expect(source.listHistory()).toEqual([
      {
        occurred_at: '2026-04-09T13:05:00.000Z',
        agent_id: 'cc-connect:agora-codex',
        provider: 'discord',
        account_id: null,
        presence: 'disconnected',
        reason: 'management_disconnected',
      },
      {
        occurred_at: '2026-04-09T13:00:00.000Z',
        agent_id: 'cc-connect:agora-codex',
        provider: 'discord',
        account_id: null,
        presence: 'online',
        reason: 'management_connected',
      },
    ]);
    expect(source.listSignals()).toEqual([
      {
        occurred_at: '2026-04-09T13:05:00.000Z',
        provider: 'discord',
        agent_id: 'cc-connect:agora-codex',
        account_id: null,
        kind: 'transport_error',
        severity: 'error',
        detail: 'management api reports platform disconnected',
      },
      {
        occurred_at: '2026-04-09T13:00:00.000Z',
        provider: 'discord',
        agent_id: 'cc-connect:agora-codex',
        account_id: null,
        kind: 'provider_ready',
        severity: 'info',
        detail: 'management api reports platform connected',
      },
    ]);
  });
});
