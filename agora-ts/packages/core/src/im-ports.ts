export interface NotificationPayload {
  task_id: string;
  event_type: string;
  data: Record<string, unknown>;
}

export interface IMContextTarget {
  provider?: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
  visibility?: 'public' | 'private';
  participant_refs?: string[] | null;
}

export interface IMProvisionContextRequest {
  task_id: string;
  title: string;
  target?: IMContextTarget | null;
  participant_refs?: string[] | null;
}

export interface IMProvisionContextResult {
  im_provider: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
  message_root_ref?: string | null;
}

export interface IMJoinParticipantRequest {
  binding_id: string;
  participant_ref: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
}

export interface IMJoinParticipantResult {
  status: 'joined' | 'ignored' | 'failed';
  detail?: string | null;
}

export interface IMRemoveParticipantRequest {
  binding_id: string;
  participant_ref: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
}

export interface IMRemoveParticipantResult {
  status: 'removed' | 'ignored' | 'failed';
  detail?: string | null;
}

export interface IMArchiveContextRequest {
  binding_id: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
  mode?: 'archive' | 'unarchive' | 'delete';
  reason?: string | null;
}

export interface IMMessagingPort {
  sendNotification(targetRef: string, payload: NotificationPayload): Promise<void>;
}

export class StubIMMessagingPort implements IMMessagingPort {
  readonly sent: Array<{ targetRef: string; payload: NotificationPayload }> = [];

  async sendNotification(targetRef: string, payload: NotificationPayload): Promise<void> {
    this.sent.push({ targetRef, payload });
  }
}

export interface IMProvisioningPort {
  /** Create/bind an IM context for a task and return provider-neutral refs. */
  provisionContext(input: IMProvisionContextRequest): Promise<IMProvisionContextResult>;
  joinParticipant(input: IMJoinParticipantRequest): Promise<IMJoinParticipantResult>;
  removeParticipant(input: IMRemoveParticipantRequest): Promise<IMRemoveParticipantResult>;
  archiveContext(input: IMArchiveContextRequest): Promise<void>;
}

export class StubIMProvisioningPort implements IMProvisioningPort {
  private readonly provisionedBinding: IMProvisionContextResult;
  readonly provisioned: IMProvisionContextRequest[] = [];
  readonly joined: IMJoinParticipantRequest[] = [];
  readonly removed: IMRemoveParticipantRequest[] = [];
  readonly archived: IMArchiveContextRequest[] = [];

  constructor(binding: {
    im_provider?: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
  } = {}) {
    this.provisionedBinding = {
      im_provider: binding.im_provider ?? 'stub',
      conversation_ref: binding.conversation_ref ?? null,
      thread_ref: binding.thread_ref ?? null,
      message_root_ref: binding.message_root_ref ?? null,
    };
  }

  async provisionContext(input: IMProvisionContextRequest): Promise<IMProvisionContextResult> {
    this.provisioned.push(input);
    return {
      im_provider: input.target?.provider ?? this.provisionedBinding.im_provider,
      conversation_ref: input.target?.conversation_ref ?? this.provisionedBinding.conversation_ref ?? null,
      thread_ref: input.target?.thread_ref ?? this.provisionedBinding.thread_ref ?? `stub-thread-${input.task_id}`,
      message_root_ref: this.provisionedBinding.message_root_ref ?? null,
    };
  }

  async joinParticipant(input: IMJoinParticipantRequest): Promise<IMJoinParticipantResult> {
    this.joined.push(input);
    return { status: 'ignored', detail: 'stub provisioning port does not manage participants' };
  }

  async removeParticipant(input: IMRemoveParticipantRequest): Promise<IMRemoveParticipantResult> {
    this.removed.push(input);
    return { status: 'ignored', detail: 'stub provisioning port does not manage participants' };
  }

  async archiveContext(input: IMArchiveContextRequest): Promise<void> {
    this.archived.push(input);
  }
}
