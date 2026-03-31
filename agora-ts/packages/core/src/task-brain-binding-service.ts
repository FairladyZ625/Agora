import { randomUUID } from 'node:crypto';
import { TaskBrainBindingRepository, type AgoraDatabase, type StoredTaskBrainBinding } from '@agora-ts/db';

export interface TaskBrainBindingServiceOptions {
  repository?: TaskBrainBindingRepository;
  idGenerator?: () => string;
}

export class TaskBrainBindingService {
  private readonly bindings: TaskBrainBindingRepository;
  private readonly idGenerator: () => string;

  constructor(db: AgoraDatabase, options: TaskBrainBindingServiceOptions = {}) {
    this.bindings = options.repository ?? new TaskBrainBindingRepository(db);
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  createBinding(input: {
    task_id: string;
    brain_pack_ref: string;
    brain_task_id: string;
    workspace_path: string;
    metadata?: Record<string, unknown> | null;
  }): StoredTaskBrainBinding {
    return this.bindings.insert({
      id: this.idGenerator(),
      task_id: input.task_id,
      brain_pack_ref: input.brain_pack_ref,
      brain_task_id: input.brain_task_id,
      workspace_path: input.workspace_path,
      metadata: input.metadata ?? null,
      status: 'active',
    });
  }

  getActiveBinding(taskId: string): StoredTaskBrainBinding | null {
    return this.bindings.getActiveByTask(taskId);
  }

  listBindings(taskId: string): StoredTaskBrainBinding[] {
    return this.bindings.listByTask(taskId);
  }

  updateStatus(bindingId: string, status: string): void {
    this.bindings.updateStatus(bindingId, status);
  }
}
