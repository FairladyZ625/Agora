import type { CraftsmanCallbackRequestDto } from '@agora-ts/contracts';
import {
  CraftsmanExecutionRepository,
  FlowLogRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskRepository,
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

    if (input.status === 'succeeded') {
      const output = formatCallbackOutput(input.payload);
      const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
        status: 'done',
        output,
        dispatch_status: 'succeeded',
        done_at: finishedAt,
      });
      this.flowLogs.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'subtask_done',
        stage_id: nextSubtask.stage_id,
        detail: {
          subtask_id: nextSubtask.id,
          execution_id: input.execution_id,
          adapter: nextExecution.adapter,
        },
        actor: nextExecution.adapter,
      });
      this.progressLogs.insertProgressLog({
        task_id: execution.task_id,
        kind: 'progress',
        stage_id: nextSubtask.stage_id,
        subtask_id: nextSubtask.id,
        content: output,
        artifacts: input.payload ?? null,
        actor: nextExecution.adapter,
      });
      return { execution: nextExecution, subtask: nextSubtask, task };
    }

    const errorMessage = input.error ?? formatCallbackOutput(input.payload) ?? `${nextExecution.adapter} callback ${input.status}`;
    const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
      status: 'failed',
      output: errorMessage,
      dispatch_status: input.status,
      done_at: null,
    });
    this.flowLogs.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'subtask_failed',
      stage_id: nextSubtask.stage_id,
      detail: {
        subtask_id: nextSubtask.id,
        execution_id: input.execution_id,
        adapter: nextExecution.adapter,
        status: input.status,
        error: input.error ?? null,
      },
      actor: nextExecution.adapter,
    });
    this.progressLogs.insertProgressLog({
      task_id: execution.task_id,
      kind: 'progress',
      stage_id: nextSubtask.stage_id,
      subtask_id: nextSubtask.id,
      content: errorMessage,
      artifacts: input.payload ?? null,
      actor: nextExecution.adapter,
    });
    return { execution: nextExecution, subtask: nextSubtask, task };
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
