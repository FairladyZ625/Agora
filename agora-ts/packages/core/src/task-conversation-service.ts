import { createHash, randomUUID } from 'node:crypto';
import type {
  IngestTaskConversationEntryRequestDto,
  TaskConversationEntryDto,
} from '@agora-ts/contracts';
import {
  TaskContextBindingRepository,
  TaskConversationRepository,
  type AgoraDatabase,
  type StoredTaskContextBinding,
} from '@agora-ts/db';

export interface TaskConversationServiceOptions {
  idGenerator?: () => string;
  now?: () => Date;
}

export class TaskConversationService {
  private readonly bindings: TaskContextBindingRepository;
  private readonly entries: TaskConversationRepository;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;

  constructor(db: AgoraDatabase, options: TaskConversationServiceOptions = {}) {
    this.bindings = new TaskContextBindingRepository(db);
    this.entries = new TaskConversationRepository(db);
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
  }

  ingest(input: IngestTaskConversationEntryRequestDto): TaskConversationEntryDto | null {
    const binding = this.findBinding(input);
    if (!binding) {
      return null;
    }
    return this.entries.insert({
      id: this.idGenerator(),
      task_id: binding.task_id,
      binding_id: binding.id,
      provider: input.provider,
      provider_message_ref: input.provider_message_ref ?? null,
      parent_message_ref: input.parent_message_ref ?? null,
      direction: input.direction,
      author_kind: input.author_kind,
      author_ref: input.author_ref ?? null,
      display_name: input.display_name ?? null,
      body: input.body,
      body_format: input.body_format ?? 'plain_text',
      occurred_at: input.occurred_at,
      ingested_at: this.now().toISOString(),
      dedupe_key: buildDedupeKey(input),
      metadata: input.metadata ?? null,
    });
  }

  listByTask(taskId: string): TaskConversationEntryDto[] {
    return this.entries.listByTask(taskId);
  }

  private findBinding(input: IngestTaskConversationEntryRequestDto): StoredTaskContextBinding | null {
    const candidates = this.bindings.listByTaskBindingsForRefs({
      thread_ref: input.thread_ref ?? null,
      conversation_ref: input.conversation_ref ?? null,
    });
    return candidates.find((candidate) => candidate.im_provider === input.provider) ?? null;
  }
}

function buildDedupeKey(input: IngestTaskConversationEntryRequestDto): string {
  if (input.provider_message_ref) {
    return `${input.provider}:${input.provider_message_ref}`;
  }
  const basis = JSON.stringify({
    provider: input.provider,
    conversation_ref: input.conversation_ref ?? null,
    thread_ref: input.thread_ref ?? null,
    direction: input.direction,
    author_kind: input.author_kind,
    author_ref: input.author_ref ?? null,
    body: input.body,
    occurred_at: input.occurred_at,
  });
  return `${input.provider}:hash:${createHash('sha1').update(basis).digest('hex')}`;
}
