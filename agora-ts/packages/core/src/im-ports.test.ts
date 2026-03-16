import { describe, expect, it } from 'vitest';
import { StubIMMessagingPort, StubIMProvisioningPort } from './im-ports.js';

describe('im ports stubs', () => {
  it('records notifications sent through the messaging stub', async () => {
    const port = new StubIMMessagingPort();

    await port.sendNotification('thread-1', {
      task_id: 'OC-NOTIFY-1',
      event_type: 'craftsman_completed',
      data: { status: 'succeeded' },
    });

    expect(port.sent).toEqual([
      {
        targetRef: 'thread-1',
        payload: {
          task_id: 'OC-NOTIFY-1',
          event_type: 'craftsman_completed',
          data: { status: 'succeeded' },
        },
      },
    ]);
  });

  it('records provisioning interactions and notifications through the provisioning stub', async () => {
    const port = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'channel-1',
      thread_ref: 'thread-1',
      message_root_ref: 'message-root-1',
    });

    await expect(port.provisionContext({
      task_id: 'OC-IM-1',
      title: 'Provision context',
      target: {
        provider: 'discord',
      },
      participant_refs: ['opus'],
    })).resolves.toEqual({
      im_provider: 'discord',
      conversation_ref: 'channel-1',
      thread_ref: 'thread-1',
      message_root_ref: 'message-root-1',
    });
    await expect(port.joinParticipant({
      binding_id: 'binding-1',
      participant_ref: 'lizeyu',
    })).resolves.toEqual({
      status: 'ignored',
      detail: 'stub provisioning port does not manage participants',
    });
    await expect(port.removeParticipant({
      binding_id: 'binding-1',
      participant_ref: 'lizeyu',
    })).resolves.toEqual({
      status: 'ignored',
      detail: 'stub provisioning port does not manage participants',
    });
    await port.publishMessages({
      binding_id: 'binding-1',
      messages: [{ body: 'hello world' }],
    });
    await port.archiveContext({
      binding_id: 'binding-1',
      mode: 'archive',
      reason: 'done',
    });
    await port.sendNotification('thread-1', {
      task_id: 'OC-IM-1',
      event_type: 'task_updated',
      data: { state: 'active' },
    });

    expect(port.provisioned).toHaveLength(1);
    expect(port.joined).toHaveLength(1);
    expect(port.removed).toHaveLength(1);
    expect(port.published).toEqual([
      {
        binding_id: 'binding-1',
        messages: [{ body: 'hello world' }],
      },
    ]);
    expect(port.archived).toEqual([
      {
        binding_id: 'binding-1',
        mode: 'archive',
        reason: 'done',
      },
    ]);
    expect(port.sent).toEqual([
      {
        targetRef: 'thread-1',
        payload: {
          task_id: 'OC-IM-1',
          event_type: 'task_updated',
          data: { state: 'active' },
        },
      },
    ]);
  });
});
