import type { RuntimeThreadMessageInput, RuntimeThreadMessagePort } from '@agora-ts/core';
import type { CcConnectThreadSessionService } from './thread-session-service.js';

export class CcConnectThreadMessagePort implements RuntimeThreadMessagePort {
  readonly runtime_provider = 'cc-connect';

  constructor(private readonly threadSessionService: CcConnectThreadSessionService) {}

  async sendInboundMessage(input: RuntimeThreadMessageInput): Promise<void> {
    if (!input.thread_ref) {
      return;
    }
    await this.threadSessionService.deliverText({
      agentRef: input.agent_ref,
      provider: input.provider,
      threadRef: input.thread_ref,
      participantBindingId: input.participant_binding_id,
      message: input.body,
    });
  }
}
