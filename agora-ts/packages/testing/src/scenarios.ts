import { SubtaskRepository, TaskRepository } from '@agora-ts/db';
import type { CreateTestRuntimeOptions, TestRuntime } from './runtime.js';
import { createTestRuntime } from './runtime.js';

export const scenarioNames = [
  'happy-path',
  'reject-rework',
  'quorum-approve',
  'cleanup-orphaned',
  'inbox-promote',
  'authoring-smoke',
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
    case 'inbox-promote':
      return runInboxPromoteScenario(runtime);
    case 'authoring-smoke':
      return runAuthoringSmokeScenario(runtime);
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

  const cleaned = runtime.taskService.cleanupOrphaned(taskId);

  return {
    name: 'cleanup-orphaned',
    taskId,
    finalState: 'deleted',
    currentStage: null,
    events: [],
    completedSubtasks: [],
    cleaned,
  };
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

function buildScenarioResult(
  runtime: TestRuntime,
  name: ScenarioName,
  taskId: string,
  overrides: Partial<ScenarioResult> = {},
): ScenarioResult {
  const status = runtime.taskService.getTaskStatus(taskId);
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
