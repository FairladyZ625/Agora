import type { ParticipantBindingRecord } from '@agora-ts/contracts';

export interface RuntimeThreadMessageInput {
  task_id: string;
  provider: string;
  thread_ref: string | null;
  conversation_ref: string | null;
  entry_id: string;
  body: string;
  author_ref: string | null;
  display_name: string | null;
  participant_binding_id: string;
  agent_ref: string;
}

export interface RuntimeThreadMessagePort {
  readonly runtime_provider: string;
  sendInboundMessage(input: RuntimeThreadMessageInput): Promise<void>;
}

export interface RuntimeThreadRoutingInput {
  task_id: string;
  provider: string;
  thread_ref: string | null;
  conversation_ref: string | null;
  entry_id: string;
  body: string;
  author_ref: string | null;
  display_name: string | null;
  participants: ParticipantBindingRecord[];
}

export class RuntimeThreadMessageRouter {
  private readonly portsByProvider: Map<string, RuntimeThreadMessagePort>;

  constructor(ports: RuntimeThreadMessagePort[]) {
    this.portsByProvider = new Map(
      ports.map((port) => [port.runtime_provider, port]),
    );
  }

  dispatch(input: RuntimeThreadRoutingInput) {
    const tasks: Promise<void>[] = [];
    for (const participant of input.participants) {
      if (!participant.runtime_provider) {
        continue;
      }
      if (participant.join_status === 'left') {
        continue;
      }
      const port = this.portsByProvider.get(participant.runtime_provider);
      if (!port) {
        continue;
      }
      tasks.push(port.sendInboundMessage({
        task_id: input.task_id,
        provider: input.provider,
        thread_ref: input.thread_ref,
        conversation_ref: input.conversation_ref,
        entry_id: input.entry_id,
        body: input.body,
        author_ref: input.author_ref,
        display_name: input.display_name,
        participant_binding_id: participant.id,
        agent_ref: participant.agent_ref,
      }));
    }
    void Promise.allSettled(tasks);
  }
}
