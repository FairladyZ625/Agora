import type {
  CraftsmanCallbackRequestDto,
  CraftsmanExecutionTailResponseDto,
  CraftsmanInputKeyDto,
  HostResourceSnapshotDto,
  TaskRecord,
} from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export interface ObserveCraftsmanExecutionsOptions {
  runningAfterMs: number;
  waitingAfterMs: number;
  now?: Date;
}

export interface ObserveCraftsmanExecutionsResult {
  scanned: number;
  probed: number;
  progressed: number;
}

type CraftsmanProbeState = {
  activityMs: number;
  lastProbeMs: number | null;
  attempts: number;
};

type InteractiveExecution = {
  executionId: string;
  adapter: string;
  sessionId: string | null;
  workdir: string | null;
  taskId: string;
  subtaskId: string;
};

export interface TaskCraftsmanServiceOptions {
  getTaskOrThrow: (taskId: string) => TaskRecord;
  getSubtaskOrThrow: (taskId: string, subtaskId: string) => {
    id: string;
    assignee: string;
    stage_id: string;
    status: string;
    output: string | null;
    dispatch_status: string | null;
    craftsman_type?: string | null;
    craftsman_workdir?: string | null;
  };
  assertSubtaskControl: (task: TaskRecord, subtask: { id: string; assignee: string }, callerId: string) => void;
  updateSubtask: (
    taskId: string,
    subtaskId: string,
    patch: Record<string, unknown>,
  ) => void;
  listExecutionsBySubtask: (taskId: string, subtaskId: string) => Array<{
    execution_id: string;
    task_id: string;
    subtask_id: string;
    adapter: string;
    mode: string;
    status: string;
    session_id: string | null;
    workdir: string | null;
    updated_at?: string | null;
    started_at?: string | null;
    created_at?: string | null;
  }>;
  updateExecution: (executionId: string, patch: Record<string, unknown>) => void;
  getExecution: (executionId: string) => {
    execution_id: string;
    task_id: string;
    subtask_id: string;
    adapter: string;
    mode: string;
    status: string;
    session_id: string | null;
    workdir: string | null;
    updated_at?: string | null;
    started_at?: string | null;
    created_at?: string | null;
  } | null;
  tailExecution?: (execution: {
    execution_id: string;
    adapter: string;
    session_id: string | null;
    workdir: string | null;
    status: string;
  }, lines: number) => CraftsmanExecutionTailResponseDto | null;
  insertFlowLog: (input: {
    task_id: string;
    kind: string;
    event: string;
    stage_id?: string | null;
    detail?: Record<string, unknown>;
    actor: string;
  }) => void;
  mirrorConversationEntry: (taskId: string, input: {
    actor: string | null;
    body: string;
    metadata?: Record<string, unknown>;
  }) => void;
  publishTaskStatusBroadcast: (
    task: TaskRecord,
    input: {
      kind: string;
      bodyLines: string[];
    },
  ) => void;
  countActiveExecutions: () => number;
  listActiveExecutionCountsByAssignee: () => Array<{ assignee: string; count: number }>;
  listActiveExecutions: () => Array<{
    execution_id: string;
    task_id: string;
    subtask_id: string;
    adapter: string;
    status: string;
    session_id: string | null;
    updated_at?: string | null;
    started_at?: string | null;
    created_at?: string | null;
  }>;
  readHostSnapshot: () => HostResourceSnapshotDto | null;
  resolveHostPressureStatus: (snapshot: HostResourceSnapshotDto | null) => string;
  buildHostGovernanceWarnings: (snapshot: HostResourceSnapshotDto | null) => string[];
  governanceLimits: {
    maxConcurrentRunning: number | null;
    maxConcurrentPerAgent: number | null;
    hostMemoryWarningUtilizationLimit: number | null;
    hostMemoryUtilizationLimit: number | null;
    hostSwapWarningUtilizationLimit: number | null;
    hostSwapUtilizationLimit: number | null;
    hostLoadPerCpuWarningLimit: number | null;
    hostLoadPerCpuLimit: number | null;
  };
  requireInteractiveExecution: (executionId: string) => InteractiveExecution;
  sendText?: (execution: InteractiveExecution, text: string, submit: boolean) => void;
  sendKeys?: (execution: InteractiveExecution, keys: CraftsmanInputKeyDto[]) => void;
  submitChoice?: (execution: InteractiveExecution, keys: CraftsmanInputKeyDto[]) => void;
  recordCraftsmanInput: (
    taskId: string,
    subtaskId: string,
    executionId: string,
    inputType: 'text' | 'keys' | 'choice',
    detail: string,
  ) => void;
  probeViaPort?: (execution: {
    executionId: string;
    adapter: string;
    sessionId: string | null;
    workdir: string | null;
    status: string;
  }) => CraftsmanCallbackRequestDto | null;
  handleCraftsmanCallback: (input: CraftsmanCallbackRequestDto) => {
    execution: { execution_id: string; status: string };
  };
  getCraftsmanProbeState: (executionId: string, latestActivityMs: number) => CraftsmanProbeState;
  shouldProbeCraftsmanExecution: (nowMs: number, thresholdMs: number, probeState: CraftsmanProbeState) => boolean;
  noteCraftsmanAutoProbe: (executionId: string, latestActivityMs: number, nowMs: number) => void;
}

export class TaskCraftsmanService {
  private readonly options: TaskCraftsmanServiceOptions;

  constructor(options: TaskCraftsmanServiceOptions) {
    this.options = options;
  }

  completeSubtask(taskId: string, options: { subtaskId: string; callerId: string; output: string }): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    const subtask = this.options.getSubtaskOrThrow(taskId, options.subtaskId);
    this.options.assertSubtaskControl(task, subtask, options.callerId);
    this.options.updateSubtask(taskId, options.subtaskId, {
      status: 'done',
      output: options.output,
      done_at: new Date().toISOString(),
    });
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_done',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId },
      actor: options.callerId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} marked done`,
      metadata: {
        event: 'subtask_done',
        subtask_id: options.subtaskId,
      },
    });
    return task;
  }

  archiveSubtask(taskId: string, options: { subtaskId: string; callerId: string; note: string }): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    const subtask = this.options.getSubtaskOrThrow(taskId, options.subtaskId);
    this.options.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    this.options.updateSubtask(taskId, options.subtaskId, {
      status: 'archived',
      output: options.note || subtask.output || `Subtask archived by ${options.callerId}`,
      done_at: now,
    });
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_archived',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} archived`,
      metadata: {
        event: 'subtask_archived',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.options.publishTaskStatusBroadcast(task, {
      kind: 'subtask_archived',
      bodyLines: [
        `Subtask ${options.subtaskId} archived by ${options.callerId}.`,
        ...(options.note ? [`Note: ${options.note}`] : []),
      ],
    });
    return task;
  }

  cancelSubtask(taskId: string, options: { subtaskId: string; callerId: string; note: string }): TaskRecord {
    const task = this.options.getTaskOrThrow(taskId);
    const subtask = this.options.getSubtaskOrThrow(taskId, options.subtaskId);
    this.options.assertSubtaskControl(task, subtask, options.callerId);
    if (TERMINAL_SUBTASK_STATES.has(subtask.status)) {
      throw new Error(`Subtask ${options.subtaskId} is already terminal (${subtask.status})`);
    }
    const now = new Date().toISOString();
    const reason = options.note || `Subtask cancelled by ${options.callerId}`;
    this.options.updateSubtask(taskId, options.subtaskId, {
      status: 'cancelled',
      output: reason,
      dispatch_status: subtask.dispatch_status && !TERMINAL_EXECUTION_STATUSES.has(subtask.dispatch_status)
        ? 'failed'
        : subtask.dispatch_status,
      done_at: now,
    });
    for (const execution of this.options.listExecutionsBySubtask(taskId, subtask.id)) {
      if (TERMINAL_EXECUTION_STATUSES.has(execution.status)) {
        continue;
      }
      this.options.updateExecution(execution.execution_id, {
        status: 'cancelled',
        error: reason,
        finished_at: now,
      });
    }
    this.options.insertFlowLog({
      task_id: taskId,
      kind: 'system',
      event: 'subtask_cancelled',
      stage_id: subtask.stage_id,
      detail: { subtask_id: options.subtaskId, note: options.note || null },
      actor: options.callerId,
    });
    this.options.mirrorConversationEntry(taskId, {
      actor: options.callerId,
      body: `Subtask ${options.subtaskId} cancelled`,
      metadata: {
        event: 'subtask_cancelled',
        subtask_id: options.subtaskId,
        note: options.note || null,
      },
    });
    this.options.publishTaskStatusBroadcast(task, {
      kind: 'subtask_cancelled',
      bodyLines: [
        `Subtask ${options.subtaskId} cancelled by ${options.callerId}.`,
        ...(options.note ? [`Reason: ${options.note}`] : []),
      ],
    });
    return task;
  }

  getCraftsmanExecution(executionId: string) {
    const execution = this.options.getExecution(executionId);
    if (!execution) {
      throw new NotFoundError(`Craftsman execution ${executionId} not found`);
    }
    return execution;
  }

  getCraftsmanExecutionTail(executionId: string, lines = 120): CraftsmanExecutionTailResponseDto {
    if (!Number.isFinite(lines) || lines <= 0) {
      throw new Error('lines must be a positive number');
    }
    const execution = this.getCraftsmanExecution(executionId);
    if (!this.options.tailExecution) {
      return {
        execution_id: execution.execution_id,
        available: false,
        output: null,
        source: 'unavailable',
      };
    }
    return this.options.tailExecution({
      execution_id: execution.execution_id,
      adapter: execution.adapter,
      session_id: execution.session_id,
      workdir: execution.workdir,
      status: execution.status,
    }, lines) ?? {
      execution_id: execution.execution_id,
      available: false,
      output: null,
      source: 'unavailable',
    };
  }

  listCraftsmanExecutions(taskId: string, subtaskId: string) {
    return this.options.listExecutionsBySubtask(taskId, subtaskId);
  }

  getCraftsmanGovernanceSnapshot() {
    const hostSnapshot = this.options.readHostSnapshot();
    return {
      limits: {
        max_concurrent_running: this.options.governanceLimits.maxConcurrentRunning,
        max_concurrent_per_agent: this.options.governanceLimits.maxConcurrentPerAgent,
        host_memory_warning_utilization_limit: this.options.governanceLimits.hostMemoryWarningUtilizationLimit,
        host_memory_utilization_limit: this.options.governanceLimits.hostMemoryUtilizationLimit,
        host_swap_warning_utilization_limit: this.options.governanceLimits.hostSwapWarningUtilizationLimit,
        host_swap_utilization_limit: this.options.governanceLimits.hostSwapUtilizationLimit,
        host_load_per_cpu_warning_limit: this.options.governanceLimits.hostLoadPerCpuWarningLimit,
        host_load_per_cpu_limit: this.options.governanceLimits.hostLoadPerCpuLimit,
      },
      active_executions: this.options.countActiveExecutions(),
      active_by_assignee: this.options.listActiveExecutionCountsByAssignee(),
      active_execution_details: this.options.listActiveExecutions().map((execution) => {
        const subtask = this.options.getSubtaskOrThrow(execution.task_id, execution.subtask_id);
        return {
          execution_id: execution.execution_id,
          task_id: execution.task_id,
          subtask_id: execution.subtask_id,
          assignee: subtask.assignee,
          adapter: execution.adapter,
          status: execution.status,
          session_id: execution.session_id,
          workdir: subtask.craftsman_workdir ?? null,
        };
      }),
      host_pressure_status: this.options.resolveHostPressureStatus(hostSnapshot),
      warnings: this.options.buildHostGovernanceWarnings(hostSnapshot),
      host: hostSnapshot,
    };
  }

  sendCraftsmanInputText(executionId: string, text: string, submit = true) {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.sendText?.(execution, text, submit);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'text', text);
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  sendCraftsmanInputKeys(executionId: string, keys: CraftsmanInputKeyDto[]) {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.sendKeys?.(execution, keys);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'keys', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  submitCraftsmanChoice(executionId: string, keys: CraftsmanInputKeyDto[] = []) {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.submitChoice?.(execution, keys);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'choice', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  probeCraftsmanExecution(executionId: string) {
    const execution = this.getCraftsmanExecution(executionId);
    if (!this.options.probeViaPort) {
      return { execution, probed: false as const };
    }
    const callback = this.options.probeViaPort({
      executionId: execution.execution_id,
      adapter: execution.adapter,
      sessionId: execution.session_id,
      workdir: execution.workdir,
      status: execution.status,
    });
    if (!callback) {
      return { execution, probed: false as const };
    }
    return {
      ...this.options.handleCraftsmanCallback(callback),
      probed: true as const,
    };
  }

  observeCraftsmanExecutions(options: ObserveCraftsmanExecutionsOptions): ObserveCraftsmanExecutionsResult {
    const nowMs = (options.now ?? new Date()).getTime();
    const result: ObserveCraftsmanExecutionsResult = {
      scanned: 0,
      probed: 0,
      progressed: 0,
    };
    for (const execution of this.options.listActiveExecutions()) {
      result.scanned += 1;
      const lastActivityMs = Date.parse(execution.updated_at ?? execution.started_at ?? execution.created_at ?? '');
      if (!Number.isFinite(lastActivityMs)) {
        continue;
      }
      const thresholdMs = execution.status === 'needs_input' || execution.status === 'awaiting_choice'
        ? options.waitingAfterMs
        : options.runningAfterMs;
      if (nowMs - lastActivityMs < thresholdMs) {
        continue;
      }
      const probeState = this.options.getCraftsmanProbeState(execution.execution_id, lastActivityMs);
      if (!this.options.shouldProbeCraftsmanExecution(nowMs, thresholdMs, probeState)) {
        continue;
      }
      this.options.insertFlowLog({
        task_id: execution.task_id,
        kind: 'system',
        event: 'craftsman_auto_probe',
        stage_id: this.options.getSubtaskOrThrow(execution.task_id, execution.subtask_id).stage_id ?? null,
        detail: {
          execution_id: execution.execution_id,
          status: execution.status,
        },
        actor: 'system',
      });
      this.options.noteCraftsmanAutoProbe(execution.execution_id, lastActivityMs, nowMs);
      const probeResult = this.probeCraftsmanExecution(execution.execution_id);
      if (probeResult.probed) {
        result.probed += 1;
        if (probeResult.execution.status !== execution.status) {
          result.progressed += 1;
        }
      }
    }
    return result;
  }
}
