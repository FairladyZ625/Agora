import type { IMPublishMessagesRequest, IMProvisioningPort, LiveSessionStore, TaskConversationService, TaskContextBindingService, TaskParticipationService } from '@agora-ts/core';
import type { CcConnectBridgeClient, CcConnectBridgeEvent } from './cc-connect-bridge-client.js';

type ReplyRelayDependencies = {
  bridgeClient: Pick<CcConnectBridgeClient, 'onEvent'>;
  imProvisioningPort: Pick<IMProvisioningPort, 'publishMessages'>;
  liveSessionStore?: Pick<LiveSessionStore, 'get' | 'upsert'>;
  taskConversationService: Pick<TaskConversationService, 'ingest'>;
  taskContextBindingService: Pick<TaskContextBindingService, 'getBindingById' | 'getActiveBinding'>;
  taskParticipationService: Pick<TaskParticipationService, 'getParticipantById' | 'getRuntimeSessionByParticipant'>;
  runtimeTargetLookup?: {
    findRuntimeTarget(runtimeTargetRef: string): {
      runtime_target_ref: string;
      display_name: string | null;
      presentation_mode: 'headless' | 'im_presented';
    } | null;
  };
  now?: () => Date;
};

export class CcConnectBridgeReplyRelayService {
  private readonly now: () => Date;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: ReplyRelayDependencies) {
    this.now = options.now ?? (() => new Date());
  }

  start() {
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.options.bridgeClient.onEvent((event) => {
      void this.handleEvent(event);
    });
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async handleEvent(event: CcConnectBridgeEvent) {
    if (event.type !== 'reply') {
      return;
    }

    const parsed = parseCcConnectThreadSessionKey(event.session_key);
    if (!parsed) {
      return;
    }

    const participant = this.options.taskParticipationService.getParticipantById(parsed.participant_binding_id);
    if (!participant) {
      return;
    }
    const runtimeSession = this.options.taskParticipationService.getRuntimeSessionByParticipant(parsed.participant_binding_id);
    if (!runtimeSession || runtimeSession.runtime_provider !== 'cc-connect' || runtimeSession.runtime_session_ref !== event.session_key) {
      return;
    }

    const binding = participant.binding_id
      ? this.options.taskContextBindingService.getBindingById(participant.binding_id)
      : this.options.taskContextBindingService.getActiveBinding(participant.task_id);
    if (!binding) {
      return;
    }
    const runtimeTarget = this.options.runtimeTargetLookup?.findRuntimeTarget(participant.agent_ref) ?? null;
    const displayName = runtimeTarget?.display_name ?? participant.agent_ref;

    const observedAt = this.now().toISOString();
    try {
      await this.options.imProvisioningPort.publishMessages(buildPublishRequest(binding.id, binding.conversation_ref, binding.thread_ref, event.content));
    } catch (error) {
      this.recordRelayHealth({
        event,
        binding,
        participant,
        observedAt,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    this.recordRelayHealth({
      event,
      binding,
      participant,
      observedAt,
      status: 'succeeded',
    });
    this.options.taskConversationService.ingest({
      provider: binding.im_provider,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      direction: 'outbound',
      author_kind: 'agent',
      author_ref: participant.agent_ref,
      display_name: displayName,
      body: event.content,
      body_format: event.format === 'markdown' ? 'markdown' : 'plain_text',
      occurred_at: observedAt,
      metadata: {
        runtime_provider: 'cc-connect',
        runtime_session_ref: event.session_key,
        ...(runtimeTarget ? {
          runtime_target_ref: runtimeTarget.runtime_target_ref,
          runtime_target_display_name: displayName,
          presentation_mode: runtimeTarget.presentation_mode,
        } : {}),
        reply_ctx: event.reply_ctx,
      },
    });
  }

  private recordRelayHealth(input: {
    event: Extract<CcConnectBridgeEvent, { type: 'reply' }>;
    binding: {
      im_provider: string;
      conversation_ref: string | null;
      thread_ref: string | null;
    };
    participant: {
      agent_ref: string;
    };
    observedAt: string;
    status: 'succeeded' | 'failed';
    error?: string;
  }) {
    const store = this.options.liveSessionStore;
    if (!store) {
      return;
    }
    const current = store.get(input.event.session_key);
    store.upsert({
      source: current?.source ?? 'cc-connect',
      agent_id: current?.agent_id ?? input.participant.agent_ref,
      session_key: input.event.session_key,
      channel: current?.channel ?? input.binding.im_provider,
      conversation_id: current?.conversation_id ?? input.binding.conversation_ref,
      thread_id: current?.thread_id ?? input.binding.thread_ref,
      status: current?.status ?? 'active',
      last_event: input.status === 'succeeded'
        ? 'cc_connect_reply_relay_published'
        : 'cc_connect_reply_relay_publish_failed',
      last_event_at: input.observedAt,
      metadata: {
        ...(current?.metadata ?? {}),
        relay_health: {
          reply_observed_at: input.observedAt,
          discord_publish_status: input.status,
          discord_publish_at: input.observedAt,
          reply_ctx: input.event.reply_ctx,
          ...(input.error ? { error: input.error } : {}),
        },
      },
    });
  }
}

export function parseCcConnectThreadSessionKey(sessionKey: string) {
  const match = sessionKey.match(/^agora-([^:]+):([^:]+):([^:]+)$/);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }
  return {
    provider: match[1],
    thread_ref: match[2],
    participant_binding_id: match[3],
  };
}

function buildPublishRequest(
  bindingId: string,
  conversationRef: string | null,
  threadRef: string | null,
  content: string,
): IMPublishMessagesRequest {
  return {
    binding_id: bindingId,
    conversation_ref: conversationRef,
    thread_ref: threadRef,
    messages: [{ kind: 'cc_connect_reply', body: content }],
  };
}
