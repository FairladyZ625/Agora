import { describe, expect, it, vi } from 'vitest';
import { CcConnectThreadSessionService } from './thread-session-service.js';

describe('CcConnectThreadSessionService', () => {
  it('creates a deterministic cc-connect session for a discord task thread', async () => {
    const listSessions = vi.fn().mockResolvedValue([]);
    const createSession = vi.fn().mockResolvedValue({
      id: 'session-1',
      session_key: 'agora-discord:thread-42:participant-1',
      name: 'Task Thread',
      created_at: '2026-04-11T14:00:00.000Z',
    });
    const switchSession = vi.fn().mockResolvedValue({
      message: 'active session switched',
      active_session_id: 'session-1',
    });
    const service = new CcConnectThreadSessionService({
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
        listSessions,
        createSession,
        switchSession,
        sendMessage: vi.fn(),
      },
    });

    const binding = await service.ensureSessionBinding({
      agentRef: 'cc-connect:agora-codex',
      provider: 'discord',
      threadRef: 'thread-42',
      participantBindingId: 'participant-1',
      sessionName: 'Task Thread',
    });

    expect(binding).toMatchObject({
      projectName: 'agora-codex',
      agentRef: 'cc-connect:agora-codex',
      sessionKey: 'agora-discord:thread-42:participant-1',
      sessionId: 'session-1',
      created: true,
      switched: true,
    });
    expect(listSessions).toHaveBeenCalledWith(expect.objectContaining({
      project: 'agora-codex',
      managementBaseUrl: 'http://127.0.0.1:9820',
      managementToken: 'secret',
    }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      project: 'agora-codex',
      sessionKey: 'agora-discord:thread-42:participant-1',
      name: 'Task Thread',
    }));
    expect(switchSession).toHaveBeenCalledWith(expect.objectContaining({
      project: 'agora-codex',
      sessionKey: 'agora-discord:thread-42:participant-1',
      sessionId: 'session-1',
    }));
  });

  it('reuses an active session and delivers text through management send', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message: 'message sent' });
    const service = new CcConnectThreadSessionService({
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
          id: 'session-2',
          session_key: 'agora-discord:thread-77:participant-2',
          name: 'Existing',
          platform: 'discord',
          agent_type: 'codex',
          active: true,
          live: true,
          history_count: 3,
          created_at: null,
          updated_at: null,
          user_name: null,
          chat_name: null,
        }]),
        createSession: vi.fn(),
        switchSession: vi.fn(),
        sendMessage,
      },
    });

    const receipt = await service.deliverText({
      agentRef: 'cc-connect:agora-codex',
      provider: 'discord',
      threadRef: 'thread-77',
      participantBindingId: 'participant-2',
      message: 'Summarize the current task state.',
    });

    expect(receipt.binding).toMatchObject({
      sessionKey: 'agora-discord:thread-77:participant-2',
      sessionId: 'session-2',
      created: false,
      switched: false,
    });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      project: 'agora-codex',
      sessionKey: 'agora-discord:thread-77:participant-2',
      message: 'Summarize the current task state.',
    }));
  });
});
