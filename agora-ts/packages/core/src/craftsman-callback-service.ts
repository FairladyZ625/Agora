import type { CraftsmanCallbackRequestDto } from '@agora-ts/contracts';
import {
  CraftsmanExecutionRepository,
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskRepository,
  type StoredCraftsmanExecution,
  type StoredSubtask,
  type StoredTask,
  type AgoraDatabase,
} from '@agora-ts/db';
import { NotFoundError } from './errors.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export class CraftsmanCallbackService {
  private readonly executions: CraftsmanExecutionRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly tasks: TaskRepository;
  private readonly flowLogs: FlowLogRepository;
  private readonly progressLogs: ProgressLogRepository;

  constructor(private readonly db: AgoraDatabase) {
    this.executions = new CraftsmanExecutionRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.tasks = new TaskRepository(db);
    this.flowLogs = new FlowLogRepository(db);
    this.progressLogs = new ProgressLogRepository(db);
  }

  handleCallback(input: CraftsmanCallbackRequestDto) {
    const execution = this.executions.getExecution(input.execution_id);
    if (!execution) {
      throw new NotFoundError(`Craftsman execution ${input.execution_id} not found`);
    }

    const task = this.tasks.getTask(execution.task_id);
    if (!task) {
      throw new NotFoundError(`Task ${execution.task_id} not found`);
    }

    const subtask = this.subtasks.listByTask(execution.task_id).find((item) => item.id === execution.subtask_id);
    if (!subtask) {
      throw new NotFoundError(`Subtask ${execution.subtask_id} not found in task ${execution.task_id}`);
    }

    if (TERMINAL_STATUSES.has(execution.status)) {
      return { execution, subtask, task };
    }

    const finishedAt = input.finished_at ?? new Date().toISOString();
    const nextExecution = this.executions.updateExecution(input.execution_id, {
      status: input.status,
      session_id: input.session_id ?? execution.session_id,
      callback_payload: input.payload ?? null,
      error: input.error ?? null,
      finished_at: finishedAt,
    });

    if (task.state === 'paused') {
      this.flowLogs.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'craftsman_callback_deferred',
        stage_id: subtask.stage_id,
        detail: {
          subtask_id: subtask.id,
          execution_id: input.execution_id,
          adapter: nextExecution.adapter,
          status: input.status,
        },
        actor: nextExecution.adapter,
      });
      return { execution: nextExecution, subtask, task };
    }

    return this.settleExecutionResult(task, subtask, nextExecution);
  }

  resumeDeferredCallbacks(taskId: string) {
    const task = this.tasks.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }

    const results: Array<{ execution_id: string; subtask_id: string }> = [];
    for (const subtask of this.subtasks.listByTask(taskId)) {
      if (subtask.status === 'done' || subtask.status === 'failed') {
        continue;
      }
      const execution = this.executions.listBySubtask(taskId, subtask.id).find((item) => TERMINAL_STATUSES.has(item.status));
      if (!execution) {
        continue;
      }
      this.settleExecutionResult(task, subtask, execution);
      results.push({ execution_id: execution.execution_id, subtask_id: subtask.id });
    }

    return results;
  }

  private settleExecutionResult(
    task: StoredTask,
    subtask: StoredSubtask,
    execution: StoredCraftsmanExecution,
  ) {
    const payload = execution.callback_payload;
    if (execution.status === 'succeeded') {
      const output = formatCallbackOutput(payload);
      const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
        status: 'done',
        output,
        dispatch_status: 'succeeded',
        done_at: execution.finished_at,
      });
      this.flowLogs.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'subtask_done',
        stage_id: nextSubtask.stage_id,
        detail: {
          subtask_id: nextSubtask.id,
          execution_id: execution.execution_id,
          adapter: execution.adapter,
        },
        actor: execution.adapter,
      });
      this.progressLogs.insertProgressLog({
        task_id: execution.task_id,
        kind: 'progress',
        stage_id: nextSubtask.stage_id,
        subtask_id: nextSubtask.id,
        content: output,
        artifacts: payload ?? null,
        actor: execution.adapter,
      });
      return { execution, subtask: nextSubtask, task };
    }

    const errorMessage = execution.error ?? formatCallbackOutput(payload) ?? `${execution.adapter} callback ${execution.status}`;
    const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
      status: 'failed',
      output: errorMessage,
      dispatch_status: execution.status,
      done_at: null,
    });
    this.flowLogs.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'subtask_failed',
      stage_id: nextSubtask.stage_id,
      detail: {
        subtask_id: nextSubtask.id,
        execution_id: execution.execution_id,
        adapter: execution.adapter,
        status: execution.status,
        error: execution.error ?? null,
      },
      actor: execution.adapter,
    });
    this.progressLogs.insertProgressLog({
      task_id: execution.task_id,
      kind: 'progress',
      stage_id: nextSubtask.stage_id,
      subtask_id: nextSubtask.id,
      content: errorMessage,
      artifacts: payload ?? null,
      actor: execution.adapter,
    });
    return { execution, subtask: nextSubtask, task };
  }
}

function formatCallbackOutput(payload: Record<string, unknown> | null | undefined) {
  if (!payload) {
    return '';
  }
  if (typeof payload.summary === 'string' && payload.summary.length > 0) {
    return payload.summary;
  }
  if (typeof payload.stderr === 'string' && payload.stderr.length > 0) {
    return payload.stderr;
  }
  return JSON.stringify(payload);
}
