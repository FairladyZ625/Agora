import { describe, expect, it, vi } from 'vitest';
import { createCliProgram } from './index.js';

function createBuffer() {
  let value = '';
  return {
    write(chunk: string) {
      value += chunk;
    },
    get value() {
      return value;
    },
  };
}

describe('cc-connect thread session cli', () => {
  it('does not expose thread-session commands by default', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const program = createCliProgram({
      stdout,
      stderr,
    }).exitOverride();

    await expect(program.parseAsync([
      'external-bridge',
      'cc-connect',
      'thread-session',
      'ensure',
      '--agent-ref',
      'cc-connect:agora-codex',
      '--thread-ref',
      'thread-1',
      '--participant-binding-id',
      'participant-1',
    ], { from: 'user' })).rejects.toBeTruthy();
    expect(stderr.value).toContain("error: unknown command 'thread-session'");
  });

  it('ensures a thread session and delivers text through the injected service', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();
    const ccConnectThreadSessionService = {
      ensureSessionBinding: vi.fn().mockResolvedValue({
        projectName: 'agora-codex',
        sessionKey: 'agora-discord:thread-1:participant-1',
        sessionId: 'session-1',
        created: true,
        switched: true,
      }),
      deliverText: vi.fn().mockResolvedValue({
        binding: {
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

    const program = createCliProgram({
      stdout,
      stderr,
      ccConnectThreadSessionService: ccConnectThreadSessionService as never,
    });

    await program.parseAsync([
      'external-bridge',
      'cc-connect',
      'thread-session',
      'ensure',
      '--agent-ref',
      'cc-connect:agora-codex',
      '--thread-ref',
      'thread-1',
      '--participant-binding-id',
      'participant-1',
      '--session-name',
      'Task Thread',
    ], { from: 'user' });

    await program.parseAsync([
      'external-bridge',
      'cc-connect',
      'thread-session',
      'deliver',
      '--agent-ref',
      'cc-connect:agora-codex',
      '--thread-ref',
      'thread-1',
      '--participant-binding-id',
      'participant-1',
      '--message',
      'Summarize the latest task state.',
    ], { from: 'user' });

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
    expect(stdout.value).toContain('session_key: agora-discord:thread-1:participant-1');
    expect(stdout.value).toContain('message: queued');
    expect(stderr.value).toBe('');
  });
});
