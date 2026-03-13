import { randomUUID } from 'node:crypto';
import { CraftsmanExecutionRepository, SubtaskRepository, type AgoraDatabase } from '@agora-ts/db';
import type { CraftsmanModeDto } from '@agora-ts/contracts';
import type { CraftsmanAdapter } from './craftsman-adapter.js';
import type { WorkdirIsolator } from './workdir-isolator.js';

export interface DispatchSubtaskInput {
  task_id: string;
  stage_id: string;
  subtask_id: string;
  adapter: string;
  mode: CraftsmanModeDto;
  workdir?: string | null;
  prompt?: string | null;
  brief_path?: string | null;
}

export interface CraftsmanDispatcherOptions {
  adapters: Record<string, CraftsmanAdapter>;
  executionIdGenerator?: () => string;
  maxConcurrentRunning?: number;
  workdirIsolator?: WorkdirIsolator;
}

export class CraftsmanDispatcher {
  private readonly executions: CraftsmanExecutionRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly adapters: Record<string, CraftsmanAdapter>;
  private readonly executionIdGenerator: () => string;
  private readonly maxConcurrentRunning: number | null;
  private readonly workdirIsolator: WorkdirIsolator | undefined;

  constructor(
    db: AgoraDatabase,
    options: CraftsmanDispatcherOptions,
  ) {
    this.executions = new CraftsmanExecutionRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.adapters = options.adapters;
    this.executionIdGenerator = options.executionIdGenerator ?? (() => randomUUID());
    this.maxConcurrentRunning = options.maxConcurrentRunning ?? null;
    this.workdirIsolator = options.workdirIsolator;
  }

  dispatchSubtask(input: DispatchSubtaskInput) {
    if (this.maxConcurrentRunning !== null && this.executions.countActiveExecutions() >= this.maxConcurrentRunning) {
      throw new Error(`craftsman concurrency limit exceeded: max ${this.maxConcurrentRunning} active executions`);
    }
    const executionId = this.executionIdGenerator();
    const adapter = this.adapters[input.adapter];
    if (!adapter) {
      throw new Error(`Craftsman adapter '${input.adapter}' not configured`);
    }
    const isolatedWorkdir = this.workdirIsolator?.isolate({
      executionId,
      taskId: input.task_id,
      subtaskId: input.subtask_id,
      adapter: input.adapter,
      workdir: input.workdir ?? null,
    }) ?? input.workdir ?? null;

    this.executions.insertExecution({
      execution_id: executionId,
      task_id: input.task_id,
      subtask_id: input.subtask_id,
      adapter: input.adapter,
      mode: input.mode,
      brief_path: input.brief_path ?? null,
      workdir: isolatedWorkdir,
      started_at: null,
    });

    this.subtasks.updateSubtask(input.task_id, input.subtask_id, {
      craftsman_type: input.adapter,
      craftsman_session: null,
      craftsman_workdir: isolatedWorkdir,
      craftsman_prompt: input.prompt ?? null,
      status: 'pending',
      dispatch_status: 'queued',
      dispatched_at: new Date().toISOString(),
    });

    try {
      const result = adapter.dispatchTask({
        execution_id: executionId,
        task_id: input.task_id,
        stage_id: input.stage_id,
        subtask_id: input.subtask_id,
        adapter: input.adapter,
        mode: input.mode,
        workdir: isolatedWorkdir,
        prompt: input.prompt ?? null,
        brief_path: input.brief_path ?? null,
      });

      const execution = this.executions.updateExecution(executionId, {
        status: result.status,
        session_id: result.session_id,
        callback_payload: result.payload ?? null,
        error: null,
        started_at: result.started_at,
        finished_at: result.status === 'failed' ? (result.started_at ?? new Date().toISOString()) : null,
      });
      const subtask = this.subtasks.updateSubtask(input.task_id, input.subtask_id, {
        craftsman_session: result.session_id,
        status: result.status === 'failed' ? 'failed' : 'in_progress',
        dispatch_status: result.status,
        ...(result.status === 'failed' ? { done_at: result.started_at ?? new Date().toISOString() } : {}),
      });
      return { execution, subtask };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.executions.updateExecution(executionId, {
        status: 'failed',
        error: message,
        finished_at: new Date().toISOString(),
      });
      this.subtasks.updateSubtask(input.task_id, input.subtask_id, {
        status: 'failed',
        dispatch_status: 'failed',
        done_at: new Date().toISOString(),
      });
      throw error;
    }
  }
}
