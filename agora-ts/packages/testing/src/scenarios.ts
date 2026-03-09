import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskService } from '@agora-ts/core';
import { ArchiveJobRepository, CraftsmanExecutionRepository, SubtaskRepository, TaskRepository } from '@agora-ts/db';
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
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });

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
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });

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
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });

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
  runtime.taskService.approveTask(task.id, {
    approverId: 'gpt52',
    comment: 'rework accepted',
  });
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });

  return buildScenarioResult(runtime, 'reject-rework', task.id);
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
  runtime.taskService.forceAdvanceTask(task.id, { reason: 'move to write' });
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
  runtime.taskService.advanceTask(task.id, { callerId: 'archon' });

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

function runPauseResumeDeferredCallbackScenario(runtime: TestRuntime): ScenarioResult {
  const task = runtime.taskService.createTask({
    title: 'Pause resume deferred callback scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise deferred callback settlement',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: (() => {
      subtasks.insertSubtask({
        id: 'resume-subtask',
        task_id: task.id,
        stage_id: task.current_stage ?? 'discuss',
        title: 'Resume after paused callback',
        assignee: 'codex',
        status: 'in_progress',
        craftsman_type: 'codex',
      });
      return 'resume-subtask';
    })(),
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
  const task = runtime.taskService.createTask({
    title: 'Cancel active task scenario',
    type: 'coding',
    creator: 'archon',
    description: 'exercise cancel side effects',
    priority: 'high',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'draft-plan',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Draft the plan',
    assignee: 'opus',
    status: 'not_started',
  });
  subtasks.insertSubtask({
    id: 'run-codex',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Run codex',
    assignee: 'sonnet',
    status: 'in_progress',
    craftsman_type: 'codex',
  });
  subtasks.insertSubtask({
    id: 'keep-done',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Already done',
    assignee: 'gpt52',
    status: 'done',
    output: 'kept',
    done_at: '2026-03-09T10:00:00.000Z',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'run-codex',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman happy path',
    type: 'coding',
    creator: 'archon',
    description: 'dispatch and callback success',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-1',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-1',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman callback failure',
    type: 'coding',
    creator: 'archon',
    description: 'dispatch then fail callback',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-fail',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-fail',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman concurrency limit scenario',
    type: 'coding',
    creator: 'archon',
    description: 'dispatch once and reject the second execution when limit is reached',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-limit-1',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Craftsman slot 1',
    assignee: 'codex',
    craftsman_type: 'codex',
  });
  subtasks.insertSubtask({
    id: 'craft-limit-2',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Craftsman slot 2',
    assignee: 'codex',
    craftsman_type: 'codex',
  });

  const first = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-limit-1',
    adapter: 'codex',
    mode: 'task',
    workdir: '/tmp/craft-limit-1',
  });
  let errorMessage = '';
  try {
    runtime.taskService.dispatchCraftsman({
      task_id: task.id,
      subtask_id: 'craft-limit-2',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman workdir isolation scenario',
    type: 'coding',
    creator: 'archon',
    description: 'dispatch with isolated git workdir policy',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-isolated',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Craftsman isolated workdir',
    assignee: 'codex',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-isolated',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman retry',
    type: 'coding',
    creator: 'archon',
    description: 'fail once then redispatch',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-retry',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const first = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-retry',
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
  const task = runtime.taskService.createTask({
    title: 'Craftsman timeout',
    type: 'coding',
    creator: 'archon',
    description: 'timeout failure path',
    priority: 'normal',
  });
  const subtasks = new SubtaskRepository(runtime.db);
  subtasks.insertSubtask({
    id: 'craft-timeout',
    task_id: task.id,
    stage_id: task.current_stage ?? 'discuss',
    title: 'Run codex',
    assignee: 'sonnet',
    craftsman_type: 'codex',
  });

  const dispatch = runtime.taskService.dispatchCraftsman({
    task_id: task.id,
    subtask_id: 'craft-timeout',
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
