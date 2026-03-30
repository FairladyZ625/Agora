import { createHash, randomUUID } from 'node:crypto';
import type {
  IngestTaskConversationEntryRequestDto,
  TaskConversationEntryDto,
  TaskConversationMarkReadRequestDto,
  TaskConversationSummaryDto,
} from '@agora-ts/contracts';
import {
  TaskContextBindingRepository,
  TaskConversationRepository,
  TaskConversationReadCursorRepository,
  type AgoraDatabase,
  type StoredTaskContextBinding,
} from '@agora-ts/db';

export interface TaskConversationServiceOptions {
  bindingRepository?: TaskContextBindingRepository;
  conversationRepository?: TaskConversationRepository;
  readCursorRepository?: TaskConversationReadCursorRepository;
  idGenerator?: () => string;
  now?: () => Date;
}

export class TaskConversationService {
  private readonly bindings: TaskContextBindingRepository;
  private readonly entries: TaskConversationRepository;
  private readonly readCursors: TaskConversationReadCursorRepository;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;

  constructor(db: AgoraDatabase, options: TaskConversationServiceOptions = {}) {
    this.bindings = options.bindingRepository ?? new TaskContextBindingRepository(db);
    this.entries = options.conversationRepository ?? new TaskConversationRepository(db);
    this.readCursors = options.readCursorRepository ?? new TaskConversationReadCursorRepository(db);
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

  getSummaryByTask(taskId: string, accountId?: number | null): TaskConversationSummaryDto {
    const latest = this.entries.getLatestByTask(taskId);
    const readCursor = accountId ? this.readCursors.get(taskId, accountId) : null;
    const unreadCount = accountId
      ? this.entries.countUnreadByTask(taskId, readCursor?.last_read_at ?? null)
      : 0;
    return {
      task_id: taskId,
      total_entries: this.entries.countByTask(taskId),
      latest_entry_id: latest?.id ?? null,
      latest_provider: latest?.provider ?? null,
      latest_direction: latest?.direction ?? null,
      latest_author_kind: latest?.author_kind ?? null,
      latest_display_name: latest?.display_name ?? null,
      latest_occurred_at: latest?.occurred_at ?? null,
      latest_body_excerpt: latest ? buildBodyExcerpt(latest.body) : null,
      last_read_at: readCursor?.last_read_at ?? null,
      unread_count: unreadCount,
      has_unread: unreadCount > 0,
    };
  }

  markRead(
    taskId: string,
    accountId: number,
    input: TaskConversationMarkReadRequestDto = {},
  ): TaskConversationSummaryDto {
    const readAt = input.read_at ?? this.now().toISOString();
    this.readCursors.upsert({
      task_id: taskId,
      account_id: accountId,
      last_read_entry_id: input.last_read_entry_id ?? this.entries.getLatestByTask(taskId)?.id ?? null,
      last_read_at: readAt,
      updated_at: this.now().toISOString(),
    });
    return this.getSummaryByTask(taskId, accountId);
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

function buildBodyExcerpt(body: string, maxLength = 160): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}
