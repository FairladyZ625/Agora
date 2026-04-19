import { randomUUID } from 'node:crypto';
import type { ITaskContextBindingRepository, TaskContextBindingRecord } from '@agora-ts/contracts';

export interface TaskContextBindingServiceOptions {
  repository: ITaskContextBindingRepository;
  idGenerator?: () => string;
}

export class TaskContextBindingService {
  private readonly bindings: ITaskContextBindingRepository;
  private readonly idGenerator: () => string;

  constructor(options: TaskContextBindingServiceOptions) {
    this.bindings = options.repository;
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  createBinding(input: {
    task_id: string;
    im_provider: string;
    conversation_ref?: string;
    thread_ref?: string;
    message_root_ref?: string;
  }): TaskContextBindingRecord {
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

  getActiveBinding(taskId: string): TaskContextBindingRecord | null {
    return this.bindings.getActiveByTask(taskId);
  }

  getBindingById(bindingId: string): TaskContextBindingRecord | null {
    return this.bindings.getById(bindingId);
  }

  getLatestBinding(taskId: string): TaskContextBindingRecord | null {
    return this.bindings.listByTask(taskId)[0] ?? null;
  }

  listBindings(taskId: string): TaskContextBindingRecord[] {
    return this.bindings.listByTask(taskId);
  }

  findLatestBindingByRefs(input: {
    provider?: string | null;
    thread_ref?: string | null;
    conversation_ref?: string | null;
  }): TaskContextBindingRecord | null {
    const candidates = this.bindings.listByTaskBindingsForRefs({
      thread_ref: input.thread_ref ?? null,
      conversation_ref: input.conversation_ref ?? null,
    });
    return candidates.find((binding) => !input.provider || binding.im_provider === input.provider) ?? null;
  }

  updateStatus(bindingId: string, status: string): void {
    this.bindings.updateStatus(bindingId, status);
  }
}
