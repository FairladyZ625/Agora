import { describe, expect, it, vi } from 'vitest';
import { CcConnectManagementService } from './cc-connect-management-service.js';

describe('CcConnectManagementService', () => {
  it('lists projects from the management api', async () => {
    const service = new CcConnectManagementService({
      exists: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockReturnValue(`
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`),
      fetchJson: vi.fn().mockResolvedValue({
        status: 200,
        json: {
          ok: true,
          data: {
            projects: [
              {
                name: 'proj-a',
                agent_type: 'codex',
                platforms: ['discord'],
                sessions_count: 2,
                heartbeat_enabled: false,
              },
            ],
          },
        },
      }),
    });

    await expect(service.listProjects()).resolves.toEqual([
      {
        name: 'proj-a',
        agent_type: 'codex',
        platforms: ['discord'],
        sessions_count: 2,
        heartbeat_enabled: false,
      },
    ]);
  });

  it('loads project detail from the management api', async () => {
    const service = new CcConnectManagementService({
      exists: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockReturnValue(`
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`),
      fetchJson: vi.fn().mockResolvedValue({
        status: 200,
        json: {
          ok: true,
          data: {
            name: 'proj-a',
            agent_type: 'codex',
            platforms: [{ type: 'discord', connected: true }],
            platform_configs: [{ type: 'discord', allow_from: '*' }],
            sessions_count: 1,
            active_session_keys: ['discord:123'],
            heartbeat: null,
            settings: {
              language: 'zh',
              admin_from: '',
              disabled_commands: [],
              quiet: false,
            },
            work_dir: '/repo',
            agent_mode: 'full-auto',
            mode: 'full-auto',
            show_context_indicator: false,
          },
        },
      }),
    });

    await expect(service.getProject({ project: 'proj-a' })).resolves.toEqual({
      name: 'proj-a',
      agent_type: 'codex',
      platforms: [{ type: 'discord', connected: true }],
      platform_configs: [{ type: 'discord', allow_from: '*' }],
      sessions_count: 1,
      active_session_keys: ['discord:123'],
      heartbeat: null,
      settings: {
        language: 'zh',
        admin_from: '',
        disabled_commands: [],
        quiet: false,
      },
      work_dir: '/repo',
      agent_mode: 'full-auto',
      mode: 'full-auto',
      show_context_indicator: false,
    });
  });

  it('loads session detail from the management api', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      status: 200,
      json: {
        ok: true,
        data: {
          id: 's1',
          session_key: 'discord:123',
          name: 'default',
          platform: 'discord',
          agent_type: 'codex',
          agent_session_id: 'agent-1',
          active: true,
          live: false,
          history_count: 2,
          created_at: '2026-04-09T21:01:32.716175+08:00',
          updated_at: '2026-04-09T21:01:32.716175+08:00',
          history: [
            { role: 'user', content: 'hello', timestamp: '2026-04-09T21:01:32.721222+08:00' },
            { role: 'assistant', content: 'hi', timestamp: '2026-04-09T21:01:40.049924+08:00' },
          ],
        },
      },
    });
    const service = new CcConnectManagementService({
      exists: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockReturnValue(`
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`),
      fetchJson,
    });

    await expect(service.getSession({
      project: 'proj-a',
      sessionId: 's1',
      historyLimit: 10,
    })).resolves.toEqual({
      id: 's1',
      session_key: 'discord:123',
      name: 'default',
      platform: 'discord',
      agent_type: 'codex',
      agent_session_id: 'agent-1',
      active: true,
      live: false,
      history_count: 2,
      created_at: '2026-04-09T21:01:32.716175+08:00',
      updated_at: '2026-04-09T21:01:32.716175+08:00',
      history: [
        { role: 'user', content: 'hello', timestamp: '2026-04-09T21:01:32.721222+08:00' },
        { role: 'assistant', content: 'hi', timestamp: '2026-04-09T21:01:40.049924+08:00' },
      ],
    });
    expect(fetchJson).toHaveBeenCalledWith(
      'http://127.0.0.1:9820/api/v1/projects/proj-a/sessions/s1?history_limit=10',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('lists bridge adapters from the management api', async () => {
    const service = new CcConnectManagementService({
      exists: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockReturnValue(`
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`),
      fetchJson: vi.fn().mockResolvedValue({
        status: 200,
        json: {
          ok: true,
          data: {
            adapters: [
              {
                platform: 'custom',
                project: 'proj-a',
                capabilities: ['text', 'files'],
                connected_at: '2026-04-09T21:10:00Z',
              },
            ],
          },
        },
      }),
    });

    await expect(service.listBridgeAdapters()).resolves.toEqual([
      {
        platform: 'custom',
        project: 'proj-a',
        capabilities: ['text', 'files'],
        connected_at: '2026-04-09T21:10:00Z',
      },
    ]);
  });

  it('sends a message to a live session through the management api', async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      status: 200,
      json: {
        ok: true,
        data: {
          message: 'message sent',
        },
      },
    });
    const service = new CcConnectManagementService({
      exists: vi.fn().mockReturnValue(true),
      readFile: vi.fn().mockReturnValue(`
[management]
enabled = true
port = 9820
token = "mgmt-secret"
`),
      fetchJson,
    });

    await expect(service.sendMessage({
      project: 'proj-a',
      sessionKey: 'discord:123',
      message: 'hello from agora',
    })).resolves.toEqual({
      message: 'message sent',
    });
    expect(fetchJson).toHaveBeenCalledWith(
      'http://127.0.0.1:9820/api/v1/projects/proj-a/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          session_key: 'discord:123',
          message: 'hello from agora',
        }),
      }),
    );
  });
});
