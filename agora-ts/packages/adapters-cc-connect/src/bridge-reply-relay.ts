import type { IMPublishMessagesRequest, IMProvisioningPort, TaskConversationService, TaskContextBindingService, TaskParticipationService } from '@agora-ts/core';
import type { CcConnectBridgeClient, CcConnectBridgeEvent } from './cc-connect-bridge-client.js';

type ReplyRelayDependencies = {
  bridgeClient: Pick<CcConnectBridgeClient, 'onEvent'>;
  imProvisioningPort: Pick<IMProvisioningPort, 'publishMessages'>;
  taskConversationService: Pick<TaskConversationService, 'ingest'>;
  taskContextBindingService: Pick<TaskContextBindingService, 'getBindingById' | 'getActiveBinding'>;
  taskParticipationService: Pick<TaskParticipationService, 'getParticipantById' | 'getRuntimeSessionByParticipant'>;
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

    await this.options.imProvisioningPort.publishMessages(buildPublishRequest(binding.id, binding.conversation_ref, binding.thread_ref, event.content));
    this.options.taskConversationService.ingest({
      provider: binding.im_provider,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      direction: 'outbound',
      author_kind: 'agent',
      author_ref: participant.agent_ref,
      display_name: participant.agent_ref,
      body: event.content,
      body_format: event.format === 'markdown' ? 'markdown' : 'plain_text',
      occurred_at: this.now().toISOString(),
      metadata: {
        runtime_provider: 'cc-connect',
        runtime_session_ref: event.session_key,
        reply_ctx: event.reply_ctx,
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
