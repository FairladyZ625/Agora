import { describe, expect, it, vi } from 'vitest';
import { CcConnectBridgeReplyRelayService, parseCcConnectThreadSessionKey } from './bridge-reply-relay.js';

describe('CcConnectBridgeReplyRelayService', () => {
  it('publishes reply messages back into the bound thread and records conversation output', async () => {
    let handler: ((event: unknown) => void) | null = null;
    const publishMessages = vi.fn().mockResolvedValue(undefined);
    const ingest = vi.fn().mockReturnValue({
      id: 'entry-outbound-1',
      task_id: 'OC-RELAY-1',
    });
    const service = new CcConnectBridgeReplyRelayService({
      bridgeClient: {
        onEvent(listener) {
          handler = listener as (event: unknown) => void;
          return () => {
            handler = null;
          };
        },
      },
      imProvisioningPort: {
        publishMessages,
      },
      taskConversationService: {
        ingest,
      },
      taskContextBindingService: {
        getBindingById: () => ({
          id: 'binding-1',
          task_id: 'OC-RELAY-1',
          im_provider: 'discord',
          conversation_ref: 'forum-1',
          thread_ref: 'thread-1',
          message_root_ref: null,
          status: 'active',
          created_at: '2026-04-14T08:00:00.000Z',
          closed_at: null,
        }),
        getActiveBinding: () => null,
      },
      taskParticipationService: {
        getParticipantById: () => ({
          id: 'participant-1',
          task_id: 'OC-RELAY-1',
          binding_id: 'binding-1',
          agent_ref: 'cc-connect:agora-codex',
          runtime_provider: 'cc-connect',
          task_role: 'developer',
          source: 'template',
          join_status: 'joined',
          created_at: '2026-04-14T08:00:00.000Z',
          joined_at: null,
          left_at: null,
        }),
        getRuntimeSessionByParticipant: () => ({
          id: 'runtime-1',
          participant_binding_id: 'participant-1',
          runtime_provider: 'cc-connect',
          runtime_session_ref: 'agora-discord:thread-1:participant-1',
          runtime_actor_ref: 'cc-connect:agora-codex',
          continuity_ref: null,
          presence_state: 'active',
          binding_reason: null,
          desired_runtime_presence: 'attached',
          reconcile_stage_id: null,
          reconciled_at: null,
          last_seen_at: '2026-04-14T08:00:00.000Z',
          created_at: '2026-04-14T08:00:00.000Z',
          updated_at: '2026-04-14T08:00:00.000Z',
          closed_at: null,
        }),
      },
      now: () => new Date('2026-04-14T08:00:10.000Z'),
    });

    service.start();
    await handler?.({
      type: 'reply',
      session_key: 'agora-discord:thread-1:participant-1',
      reply_ctx: 'ctx-1',
      content: 'Done. Here is the summary.',
      format: 'text',
    });

    expect(publishMessages).toHaveBeenCalledWith({
      binding_id: 'binding-1',
      conversation_ref: 'forum-1',
      thread_ref: 'thread-1',
      messages: [{ kind: 'cc_connect_reply', body: 'Done. Here is the summary.' }],
    });
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'discord',
      conversation_ref: 'forum-1',
      thread_ref: 'thread-1',
      direction: 'outbound',
      author_kind: 'agent',
      author_ref: 'cc-connect:agora-codex',
      body: 'Done. Here is the summary.',
    }));
  });

  it('ignores replies for unknown or mismatched runtime sessions', async () => {
    const publishMessages = vi.fn().mockResolvedValue(undefined);
    const ingest = vi.fn();
    const service = new CcConnectBridgeReplyRelayService({
      bridgeClient: { onEvent: () => () => undefined },
      imProvisioningPort: { publishMessages },
      taskConversationService: { ingest },
      taskContextBindingService: {
        getBindingById: () => null,
        getActiveBinding: () => null,
      },
      taskParticipationService: {
        getParticipantById: () => null,
        getRuntimeSessionByParticipant: () => null,
      },
    });

    await service.handleEvent({
      type: 'reply',
      session_key: 'agora-discord:thread-x:participant-x',
      reply_ctx: 'ctx-x',
      content: 'ignored',
      format: 'text',
    });

    expect(publishMessages).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe('parseCcConnectThreadSessionKey', () => {
  it('parses deterministic agora thread session keys', () => {
    expect(parseCcConnectThreadSessionKey('agora-discord:thread-1:participant-1')).toEqual({
      provider: 'discord',
      thread_ref: 'thread-1',
      participant_binding_id: 'participant-1',
    });
    expect(parseCcConnectThreadSessionKey('discord:thread-1')).toBeNull();
  });
});
