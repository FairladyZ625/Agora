import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HumanAccountService, TaskService, TaskContextBindingService } from '@agora-ts/core';
import { ArchiveJobRepository, CraftsmanExecutionRepository, SubtaskRepository, TaskRepository, NotificationOutboxRepository, TaskConversationRepository } from '@agora-ts/db';
import type { CreateTestRuntimeOptions, TestRuntime } from './runtime.js';
import { createTestRuntime } from './runtime.js';

export const scenarioNames = [
  'happy-path',
  'reject-rework',
  'quorum-approve',
  'cleanup-orphaned',
  'archive-notify',
  'archive-receipt',
  'unblock-retry',
  'unblock-skip',
  'unblock-reassign',
  'pause-resume-deferred-callback',
  'pause-resume-missing-session',
  'startup-recovery-missing-session',
  'cancel-active-task',
  'inbox-promote',
  'authoring-smoke',
  'craftsman-happy-path',
  'craftsman-callback-failure',
  'craftsman-concurrency-limit',
  'craftsman-workdir-isolation',
  'craftsman-retry',
  'craftsman-timeout-escalation',
  'craftsman-callback-notify-outbox',
  'runtime-session-binding',
  'task-conversation-ingest',
  'task-action-conversation-mirror',
  'task-conversation-read-cursor',
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export interface ScenarioResult {
  name: ScenarioName;
  taskId: string;
  finalState: string;
  currentStage: string | null;
  events: string[];
  completedSubtasks: string[];
  quorum?: { approved: number; total: number };
  cleaned?: number;
  promotedTargets?: { todo: string; task: string };
  executions?: string[];
  templateChecks?: {
    validated: boolean;
    saved: boolean;
    duplicated: boolean;
    workflowValidated: boolean;
  };
  notificationDelivered?: boolean;
  participantBindings?: string[];
  runtimeSessionRefs?: string[];
  conversationBodies?: string[];
  unreadBefore?: number;
  unreadAfter?: number;
}

export function runScenario(runtime: TestRuntime, name: ScenarioName): ScenarioResult {
  switch (name) {
    case 'happy-path':
      return runHappyPathScenario(runtime);
    case 'reject-rework':
      return runRejectReworkScenario(runtime);
    case 'quorum-approve':
      return runQuorumApproveScenario(runtime);
    case 'cleanup-orphaned':
      return runCleanupOrphanedScenario(runtime);
    case 'archive-notify':
      return runArchiveNotifyScenario(runtime);
    case 'archive-receipt':
      return runArchiveReceiptScenario(runtime);
    case 'unblock-retry':
      return runUnblockRetryScenario(runtime);
    case 'unblock-skip':
      return runUnblockSkipScenario(runtime);
    case 'unblock-reassign':
      return runUnblockReassignScenario(runtime);
    case 'pause-resume-deferred-callback':
      return runPauseResumeDeferredCallbackScenario(runtime);
    case 'pause-resume-missing-session':
      return runPauseResumeMissingSessionScenario(runtime);
    case 'startup-recovery-missing-session':
      return runStartupRecoveryMissingSessionScenario(runtime);
    case 'cancel-active-task':
      return runCancelActiveTaskScenario(runtime);
    case 'inbox-promote':
      return runInboxPromoteScenario(runtime);
    case 'authoring-smoke':
      return runAuthoringSmokeScenario(runtime);
    case 'craftsman-happy-path':
      return runCraftsmanHappyPathScenario(runtime);
    case 'craftsman-callback-failure':
      return runCraftsmanCallbackFailureScenario(runtime);
    case 'craftsman-concurrency-limit':
      return runCraftsmanConcurrencyLimitScenario(runtime);
    case 'craftsman-workdir-isolation':
      return runCraftsmanWorkdirIsolationScenario(runtime);
    case 'craftsman-retry':
      return runCraftsmanRetryScenario(runtime);
    case 'craftsman-timeout-escalation':
      return runCraftsmanTimeoutScenario(runtime);
    case 'craftsman-callback-notify-outbox':
      return runCraftsmanCallbackNotifyOutboxScenario(runtime);
    case 'runtime-session-binding':
      return runRuntimeSessionBindingScenario(runtime);
    case 'task-conversation-ingest':
      return runTaskConversationIngestScenario(runtime);
    case 'task-action-conversation-mirror':
      return runTaskActionConversationMirrorScenario(runtime);
    case 'task-conversation-read-cursor':
      return runTaskConversationReadCursorScenario(runtime);
  }
}

export function runScenarioIsolated(name: ScenarioName, options: CreateTestRuntimeOptions = {}): ScenarioResult {
  const runtime = createTestRuntime(options);
  try {
    return runScenario(runtime, name);
  } finally {
    runtime.cleanup();
  }
}

export function runAllScenarios(options: CreateTestRuntimeOptions = {}): ScenarioResult[] {
  return scenarioNames.map((name) => runScenarioIsolated(name, options));
}

function runHappyPathScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Happy path scenario',
    type: 'document',
    creator: 'archon',
    description: 'Run the standard document lifecycle',
    priority: 'normal',
  });

  runtime.taskService.archonApproveTask(task.id, {
    reviewerId: 'lizeyu',
    comment: 'outline approved',
  });

  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'write-body',
    task_id: task.id,
    stage_id: 'write',
    title: 'Write the document body',
    assignee: 'glm5',
  });
  runtime.taskService.completeSubtask(task.id, {
    subtaskId: 'write-body',
    callerId: 'glm5',
    output: 'Draft completed',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });
  runtime.taskService.approveTask(task.id, {
    approverId: 'gpt52',
    comment: 'review passed',
  });

  return buildScenarioResult(runtime, 'happy-path', task.id);
}

function runRejectReworkScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Reject and rework scenario',
    type: 'document',
    creator: 'archon',
    description: 'Exercise reject then approve flow',
    priority: 'normal',
  });

  runtime.taskService.archonApproveTask(task.id, {
    reviewerId: 'lizeyu',
    comment: 'outline approved',
  });

  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'write-rework',
    task_id: task.id,
    stage_id: 'write',
    title: 'Write the rework draft',
    assignee: 'glm5',
  });
  runtime.taskService.completeSubtask(task.id, {
    subtaskId: 'write-rework',
    callerId: 'glm5',
    output: 'Initial draft',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });
  runtime.taskService.rejectTask(task.id, {
    rejectorId: 'gpt52',
    reason: 'needs another pass',
  });
  subtasks.insertSubtask({
    id: 'write-rework-2',
    task_id: task.id,
    stage_id: 'write',
    title: 'Rewrite after rejection',
    assignee: 'glm5',
  });
  runtime.taskService.completeSubtask(task.id, {
    subtaskId: 'write-rework-2',
    callerId: 'glm5',
    output: 'Reworked draft',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });
  runtime.taskService.approveTask(task.id, {
    approverId: 'gpt52',
    comment: 'rework accepted',
  });

  return buildScenarioResult(runtime, 'reject-rework', task.id);
}

function runRuntimeSessionBindingScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Runtime session binding scenario',
    type: 'coding',
    creator: 'archon',
    description: 'Track live session against task participants',
    priority: 'normal',
  });
  const binding = runtime.taskContextBindingService.createBinding({
    task_id: task.id,
    im_provider: 'discord',
    thread_ref: 'scenario-thread-92',
  });
  runtime.taskParticipationService.attachContextBinding(task.id, binding.id);
  runtime.taskParticipationService.syncLiveSession({
    source: 'openclaw',
    agent_id: 'sonnet',
    session_key: 'agent:sonnet:discord:thread:scenario-92',
    channel: 'discord',
    conversation_id: 'scenario',
    thread_id: 'scenario-thread-92',
    status: 'active',
    last_event: 'session_start',
    last_event_at: '2026-03-10T12:00:00.000Z',
    metadata: { continuity_ref: 'scenario-cont-92' },
  });

  return {
    name: 'runtime-session-binding',
    taskId: task.id,
    finalState: runtime.taskService.getTask(task.id)?.state ?? 'unknown',
    currentStage: runtime.taskService.getTask(task.id)?.current_stage ?? null,
    events: runtime.taskService.getTaskStatus(task.id).flow_log.map((item) => item.event),
    completedSubtasks: runtime.taskService.getTaskStatus(task.id).subtasks.filter((item) => item.status === 'done').map((item) => item.id),
    participantBindings: runtime.taskParticipationService.listParticipants(task.id).map((item) => `${item.agent_ref}:${item.join_status}`),
    runtimeSessionRefs: runtime.taskParticipationService.listRuntimeSessions(task.id).map((item) => item.runtime_session_ref),
  };
}

function runQuorumApproveScenario(runtime: TestRuntime): ScenarioResult {
  const tasks = new TaskRepository(runtime.db);
  const taskId = 'OC-QUORUM';

  const draft = tasks.insertTask({
    id: taskId,
    title: 'Quorum approval scenario',
    description: '',
    type: 'custom',
    priority: 'normal',
    creator: 'archon',
    team: {
      members: [
        { role: 'architect', agentId: 'opus', model_preference: 'reasoning' },
        { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
      ],
    },
    workflow: {
      type: 'vote',
      stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
    },
  });
  const created = tasks.updateTask(taskId, draft.version, { state: 'created' });
  tasks.updateTask(taskId, created.version, { state: 'active', current_stage: 'vote' });
  runtime.db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run(taskId, 'vote');

  const firstVote = runtime.taskService.confirmTask(taskId, {
    voterId: 'opus',
    vote: 'approve',
    comment: 'first yes',
  });
  const secondVote = runtime.taskService.confirmTask(taskId, {
    voterId: 'gpt52',
    vote: 'approve',
    comment: 'second yes',
  });
  runtime.taskService.advanceTask(taskId, { callerId: 'archon' });

  return buildScenarioResult(runtime, 'quorum-approve', taskId, {
    quorum: secondVote.quorum ?? firstVote.quorum,
  });
}

function runCleanupOrphanedScenario(runtime: TestRuntime): ScenarioResult {
  const tasks = new TaskRepository(runtime.db);
  const subtasks = new SubtaskRepository(runtime.db);
  const executions = new CraftsmanExecutionRepository(runtime.db);
  const taskId = 'OC-CLEAN';

  const draft = tasks.insertTask({
    id: taskId,
    title: 'Cleanup orphaned scenario',
    description: '',
    type: 'custom',
    priority: 'normal',
    creator: 'archon',
    team: { members: [] },
    workflow: { stages: [] },
  });
  tasks.updateTask(taskId, draft.version, { state: 'orphaned' });
  subtasks.insertSubtask({
    id: 'cleanup-subtask',
    task_id: taskId,
    stage_id: 'develop',
    title: 'Cleanup execution residue',
    assignee: 'codex',
    status: 'failed',
    craftsman_type: 'codex',
  });
  executions.insertExecution({
    execution_id: 'exec-cleanup-1',
    task_id: taskId,
    subtask_id: 'cleanup-subtask',
    adapter: 'codex',
    mode: 'task',
    status: 'failed',
    session_id: 'tmux:cleanup',
    finished_at: '2026-03-09T10:03:00.000Z',
  });

  const cleaned = runtime.taskService.cleanupOrphaned(taskId);

  return {
    name: 'cleanup-orphaned',
    taskId,
    finalState: 'deleted',
    currentStage: null,
    events: [],
    completedSubtasks: [],
    cleaned,
    executions: ['exec-cleanup-1'],
  };
}

function runArchiveNotifyScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Archive notify scenario',
    type: 'document',
    creator: 'archon',
    description: 'exercise archive notify outbox',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);

  runtime.taskService.archonApproveTask(task.id, {
    reviewerId: 'lizeyu',
    comment: 'outline ok',
  });
  subtasks.insertSubtask({
    id: 'archive-write',
    task_id: task.id,
    stage_id: 'write',
    title: 'Write archive body',
    assignee: 'glm5',
  });
  runtime.taskService.completeSubtask(task.id, {
    subtaskId: 'archive-write',
    callerId: 'glm5',
    output: 'archive ready',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });
  runtime.taskService.approveTask(task.id, {
    approverId: 'gpt52',
    comment: 'approved',
  });

  const archives = new ArchiveJobRepository(runtime.db);
  const job = archives.listArchiveJobs({ taskId: task.id })[0];
  if (!job) {
    throw new Error(`Archive job for ${task.id} was not enqueued`);
  }
  runtime.dashboardQueryService.notifyArchiveJob(job.id);

  return buildScenarioResult(runtime, 'archive-notify', task.id);
}


function runArchiveReceiptScenario(runtime: TestRuntime): ScenarioResult {
  const result = runArchiveNotifyScenario(runtime);
  writeFileSync(join(runtime.archiveReceiptDir, 'archive-job-1.receipt.json'), JSON.stringify({
    job_id: 1,
    status: 'synced',
    commit_hash: 'archive-receipt-commit',
  }), 'utf8');
  runtime.dashboardQueryService.ingestArchiveJobReceipts();
  return buildScenarioResult(runtime, 'archive-receipt', result.taskId);
}

function runUnblockRetryScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Unblock retry scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise unblock retry recovery',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'retry-subtask',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Retry me',
    assignee: 'codex',
    status: 'failed',
    output: 'timed out',
    craftsman_type: 'codex',
    craftsman_session: 'tmux:retry-subtask',
    dispatch_status: 'failed',
    dispatched_at: '2026-03-09T11:00:00.000Z',
    done_at: '2026-03-09T11:01:00.000Z',
  });

  runtime.taskService.updateTaskState(task.id, 'blocked', { reason: 'timeout escalation' });
  runtime.taskService.unblockTask(task.id, { reason: 'retry now', action: 'retry' });

  return buildScenarioResult(runtime, 'unblock-retry', task.id);
}

function runUnblockSkipScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Unblock skip scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise unblock skip recovery',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'skip-subtask',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Skip me',
    assignee: 'codex',
    status: 'failed',
    output: 'timed out',
    craftsman_type: 'codex',
    craftsman_session: 'tmux:skip-subtask',
    dispatch_status: 'failed',
    dispatched_at: '2026-03-09T11:00:00.000Z',
  });

  runtime.taskService.updateTaskState(task.id, 'blocked', { reason: 'human intervention' });
  runtime.taskService.unblockTask(task.id, { reason: 'skip now', action: 'skip' });

  return buildScenarioResult(runtime, 'unblock-skip', task.id);
}

function runUnblockReassignScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Unblock reassign scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise unblock reassign recovery',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'reassign-subtask',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Reassign me',
    assignee: 'codex',
    status: 'failed',
    output: 'timed out',
    craftsman_type: 'codex',
    craftsman_session: 'tmux:reassign-subtask',
    dispatch_status: 'failed',
    dispatched_at: '2026-03-09T11:00:00.000Z',
  });

  runtime.taskService.updateTaskState(task.id, 'blocked', { reason: 'human intervention' });
  runtime.taskService.unblockTask(task.id, {
    reason: 'reassign now',
    action: 'reassign',
    assignee: 'claude',
    craftsman_type: 'claude',
  });

  return buildScenarioResult(runtime, 'unblock-reassign', task.id);
}

function createCraftsmanReadyTask(
  taskService: TestRuntime['taskService'],
  input: { title: string; description: string; priority?: 'low' | 'normal' | 'high' },
) {
  return taskService.createTask({
    title: input.title,
    type: 'coding',
    creator: 'archon',
    description: input.description,
    priority: input.priority ?? 'normal',
    workflow_override: {
      type: 'craftsman-ready',
      stages: [{
        id: 'develop',
        mode: 'execute',
        execution_kind: 'citizen_execute',
        allowed_actions: ['execute', 'dispatch_craftsman'],
        gate: { type: 'all_subtasks_done' },
      }],
    },
  });
}

function runPauseResumeDeferredCallbackScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Pause resume deferred callback scenario',
    description: 'exercise deferred callback settlement',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: (() => {
      subtasks.insertSubtask({
        id: 'resume-subtask',
        task_id: task.id,
        stage_id: task.current_stage ?? 'develop',
        title: 'Resume after paused callback',
        assignee: 'codex',
        status: 'in_progress',
        craftsman_type: 'codex',
      });
      return 'resume-subtask';
    })(),
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });

  runtime.taskService.pauseTask(task.id, { reason: 'hold' });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: dispatch.execution.execution_id,
    status: 'succeeded',
    session_id: dispatch.execution.session_id,
    payload: { summary: 'done while paused' },
    error: null,
    finished_at: '2026-03-09T12:01:00.000Z',
  });
  runtime.taskService.resumeTask(task.id);

  return buildScenarioResult(runtime, 'pause-resume-deferred-callback', task.id, {
    executions: [dispatch.execution.execution_id],
  });
}

function runPauseResumeMissingSessionScenario(runtime: TestRuntime): ScenarioResult {
  const taskService = new TaskService(runtime.db, {
    templatesDir: runtime.templatesDir,
    taskIdGenerator: () => 'OC-DEAD',
    craftsmanDispatcher: runtime.craftsmanDispatcher,
    isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
  });
  const task = taskService.createTask({
    title: 'Pause resume missing session scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise missing session failure on resume',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  const executions = new CraftsmanExecutionRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'dead-subtask',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Dead session subtask',
    assignee: 'codex',
    status: 'in_progress',
    craftsman_type: 'codex',
    craftsman_session: 'tmux:dead',
    dispatch_status: 'running',
    dispatched_at: '2026-03-09T13:00:00.000Z',
  });
  executions.insertExecution({
    execution_id: 'exec-dead-1',
    task_id: task.id,
    subtask_id: 'dead-subtask',
    adapter: 'codex',
    mode: 'task',
    session_id: 'tmux:dead',
    status: 'running',
    started_at: '2026-03-09T13:00:00.000Z',
  });

  taskService.pauseTask(task.id, { reason: 'hold' });
  taskService.resumeTask(task.id);

  return buildScenarioResult(runtime, 'pause-resume-missing-session', task.id, {
    executions: ['exec-dead-1'],
  }, taskService);
}

function runStartupRecoveryMissingSessionScenario(runtime: TestRuntime): ScenarioResult {
  const taskService = new TaskService(runtime.db, {
    templatesDir: runtime.templatesDir,
    taskIdGenerator: () => 'OC-STARTUP',
    craftsmanDispatcher: runtime.craftsmanDispatcher,
    isCraftsmanSessionAlive: (sessionId) => sessionId !== 'tmux:dead',
  });
  const task = taskService.createTask({
    title: 'Startup recovery missing session scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise missing session failure on startup recovery',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  const executions = new CraftsmanExecutionRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'startup-dead',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Dead session on startup',
    assignee: 'codex',
    status: 'in_progress',
    craftsman_type: 'codex',
    craftsman_session: 'tmux:dead',
    dispatch_status: 'running',
    dispatched_at: '2026-03-09T15:00:00.000Z',
  });
  executions.insertExecution({
    execution_id: 'exec-startup-dead-1',
    task_id: task.id,
    subtask_id: 'startup-dead',
    adapter: 'codex',
    mode: 'task',
    session_id: 'tmux:dead',
    status: 'running',
    started_at: '2026-03-09T15:00:00.000Z',
  });

  taskService.startupRecoveryScan();

  return buildScenarioResult(runtime, 'startup-recovery-missing-session', task.id, {
    executions: ['exec-startup-dead-1'],
  }, taskService);
}

function runCancelActiveTaskScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Cancel active task scenario',
    description: 'exercise cancel side effects',
    priority: 'high',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'draft-plan',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Draft the plan',
    assignee: 'opus',
    status: 'not_started',
  });
  subtasks.insertSubtask({
    id: 'run-codex',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex',
    assignee: 'sonnet',
    status: 'in_progress',
    craftsman_type: 'codex',
  });
  subtasks.insertSubtask({
    id: 'keep-done',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Already done',
    assignee: 'gpt52',
    status: 'done',
    output: 'kept',
    done_at: '2026-03-09T10:00:00.000Z',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'run-codex',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.cancelTask(task.id, { reason: 'scope dropped' });

  return buildScenarioResult(runtime, 'cancel-active-task', task.id, {
    executions: [dispatch.execution.execution_id],
  });
}

function runInboxPromoteScenario(runtime: TestRuntime): ScenarioResult {
  const todoSource = runtime.inboxService.createInboxItem({
    text: 'Inbox to todo regression',
    source: 'scenario',
    tags: ['scenario', 'todo'],
  });
  const taskSource = runtime.inboxService.createInboxItem({
    text: 'Inbox to task regression',
    source: 'scenario',
    notes: 'Promote into formal task',
    tags: ['scenario', 'task'],
  });

  const todoPromotion = runtime.inboxService.promoteInboxItem(todoSource.id, {
    target: 'todo',
    type: 'quick',
    creator: 'archon',
    priority: 'normal',
  });
  const taskPromotion = runtime.inboxService.promoteInboxItem(taskSource.id, {
    target: 'task',
    type: 'coding',
    creator: 'archon',
    priority: 'high',
  });
  if (!('todo' in todoPromotion) || !('task' in taskPromotion)) {
    throw new Error('Inbox promote scenario returned unexpected promotion targets');
  }

  return buildScenarioResult(runtime, 'inbox-promote', taskPromotion.task.id, {
    promotedTargets: {
      todo: String(todoPromotion.todo.id),
      task: taskPromotion.task.id,
    },
  });
}

function runAuthoringSmokeScenario(runtime: TestRuntime): ScenarioResult {
  const validation = runtime.templateAuthoringService.validateTemplate({
    name: 'Flow Editor Manual',
    type: 'flow_editor_manual',
    defaultWorkflow: 'draft-review',
    stages: [{ id: 'draft', gate: { type: 'command' } }],
  });
  const saved = runtime.templateAuthoringService.saveTemplate('flow_editor_manual', {
    name: 'Flow Editor Manual',
    type: 'flow_editor_manual',
    defaultWorkflow: 'draft-review',
    stages: [{ id: 'draft', gate: { type: 'command' } }],
  });
  const updated = runtime.templateAuthoringService.updateTemplateWorkflow('flow_editor_manual', {
    defaultWorkflow: 'draft-review-publish',
    stages: [
      { id: 'draft', gate: { type: 'command' } },
      { id: 'publish', gate: { type: 'archon_review' } },
    ],
  });
  const duplicated = runtime.templateAuthoringService.duplicateTemplate('flow_editor_manual', {
    new_id: 'flow_editor_manual_copy',
    name: 'Flow Editor Manual Copy',
  });
  const workflowValidation = runtime.templateAuthoringService.validateWorkflow({
    defaultWorkflow: 'draft-review-publish',
    stages: updated.template.stages ?? [],
  });

  return {
    name: 'authoring-smoke',
    taskId: duplicated.id,
    finalState: validation.valid && workflowValidation.valid ? 'valid' : 'invalid',
    currentStage: updated.template.stages?.[0]?.id ?? null,
    events: [],
    completedSubtasks: [],
    templateChecks: {
      validated: validation.valid,
      saved: saved.saved,
      duplicated: duplicated.id === 'flow_editor_manual_copy',
      workflowValidated: workflowValidation.valid,
    },
  };
}

function runCraftsmanHappyPathScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman happy path',
    description: 'dispatch and callback success',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-1',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-1',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: dispatch.execution.execution_id,
    status: 'succeeded',
    session_id: dispatch.execution.session_id,
    payload: { summary: 'craftsman done' },
    error: null,
    finished_at: '2026-03-08T15:01:00.000Z',
  });

  return buildScenarioResult(runtime, 'craftsman-happy-path', task.id, {
    executions: [dispatch.execution.execution_id],
  });
}

function runCraftsmanCallbackFailureScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman callback failure',
    description: 'dispatch then fail callback',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-fail',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-fail',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: dispatch.execution.execution_id,
    status: 'failed',
    session_id: dispatch.execution.session_id,
    payload: { stderr: 'compile failed' },
    error: 'compile failed',
    finished_at: '2026-03-08T15:02:00.000Z',
  });

  return buildScenarioResult(runtime, 'craftsman-callback-failure', task.id, {
    executions: [dispatch.execution.execution_id],
  });
}

function runCraftsmanConcurrencyLimitScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman concurrency limit scenario',
    description: 'dispatch once and reject the second execution when limit is reached',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-limit-1',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Craftsman slot 1',
    assignee: 'codex',
    craftsman_type: 'codex',
  });
  subtasks.insertSubtask({
    id: 'craft-limit-2',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Craftsman slot 2',
    assignee: 'codex',
    craftsman_type: 'codex',
  });

  const first = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-limit-1',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/craft-limit-1',
  });
  let errorMessage = '';
  try {
    runtime.taskService.dispatchCraftsman({
      task_id: task.id,
      subtask_id: 'craft-limit-2',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'task',
      workdir: '/tmp/craft-limit-2',
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return buildScenarioResult(runtime, 'craftsman-concurrency-limit', task.id, {
    executions: [first.execution.execution_id],
    templateChecks: {
      validated: errorMessage === 'craftsman concurrency limit exceeded: max 1 active executions',
      saved: true,
      duplicated: false,
      workflowValidated: false,
    },
  });
}

function runCraftsmanWorkdirIsolationScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman workdir isolation scenario',
    description: 'dispatch with isolated git workdir policy',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-isolated',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Craftsman isolated workdir',
    assignee: 'codex',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-isolated',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/repo/root',
  });

  return buildScenarioResult(runtime, 'craftsman-workdir-isolation', task.id, {
    executions: [dispatch.execution.execution_id],
    templateChecks: {
      validated: dispatch.execution.workdir === '/isolated/codex/repo',
      saved: true,
      duplicated: false,
      workflowValidated: false,
    },
  });
}

function runCraftsmanRetryScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman retry',
    description: 'fail once then redispatch',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-retry',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const first = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-retry',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: first.execution.execution_id,
    status: 'failed',
    session_id: first.execution.session_id,
    payload: { stderr: 'first failure' },
    error: 'first failure',
    finished_at: '2026-03-08T15:03:00.000Z',
  });
  const second = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-retry',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: second.execution.execution_id,
    status: 'succeeded',
    session_id: second.execution.session_id,
    payload: { summary: 'retry success' },
    error: null,
    finished_at: '2026-03-08T15:04:00.000Z',
  });

  return buildScenarioResult(runtime, 'craftsman-retry', task.id, {
    executions: [first.execution.execution_id, second.execution.execution_id],
  });
}

function runCraftsmanTimeoutScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman timeout',
    description: 'timeout failure path',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-timeout',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-timeout',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: dispatch.execution.execution_id,
    status: 'failed',
    session_id: dispatch.execution.session_id,
    payload: { stderr: 'timeout after 30m' },
    error: 'timeout after 30m',
    finished_at: '2026-03-08T15:05:00.000Z',
  });

  return buildScenarioResult(runtime, 'craftsman-timeout-escalation', task.id, {
    executions: [dispatch.execution.execution_id],
  });
}

function runCraftsmanCallbackNotifyOutboxScenario(runtime: TestRuntime): ScenarioResult {
  const task = createCraftsmanReadyTask(runtime.taskService, {
    title: 'Craftsman callback notify outbox',
    description: 'dispatch with binding, callback, scan outbox',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  const bindingService = new TaskContextBindingService(runtime.db, {
    idGenerator: () => 'bind-notify-1',
  });
  const outbox = new NotificationOutboxRepository(runtime.db);

  bindingService.createBinding({
    task_id: task.id,
    im_provider: 'discord',
    thread_ref: 'thread-notify-test',
  });

  subtasks.insertSubtask({
    id: 'craft-notify',
    task_id: task.id,
    stage_id: task.current_stage ?? 'develop',
    title: 'Run codex with notification',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-notify',
    caller_id: 'opus',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/codex',
  });
  runtime.taskService.handleCraftsmanCallback({
    execution_id: dispatch.execution.execution_id,
    status: 'succeeded',
    session_id: dispatch.execution.session_id,
    payload: { summary: 'notify test done' },
    error: null,
    finished_at: '2026-03-09T16:01:00.000Z',
  });

  const pending = outbox.listByTask(task.id);
  if (pending.length === 0) {
    throw new Error('Expected pending notification in outbox after callback');
  }
  if (pending[0]?.event_type !== 'craftsman_completed') {
    throw new Error(`Expected event_type craftsman_completed, got ${pending[0]?.event_type}`);
  }
  if (pending[0]?.target_binding_id !== 'bind-notify-1') {
    throw new Error(`Expected target_binding_id bind-notify-1, got ${pending[0]?.target_binding_id}`);
  }
  const conversations = new TaskConversationRepository(runtime.db);
  const entries = conversations.listByTask(task.id);
  if (entries.length === 0) {
    throw new Error('Expected mirrored conversation entry after callback');
  }

  return buildScenarioResult(runtime, 'craftsman-callback-notify-outbox', task.id, {
    executions: [dispatch.execution.execution_id],
    notificationDelivered: true,
    conversationBodies: entries.map((entry) => entry.body),
  });
}

function runTaskConversationIngestScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Task conversation ingest scenario',
    type: 'coding',
    creator: 'archon',
    description: 'bind task context and ingest text messages',
    priority: 'normal',
  });

  const binding = runtime.taskContextBindingService.createBinding({
    task_id: task.id,
    im_provider: 'discord',
    conversation_ref: 'scenario-conv',
    thread_ref: 'scenario-thread',
  });

  runtime.taskConversationService.ingest({
    provider: 'discord',
    thread_ref: 'scenario-thread',
    provider_message_ref: 'msg-thread',
    direction: 'inbound',
    author_kind: 'human',
    author_ref: 'reviewer-1',
    display_name: 'Reviewer',
    body: 'message via thread',
    occurred_at: '2026-03-10T13:00:00.000Z',
  });
  runtime.taskConversationService.ingest({
    provider: 'discord',
    conversation_ref: 'scenario-conv',
    provider_message_ref: 'msg-conv',
    direction: 'inbound',
    author_kind: 'human',
    author_ref: 'reviewer-1',
    display_name: 'Reviewer',
    body: 'message via conversation',
    occurred_at: '2026-03-10T13:00:01.000Z',
  });

  const entries = runtime.taskConversationService.listByTask(task.id);
  if (entries.length !== 2) {
    throw new Error(`Expected 2 conversation entries for ${task.id}, got ${entries.length}`);
  }
  if (entries.some((entry) => entry.binding_id !== binding.id)) {
    throw new Error(`Expected all conversation entries to bind to ${binding.id}`);
  }

  return buildScenarioResult(runtime, 'task-conversation-ingest', task.id, {
    conversationBodies: entries.map((entry) => entry.body),
  });
}

function runTaskActionConversationMirrorScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Task action conversation mirror scenario',
    type: 'document',
    creator: 'archon',
    description: 'mirror core task actions into task conversation',
    priority: 'normal',
  });

  runtime.taskContextBindingService.createBinding({
    task_id: task.id,
    im_provider: 'discord',
    thread_ref: 'scenario-actions-thread',
  });

  runtime.taskService.archonApproveTask(task.id, {
    reviewerId: 'lizeyu',
    comment: 'outline ok',
  });

  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'write-doc',
    task_id: task.id,
    stage_id: 'write',
    title: '写正文',
    assignee: 'glm5',
  });
  runtime.taskService.completeSubtask(task.id, {
    subtaskId: 'write-doc',
    callerId: 'glm5',
    output: '初稿完成',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });
  runtime.taskService.rejectTask(task.id, {
    rejectorId: 'gpt52',
    reason: 'needs more structure',
  });
  runtime.taskService.pauseTask(task.id, { reason: 'human hold' });
  runtime.taskService.resumeTask(task.id);

  const entries = new TaskConversationRepository(runtime.db).listByTask(task.id);
  return buildScenarioResult(runtime, 'task-action-conversation-mirror', task.id, {
    conversationBodies: entries.map((entry) => entry.body),
  });
}

function runTaskConversationReadCursorScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Task conversation read cursor scenario',
    type: 'coding',
    creator: 'archon',
    description: 'track unread and read cursor semantics',
    priority: 'normal',
  });
  runtime.taskContextBindingService.createBinding({
    task_id: task.id,
    im_provider: 'discord',
    thread_ref: 'scenario-read-thread',
  });
  const humans = new HumanAccountService(runtime.db);
  const account = humans.bootstrapAdmin({
    username: 'lizeyu',
    password: 'secret-pass',
  });

  runtime.taskConversationService.ingest({
    provider: 'discord',
    thread_ref: 'scenario-read-thread',
    provider_message_ref: 'msg-1',
    direction: 'inbound',
    author_kind: 'human',
    body: 'first unread',
    occurred_at: '2026-03-10T14:00:00.000Z',
  });
  runtime.taskConversationService.ingest({
    provider: 'discord',
    thread_ref: 'scenario-read-thread',
    provider_message_ref: 'msg-2',
    direction: 'outbound',
    author_kind: 'agent',
    body: 'second unread',
    occurred_at: '2026-03-10T14:00:01.000Z',
  });

  const before = runtime.taskConversationService.getSummaryByTask(task.id, account.id);
  const after = runtime.taskConversationService.markRead(task.id, account.id, {
    last_read_entry_id: before.latest_entry_id,
  });

  return buildScenarioResult(runtime, 'task-conversation-read-cursor', task.id, {
    conversationBodies: runtime.taskConversationService.listByTask(task.id).map((entry) => entry.body),
    unreadBefore: before.unread_count,
    unreadAfter: after.unread_count,
  });
}

function buildScenarioResult(
  runtime: TestRuntime,
  name: ScenarioName,
  taskId: string,
  overrides: Partial<ScenarioResult> = {},
  taskService: Pick<TestRuntime['taskService'], 'getTaskStatus'> = runtime.taskService,
): ScenarioResult {
  const status = taskService.getTaskStatus(taskId);
  return {
    name,
    taskId,
    finalState: status.task.state,
    currentStage: status.task.current_stage,
    events: status.flow_log.map((item) => item.event),
    completedSubtasks: status.subtasks.filter((item) => item.status === 'done').map((item) => item.id),
    ...overrides,
  };
}
