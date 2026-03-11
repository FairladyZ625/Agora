import type {
  IMArchiveContextRequest,
  IMJoinParticipantRequest,
  IMJoinParticipantResult,
  IMProvisionContextRequest,
  IMProvisionContextResult,
  IMProvisioningPort,
} from '@agora-ts/core';
import { DiscordHttpClient } from './discord-http-client.js';

export interface DiscordIMProvisioningAdapterOptions {
  botToken: string;
  defaultChannelId: string;
  participantTokens?: Record<string, string>;
  primaryAccountId?: string | null;
}

export class DiscordIMProvisioningAdapter implements IMProvisioningPort {
  private readonly client: DiscordHttpClient;
  private readonly defaultChannelId: string;
  private readonly participantTokens: Record<string, string>;
  private readonly primaryAccountId: string | null;

  constructor(options: DiscordIMProvisioningAdapterOptions) {
    this.client = new DiscordHttpClient({ botToken: options.botToken });
    this.defaultChannelId = options.defaultChannelId;
    this.participantTokens = options.participantTokens ?? {};
    this.primaryAccountId = options.primaryAccountId ?? null;
  }

  async provisionContext(input: IMProvisionContextRequest): Promise<IMProvisionContextResult> {
    const provider = input.target?.provider;
    if (provider && provider !== 'discord') {
      throw new Error(`Discord provisioning adapter cannot serve provider ${provider}`);
    }
    const conversationRef = input.target?.conversation_ref ?? this.defaultChannelId;
    if (input.target?.thread_ref) {
      return {
        im_provider: 'discord',
        conversation_ref: conversationRef,
        thread_ref: input.target.thread_ref,
        message_root_ref: null,
      };
    }
    const name = `[${input.task_id}] ${input.title}`.slice(0, 100);
    const message = `Task **${input.task_id}** created: ${input.title}`;
    const threadRef = await this.client.createThread(
      conversationRef,
      name,
      message,
      input.target?.visibility ?? 'public',
    );
    return {
      im_provider: 'discord',
      conversation_ref: conversationRef,
      thread_ref: threadRef,
      message_root_ref: null,
    };
  }

  async joinParticipant(_input: IMJoinParticipantRequest): Promise<IMJoinParticipantResult> {
    const threadRef = _input.thread_ref ?? null;
    if (!threadRef) {
      return { status: 'ignored', detail: 'missing thread_ref' };
    }
    if (this.primaryAccountId && _input.participant_ref === this.primaryAccountId) {
      return { status: 'ignored', detail: 'primary provisioning account already owns the thread' };
    }
    const token = this.participantTokens[_input.participant_ref];
    if (!token) {
      return { status: 'failed', detail: `no discord token configured for participant ${_input.participant_ref}` };
    }
    const client = new DiscordHttpClient({ botToken: token });
    await client.joinThread(threadRef);
    return { status: 'joined', detail: null };
  }

  async archiveContext(_input: IMArchiveContextRequest): Promise<void> {
    // Intentionally left as a no-op in Plan A. Archive semantics will be hardened in a later wave.
  }
}
