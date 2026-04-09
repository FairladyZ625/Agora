import type {
  CraftsmanCallbackRequestDto,
  CraftsmanExecutionPayloadDto,
  CraftsmanDispatchRequestDto,
  CraftsmanExecutionTailResponseDto,
  CraftsmanInputKeyDto,
  CreateSubtasksRequestDto,
  CreateSubtasksResponseDto,
  HostResourceSnapshotDto,
  TaskRecord,
  WorkflowDto,
} from '@agora-ts/contracts';
import { craftsmanExecutionSchema, createSubtasksRequestSchema } from '@agora-ts/contracts';
import { normalizeCraftsmanAdapter } from './craftsman-adapter-aliases.js';
import { NotFoundError } from './errors.js';
import { TaskState } from './enums.js';

const TERMINAL_SUBTASK_STATES = new Set(['done', 'failed', 'cancelled', 'archived']);
const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

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

export interface TaskCraftsmanExecutionView {
  execution_id: string;
  task_id: string;
  subtask_id: string;
  adapter: string;
  mode: string;
  session_id: string | null;
  status: string;
  brief_path?: string | null;
  workdir: string | null;
  callback_payload?: CraftsmanExecutionPayloadDto | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TaskCraftsmanSubtaskView {
  id: string;
  task_id?: string;
  stage_id?: string;
  title?: string;
  assignee?: string;
  status: string;
  output?: string | null;
  dispatch_status?: string | null;
  done_at?: string | null;
}

export interface CraftsmanDispatchResult {
  execution: TaskCraftsmanExecutionView;
}

export interface HandleCraftsmanCallbackResult {
  task: TaskRecord;
  subtask: TaskCraftsmanSubtaskView;
  execution: TaskCraftsmanExecutionView;
}

export type ProbeCraftsmanExecutionResult =
  | { execution: TaskCraftsmanExecutionView; probed: false }
  | (HandleCraftsmanCallbackResult & { probed: true });

export interface TaskCraftsmanServiceOptions {
  getTaskOrThrow: (taskId: string) => TaskRecord;
  withControllerRef: (task: TaskRecord) => TaskRecord;
  listSubtasksByTask: (taskId: string) => Array<{
    id: string;
    task_id?: string;
    assignee: string;
    stage_id: string;
    title: string;
    status: string;
    output: string | null;
    dispatch_status: string | null;
    dispatched_at?: string | null;
    done_at?: string | null;
    craftsman_type?: string | null;
    craftsman_workdir?: string | null;
    craftsman_prompt?: string | null;
  }>;
  getSubtaskOrThrow: (taskId: string, subtaskId: string) => {
    id: string;
    assignee: string;
    stage_id: string;
    title: string;
    status: string;
    output: string | null;
    dispatch_status: string | null;
    craftsman_type?: string | null;
    craftsman_workdir?: string | null;
    craftsman_prompt?: string | null;
  };
  getCurrentStageOrThrow: (task: TaskRecord) => WorkflowStageLike;
  getStageByIdOrThrow: (task: TaskRecord, stageId: string) => WorkflowStageLike;
  assertSubtaskControl: (task: TaskRecord, subtask: { id: string; assignee: string }, callerId: string) => void;
  updateSubtask: (
    taskId: string,
    subtaskId: string,
    patch: Record<string, unknown>,
  ) => void;
  assertCraftsmanInteractionGuard: (
    mode: 'one_shot' | 'interactive',
    interactionExpectation: 'one_shot' | 'needs_input' | 'awaiting_choice',
    scope: string,
  ) => void;
  assertCraftsmanDispatchAllowed: (assignee: string, additionalPlanned?: number) => void;
  resolveDispatchWorkdir: (task: TaskRecord) => string;
  materializeExecutionBrief: (
    task: TaskRecord,
    input: {
      subtask_id: string;
      subtask_title: string;
      assignee: string;
      adapter: string;
      mode: 'one_shot' | 'interactive';
      prompt: string | null;
      workdir: string | null;
    },
  ) => string | null;
  enterExecuteMode: (
    taskId: string,
    stageId: string,
    executeDefs: Array<{
      id: string;
      title: string;
      assignee: string;
      craftsman?: {
        adapter: string;
        mode: 'one_shot' | 'interactive';
        workdir: string | null;
        prompt: string | null;
        brief_path: string | null;
      };
    }>,
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
  buildSmokeSubtaskCommands: (
    task: TaskRecord,
    callerId: string,
    createdSubtasks: Array<{ id: string }>,
    dispatchedExecutions: Array<{ execution_id: string }>,
  ) => string[];
  buildSmokeExecutionCommandsForTask: (
    task: TaskRecord,
    executionId: string,
    status: string,
  ) => string[];
  dispatchSubtask?: (input: {
    task_id: string;
    stage_id: string;
    subtask_id: string;
    adapter: string;
    mode: 'one_shot' | 'interactive';
    workdir: string;
    prompt: string | null;
    brief_path: string | null;
  }) => CraftsmanDispatchResult;
  probeViaPort?: (execution: {
    executionId: string;
    adapter: string;
    sessionId: string | null;
    workdir: string | null;
    status: string;
  }) => CraftsmanCallbackRequestDto | null;
  processCraftsmanCallback: (input: CraftsmanCallbackRequestDto) => HandleCraftsmanCallbackResult;
  publishImmediateCraftsmanNotification: (taskId: string, executionId: string, subtaskId: string) => void;
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

  createSubtasks(taskId: string, options: CreateSubtasksRequestDto): CreateSubtasksResponseDto {
    const parsed = createSubtasksRequestSchema.parse(options);
    const task = this.options.getTaskOrThrow(taskId);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${taskId} is in state '${task.state}', expected 'active'`);
    }
    if (!task.current_stage) {
      throw new Error(`Task ${taskId} has no current_stage set`);
    }
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && parsed.caller_id !== controllerRef) {
      throw new Error(`Subtask creation requires controller ownership: expected '${controllerRef}', received '${parsed.caller_id}'`);
    }
    const stage = this.options.getCurrentStageOrThrow(task);
    const executionKind = resolveStageExecutionKind(stage);
    if (executionKind !== 'citizen_execute' && executionKind !== 'craftsman_dispatch') {
      throw new Error(`Stage '${stage.id}' does not allow execute-mode subtasks`);
    }
    const duplicateIds = new Set<string>();
    const existingIds = new Set(this.options.listSubtasksByTask(taskId).map((subtask) => subtask.id));
    const normalizedSubtasks = parsed.subtasks.map((subtask) => ({
      ...subtask,
      ...(subtask.craftsman ? {
        craftsman: {
          ...subtask.craftsman,
          adapter: normalizeCraftsmanAdapter(subtask.craftsman.adapter),
        },
      } : {}),
    }));
    const plannedByAssignee = new Map<string, number>();
    for (const subtask of normalizedSubtasks) {
      if (duplicateIds.has(subtask.id) || existingIds.has(subtask.id)) {
        throw new Error(`Subtask id '${subtask.id}' already exists in task ${taskId}`);
      }
      duplicateIds.add(subtask.id);
      if (subtask.execution_target === 'craftsman' && !stageAllowsCraftsmanDispatch(stage)) {
        throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
      }
      if (subtask.execution_target === 'craftsman' && subtask.craftsman) {
        this.options.assertCraftsmanInteractionGuard(
          subtask.craftsman.mode,
          subtask.craftsman.interaction_expectation,
          `subtask '${subtask.id}'`,
        );
        plannedByAssignee.set(subtask.assignee, (plannedByAssignee.get(subtask.assignee) ?? 0) + 1);
      }
      if (
        task.control?.mode === 'smoke_test'
        && stageAllowsCraftsmanDispatch(stage)
        && subtask.execution_target === 'manual'
      ) {
        throw new Error([
          `Smoke task ${taskId} is in a craftsman-capable stage '${stage.id}', but subtask '${subtask.id}' declares execution_target='manual'.`,
          'If you want a craftsman run, use execution_target="craftsman" and include a craftsman block.',
          'Example:',
          JSON.stringify({
            id: subtask.id,
            title: subtask.title,
            assignee: subtask.assignee,
            execution_target: 'craftsman',
            craftsman: {
              adapter: 'claude',
              mode: 'one_shot',
              interaction_expectation: 'one_shot',
              prompt: '<prompt>',
            },
          }, null, 2),
        ].join('\n'));
      }
    }
    for (const [assignee, planned] of plannedByAssignee) {
      this.options.assertCraftsmanDispatchAllowed(assignee, planned);
    }

    const executeDefs = normalizedSubtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      assignee: subtask.assignee,
      ...(subtask.execution_target === 'craftsman' && subtask.craftsman ? {
        craftsman: {
          adapter: subtask.craftsman.adapter,
          mode: subtask.craftsman.mode,
          workdir: subtask.craftsman.workdir ?? this.options.resolveDispatchWorkdir(task),
          prompt: subtask.craftsman.prompt ?? null,
          brief_path: subtask.craftsman.brief_path
            ?? this.options.materializeExecutionBrief(task, {
              subtask_id: subtask.id,
              subtask_title: subtask.title,
              assignee: subtask.assignee,
              adapter: subtask.craftsman.adapter,
              mode: subtask.craftsman.mode,
              prompt: subtask.craftsman.prompt ?? null,
              workdir: subtask.craftsman.workdir ?? this.options.resolveDispatchWorkdir(task),
            }),
        },
      } : {}),
    }));
    this.options.enterExecuteMode(taskId, stage.id, executeDefs);

    const createdSubtasks = this.options
      .listSubtasksByTask(taskId)
      .filter((subtask) => duplicateIds.has(subtask.id));
    const dispatchedExecutions = createdSubtasks
      .flatMap((subtask) => this.options.listExecutionsBySubtask(taskId, subtask.id))
      .map((execution) => craftsmanExecutionSchema.parse(execution));

    this.options.publishTaskStatusBroadcast(task, {
      kind: 'subtasks_created',
      bodyLines: [
        `Controller ${parsed.caller_id} created ${createdSubtasks.length} subtasks in stage ${stage.id}.`,
        ...createdSubtasks.map((subtask) => `- ${subtask.id} | ${subtask.assignee} | ${subtask.craftsman_type ?? 'manual'}`),
        ...(dispatchedExecutions.length > 0
          ? [`Auto-dispatched executions: ${dispatchedExecutions.map((execution) => `${execution.subtask_id}:${execution.execution_id}`).join(', ')}`]
          : []),
        ...this.options.buildSmokeSubtaskCommands(task, parsed.caller_id, createdSubtasks, dispatchedExecutions),
      ],
    });

    return {
      task: this.options.withControllerRef(this.options.getTaskOrThrow(taskId)) as CreateSubtasksResponseDto['task'],
      subtasks: createdSubtasks as CreateSubtasksResponseDto['subtasks'],
      dispatched_executions: dispatchedExecutions,
    };
  }

  listSubtasks(taskId: string) {
    this.options.getTaskOrThrow(taskId);
    return this.options.listSubtasksByTask(taskId);
  }

  handleCraftsmanCallback(input: CraftsmanCallbackRequestDto): HandleCraftsmanCallbackResult {
    const result = this.options.processCraftsmanCallback(input);
    if (
      result.task.state !== TaskState.PAUSED
      && ['done', 'failed', 'in_progress', 'waiting_input'].includes(result.subtask.status)
      && ['running', 'succeeded', 'failed', 'cancelled', 'needs_input', 'awaiting_choice'].includes(result.execution.status)
    ) {
      this.options.publishImmediateCraftsmanNotification(result.task.id, result.execution.execution_id, result.subtask.id);
    }
    return result;
  }

  dispatchCraftsman(input: CraftsmanDispatchRequestDto): CraftsmanDispatchResult {
    if (!this.options.dispatchSubtask) {
      throw new Error('Craftsman dispatcher is not configured');
    }
    const normalizedAdapter = normalizeCraftsmanAdapter(input.adapter);
    const task = this.options.getTaskOrThrow(input.task_id);
    if (task.state !== TaskState.ACTIVE) {
      throw new Error(`Task ${input.task_id} is in state '${task.state}', expected 'active'`);
    }
    const subtask = this.options.getSubtaskOrThrow(input.task_id, input.subtask_id);
    const controllerRef = resolveControllerRef(task.team.members);
    if (controllerRef && input.caller_id !== controllerRef) {
      throw new Error(`Craftsman dispatch requires controller ownership: expected '${controllerRef}', received '${input.caller_id}'`);
    }
    if (task.current_stage !== subtask.stage_id) {
      throw new Error(
        `Craftsman dispatch requires the active stage '${task.current_stage ?? 'null'}' to match subtask stage '${subtask.stage_id}'`,
      );
    }
    const stage = this.options.getStageByIdOrThrow(task, subtask.stage_id);
    if (!stageAllowsCraftsmanDispatch(stage)) {
      throw new Error(`Stage '${stage.id}' does not allow craftsman dispatch`);
    }
    this.options.assertCraftsmanInteractionGuard(
      input.mode,
      input.interaction_expectation,
      `dispatch for subtask '${subtask.id}'`,
    );
    this.options.assertCraftsmanDispatchAllowed(subtask.assignee);
    const resolvedWorkdir = input.workdir ?? subtask.craftsman_workdir ?? this.options.resolveDispatchWorkdir(task);
    const dispatched = this.options.dispatchSubtask({
      task_id: input.task_id,
      stage_id: subtask.stage_id,
      subtask_id: input.subtask_id,
      adapter: normalizedAdapter,
      mode: input.mode,
      workdir: resolvedWorkdir ?? '',
      prompt: subtask.craftsman_prompt ?? null,
      brief_path: input.brief_path
        ?? this.options.materializeExecutionBrief(task, {
          subtask_id: subtask.id,
          subtask_title: subtask.title,
          assignee: subtask.assignee,
          adapter: normalizedAdapter,
          mode: input.mode,
          prompt: subtask.craftsman_prompt ?? null,
          workdir: resolvedWorkdir,
        }),
    });
    this.options.publishTaskStatusBroadcast(task, {
      kind: 'craftsman_started',
      bodyLines: [
        `Craftsman dispatch started for subtask ${subtask.id}.`,
        `Caller: ${input.caller_id}`,
        `Adapter: ${normalizedAdapter}`,
        `Execution: ${dispatched.execution.execution_id}`,
        ...this.options.buildSmokeExecutionCommandsForTask(
          task,
          dispatched.execution.execution_id,
          dispatched.execution.status,
        ),
      ],
    });
    return dispatched;
  }

  getCraftsmanExecution(executionId: string): TaskCraftsmanExecutionView {
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

  listCraftsmanExecutions(taskId: string, subtaskId: string): TaskCraftsmanExecutionView[] {
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

  sendCraftsmanInputText(executionId: string, text: string, submit = true): InteractiveExecution {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.sendText?.(execution, text, submit);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'text', text);
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  sendCraftsmanInputKeys(executionId: string, keys: CraftsmanInputKeyDto[]): InteractiveExecution {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.sendKeys?.(execution, keys);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'keys', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  submitCraftsmanChoice(executionId: string, keys: CraftsmanInputKeyDto[] = []): InteractiveExecution {
    const execution = this.options.requireInteractiveExecution(executionId);
    this.options.submitChoice?.(execution, keys);
    this.options.recordCraftsmanInput(execution.taskId, execution.subtaskId, execution.executionId, 'choice', keys.join(','));
    this.probeCraftsmanExecution(execution.executionId);
    return execution;
  }

  probeCraftsmanExecution(executionId: string): ProbeCraftsmanExecutionResult {
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
      ...this.handleCraftsmanCallback(callback),
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

function resolveStageExecutionKind(stage: WorkflowStageLike | null | undefined) {
  return stage?.execution_kind
    ?? (
      stage?.mode === 'execute'
        ? 'citizen_execute'
        : stage?.mode === 'discuss'
          ? 'citizen_discuss'
          : null
    );
}

function resolveAllowedActions(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return [];
  }
  if (stage.allowed_actions?.length) {
    return stage.allowed_actions;
  }
  switch (resolveStageExecutionKind(stage)) {
    case 'citizen_execute':
      return ['advance', 'create_subtasks'];
    case 'craftsman_dispatch':
      return ['advance', 'create_subtasks', 'dispatch_craftsman'];
    case 'citizen_discuss':
      return ['advance'];
    default:
      return [];
  }
}

function stageAllowsCraftsmanDispatch(stage: WorkflowStageLike | null | undefined) {
  return resolveStageExecutionKind(stage) === 'craftsman_dispatch'
    || resolveAllowedActions(stage).includes('dispatch_craftsman');
}

function resolveControllerRef(members: TaskRecord['team']['members']) {
  return members.find((member) => member.member_kind === 'controller')?.agentId ?? null;
}
