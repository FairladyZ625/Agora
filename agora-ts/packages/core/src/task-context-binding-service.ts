import { randomUUID } from 'node:crypto';
import { TaskContextBindingRepository, type AgoraDatabase, type StoredTaskContextBinding } from '@agora-ts/db';

export interface TaskContextBindingServiceOptions {
  idGenerator?: () => string;
}

export class TaskContextBindingService {
  private readonly bindings: TaskContextBindingRepository;
  private readonly idGenerator: () => string;

  constructor(db: AgoraDatabase, options: TaskContextBindingServiceOptions = {}) {
    this.bindings = new TaskContextBindingRepository(db);
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  createBinding(input: {
    task_id: string;
    im_provider: string;
    conversation_ref?: string;
    thread_ref?: string;
    message_root_ref?: string;
  }): StoredTaskContextBinding {
    return this.bindings.insert({
      id: this.idGenerator(),
      task_id: input.task_id,
      im_provider: input.im_provider,
      conversation_ref: input.conversation_ref ?? null,
      thread_ref: input.thread_ref ?? null,
      message_root_ref: input.message_root_ref ?? null,
      status: 'active',
    });
  }

  getActiveBinding(taskId: string): StoredTaskContextBinding | null {
    return this.bindings.getActiveByTask(taskId);
  }

  listBindings(taskId: string): StoredTaskContextBinding[] {
    return this.bindings.listByTask(taskId);
  }

  updateStatus(bindingId: string, status: string): void {
    this.bindings.updateStatus(bindingId, status);
  }
}
