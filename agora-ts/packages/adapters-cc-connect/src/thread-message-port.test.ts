import { describe, expect, it, vi } from 'vitest';
import { CcConnectThreadMessagePort } from './thread-message-port.js';

describe('CcConnectThreadMessagePort', () => {
  it('delivers inbound messages through the thread session service', async () => {
    const deliverText = vi.fn().mockResolvedValue({
      binding: { sessionKey: 'agora-discord:thread-1:participant-1' },
      receipt: { message: 'queued' },
    });
    const port = new CcConnectThreadMessagePort({
      deliverText,
    } as never);

    await port.sendInboundMessage({
      task_id: 'OC-THREAD-1',
      provider: 'discord',
      thread_ref: 'thread-1',
      conversation_ref: null,
      entry_id: 'entry-1',
      body: 'hello',
      author_ref: 'alice',
      display_name: 'Alice',
      participant_binding_id: 'participant-1',
      agent_ref: 'cc-connect:agora-codex',
    });

    expect(deliverText).toHaveBeenCalledWith({
      agentRef: 'cc-connect:agora-codex',
      provider: 'discord',
      threadRef: 'thread-1',
      participantBindingId: 'participant-1',
      message: 'hello',
    });
  });
});
