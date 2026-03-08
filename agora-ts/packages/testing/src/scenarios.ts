import { SubtaskRepository, TaskRepository } from '@agora-ts/db';
import type { CreateTestRuntimeOptions, TestRuntime } from './runtime.js';
import { createTestRuntime } from './runtime.js';

export const scenarioNames = [
  'happy-path',
  'reject-rework',
  'quorum-approve',
  'cleanup-orphaned',
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
