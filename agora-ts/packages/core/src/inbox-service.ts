import type { PromoteInboxRequestDto, TaskPriority, UpdateInboxRequestDto } from '@agora-ts/contracts';
import { InboxRepository, TodoRepository, type AgoraDatabase } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type { TaskService } from './task-service.js';

export class InboxService {
  private readonly inboxRepository: InboxRepository;
  private readonly todoRepository: TodoRepository;

  constructor(
    db: AgoraDatabase,
    private readonly taskService: TaskService,
  ) {
    this.inboxRepository = new InboxRepository(db);
    this.todoRepository = new TodoRepository(db);
  }

  listInboxItems(status?: string) {
    return this.inboxRepository.listInboxItems(status);
  }

  createInboxItem(input: {
    text: string;
    source?: string;
    notes?: string;
    tags?: string[];
  }) {
    return this.inboxRepository.insertInboxItem(input);
  }

  updateInboxItem(inboxId: number, updates: UpdateInboxRequestDto) {
    const existing = this.inboxRepository.getInboxItem(inboxId);
    if (!existing) {
      throw new NotFoundError(`Inbox item ${inboxId} not found`);
    }
    const nextUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    return this.inboxRepository.updateInboxItem(inboxId, nextUpdates);
  }

  deleteInboxItem(inboxId: number) {
    const deleted = this.inboxRepository.deleteInboxItem(inboxId);
    if (!deleted) {
      throw new NotFoundError(`Inbox item ${inboxId} not found`);
    }
    return { deleted: true };
  }

  promoteInboxItem(inboxId: number, options: PromoteInboxRequestDto) {
    const item = this.inboxRepository.getInboxItem(inboxId);
    if (!item) {
      throw new NotFoundError(`Inbox item ${inboxId} not found`);
    }
    if (item.promoted_to_id) {
      throw new Error(`Inbox item ${inboxId} already promoted to ${item.promoted_to_type}:${item.promoted_to_id}`);
    }

    if (options.target === 'todo') {
      const todo = this.todoRepository.insertTodo({
        text: item.text,
        project_id: null,
        tags: item.tags,
      });
      const inbox = this.inboxRepository.updateInboxItem(inboxId, {
        status: 'promoted',
        promoted_to_type: 'todo',
        promoted_to_id: String(todo.id),
      });
      return { inbox, todo };
    }

    const task = this.taskService.createTask({
      title: item.text,
      type: options.type,
      creator: options.creator,
      description: item.notes ?? '',
      priority: options.priority as TaskPriority,
      locale: 'zh-CN',
    });
    const inbox = this.inboxRepository.updateInboxItem(inboxId, {
      status: 'promoted',
      promoted_to_type: 'task',
      promoted_to_id: task.id,
    });
    return { inbox, task };
  }
}
