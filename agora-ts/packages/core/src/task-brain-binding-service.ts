import { randomUUID } from 'node:crypto';
import type { ITaskBrainBindingRepository, TaskBrainBindingRecord } from '@agora-ts/contracts';

export interface TaskBrainBindingServiceOptions {
  repository: ITaskBrainBindingRepository;
  idGenerator?: () => string;
}

export class TaskBrainBindingService {
  private readonly bindings: ITaskBrainBindingRepository;
  private readonly idGenerator: () => string;

  constructor(options: TaskBrainBindingServiceOptions) {
    this.bindings = options.repository;
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  createBinding(input: {
    task_id: string;
    brain_pack_ref: string;
    brain_task_id: string;
    workspace_path: string;
    metadata?: Record<string, unknown> | null;
  }): TaskBrainBindingRecord {
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

  getActiveBinding(taskId: string): TaskBrainBindingRecord | null {
    return this.bindings.getActiveByTask(taskId);
  }

  listBindings(taskId: string): TaskBrainBindingRecord[] {
    return this.bindings.listByTask(taskId);
  }

  updateStatus(bindingId: string, status: string): void {
    this.bindings.updateStatus(bindingId, status);
  }
}
