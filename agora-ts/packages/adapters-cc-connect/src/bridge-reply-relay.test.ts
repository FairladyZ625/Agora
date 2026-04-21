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
    const upsert = vi.fn();
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
      liveSessionStore: {
        get: () => ({
          source: 'cc-connect',
          agent_id: 'cc-connect:agora-codex',
          session_key: 'agora-discord:thread-1:participant-1',
          channel: 'discord',
          conversation_id: 'forum-1',
          thread_id: 'thread-1',
          status: 'active',
          last_event: 'thread_bridge_dispatch',
          last_event_at: '2026-04-14T08:00:00.000Z',
          metadata: {
            project: 'agora-codex',
            runtime_flavor: 'codex',
            runtime_target_ref: 'cc-connect:agora-codex',
          },
        }),
        upsert,
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
          desired_exposure: 'in_thread',
          exposure_reason: null,
          exposure_stage_id: null,
          reconciled_at: null,
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
      runtimeTargetLookup: {
        findRuntimeTarget: () => ({
          runtime_target_ref: 'cc-connect:agora-codex',
          inventory_kind: 'runtime_target',
          runtime_provider: 'cc-connect',
          runtime_flavor: 'codex',
          host_framework: 'cc-connect',
          primary_model: null,
          workspace_dir: '/repo/agora',
          channel_providers: ['discord'],
          inventory_sources: ['cc-connect'],
          discord_bot_user_ids: ['1491781344664227942'],
          enabled: true,
          display_name: 'Codex Review Bot',
          tags: [],
          allowed_projects: [],
          default_roles: [],
          presentation_mode: 'headless',
          presentation_provider: null,
          presentation_identity_ref: null,
          metadata: null,
          discovered: true,
        }),
      },
      now: () => new Date('2026-04-14T08:00:10.000Z'),
    });

    service.start();
    expect(handler).toBeTruthy();
    await (handler as unknown as (event: unknown) => void)({
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
      display_name: 'Codex Review Bot',
      body: 'Done. Here is the summary.',
      metadata: expect.objectContaining({
        presentation_mode: 'headless',
        runtime_target_display_name: 'Codex Review Bot',
      }),
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'agora-discord:thread-1:participant-1',
      channel: 'discord',
      conversation_id: 'forum-1',
      thread_id: 'thread-1',
      status: 'active',
      last_event: 'cc_connect_reply_relay_published',
      last_event_at: '2026-04-14T08:00:10.000Z',
      metadata: expect.objectContaining({
        project: 'agora-codex',
        runtime_flavor: 'codex',
        runtime_target_ref: 'cc-connect:agora-codex',
        relay_health: {
          reply_observed_at: '2026-04-14T08:00:10.000Z',
          discord_publish_status: 'succeeded',
          discord_publish_at: '2026-04-14T08:00:10.000Z',
          reply_ctx: 'ctx-1',
        },
      }),
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

  it('records publish failures without ingesting an outbound conversation entry', async () => {
    const publishMessages = vi.fn().mockRejectedValue(new Error('Discord publish failed: 403 missing access'));
    const ingest = vi.fn();
    const upsert = vi.fn();
    const service = new CcConnectBridgeReplyRelayService({
      bridgeClient: { onEvent: () => () => undefined },
      imProvisioningPort: { publishMessages },
      liveSessionStore: {
        get: () => ({
          source: 'cc-connect',
          agent_id: 'cc-connect:agora-codex',
          session_key: 'agora-discord:thread-1:participant-1',
          channel: 'discord',
          conversation_id: 'forum-1',
          thread_id: 'thread-1',
          status: 'active',
          last_event: 'thread_bridge_dispatch',
          last_event_at: '2026-04-14T08:00:00.000Z',
          metadata: {
            project: 'agora-codex',
          },
        }),
        upsert,
      },
      taskConversationService: { ingest },
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
          desired_exposure: 'in_thread',
          exposure_reason: null,
          exposure_stage_id: null,
          reconciled_at: null,
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

    await expect(service.handleEvent({
      type: 'reply',
      session_key: 'agora-discord:thread-1:participant-1',
      reply_ctx: 'ctx-1',
      content: 'This reply cannot be published.',
      format: 'text',
    })).resolves.toBeUndefined();

    expect(ingest).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cc-connect',
      agent_id: 'cc-connect:agora-codex',
      session_key: 'agora-discord:thread-1:participant-1',
      last_event: 'cc_connect_reply_relay_publish_failed',
      last_event_at: '2026-04-14T08:00:10.000Z',
      metadata: expect.objectContaining({
        project: 'agora-codex',
        relay_health: {
          reply_observed_at: '2026-04-14T08:00:10.000Z',
          discord_publish_status: 'failed',
          discord_publish_at: '2026-04-14T08:00:10.000Z',
          reply_ctx: 'ctx-1',
          error: 'Discord publish failed: 403 missing access',
        },
      }),
    }));
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
