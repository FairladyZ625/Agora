import { describe, expect, it, vi } from 'vitest';
import { CcConnectSessionMirrorService, type MirroredLiveSessionDto } from './session-mirror.js';

describe('CcConnectSessionMirrorService', () => {
  it('mirrors active cc-connect sessions into the live session store and sync hook', async () => {
    const upsert = vi.fn();
    const synced: MirroredLiveSessionDto[] = [];
    const service = new CcConnectSessionMirrorService({
      autoStart: false,
      now: () => new Date('2026-04-09T14:00:00.000Z'),
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
      managementService: {
        listSessions: vi.fn().mockResolvedValue([{
          id: 's1',
          session_key: 'discord:1475328660373372940',
          platform: 'discord',
          active: true,
          live: false,
          created_at: '2026-04-09T13:59:00.000Z',
          updated_at: '2026-04-09T14:00:00.000Z',
          chat_name: '人民大会堂',
          user_name: 'fairladyz',
        }]),
      },
      liveSessionStore: {
        upsert,
        end: vi.fn(),
      },
      onSessionSync: (session) => {
        synced.push(session);
      },
    });

    await service.refreshNow();

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'cc-connect:agora-codex:discord:1475328660373372940',
      channel: 'discord',
      conversation_id: '1475328660373372940',
      thread_id: '1475328660373372940',
      status: 'active',
    }));
    expect(synced).toEqual([
      expect.objectContaining({
        source: 'cc-connect',
        agent_id: 'cc-connect:agora-codex',
      }),
    ]);
  });

  it('closes mirrored sessions that disappear from cc-connect', async () => {
    const end = vi.fn().mockReturnValue({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'cc-connect:agora-codex:discord:1475328660373372940',
      channel: 'discord',
      conversation_id: '1475328660373372940',
      thread_id: '1475328660373372940',
      status: 'closed',
      last_event: 'cc_connect_session_missing',
      last_event_at: '2026-04-09T14:05:00.000Z',
      metadata: {},
    } satisfies MirroredLiveSessionDto);
    const synced: MirroredLiveSessionDto[] = [];
    let sessions = [{
      id: 's1',
      session_key: 'discord:1475328660373372940',
      platform: 'discord',
      active: true,
      live: false,
      created_at: '2026-04-09T13:59:00.000Z',
      updated_at: '2026-04-09T14:00:00.000Z',
      chat_name: null,
      user_name: null,
    }];
    const service = new CcConnectSessionMirrorService({
      autoStart: false,
      now: () => new Date('2026-04-09T14:05:00.000Z'),
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
      managementService: {
        listSessions: vi.fn().mockImplementation(async () => sessions),
      },
      liveSessionStore: {
        upsert: vi.fn(),
        end,
      },
      onSessionSync: (session) => {
        synced.push(session);
      },
    });

    await service.refreshNow();
    sessions = [];
    await service.refreshNow();

    expect(end).toHaveBeenCalledWith(
      'cc-connect:agora-codex:discord:1475328660373372940',
      '2026-04-09T14:05:00.000Z',
      'cc_connect_session_missing',
    );
    expect(synced.at(-1)).toEqual(expect.objectContaining({
      status: 'closed',
      last_event: 'cc_connect_session_missing',
    }));
  });

  it('degrades when one management endpoint fails and still mirrors other targets', async () => {
    const upsert = vi.fn();
    const warn = vi.fn();
    const service = new CcConnectSessionMirrorService({
      autoStart: false,
      now: () => new Date('2026-04-11T07:00:00.000Z'),
      targets: [
        {
          configPath: '/tmp/config.toml',
          projectName: 'agora-codex',
          agentType: 'codex',
          workDir: '/repo/agora',
          primaryModel: 'gpt-5.4',
          channelProviders: ['discord'],
          management: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:9820',
            token: 'secret-a',
          },
        },
        {
          configPath: '/tmp/config-immediate.toml',
          projectName: 'agora-codex-immediate',
          agentType: 'codex',
          workDir: '/repo/agora',
          primaryModel: 'gpt-5.4',
          channelProviders: ['discord'],
          management: {
            enabled: true,
            baseUrl: 'http://127.0.0.1:9821',
            token: 'secret-b',
          },
        },
      ],
      managementService: {
        listSessions: vi.fn()
          .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9821'))
          .mockResolvedValueOnce([{
            id: 's1',
            session_key: 'discord:1491748680485572679',
            platform: 'discord',
            active: true,
            live: true,
            created_at: '2026-04-11T06:59:00.000Z',
            updated_at: '2026-04-11T07:00:00.000Z',
            chat_name: 'codex-cli',
            user_name: 'fairladyz',
          }]),
      },
      liveSessionStore: {
        upsert,
        end: vi.fn(),
      },
      logger: { warn },
    });

    await expect(service.refreshNow()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      '[agora] cc-connect session mirror poll failed',
      expect.objectContaining({
        project: 'agora-codex',
        baseUrl: 'http://127.0.0.1:9820',
        error: 'connect ECONNREFUSED 127.0.0.1:9821',
      }),
    );
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex-immediate',
      session_key: 'cc-connect:agora-codex-immediate:discord:1491748680485572679',
      status: 'active',
    }));
  });
});
