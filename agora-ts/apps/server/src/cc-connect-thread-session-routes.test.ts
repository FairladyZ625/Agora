import { describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

describe('cc-connect thread session routes', () => {
  it('does not expose thread session routes unless an experimental service is injected', async () => {
    const app = buildApp({});

    const response = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/thread-sessions/ensure',
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });

  it('ensures a deterministic thread session and delivers a message through the injected service', async () => {
    const ccConnectThreadSessionService = {
      ensureSessionBinding: vi.fn().mockResolvedValue({
        agentRef: 'cc-connect:agora-codex',
        projectName: 'agora-codex',
        sessionKey: 'agora-discord:thread-1:participant-1',
        sessionId: 'session-1',
        created: true,
        switched: true,
      }),
      deliverText: vi.fn().mockResolvedValue({
        binding: {
          agentRef: 'cc-connect:agora-codex',
          projectName: 'agora-codex',
          sessionKey: 'agora-discord:thread-1:participant-1',
          sessionId: 'session-1',
          created: false,
          switched: false,
        },
        receipt: {
          message: 'queued',
        },
      }),
    };
    const app = buildApp({
      ccConnectThreadSessionService: ccConnectThreadSessionService as never,
    });

    const ensured = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/thread-sessions/ensure',
      payload: {
        agent_ref: 'cc-connect:agora-codex',
        provider: 'discord',
        thread_ref: 'thread-1',
        participant_binding_id: 'participant-1',
        session_name: 'Task Thread',
      },
    });
    const delivered = await app.inject({
      method: 'POST',
      url: '/api/external-bridges/cc-connect/thread-sessions/deliver',
      payload: {
        agent_ref: 'cc-connect:agora-codex',
        provider: 'discord',
        thread_ref: 'thread-1',
        participant_binding_id: 'participant-1',
        message: 'Summarize the latest task state.',
      },
    });

    expect(ensured.statusCode).toBe(200);
    expect(delivered.statusCode).toBe(200);
    expect(ccConnectThreadSessionService.ensureSessionBinding).toHaveBeenCalledWith({
      agentRef: 'cc-connect:agora-codex',
      provider: 'discord',
      threadRef: 'thread-1',
      participantBindingId: 'participant-1',
      sessionName: 'Task Thread',
    });
    expect(ccConnectThreadSessionService.deliverText).toHaveBeenCalledWith({
      agentRef: 'cc-connect:agora-codex',
      provider: 'discord',
      threadRef: 'thread-1',
      participantBindingId: 'participant-1',
      message: 'Summarize the latest task state.',
    });
  });
});
