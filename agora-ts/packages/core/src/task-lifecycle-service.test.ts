import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { CraftsmanExecutionRepository, FlowLogRepository, ProgressLogRepository, ProjectRepository, SubtaskRepository, TaskRepository, TodoRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import type { TaskRecord } from '@agora-ts/contracts';
import { TaskLifecycleService } from './task-lifecycle-service.js';

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-lifecycle-'));
  const db = createAgoraDatabase({ dbPath: join(dir, 'task-lifecycle.db') });
  runMigrations(db);
  return {
    dir,
    db,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function buildLifecycleCallbacks() {
  return {
    tryLoadTemplate: () => null,
    buildWorkflow: () => ({ type: 'custom', stages: [] }),
    buildTeam: () => ({ members: [] }),
    enrichTeam: (team: TaskRecord['team']) => team,
    taskIdGenerator: () => 'OC-LIFECYCLE-CREATE-1',
    validateProjectBinding: () => {},
    enterStage: () => {},
    seedTaskParticipants: () => {},
    createTaskBrainWorkspace: () => null,
    destroyTaskBrainWorkspace: () => {},
    recordProjectTaskBinding: () => {},
    persistTaskAuthority: () => {},
  };
}

describe('TaskLifecycleService', () => {
  it('builds task status using lifecycle-owned query assembly', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const progressLogRepository = new ProgressLogRepository(db);
      const subtaskRepository = new SubtaskRepository(db);
      const todoRepository = new TodoRepository(db);
      const created = taskRepository.insertTask({
        id: 'OC-LIFECYCLE-1',
        title: 'Lifecycle status',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      taskRepository.updateTask(created.id, created.version, {
        state: 'active',
        current_stage: 'draft',
      });
      flowLogRepository.insertFlowLog({
        task_id: 'OC-LIFECYCLE-1',
        kind: 'flow',
        event: 'state_changed',
        stage_id: 'draft',
        actor: 'system',
      });
      progressLogRepository.insertProgressLog({
        task_id: 'OC-LIFECYCLE-1',
        kind: 'progress',
        stage_id: 'draft',
        content: 'Entered stage draft',
        actor: 'system',
      });
      subtaskRepository.insertSubtask({
        id: 'sub-lifecycle-1',
        task_id: 'OC-LIFECYCLE-1',
        stage_id: 'draft',
        title: 'Do lifecycle work',
        assignee: 'opus',
        status: 'pending',
      });

      const service = new TaskLifecycleService({
        databasePort: db,
        taskRepository,
        flowLogRepository,
        progressLogRepository,
        subtaskRepository,
        todoRepository,
        createTask: () => {
          throw new Error('not used');
        },
        ...buildLifecycleCallbacks(),
        withControllerRef: (task) => ({
          ...task,
          controller_ref: 'opus',
        } as TaskRecord),
        buildTaskBlueprint: () => ({
          graph_version: 1,
          entry_nodes: ['draft'],
          controller_ref: 'opus',
          nodes: [],
          edges: [],
          artifact_contracts: [],
          role_bindings: [],
        }),
        buildCurrentStageRoster: () => ({
          stage_id: 'draft',
          desired_participant_refs: ['opus'],
          joined_participant_refs: [],
          participant_states: [],
        }),
      });

      const status = service.getTaskStatus('OC-LIFECYCLE-1');

      expect(status.task.id).toBe('OC-LIFECYCLE-1');
      expect(status.task_blueprint).toBeDefined();
      expect(status.task_blueprint?.entry_nodes).toEqual(['draft']);
      expect(status.current_stage_roster?.stage_id).toBe('draft');
      expect(status.flow_log).toHaveLength(1);
      expect(status.progress_log).toHaveLength(1);
      expect(status.subtasks).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it('promotes project-bound todos into tasks that keep the same project id', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const progressLogRepository = new ProgressLogRepository(db);
      const subtaskRepository = new SubtaskRepository(db);
      const todoRepository = new TodoRepository(db);
      new ProjectRepository(db).insertProject({
        id: 'proj-life-1',
        name: 'Lifecycle Project',
      });
      const todo = todoRepository.insertTodo({
        text: 'promote into lifecycle task',
        project_id: 'proj-life-1',
      });
      const service = new TaskLifecycleService({
        databasePort: db,
        taskRepository,
        flowLogRepository,
        progressLogRepository,
        subtaskRepository,
        todoRepository,
        createTask: (input) => {
          const inserted = taskRepository.insertTask({
            id: 'OC-LIFECYCLE-TODO-1',
            title: input.title,
            description: input.description,
            type: input.type,
            creator: input.creator,
            priority: input.priority,
            locale: input.locale,
            ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
            workflow: { type: 'custom', stages: [] },
            team: { members: [] },
          });
          return taskRepository.updateTask(inserted.id, inserted.version, {
            state: 'active',
          });
        },
        ...buildLifecycleCallbacks(),
        withControllerRef: (task) => task,
        buildTaskBlueprint: () => ({
          graph_version: 1,
          entry_nodes: [],
          controller_ref: null,
          nodes: [],
          edges: [],
          artifact_contracts: [],
          role_bindings: [],
        }),
        buildCurrentStageRoster: () => undefined,
      });

      const promoted = service.promoteTodo(todo.id, {
        type: 'coding',
        creator: 'archon',
        priority: 'high',
      });

      expect(promoted.todo.project_id).toBe('proj-life-1');
      expect(promoted.task.project_id).toBe('proj-life-1');
      expect(promoted.todo.promoted_to).toBe('OC-LIFECYCLE-TODO-1');
    } finally {
      fixture.cleanup();
    }
  });

  it('cleans up orphaned task rows together with craftsman execution residue', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const progressLogRepository = new ProgressLogRepository(db);
      const subtaskRepository = new SubtaskRepository(db);
      const todoRepository = new TodoRepository(db);
      const executions = new CraftsmanExecutionRepository(db);
      const draft = taskRepository.insertTask({
        id: 'OC-LIFECYCLE-ORPHAN-1',
        title: 'orphan cleanup',
        description: '',
        type: 'custom',
        priority: 'normal',
        creator: 'archon',
        locale: 'zh-CN',
        workflow: { type: 'custom', stages: [] },
        team: { members: [] },
      });
      taskRepository.updateTask(draft.id, draft.version, { state: 'orphaned' });
      subtaskRepository.insertSubtask({
        id: 'sub-orphan-1',
        task_id: 'OC-LIFECYCLE-ORPHAN-1',
        stage_id: 'draft',
        title: 'cleanup residue',
        assignee: 'codex',
        status: 'failed',
        craftsman_type: 'codex',
      });
      executions.insertExecution({
        execution_id: 'exec-orphan-life-1',
        task_id: 'OC-LIFECYCLE-ORPHAN-1',
        subtask_id: 'sub-orphan-1',
        adapter: 'codex',
        mode: 'one_shot',
        status: 'failed',
        session_id: 'tmux:orphan-life',
        finished_at: '2026-03-09T10:03:00.000Z',
      });

      const service = new TaskLifecycleService({
        databasePort: db,
        taskRepository,
        flowLogRepository,
        progressLogRepository,
        subtaskRepository,
        todoRepository,
        createTask: () => {
          throw new Error('not used');
        },
        ...buildLifecycleCallbacks(),
        withControllerRef: (task) => task,
        buildTaskBlueprint: () => ({
          graph_version: 1,
          entry_nodes: [],
          controller_ref: null,
          nodes: [],
          edges: [],
          artifact_contracts: [],
          role_bindings: [],
        }),
        buildCurrentStageRoster: () => undefined,
      });

      const cleaned = service.cleanupOrphaned('OC-LIFECYCLE-ORPHAN-1');

      expect(cleaned).toBe(1);
      expect(taskRepository.getTask('OC-LIFECYCLE-ORPHAN-1')).toBeNull();
      expect(executions.getExecution('exec-orphan-life-1')).toBeNull();
    } finally {
      fixture.cleanup();
    }
  });

  it('creates active tasks through lifecycle-owned transactional core', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const flowLogRepository = new FlowLogRepository(db);
      const progressLogRepository = new ProgressLogRepository(db);
      const subtaskRepository = new SubtaskRepository(db);
      const todoRepository = new TodoRepository(db);
      const enterStageCalls: Array<{ taskId: string; stageId: string }> = [];
      const seedCalls: Array<{ taskId: string; team: TaskRecord['team']; firstStageId: string | null }> = [];
      const authorityCalls: Array<{ taskId: string; approver_account_id: number | null }> = [];
      const service = new TaskLifecycleService({
        databasePort: db,
        taskRepository,
        flowLogRepository,
        progressLogRepository,
        subtaskRepository,
        todoRepository,
        createTask: () => {
          throw new Error('not used');
        },
        tryLoadTemplate: () => ({
          name: 'Coding Template',
          defaultWorkflow: 'custom',
          stages: [
            { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          ],
          defaultTeam: {
            architect: { suggested: ['opus'], member_kind: 'controller', model_preference: 'strong_reasoning' },
          },
        }),
        buildWorkflow: (template) => ({
          type: template.defaultWorkflow ?? 'custom',
          stages: template.stages ?? [],
        }),
        buildTeam: (template) => ({
          members: Object.entries(template.defaultTeam ?? {}).map(([role, config]) => ({
            role,
            agentId: config.suggested?.[0] ?? role,
            ...(config.member_kind ? { member_kind: config.member_kind } : {}),
            model_preference: config.model_preference ?? '',
          })),
        }),
        enrichTeam: (team) => team,
        taskIdGenerator: () => 'OC-LIFECYCLE-CREATE-1',
        validateProjectBinding: () => {},
        enterStage: (taskId, stageId) => {
          enterStageCalls.push({ taskId, stageId });
        },
        seedTaskParticipants: (input) => {
          seedCalls.push({
            taskId: input.taskId,
            team: input.team,
            firstStageId: input.firstStage?.id ?? null,
          });
        },
        createTaskBrainWorkspace: () => ({
          brain_pack_ref: 'brain-pack',
          brain_task_id: 'brain-task',
          workspace_path: '/tmp/agora-task-life',
          metadata: null,
        }),
        destroyTaskBrainWorkspace: () => {},
        recordProjectTaskBinding: () => {},
        persistTaskAuthority: (taskId, authority) => {
          authorityCalls.push({
            taskId,
            approver_account_id: authority?.approver_account_id ?? null,
          });
        },
        withControllerRef: (task) => task,
        buildTaskBlueprint: () => ({
          graph_version: 1,
          entry_nodes: ['draft'],
          controller_ref: 'opus',
          nodes: [],
          edges: [],
          artifact_contracts: [],
          role_bindings: [],
        }),
        buildCurrentStageRoster: () => undefined,
      });

      const result = service.createTaskCore({
        title: 'Create task with skill policy',
        type: 'coding',
        creator: 'archon',
        description: '',
        priority: 'normal',
        control: {
          mode: 'smoke_test',
        },
        skill_policy: {
          global_refs: ['planning-with-files'],
          role_refs: {
            architect: ['brainstorming'],
          },
          enforcement: 'required',
        },
        authority: {
          approver_account_id: 42,
        },
      });

      expect(result.task.id).toBe('OC-LIFECYCLE-CREATE-1');
      expect(result.task.state).toBe('active');
      expect(result.task.current_stage).toBe('draft');
      expect(result.task.skill_policy).toEqual({
        global_refs: ['planning-with-files'],
        role_refs: {
          architect: ['brainstorming'],
        },
        enforcement: 'required',
      });
      expect(result.task.control).toMatchObject({
        mode: 'smoke_test',
      });
      expect(result.brainWorkspaceBinding?.workspace_path).toBe('/tmp/agora-task-life');
      expect(flowLogRepository.listByTask('OC-LIFECYCLE-CREATE-1')).toHaveLength(2);
      expect(progressLogRepository.listByTask('OC-LIFECYCLE-CREATE-1')).toHaveLength(1);
      expect(enterStageCalls).toEqual([{ taskId: 'OC-LIFECYCLE-CREATE-1', stageId: 'draft' }]);
      expect(seedCalls).toHaveLength(1);
      expect(seedCalls[0]?.firstStageId).toBe('draft');
      expect(authorityCalls).toEqual([{ taskId: 'OC-LIFECYCLE-CREATE-1', approver_account_id: 42 }]);
    } finally {
      fixture.cleanup();
    }
  });
});
