import type { CraftsmanCallbackRequestDto, CraftsmanExecutionPayloadDto } from '@agora-ts/contracts';
import {
  CraftsmanExecutionRepository,
  FlowLogRepository,
  NotificationOutboxRepository,
  ProgressLogRepository,
  SubtaskRepository,
  TaskConversationRepository,
  TaskContextBindingRepository,
  TaskRepository,
  type StoredCraftsmanExecution,
  type StoredSubtask,
  type StoredTask,
  type AgoraDatabase,
} from '@agora-ts/db';
import { randomUUID } from 'node:crypto';
import { NotFoundError } from './errors.js';
import { formatCraftsmanOutput, normalizeCraftsmanOutput } from './craftsman-output.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const INPUT_WAITING_STATUSES = new Set(['needs_input', 'awaiting_choice']);

export class CraftsmanCallbackService {
  private readonly executions: CraftsmanExecutionRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly tasks: TaskRepository;
  private readonly flowLogs: FlowLogRepository;
  private readonly progressLogs: ProgressLogRepository;
  private readonly outbox: NotificationOutboxRepository;
  private readonly bindings: TaskContextBindingRepository;
  private readonly conversations: TaskConversationRepository;

  constructor(private readonly db: AgoraDatabase) {
    this.executions = new CraftsmanExecutionRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.tasks = new TaskRepository(db);
    this.flowLogs = new FlowLogRepository(db);
    this.progressLogs = new ProgressLogRepository(db);
    this.outbox = new NotificationOutboxRepository(db);
    this.bindings = new TaskContextBindingRepository(db);
    this.conversations = new TaskConversationRepository(db);
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
      finished_at: INPUT_WAITING_STATUSES.has(input.status) ? null : finishedAt,
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

    if (INPUT_WAITING_STATUSES.has(nextExecution.status)) {
      return this.recordInputRequired(task, subtask, nextExecution);
    }

    if (nextExecution.status === 'running') {
      return this.recordRunningProgress(task, subtask, nextExecution);
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
      if (subtask.status === 'done' || subtask.status === 'failed' || subtask.status === 'cancelled' || subtask.status === 'archived') {
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
    const payload = execution.callback_payload as CraftsmanExecutionPayloadDto | null;
    const normalizedOutput = normalizeCraftsmanOutput(payload);
    let nextSubtask: StoredSubtask;
    let eventType: string;

    if (execution.status === 'succeeded') {
      const output = formatCraftsmanOutput(payload);
      nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
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
        artifacts: normalizedOutput ?? payload ?? null,
        actor: execution.adapter,
      });
      eventType = 'craftsman_completed';
    } else {
      const errorMessage = execution.error ?? formatCraftsmanOutput(payload) ?? `${execution.adapter} callback ${execution.status}`;
      nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
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
        artifacts: normalizedOutput ?? payload ?? null,
        actor: execution.adapter,
      });
      eventType = 'craftsman_failed';
    }

    this.enqueueNotification(task, execution, nextSubtask, eventType);

    return { execution, subtask: nextSubtask, task };
  }

  private recordInputRequired(
    task: StoredTask,
    subtask: StoredSubtask,
    execution: StoredCraftsmanExecution,
  ) {
    const payload = execution.callback_payload as CraftsmanExecutionPayloadDto | null;
    const inputRequest = payload?.input_request ?? null;
    const output = formatCraftsmanOutput(payload)
      ?? inputRequest?.hint
      ?? `${execution.adapter} requires follow-up input`;
    const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
      status: 'waiting_input',
      output,
      dispatch_status: execution.status,
      done_at: null,
    });
    const eventType = execution.status === 'awaiting_choice' ? 'craftsman_awaiting_choice' : 'craftsman_needs_input';
    this.flowLogs.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'subtask_waiting_input',
      stage_id: nextSubtask.stage_id,
      detail: {
        subtask_id: nextSubtask.id,
        execution_id: execution.execution_id,
        adapter: execution.adapter,
        status: execution.status,
        input_request: inputRequest,
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
    this.enqueueNotification(task, execution, nextSubtask, eventType);
    return { execution, subtask: nextSubtask, task };
  }

  private recordRunningProgress(
    task: StoredTask,
    subtask: StoredSubtask,
    execution: StoredCraftsmanExecution,
  ) {
    const payload = execution.callback_payload as CraftsmanExecutionPayloadDto | null;
    const output = formatCraftsmanOutput(payload) ?? `${execution.adapter} resumed and is running`;
    const nextSubtask = this.subtasks.updateSubtask(execution.task_id, execution.subtask_id, {
      status: 'in_progress',
      output,
      dispatch_status: execution.status,
      done_at: null,
    });
    this.flowLogs.insertFlowLog({
      task_id: execution.task_id,
      kind: 'system',
      event: 'subtask_running',
      stage_id: nextSubtask.stage_id,
      detail: {
        subtask_id: nextSubtask.id,
        execution_id: execution.execution_id,
        adapter: execution.adapter,
        status: execution.status,
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
    this.enqueueNotification(task, execution, nextSubtask, 'craftsman_running');
    return { execution, subtask: nextSubtask, task };
  }

  private enqueueNotification(
    task: StoredTask,
    execution: StoredCraftsmanExecution,
    subtask: StoredSubtask,
    eventType: string,
  ) {
    const binding = this.bindings.getActiveByTask(task.id);
    if (!binding) {
      return;
    }
    this.outbox.insert({
      id: randomUUID(),
      task_id: task.id,
      event_type: eventType,
      target_binding_id: binding.id,
      payload: {
        execution_id: execution.execution_id,
        subtask_id: subtask.id,
        adapter: execution.adapter,
        status: execution.status,
        output: subtask.output,
      },
      sequence_no: Date.now(),
    });
    this.conversations.insert({
      id: randomUUID(),
      task_id: task.id,
      binding_id: binding.id,
      provider: binding.im_provider,
      direction: 'system',
      author_kind: 'craftsman',
      author_ref: execution.adapter,
      display_name: execution.adapter,
      body: subtask.output ?? `${execution.adapter} ${eventType}`,
      body_format: 'plain_text',
      occurred_at: execution.finished_at ?? new Date().toISOString(),
      dedupe_key: `callback:${execution.execution_id}:${eventType}`,
      metadata: {
        event_type: eventType,
        execution_id: execution.execution_id,
        subtask_id: subtask.id,
        status: execution.status,
      },
    });
  }
}
