import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalRequestRepository, ArchiveJobRepository, CraftsmanExecutionRepository, createAgoraDatabase, ProjectRepository, ProjectWriteLockRepository, runMigrations, SubtaskRepository, TaskBrainBindingRepository, TaskConversationRepository, TaskRepository, TaskContextBindingRepository, TemplateRepository, TodoRepository } from '@agora-ts/db';
import {
  createCitizenServiceFromDb,
  createCraftsmanDispatcherFromDb,
  createProjectServiceFromDb,
  createRolePackServiceFromDb,
  createTaskBrainBindingServiceFromDb,
  createTaskContextBindingServiceFromDb,
  createTaskParticipationServiceFromDb,
  createTaskServiceFromDb,
} from '@agora-ts/testing';
import { AcpCraftsmanProbePort } from '@agora-ts/adapters-runtime';
import { StubCraftsmanAdapter } from './craftsman-adapter.js';
import { FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, FilesystemTaskBrainWorkspaceAdapter } from '@agora-ts/adapters-brain';
import { OpenClawCitizenProjectionAdapter } from '@agora-ts/adapters-openclaw';
import type { CraftsmanInputPortExecution } from './craftsman-input-port.js';
import type { CraftsmanProbePortExecution } from './craftsman-probe-port.js';
import type { CraftsmanTailPortExecution } from './craftsman-tail-port.js';
import { LiveSessionStore } from './live-session-store.js';
import { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import { ProjectBrainService } from './project-brain-service.js';
import { ProjectContextWriter } from './project-context-writer.js';
import type { RuntimeRecoveryPort } from './runtime-recovery-port.js';
import { StubIMProvisioningPort } from './im-ports.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');
type TaskServiceBuilderOptions = NonNullable<Parameters<typeof createTaskServiceFromDb>[1]>;

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-service-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function makeEmptyTemplatesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-empty-templates-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  return dir;
}

function makeBrainPackDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-brain-pack-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  cpSync(resolve(process.cwd(), '../agora-ai-brain/roles'), join(dir, 'roles'), {
    recursive: true,
  });
  return dir;
}

function runGit(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initCommittedRepo(dir: string, files: Record<string, string> = { 'README.md': 'hello\n' }) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(dir, relativePath);
    mkdirSync(join(absolutePath, '..'), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  }
  runGit(dir, ['-c', 'init.defaultBranch=main', 'init', '--quiet']);
  runGit(dir, ['config', 'user.name', 'Agora']);
  runGit(dir, ['config', 'user.email', 'agora@example.com']);
  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '--quiet', '-m', 'init']);
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('task service', () => {
  it('builds a unified health snapshot across tasks, contexts, runtime sessions, craftsman, and host', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const liveSessionStore = new LiveSessionStore({ staleAfterMs: 1234 });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HEALTH-1',
      imProvisioningPort: new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'thread-1',
      }),
      craftsmanDispatcher: createCraftsmanDispatcherFromDb(db, {
        adapters: {
          claude: new StubCraftsmanAdapter('claude'),
        },
      }),
      liveSessionStore: liveSessionStore as unknown as NonNullable<TaskServiceBuilderOptions['liveSessionStore']>,
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-14T04:30:00.000Z',
          platform: 'darwin',
          cpu_count: 8,
          load_1m: 1.2,
          memory_total_bytes: 100,
          memory_used_bytes: 50,
          memory_utilization: 0.5,
          memory_pressure: 0.4,
          swap_total_bytes: 100,
          swap_used_bytes: 10,
          swap_utilization: 0.1,
        }),
      },
    });

    service.createTask({
      title: 'Health snapshot smoke',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'build',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
    });

    new TaskContextBindingRepository(db).insert({
      id: 'binding-health-1',
      task_id: 'OC-HEALTH-1',
      im_provider: 'discord',
      conversation_ref: 'discord-parent',
      thread_ref: 'thread-1',
      status: 'active',
    });

    service.createSubtasks('OC-HEALTH-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-health',
          title: 'Health execution',
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude',
            mode: 'interactive',
            interaction_expectation: 'needs_input',
            prompt: 'wait for input',
          },
        },
      ],
    });

    liveSessionStore.upsert({
      source: 'openclaw',
      agent_id: 'opus',
      session_key: 'sess-opus-1',
      channel: 'discord',
      status: 'active',
      last_event: 'provider_ready',
      last_event_at: new Date().toISOString(),
      metadata: {},
    });
    liveSessionStore.upsert({
      source: 'openclaw',
      agent_id: 'opus',
      session_key: 'sess-opus-0',
      channel: 'discord',
      status: 'closed',
      last_event: 'runtime_closed',
      last_event_at: '2026-03-14T04:00:00.000Z',
      metadata: {},
    });
    liveSessionStore.upsert({
      source: 'openclaw',
      agent_id: 'sonnet',
      session_key: 'sess-sonnet-1',
      channel: 'discord',
      status: 'closed',
      last_event: 'runtime_closed',
      last_event_at: '2026-03-14T04:10:00.000Z',
      metadata: {},
    });
    liveSessionStore.upsert({
      source: 'openclaw',
      agent_id: 'sonnet',
      session_key: 'sess-sonnet-2',
      channel: 'discord',
      status: 'closed',
      last_event: 'runtime_closed',
      last_event_at: '2026-03-14T04:20:00.000Z',
      metadata: {},
    });

    const snapshot = service.getHealthSnapshot();

    expect(snapshot.tasks).toMatchObject({
      total_tasks: 1,
      active_tasks: 1,
      status: 'healthy',
    });
    expect(snapshot.im).toMatchObject({
      active_bindings: 1,
      active_threads: 1,
      status: 'healthy',
    });
    expect(snapshot.runtime).toMatchObject({
      available: true,
      active_sessions: 1,
      stale_after_ms: 1234,
      status: 'degraded',
    });
    expect(snapshot.runtime.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agent_id: 'opus',
        status: 'active',
        session_count: 2,
      }),
      expect.objectContaining({
        agent_id: 'sonnet',
        status: 'closed',
        session_count: 2,
        last_event_at: '2026-03-14T04:20:00.000Z',
      }),
    ]));
    expect(snapshot.craftsman).toMatchObject({
      active_executions: 1,
      waiting_input_executions: 0,
      status: 'healthy',
    });
    expect(snapshot.host).toMatchObject({
      status: 'healthy',
      snapshot: {
        platform: 'darwin',
        memory_pressure: 0.4,
      },
    });
    expect(snapshot.escalation).toMatchObject({
      status: 'degraded',
      controller_pinged_tasks: 0,
      roster_pinged_tasks: 0,
      inbox_escalated_tasks: 0,
      unhealthy_runtime_agents: 1,
      runtime_unhealthy: true,
      policy: {
        controller_after_ms: 300000,
        roster_after_ms: 900000,
        inbox_after_ms: 1800000,
      },
    });
  });

  it('requests runtime diagnosis through the recovery port and records control-plane events', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-RUNTIME-DIAG-1',
      agentRuntimePort: {
        resolveAgent: () => ({
          agent_ref: 'opus',
          runtime_provider: 'openclaw',
          runtime_actor_ref: 'runtime-opus',
        }),
      },
      runtimeRecoveryPort: {
        requestRuntimeDiagnosis: () => ({
          operation: 'request_runtime_diagnosis',
          task_id: 'OC-RUNTIME-DIAG-1',
          agent_ref: 'opus',
          status: 'accepted',
          health: 'healthy',
          runtime_provider: 'openclaw',
          runtime_actor_ref: 'runtime-opus',
          summary: 'runtime-opus looks healthy',
          detail: 'last heartbeat just now',
        }),
        restartCitizenRuntime: () => {
          throw new Error('not used');
        },
        stopExecution: () => {
          throw new Error('not used');
        },
      },
    });

    service.createTask({
      title: 'Runtime diagnosis test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
    });

    const result = service.requestRuntimeDiagnosis('OC-RUNTIME-DIAG-1', {
      task_id: 'OC-RUNTIME-DIAG-1',
      agent_ref: 'opus',
      caller_id: 'opus',
      reason: 'health check',
    });

    expect(result).toMatchObject({
      status: 'accepted',
      health: 'healthy',
      summary: 'runtime-opus looks healthy',
    });
    const flow = db.prepare("SELECT event FROM flow_log WHERE task_id = 'OC-RUNTIME-DIAG-1' ORDER BY id DESC LIMIT 1").get() as { event: string };
    expect(flow.event).toBe('runtime_diagnosis_requested');
  });

  it('requests craftsman stop through the recovery port for a running execution', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-stop-1',
      adapters: {
        claude: new StubCraftsmanAdapter('claude'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STOP-1',
      craftsmanDispatcher: dispatcher,
      runtimeRecoveryPort: {
        requestRuntimeDiagnosis: () => {
          throw new Error('not used');
        },
        restartCitizenRuntime: () => {
          throw new Error('not used');
        },
        stopExecution: (input: Parameters<RuntimeRecoveryPort['stopExecution']>[0]) => ({
          operation: 'stop_execution',
          status: 'accepted',
          task_id: input.taskId,
          agent_ref: input.adapter,
          execution_id: input.executionId,
          summary: 'stop signal sent',
          detail: null,
        }),
      },
    });

    service.createTask({
      title: 'Craftsman stop test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'build',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
    });

    service.createSubtasks('OC-STOP-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-stop',
          title: 'stop me',
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude',
            mode: 'interactive',
            interaction_expectation: 'needs_input',
            prompt: 'wait',
          },
        },
      ],
    });

    const result = service.stopCraftsmanExecution('exec-stop-1', {
      caller_id: 'opus',
      reason: 'operator stop',
    });

    expect(result).toMatchObject({
      operation: 'stop_execution',
      status: 'accepted',
      execution_id: 'exec-stop-1',
    });
    const flow = db.prepare("SELECT event FROM flow_log WHERE task_id = 'OC-STOP-1' ORDER BY id DESC LIMIT 1").get() as { event: string };
    expect(flow.event).toBe('craftsman_stop_requested');
  });

  it('rejects stop requests for terminal craftsman executions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-stop-terminal-1',
      adapters: {
        claude: new StubCraftsmanAdapter('claude'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STOP-TERM-1',
      craftsmanDispatcher: dispatcher,
      runtimeRecoveryPort: {
        requestRuntimeDiagnosis: () => {
          throw new Error('not used');
        },
        restartCitizenRuntime: () => {
          throw new Error('not used');
        },
        stopExecution: () => {
          throw new Error('not used');
        },
      },
    });

    service.createTask({
      title: 'terminal stop test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'build',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
    });

    service.createSubtasks('OC-STOP-TERM-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-stop-terminal',
          title: 'terminal stop',
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'done',
          },
        },
      ],
    });
    service.handleCraftsmanCallback({
      execution_id: 'exec-stop-terminal-1',
      status: 'succeeded',
      session_id: 'tmux:claude',
      payload: null,
      error: null,
      finished_at: '2026-03-14T00:00:00.000Z',
    });

    expect(() =>
      service.stopCraftsmanExecution('exec-stop-terminal-1', {
        caller_id: 'opus',
      }),
    ).toThrow(/already terminal/);
  });

  it('creates a task from template and exposes task status payloads', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-100',
    });

    const task = service.createTask({
      title: '迁移 TS 任务主链路',
      type: 'coding',
      creator: 'archon',
      description: '先追平 create/list/get/status',
      priority: 'high',
    });
    const listed = service.listTasks();
    const status = service.getTaskStatus('OC-100');

    expect(task.id).toBe('OC-100');
    expect(task.state).toBe('active');
    expect(task.current_stage).toBe('discuss');
    expect(task.team.members.map((member) => member.role)).toContain('architect');
    expect(listed).toHaveLength(1);
    expect(status.task.id).toBe('OC-100');
    expect(status.task.controller_ref).toBe('opus');
    expect(status.task_blueprint).toMatchObject({
      graph_version: 1,
      entry_nodes: ['discuss'],
      controller_ref: 'opus',
      nodes: [
        { id: 'discuss', gate_type: 'archon_review' },
        { id: 'develop', gate_type: 'all_subtasks_done' },
        { id: 'review', gate_type: 'archon_review' },
      ],
      edges: [
        { from: 'discuss', to: 'develop', kind: 'advance' },
        { from: 'develop', to: 'review', kind: 'advance' },
        { from: 'review', to: 'develop', kind: 'reject' },
      ],
    });
    expect(status.flow_log).toHaveLength(2);
    expect(status.progress_log).toHaveLength(1);
    expect(status.subtasks).toEqual([]);
  });

  it('builds task blueprint from workflow.graph when present', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-BLUEPRINT',
    });

    const task = service.createTask({
      title: 'Graph blueprint',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          {
            id: 'review',
            mode: 'discuss',
            roster: { include_roles: ['reviewer'], keep_controller: true },
            gate: { type: 'approval', approver: 'reviewer' },
          },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['draft'],
          nodes: [
            { id: 'draft', kind: 'stage', execution_kind: 'citizen_discuss', gate: { type: 'command' } },
            {
              id: 'review',
              kind: 'stage',
              execution_kind: 'human_approval',
              roster: { include_roles: ['reviewer'], keep_controller: true },
              gate: { type: 'approval', approver: 'reviewer' },
            },
          ],
          edges: [
            { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
            { id: 'review__reject__draft', from: 'review', to: 'draft', kind: 'reject' },
          ],
        },
      },
    });

    const status = service.getTaskStatus(task.id);
    expect(status.task_blueprint).toMatchObject({
      graph_version: 1,
      entry_nodes: ['draft'],
      nodes: [
        { id: 'draft', execution_kind: 'citizen_discuss' },
        {
          id: 'review',
          execution_kind: 'human_approval',
          gate_type: 'approval',
          roster: { include_roles: ['reviewer'], keep_controller: true },
        },
      ],
      edges: [
        { from: 'draft', to: 'review', kind: 'advance' },
        { from: 'review', to: 'draft', kind: 'reject' },
      ],
    });
  });

  it('retains branch and complete edges in task blueprints for graph-backed workflows', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-BLUEPRINT-2',
    });

    const task = service.createTask({
      title: 'Graph blueprint branch+complete',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'fast-path', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          { id: 'deep-review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['triage'],
          nodes: [
            { id: 'triage', kind: 'stage', gate: { type: 'command' } },
            { id: 'fast-path', kind: 'stage', execution_kind: 'citizen_execute', gate: { type: 'all_subtasks_done' } },
            { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
            { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
            { id: 'fast-path__complete__done', from: 'fast-path', to: 'done', kind: 'complete' },
          ],
        },
      },
    });

    const status = service.getTaskStatus(task.id);
    expect(status.task_blueprint?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'triage', to: 'fast-path', kind: 'branch' }),
        expect.objectContaining({ from: 'fast-path', to: 'done', kind: 'complete' }),
      ]),
    );
  });

  it('uses workflow.graph entry_nodes[0] as the initial current stage for graph-backed tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-ENTRY-1',
    });

    const task = service.createTask({
      title: 'Graph entry stage',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
          { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['draft'],
          nodes: [
            { id: 'draft', kind: 'stage', gate: { type: 'command' } },
            { id: 'review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
            { id: 'review__reject__draft', from: 'review', to: 'draft', kind: 'reject' },
          ],
        },
      },
    });

    expect(task.current_stage).toBe('draft');
  });

  it('marks graph-backed tasks done when advance follows a complete edge into a terminal node', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-COMPLETE-1',
      archonUsers: ['archon'],
    });

    service.createTask({
      title: 'Graph complete edge',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'deliver', mode: 'execute', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['deliver'],
          nodes: [
            { id: 'deliver', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal', terminal: { outcome: 'shipped', summary: 'Deliverable shipped' } },
          ],
          edges: [
            { id: 'deliver__complete__done', from: 'deliver', to: 'done', kind: 'complete' },
          ],
        },
      },
    });

    expect(service.getTaskStatus('OC-GRAPH-COMPLETE-1').task_blueprint).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'done',
          kind: 'terminal',
          terminal: {
            outcome: 'shipped',
            summary: 'Deliverable shipped',
          },
        }),
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({
          from: 'deliver',
          to: 'done',
          kind: 'complete',
        }),
      ]),
    });

    const advanced = service.advanceTask('OC-GRAPH-COMPLETE-1', {
      callerId: 'archon',
    });

    expect(advanced).toMatchObject({
      id: 'OC-GRAPH-COMPLETE-1',
      state: 'done',
      current_stage: null,
    });
    expect(service.getTaskStatus('OC-GRAPH-COMPLETE-1').flow_log.at(-1)).toMatchObject({
      event: 'state_changed',
      detail: JSON.stringify({
        transition_kind: 'advance',
        terminal_node_id: 'done',
        terminal_outcome: 'shipped',
        terminal_summary: 'Deliverable shipped',
      }),
    });
  });

  it('creates tasks from the database-backed template catalog even when the legacy templates directory is empty', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templates = new TemplateRepository(db);
    templates.seedFromDir(templatesDir);

    const service = createTaskServiceFromDb(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-DB-TEMPLATE',
    });

    const task = service.createTask({
      title: '数据库模板创建',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
    });

    expect(task).toMatchObject({
      id: 'OC-DB-TEMPLATE',
      type: 'coding',
      current_stage: 'discuss',
    });
  });

  it('creates an ad-hoc task when team and workflow overrides are fully provided for an unknown type', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);

    const service = createTaskServiceFromDb(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-ADHOC-OVERRIDE',
    });

    const created = service.createTask({
      title: 'Ad-hoc orchestration',
      type: 'adhoc-runtime-task',
      creator: 'archon',
      description: 'create from explicit overrides only',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'claude-opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        ],
      },
    });

    const status = service.getTaskStatus('OC-ADHOC-OVERRIDE');

    expect(created).toMatchObject({
      id: 'OC-ADHOC-OVERRIDE',
      type: 'adhoc-runtime-task',
      state: 'active',
      current_stage: 'triage',
    });
    expect(created.team.members.map((member) => member.role)).toEqual(['architect', 'developer']);
    expect(status.task_blueprint).toMatchObject({
      entry_nodes: ['triage'],
      controller_ref: 'claude-opus',
      nodes: [
        { id: 'triage', gate_type: 'command' },
        { id: 'ship', gate_type: 'all_subtasks_done' },
      ],
    });
  });

  it('creates a brain binding and materialized workspace when task brain services are configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-100',
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    const task = service.createTask({
      title: 'Brain pack materialization',
      type: 'coding',
      creator: 'archon',
      description: 'materialize task workspace',
      priority: 'high',
    });

    const bindings = new TaskBrainBindingRepository(db);
    const binding = bindings.getActiveByTask(task.id);
    expect(binding).toMatchObject({
      id: 'brain-binding-1',
      task_id: 'OC-BRAIN-100',
      brain_pack_ref: 'agora-ai-brain',
      brain_task_id: 'OC-BRAIN-100',
      status: 'active',
    });
    expect(binding?.workspace_path).toBe(join(brainPackDir, 'tasks', 'OC-BRAIN-100'));
    expect(existsSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', 'task.meta.yaml'))).toBe(true);
    expect(existsSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '05-agents', 'opus', '00-role-brief.md'))).toBe(true);
    expect(existsSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '05-agents', 'opus', '03-citizen-scaffold.md'))).toBe(true);
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '05-agents', 'opus', '03-citizen-scaffold.md'), 'utf8')).toContain('Soul');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '05-agents', 'opus', '03-citizen-scaffold.md'), 'utf8')).toContain('Clarify system shape');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-BRAIN-100', '02-roster.md'), 'utf8')).toContain('opus | architect | controller');
  });

  it('materializes current stage desired roster into the brain workspace', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-ROSTER-1',
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-roster-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Brain roster materialization',
      type: 'custom',
      creator: 'archon',
      description: 'show current stage roster',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: { include_roles: ['reviewer'], keep_controller: true },
            gate: { type: 'command' },
          },
        ],
      },
    });

    const rosterDoc = readFileSync(join(brainPackDir, 'tasks', 'OC-BRAIN-ROSTER-1', '02-roster.md'), 'utf8');
    expect(rosterDoc).toContain('当前阶段目标成员');
    expect(rosterDoc).toContain('opus');
    expect(rosterDoc).toContain('sonnet');
    expect(rosterDoc).not.toContain('glm5 | current_stage_target');
  });

  it('creates a project-scoped brain workspace when task project binding is provided', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    new ProjectRepository(db).insertProject({
      id: 'proj-alpha',
      name: 'Project Alpha',
      summary: 'project brain scope',
    });
    const brainPackDir = makeBrainPackDir();
    const projectStateDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-state-'));
    tempPaths.push(projectStateDir);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-PROJECT',
      projectService: createProjectServiceFromDb(db),
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-project',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    const task = service.createTask({
      title: 'Project scoped brain pack',
      type: 'coding',
      creator: 'archon',
      description: 'materialize project workspace',
      priority: 'high',
      project_id: 'proj-alpha',
    });

    const binding = new TaskBrainBindingRepository(db).getActiveByTask(task.id);
    const workspacePath = join(projectStateDir, 'proj-alpha', 'tasks', 'OC-BRAIN-PROJECT');
    expect(task.project_id).toBe('proj-alpha');
    expect(binding?.workspace_path).toBe(workspacePath);
    expect(binding?.metadata).toMatchObject({
      project_id: 'proj-alpha',
    });
    expect(existsSync(join(workspacePath, 'task.meta.yaml'))).toBe(true);
    expect(readFileSync(join(workspacePath, 'task.meta.yaml'), 'utf8')).toContain('project_id: "proj-alpha"');
    expect(readFileSync(join(workspacePath, '00-current.md'), 'utf8')).toContain('Project: proj-alpha');
    expect(readFileSync(join(workspacePath, '05-agents', 'opus', '00-role-brief.md'), 'utf8')).toContain(
      join(brainPackDir, 'roles', 'architect.md'),
    );
    expect(binding?.brain_pack_ref).toBe('agora-project-state');
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-alpha', 'tasks', 'OC-BRAIN-PROJECT'))).toBe(false);
  });

  it('materializes audience-specific project brain context files for project-bound tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectStateDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-state-'));
    tempPaths.push(projectStateDir);
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-bootstrap',
      name: 'Project Bootstrap',
      summary: 'Automation bootstrap context',
    });
    projectService.upsertKnowledgeEntry({
      project_id: 'proj-bootstrap',
      kind: 'decision',
      slug: 'runtime-boundary',
      title: 'Runtime Boundary',
      summary: 'Keep runtime adapters outside core.',
      body: 'Runtime adapters stay outside core and expose provider-neutral ports.',
      source_task_ids: ['OC-BOOT-0'],
    });
    const rolePackService = createRolePackServiceFromDb(db);
    rolePackService.saveRoleDefinition({
      id: 'architect',
      name: 'Architect',
      member_kind: 'citizen',
      summary: 'Design systems.',
      prompt_asset: 'roles/architect.md',
      source: 'test',
      source_ref: null,
      default_model_preference: null,
      allowed_target_kinds: ['runtime_agent'],
      citizen_scaffold: {
        soul: 'Think in systems.',
        boundaries: ['Keep runtime adapters outside core.'],
        heartbeat: ['Restate objective.'],
        recap_expectations: ['Summarize next step.'],
      },
      metadata: {},
    });
    const citizenService = createCitizenServiceFromDb(db, {
      projectService,
      rolePackService,
      projectionPorts: [new OpenClawCitizenProjectionAdapter()],
    });
    citizenService.createCitizen({
      citizen_id: 'citizen-alpha',
      project_id: 'proj-bootstrap',
      role_id: 'architect',
      display_name: 'Alpha Architect',
      persona: null,
      boundaries: [],
      skills_ref: [],
      channel_policies: {},
      brain_scaffold_mode: 'role_default',
      runtime_projection: {
        adapter: 'openclaw',
        auto_provision: false,
        metadata: {},
      },
    });
    const projectBrainService = new ProjectBrainService({
      projectService: projectService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['projectService']>,
      citizenService: citizenService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainService>[0]['citizenService']>,
      projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    const automationService = new ProjectBrainAutomationService({
      projectBrainService: projectBrainService as unknown as NonNullable<ConstructorParameters<typeof ProjectBrainAutomationService>[0]['projectBrainService']>,
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-BOOTSTRAP',
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-bootstrap',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
      projectBrainAutomationService: automationService as unknown as NonNullable<TaskServiceBuilderOptions['projectBrainAutomationService']>,
    });

    service.createTask({
      title: 'Project bootstrap task',
      type: 'coding',
      creator: 'archon',
      description: 'bootstrap project context',
      priority: 'high',
      project_id: 'proj-bootstrap',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
          { role: 'citizen', agentId: 'citizen-alpha', model_preference: 'balanced', member_kind: 'citizen' },
        ],
      },
    });

    const workspacePath = join(projectStateDir, 'proj-bootstrap', 'tasks', 'OC-PROJECT-BOOTSTRAP');
    const controllerContextPath = join(workspacePath, '04-context', 'project-brain-context-controller.md');
    const craftsmanContextPath = join(workspacePath, '04-context', 'project-brain-context-craftsman.md');
    const citizenContextPath = join(workspacePath, '04-context', 'project-brain-context-citizen.md');
    expect(existsSync(controllerContextPath)).toBe(true);
    expect(existsSync(craftsmanContextPath)).toBe(true);
    expect(existsSync(citizenContextPath)).toBe(true);
    expect(readFileSync(controllerContextPath, 'utf8')).toContain('doc_type: project_brain_bootstrap_context');
    expect(readFileSync(controllerContextPath, 'utf8')).toContain('Runtime Boundary');
    expect(readFileSync(controllerContextPath, 'utf8')).toContain('citizen-alpha');
    expect(readFileSync(craftsmanContextPath, 'utf8')).toContain('doc_type: project_brain_bootstrap_context');
    expect(readFileSync(citizenContextPath, 'utf8')).toContain('doc_type: project_brain_bootstrap_context');
    expect(readFileSync(join(workspacePath, '00-bootstrap.md'), 'utf8')).toContain(controllerContextPath);
    expect(readFileSync(join(workspacePath, '00-bootstrap.md'), 'utf8')).toContain(craftsmanContextPath);
    expect(readFileSync(join(workspacePath, '00-bootstrap.md'), 'utf8')).toContain(citizenContextPath);
    expect(readFileSync(join(workspacePath, '05-agents', 'opus', '00-role-brief.md'), 'utf8')).toContain(controllerContextPath);
    expect(readFileSync(join(workspacePath, '05-agents', 'citizen-alpha', '00-role-brief.md'), 'utf8')).toContain(citizenContextPath);
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-bootstrap', 'tasks', 'OC-PROJECT-BOOTSTRAP'))).toBe(false);
  });

  it('passes task context into project brain bootstrap generation for project-bound tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    projectService.createProject({
      id: 'proj-bootstrap',
      name: 'Project Bootstrap',
    });
    const buildBootstrapContext = vi.fn().mockReturnValue({
      project_id: 'proj-bootstrap',
      audience: 'controller',
      markdown: '# Bootstrap',
      source_documents: [],
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-CTX',
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-bootstrap',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
      projectBrainAutomationService: {
        buildBootstrapContext,
        promoteKnowledge: vi.fn(),
        recordTaskCloseRecap: vi.fn(),
      } as unknown as NonNullable<TaskServiceBuilderOptions['projectBrainAutomationService']>,
    });

    service.createTask({
      title: 'Project bootstrap task',
      type: 'coding',
      creator: 'archon',
      description: 'bootstrap project context',
      priority: 'high',
      project_id: 'proj-bootstrap',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
          { role: 'citizen', agentId: 'citizen-alpha', model_preference: 'balanced', member_kind: 'citizen' },
        ],
      },
    });

    expect(buildBootstrapContext).toHaveBeenCalledTimes(3);
    expect(buildBootstrapContext).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'controller',
    }));
    expect(buildBootstrapContext).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'craftsman',
    }));
    expect(buildBootstrapContext).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'citizen',
    }));
  });

  it('prefers synchronous context materialization for task brain workspace project contexts when configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    projectService.createProject({
      id: 'proj-bootstrap',
      name: 'Project Bootstrap',
    });
    const contextMaterializationService = {
      materializeSync: vi.fn(({ audience }: { audience: 'controller' | 'craftsman' | 'citizen' }) => ({
        target: 'project_context_briefing',
        artifact: {
          project_id: 'proj-bootstrap',
          audience,
          markdown: `# ${audience}`,
          source_documents: [],
        },
      })),
    };
    const buildBootstrapContext = vi.fn().mockReturnValue({
      project_id: 'proj-bootstrap',
      audience: 'controller',
      markdown: '# Bootstrap',
      source_documents: [],
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-CTX-MAT',
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-bootstrap-materialized',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
      contextMaterializationService: contextMaterializationService as never,
      projectBrainAutomationService: {
        buildBootstrapContext,
        promoteKnowledge: vi.fn(),
        recordTaskCloseRecap: vi.fn(),
      } as unknown as NonNullable<TaskServiceBuilderOptions['projectBrainAutomationService']>,
    });

    service.createTask({
      title: 'Project bootstrap task',
      type: 'coding',
      creator: 'archon',
      description: 'bootstrap project context',
      priority: 'high',
      project_id: 'proj-bootstrap',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
          { role: 'citizen', agentId: 'citizen-alpha', model_preference: 'balanced', member_kind: 'citizen' },
        ],
      },
    });

    expect(contextMaterializationService.materializeSync).toHaveBeenCalledTimes(3);
    expect(contextMaterializationService.materializeSync).toHaveBeenCalledWith(expect.objectContaining({
      target: 'project_context_briefing',
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX-MAT',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'controller',
    }));
    expect(contextMaterializationService.materializeSync).toHaveBeenCalledWith(expect.objectContaining({
      target: 'project_context_briefing',
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX-MAT',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'craftsman',
    }));
    expect(contextMaterializationService.materializeSync).toHaveBeenCalledWith(expect.objectContaining({
      target: 'project_context_briefing',
      project_id: 'proj-bootstrap',
      task_id: 'OC-PROJECT-CTX-MAT',
      task_title: 'Project bootstrap task',
      task_description: 'bootstrap project context',
      allowed_citizen_ids: ['citizen-alpha'],
      audience: 'citizen',
    }));
    expect(buildBootstrapContext).not.toHaveBeenCalled();
  });

  it('builds a structured project context write proposal for task closeout', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectStateDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-writer-proposal-'));
    tempPaths.push(projectStateDir);
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-writer-proposal',
      name: 'Writer Proposal',
      metadata: {
        agora: {
          nomos: {
            project_state_root: join(projectStateDir, 'proj-writer-proposal'),
          },
        },
      },
    });
    const bindingService = createTaskBrainBindingServiceFromDb(db, {
      idGenerator: () => 'brain-binding-writer-proposal',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-WRITER-PROPOSAL',
      projectService,
      taskBrainBindingService: bindingService,
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    service.createTask({
      title: 'Writer proposal task',
      type: 'project-thin-slice',
      creator: 'archon',
      description: 'proposal path',
      priority: 'high',
      project_id: 'proj-writer-proposal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'command-only',
        stages: [{ id: 'ship', mode: 'execute', gate: { type: 'command' } }],
      },
    });

    const task = service.getTask('OC-WRITER-PROPOSAL')!;
    const binding = bindingService.getActiveBinding('OC-WRITER-PROPOSAL')!;
    const writer = new ProjectContextWriter({
      writeLockRepository: new ProjectWriteLockRepository(db),
      projectService,
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
      execFile: vi.fn(() => ''),
    });

    const proposal = writer.buildTaskCloseoutProposal({
      task,
      binding,
      actor: 'archon',
      reason: 'ready to archive',
    });

    expect(proposal).toMatchObject({
      kind: 'task_closeout',
      project_id: 'proj-writer-proposal',
      task_id: 'OC-WRITER-PROPOSAL',
      canonical_root: join(projectStateDir, 'proj-writer-proposal'),
      lock_holder_task_id: 'OC-WRITER-PROPOSAL',
      close_recap: {
        binding: expect.objectContaining({
          workspace_path: join(projectStateDir, 'proj-writer-proposal', 'tasks', 'OC-WRITER-PROPOSAL'),
        }),
        input: expect.objectContaining({
          project_id: 'proj-writer-proposal',
          task_id: 'OC-WRITER-PROPOSAL',
          completed_by: 'archon',
          summary_lines: expect.arrayContaining([
            '任务已到达 done，已进入 archive 流程。',
            '完成人: archon',
            '原因: ready to archive',
          ]),
        }),
      },
      project_recap: expect.objectContaining({
        project_id: 'proj-writer-proposal',
        task_id: 'OC-WRITER-PROPOSAL',
        workspace_path: join(projectStateDir, 'proj-writer-proposal', 'tasks', 'OC-WRITER-PROPOSAL'),
        completed_by: 'archon',
      }),
    });
  });

  it('materializes project-bound task workspace and recap data into the canonical project root when configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const projectStateDir = mkdtempSync(join(tmpdir(), 'agora-ts-project-state-'));
    tempPaths.push(projectStateDir);
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });
    projectService.createProject({
      id: 'proj-recap',
      name: 'Project Recap',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir: makeEmptyTemplatesDir(),
      taskIdGenerator: () => 'OC-PROJECT-RECAP',
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-recap',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
        projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
      }),
    });

    service.createTask({
      title: 'Project recap task',
      type: 'project-thin-slice',
      creator: 'archon',
      description: 'recap writeback path',
      priority: 'high',
      project_id: 'proj-recap',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'command-only',
        stages: [{ id: 'ship', mode: 'execute', gate: { type: 'command' } }],
      },
    });

    const activeProjectionPath = join(projectStateDir, 'proj-recap', 'tasks', 'active', 'OC-PROJECT-RECAP.md');
    expect(existsSync(activeProjectionPath)).toBe(true);
    expect(readFileSync(activeProjectionPath, 'utf8')).toContain('Projection: active');
    expect(readFileSync(join(projectStateDir, 'proj-recap', 'index.md'), 'utf8')).toContain(
      '[[tasks/active/OC-PROJECT-RECAP.md]] | Project recap task | state=active',
    );

    const done = service.advanceTask('OC-PROJECT-RECAP', { callerId: 'archon' });
    const workspacePath = join(projectStateDir, 'proj-recap', 'tasks', 'OC-PROJECT-RECAP');
    const taskRecapPath = join(workspacePath, '07-outputs', 'task-close-recap.md');
    const taskHarvestDraftPath = join(workspacePath, '07-outputs', 'project-harvest-draft.md');
    const projectRecapPath = join(projectStateDir, 'proj-recap', 'recaps', 'OC-PROJECT-RECAP.md');
    const archiveProjectionPath = join(projectStateDir, 'proj-recap', 'tasks', 'archive', 'OC-PROJECT-RECAP.md');

    expect(done.state).toBe('done');
    expect(existsSync(activeProjectionPath)).toBe(false);
    expect(existsSync(archiveProjectionPath)).toBe(true);
    expect(existsSync(taskRecapPath)).toBe(true);
    expect(existsSync(taskHarvestDraftPath)).toBe(true);
    expect(existsSync(projectRecapPath)).toBe(true);
    expect(existsSync(join(projectStateDir, 'proj-recap', 'index.md'))).toBe(true);
    expect(existsSync(join(projectStateDir, 'proj-recap', 'timeline.md'))).toBe(true);
    expect(readFileSync(taskRecapPath, 'utf8')).toContain('doc_type: task_recap');
    expect(readFileSync(taskRecapPath, 'utf8')).toContain('Project: proj-recap');
    expect(readFileSync(taskRecapPath, 'utf8')).toContain('任务已到达 done，已进入 archive 流程。');
    expect(readFileSync(taskHarvestDraftPath, 'utf8')).toContain('doc_type: task_harvest_draft');
    expect(readFileSync(taskHarvestDraftPath, 'utf8')).toContain('候选沉淀');
    expect(readFileSync(taskHarvestDraftPath, 'utf8')).toContain('事实候选');
    expect(readFileSync(projectRecapPath, 'utf8')).toContain('doc_type: task_recap');
    expect(readFileSync(projectRecapPath, 'utf8')).toContain('完成人: archon');
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('Projection: archive');
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('[[../../recaps/OC-PROJECT-RECAP.md]]');
    expect(readFileSync(archiveProjectionPath, 'utf8')).toContain('[[../OC-PROJECT-RECAP/07-outputs/project-harvest-draft.md]]');
    expect(readFileSync(join(projectStateDir, 'proj-recap', 'index.md'), 'utf8')).toContain('[[recaps/OC-PROJECT-RECAP.md]]');
    expect(readFileSync(join(projectStateDir, 'proj-recap', 'index.md'), 'utf8')).toContain(
      '[[tasks/archive/OC-PROJECT-RECAP.md]] | Project recap task | state=done',
    );
    expect(readFileSync(join(projectStateDir, 'proj-recap', 'timeline.md'), 'utf8')).toContain('task_recap | OC-PROJECT-RECAP');
    expect(readFileSync(join(projectStateDir, 'proj-recap', 'timeline.md'), 'utf8')).toContain(
      'doc=[[tasks/archive/OC-PROJECT-RECAP.md]]',
    );
    expect(new ProjectWriteLockRepository(db).getLock('proj-recap')).toBeNull();
    expect(existsSync(join(brainPackDir, 'project-index', 'proj-recap', 'index.md'))).toBe(false);
  });

  it('promotes project-bound todos into tasks that keep the same project_id', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    new ProjectRepository(db).insertProject({
      id: 'proj-promote',
      name: 'Promote Project',
    });
    const todo = new TodoRepository(db).insertTodo({
      text: 'promote into task',
      project_id: 'proj-promote',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-TODO-PROJECT',
    });

    const promoted = service.promoteTodo(todo.id, {
      type: 'coding',
      creator: 'archon',
      priority: 'high',
    });

    expect(promoted.todo.project_id).toBe('proj-promote');
    expect(promoted.task.project_id).toBe('proj-promote');
  });

  it('rolls back task creation when brain workspace materialization fails', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRAIN-FAIL',
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-binding-fail',
      }),
      taskBrainWorkspacePort: {
        createWorkspace: () => {
          throw new Error('brain workspace boom');
        },
        updateWorkspace: () => {},
        writeExecutionBrief: () => ({ brief_path: '/tmp/unused-brief.md' }),
        writeTaskCloseRecap: () => {},
        writeTaskHarvestDraft: () => {},
        destroyWorkspace: () => {},
      },
    });

    expect(() => service.createTask({
      title: 'Brain failure',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    })).toThrow('brain workspace boom');
    expect(tasks.getTask('OC-BRAIN-FAIL')).toBeNull();
    expect(new TaskBrainBindingRepository(db).getActiveByTask('OC-BRAIN-FAIL')).toBeNull();
  });

  it('rejects task creation when a referenced project does not exist', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const tasks = new TaskRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROJECT-MISSING',
    });

    expect(() => service.createTask({
      title: 'Missing project task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-missing',
    })).toThrow('Project not found: proj-missing');
    expect(tasks.getTask('OC-PROJECT-MISSING')).toBeNull();
  });

  it('repairs stale database-backed templates with missing member_kind before building the task team', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO templates (id, source, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'coding',
      'user',
      JSON.stringify({
        name: 'stale coding template',
        type: 'coding',
        governance: 'standard',
        defaultTeam: {
          architect: { suggested: ['opus'] },
          developer: { suggested: ['sonnet'] },
          craftsman: { suggested: ['codex'] },
        },
        stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
      }),
      now,
      now,
    );

    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REPAIRED-TEMPLATE',
    });

    const task = service.createTask({
      title: 'repair stale template team semantics',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    expect(task.team.members).toEqual([
      {
        role: 'architect',
        agentId: 'opus',
        member_kind: 'controller',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
      {
        role: 'developer',
        agentId: 'sonnet',
        member_kind: 'citizen',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
      {
        role: 'craftsman',
        agentId: 'codex',
        member_kind: 'craftsman',
        model_preference: '',
        agent_origin: 'user_managed',
        briefing_mode: 'overlay_full',
      },
    ]);
    expect(service.getTaskStatus('OC-REPAIRED-TEMPLATE').task.controller_ref).toBe('opus');
  });

  it('rejects advance before gate passes and advances once archon review is recorded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-101',
    });
    const approvalRequests = new ApprovalRequestRepository(db);

    service.createTask({
      title: '推进 discuss gate',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    expect(() => service.advanceTask('OC-101', { callerId: 'archon' })).toThrow(
      "Gate check failed for stage 'discuss'",
    );
    expect(approvalRequests.getLatestPending('OC-101', 'discuss')).toMatchObject({
      task_id: 'OC-101',
      stage_id: 'discuss',
      gate_type: 'archon_review',
      requested_by: 'archon',
      status: 'pending',
    });

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-101', 'discuss', 'approved', 'lizeyu');

    const advanced = service.advanceTask('OC-101', { callerId: 'archon' });
    const status = service.getTaskStatus('OC-101');

    expect(advanced.current_stage).toBe('develop');
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'stage_advanced',
      stage_id: 'develop',
    });
  });

  it('treats concurrent stage advancement as success instead of returning a stale gate failure', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-101B',
    });
    const tasks = new TaskRepository(db);

    service.createTask({
      title: '并发推进回读',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-101B', 'discuss', 'approved', 'lizeyu');

    const originalCheckGate = (service as never as { stateMachine: { checkGate: typeof service['advanceTask'] } }).stateMachine.checkGate;
    (service as never as { stateMachine: { checkGate: (...args: unknown[]) => boolean } }).stateMachine.checkGate = () => {
      const current = tasks.getTask('OC-101B');
      if (!current) {
        throw new Error('task missing');
      }
      tasks.updateTask('OC-101B', current.version, { current_stage: 'develop' });
      db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-101B', 'develop');
      return false;
    };

    const advanced = service.advanceTask('OC-101B', { callerId: 'archon' });
    (service as never as { stateMachine: { checkGate: typeof originalCheckGate } }).stateMachine.checkGate = originalCheckGate;

    expect(advanced.current_stage).toBe('develop');
  });

  it('uses allowAgents canAdvance config for non-controller command advances', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-104',
      archonUsers: ['archon'],
      allowAgents: {
        opus: { canCall: ['sonnet'], canAdvance: false },
        '*': { canCall: [], canAdvance: false },
      },
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-104',
      title: 'command advance permissions',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [{ role: 'developer', agentId: 'opus', model_preference: 'strong_reasoning' }],
      },
      workflow: {
        type: 'command-only',
        stages: [{ id: 'execute', gate: { type: 'command' } }],
      },
    });
    tasks.updateTask('OC-104', 1, { state: 'created' });
    tasks.updateTask('OC-104', 2, { state: 'active', current_stage: 'execute' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-104', 'execute');

    expect(() => service.advanceTask('OC-104', { callerId: 'opus' })).toThrow(
      'caller opus has canAdvance=false for /task advance',
    );
    expect(service.advanceTask('OC-104', { callerId: 'archon' }).state).toBe('done');
  });

  it('requires advance callers to be active in the current stage roster unless they are controller or archon', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STAGE-ADVANCE-1',
      archonUsers: ['archon'],
      allowAgents: {
        opus: { canCall: [], canAdvance: true },
        glm5: { canCall: [], canAdvance: true },
        '*': { canCall: [], canAdvance: false },
      },
    });

    service.createTask({
      title: 'stage advance permissions',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: {
              include_roles: ['developer'],
              keep_controller: false,
            },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: {
              include_roles: ['reviewer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
        ],
      },
    });

    expect(() => service.advanceTask('OC-STAGE-ADVANCE-1', { callerId: 'glm5' })).toThrow(
      'caller glm5 is outside current stage roster for advance',
    );

    expect(service.advanceTask('OC-STAGE-ADVANCE-1', { callerId: 'opus' }).current_stage).toBe('review');
  });

  it('requires next_stage_id when advancing from a branching stage and follows the selected branch', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BRANCH-ADVANCE-1',
      archonUsers: ['archon'],
    });

    service.createTask({
      title: 'branching advance',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'fast-path', mode: 'execute', gate: { type: 'all_subtasks_done' } },
          { id: 'deep-review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['triage'],
          nodes: [
            { id: 'triage', kind: 'stage', gate: { type: 'command' } },
            { id: 'fast-path', kind: 'stage', gate: { type: 'all_subtasks_done' } },
            { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
          ],
          edges: [
            { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
            { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
          ],
        },
      },
    });

    expect(() => service.advanceTask('OC-BRANCH-ADVANCE-1', { callerId: 'archon' })).toThrow(/next_stage_id/);

    const advanced = service.advanceTask('OC-BRANCH-ADVANCE-1', {
      callerId: 'archon',
      nextStageId: 'deep-review',
    });
    expect(advanced.current_stage).toBe('deep-review');
  });

  it('records archon approval, subtask completion, approval, and force advance actions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-102',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: '迁移剩余 task actions',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const outlineApproved = service.archonApproveTask('OC-102', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    expect(outlineApproved).toMatchObject({
      id: 'OC-102',
      current_stage: 'write',
    });

    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-102',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });

    const subtaskDone = service.completeSubtask('OC-102', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '初稿完成',
    });
    expect(subtaskDone.id).toBe('OC-102');

    const reviewStage = service.advanceTask('OC-102', { callerId: 'archon' });
    expect(reviewStage.current_stage).toBe('review');

    const rejected = service.rejectTask('OC-102', {
      rejectorId: 'gpt52',
      reason: 'needs more structure',
    });
    expect(rejected).toMatchObject({
      id: 'OC-102',
      current_stage: 'write',
    });

    subtasks.insertSubtask({
      id: 'write-doc-rework',
      task_id: 'OC-102',
      stage_id: 'write',
      title: '重写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-102', {
      subtaskId: 'write-doc-rework',
      callerId: 'glm5',
      output: '重写完成',
    });
    const reviewAgain = service.advanceTask('OC-102', { callerId: 'archon' });
    expect(reviewAgain.current_stage).toBe('review');

    const approved = service.approveTask('OC-102', {
      approverId: 'gpt52',
      comment: 'fixed',
    });
    const status = service.getTaskStatus('OC-102');

    expect(approved).toMatchObject({
      id: 'OC-102',
      state: 'done',
      current_stage: null,
    });
    expect(status.subtasks).toMatchObject([
      {
        id: 'write-doc',
        status: 'done',
        output: '初稿完成',
      },
      {
        id: 'write-doc-rework',
        status: 'done',
        output: '重写完成',
      },
    ]);
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        'gate_passed',
        'archon_approved',
        'stage_advanced',
        'subtask_done',
        'gate_failed',
        'stage_rewound',
        'rejected',
        'gate_passed',
      ]),
    );
  });

  it('auto-advances archon review stages and blocks repeated approval on the next gate', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-102A',
    });

    service.createTask({
      title: 'coding review auto advance',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const approved = service.archonApproveTask('OC-102A', {
      reviewerId: 'lizeyu',
      comment: 'go build',
    });

    expect(approved).toMatchObject({
      id: 'OC-102A',
      current_stage: 'develop',
    });
    expect(() => service.archonApproveTask('OC-102A', {
      reviewerId: 'lizeyu',
      comment: 'again',
    })).toThrow('当前 Gate 类型为 all_subtasks_done，不是 archon_review。');
  });

  it('mirrors key task actions into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103',
    });
    const bindings = new TaskContextBindingRepository(db);
    const conversations = new TaskConversationRepository(db);
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'mirror task actions',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-103',
      task_id: 'OC-103',
      im_provider: 'discord',
      thread_ref: 'thread-103',
      status: 'active',
    });

    service.archonApproveTask('OC-103', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-103',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-103', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '初稿完成',
    });
    service.advanceTask('OC-103', { callerId: 'archon' });
    service.rejectTask('OC-103', {
      rejectorId: 'gpt52',
      reason: 'needs more structure',
    });

    const entries = conversations.listByTask('OC-103');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Archon approved: outline ok',
        'Advanced to stage write',
        'Subtask write-doc marked done',
        'Advanced to stage review',
        'Approval rejected: needs more structure',
      ]),
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: 'bind-103',
          provider: 'discord',
          direction: 'system',
          author_kind: 'system',
        }),
      ]),
    );
  });

  it('mirrors state transition actions into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103B',
    });
    const bindings = new TaskContextBindingRepository(db);
    const conversations = new TaskConversationRepository(db);
    const tasks = new TaskRepository(db);

    service.createTask({
      title: 'mirror state transitions',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-103b',
      task_id: 'OC-103B',
      im_provider: 'discord',
      thread_ref: 'thread-103b',
      status: 'active',
    });

    service.pauseTask('OC-103B', { reason: 'hold for review' });
    service.resumeTask('OC-103B');
    const latest = tasks.getTask('OC-103B');
    if (!latest) {
      throw new Error('Expected task OC-103B to exist');
    }
    tasks.updateTask('OC-103B', latest.version, { state: 'blocked' });
    service.unblockTask('OC-103B', { reason: 'dependency resolved' });
    service.cancelTask('OC-103B', { reason: 'manual stop' });

    const entries = conversations.listByTask('OC-103B');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Task paused: hold for review',
        'Task resumed',
        'Task unblocked: dependency resolved',
        'Task cancelled: manual stop',
      ]),
    );
  });

  it('records gate result events for archon review decisions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-108',
    });
    const tasks = new TaskRepository(db);

    service.createTask({
      title: 'archon gate result logs',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    service.archonApproveTask('OC-108', {
      reviewerId: 'lizeyu',
      comment: 'approved',
    });

    tasks.insertTask({
      id: 'OC-109',
      title: 'archon reject logs',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: {
        type: 'archon-review',
        stages: [
          { id: 'draft', gate: { type: 'command' } },
          { id: 'review', gate: { type: 'archon_review' }, reject_target: 'draft' },
        ],
      },
    });
    tasks.updateTask('OC-109', 1, { state: 'created' });
    tasks.updateTask('OC-109', 2, { state: 'active', current_stage: 'review' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-109', 'review');

    const rejected = service.archonRejectTask('OC-109', {
      reviewerId: 'lizeyu',
      reason: 'not ready',
    });
    expect(rejected.current_stage).toBe('draft');

    expect(service.getTaskStatus('OC-108').flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['gate_passed', 'archon_approved']),
    );
    expect(service.getTaskStatus('OC-109').flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['gate_failed', 'stage_rewound', 'archon_rejected']),
    );
  });

  it('records quorum confirmations and supports pause/resume/cancel/unblock state transitions', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-103',
    });
    const tasks = new TaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    tasks.insertTask({
      id: 'OC-103',
      title: '自定义 quorum 任务',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'quorum-only',
        stages: [{ id: 'vote', gate: { type: 'quorum', required: 2 } }],
      },
    });
    tasks.updateTask('OC-103', 1, { state: 'created' });
    tasks.updateTask('OC-103', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-103', 'vote');

    const firstVote = service.confirmTask('OC-103', {
      voterId: 'opus',
      vote: 'approve',
      comment: 'first yes',
    });
    const secondVote = service.confirmTask('OC-103', {
      voterId: 'gpt52',
      vote: 'approve',
      comment: 'second yes',
    });

    expect(firstVote.quorum).toMatchObject({ approved: 1, total: 1 });
    expect(secondVote.quorum).toMatchObject({ approved: 2, total: 2 });

    const paused = service.pauseTask('OC-103', { reason: 'waiting' });
    const resumed = service.resumeTask('OC-103');
    const blocked = service.updateTaskState('OC-103', 'blocked', { reason: 'dependency' });
    const unblocked = service.unblockTask('OC-103', { reason: 'dependency cleared' });
    const cancelled = service.cancelTask('OC-103', { reason: 'closed' });
    const status = service.getTaskStatus('OC-103');

    expect(paused.state).toBe('paused');
    expect(resumed.state).toBe('active');
    expect(blocked.state).toBe('blocked');
    expect(unblocked.state).toBe('active');
    expect(cancelled.state).toBe('cancelled');
    expect(archives.listArchiveJobs({ taskId: 'OC-103' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task_id: 'OC-103',
          status: 'pending',
          payload: expect.objectContaining({
            state: 'cancelled',
            closeout_review: expect.objectContaining({
              state: 'advisory',
            }),
          }),
        }),
      ]),
    );
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        'quorum_vote',
        'state_changed',
        'paused',
        'resumed',
        'blocked',
        'unblocked',
        'cancelled',
      ]),
    );
  });

  it('requires quorum voters to be active in the current stage roster unless they are archon', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STAGE-CONFIRM-1',
      archonUsers: ['archon'],
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-STAGE-CONFIRM-1',
      title: 'stage confirm permissions',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'quorum-only',
        stages: [
          {
            id: 'vote',
            gate: { type: 'quorum', required: 1 },
            roster: {
              include_agents: ['opus'],
              keep_controller: false,
            },
          },
        ],
      },
    });
    tasks.updateTask('OC-STAGE-CONFIRM-1', 1, { state: 'created' });
    tasks.updateTask('OC-STAGE-CONFIRM-1', 2, { state: 'active', current_stage: 'vote' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-STAGE-CONFIRM-1', 'vote');

    expect(() => service.confirmTask('OC-STAGE-CONFIRM-1', {
      voterId: 'gpt52',
      vote: 'approve',
      comment: 'out of stage',
    })).toThrow('caller gpt52 is outside current stage roster for confirm');

    expect(service.confirmTask('OC-STAGE-CONFIRM-1', {
      voterId: 'archon',
      vote: 'approve',
      comment: 'override',
    }).quorum).toMatchObject({ approved: 1, total: 1 });
  });

  it('requires approval reviewers to be active in the current stage roster unless they are archon', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STAGE-APPROVE-1',
      archonUsers: ['archon'],
    });
    const tasks = new TaskRepository(db);

    tasks.insertTask({
      id: 'OC-STAGE-APPROVE-1',
      title: 'stage approval permissions',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'gpt52', model_preference: 'review' },
        ],
      },
      workflow: {
        type: 'approval-only',
        stages: [
          {
            id: 'review',
            gate: { type: 'approval', approver: 'reviewer' },
            roster: {
              include_agents: ['opus'],
              keep_controller: false,
            },
          },
        ],
      },
    });
    tasks.updateTask('OC-STAGE-APPROVE-1', 1, { state: 'created' });
    tasks.updateTask('OC-STAGE-APPROVE-1', 2, { state: 'active', current_stage: 'review' });
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-STAGE-APPROVE-1', 'review');

    expect(() => service.approveTask('OC-STAGE-APPROVE-1', {
      approverId: 'gpt52',
      comment: 'not on roster',
    })).toThrow('caller gpt52 is outside current stage roster for approve');

    expect(service.approveTask('OC-STAGE-APPROVE-1', {
      approverId: 'archon',
      comment: 'override approval',
    }).state).toBe('done');
  });

  it('supports unblock retry by resetting failed subtasks in the current stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-110',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock retry',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'retry-me',
      task_id: 'OC-110',
      stage_id: 'discuss',
      title: 'Retry this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:retry-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'leave-alone',
      task_id: 'OC-110',
      stage_id: 'discuss',
      title: 'Already done',
      assignee: 'opus',
      status: 'done',
      output: 'done',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    service.updateTaskState('OC-110', 'blocked', { reason: 'timeout escalation' });

    const unblocked = service.unblockTask('OC-110', { reason: 'retry now', action: 'retry' });
    const status = service.getTaskStatus('OC-110');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'retry-me',
          status: 'pending',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
        expect.objectContaining({
          id: 'leave-alone',
          status: 'done',
          output: 'done',
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'retry now',
        action: 'retry',
        retried_subtasks: ['retry-me'],
      }),
    });
  });

  it('supports unblock skip by marking failed subtasks done in the current stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-111',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock skip',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'skip-me',
      task_id: 'OC-111',
      stage_id: 'discuss',
      title: 'Skip this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:skip-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'other-stage',
      task_id: 'OC-111',
      stage_id: 'develop',
      title: 'Do not touch',
      assignee: 'opus',
      status: 'failed',
      output: 'keep failed',
      dispatch_status: 'failed',
    });
    service.updateTaskState('OC-111', 'blocked', { reason: 'human intervention' });

    const unblocked = service.unblockTask('OC-111', { reason: 'skip now', action: 'skip' });
    const status = service.getTaskStatus('OC-111');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'skip-me',
          status: 'done',
          output: 'Skipped by archon: skip now',
          craftsman_session: null,
          dispatch_status: 'skipped',
        }),
        expect.objectContaining({
          id: 'other-stage',
          status: 'failed',
          output: 'keep failed',
          dispatch_status: 'failed',
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'skip now',
        action: 'skip',
        skipped_subtasks: ['skip-me'],
      }),
    });
  });

  it('supports unblock reassign by resetting failed subtasks to a new assignee', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-112',
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'unblock reassign',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'reassign-me',
      task_id: 'OC-112',
      stage_id: 'discuss',
      title: 'Reassign this one',
      assignee: 'codex',
      status: 'failed',
      output: 'timeout',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:reassign-me',
      dispatch_status: 'failed',
      dispatched_at: '2026-03-09T11:00:00.000Z',
      done_at: '2026-03-09T11:01:00.000Z',
    });
    service.updateTaskState('OC-112', 'blocked', { reason: 'human intervention' });

    const unblocked = service.unblockTask('OC-112', {
      reason: 'reassign now',
      action: 'reassign',
      assignee: 'claude',
      craftsman_type: 'claude',
    });
    const status = service.getTaskStatus('OC-112');

    expect(unblocked.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reassign-me',
          status: 'pending',
          assignee: 'claude',
          craftsman_type: 'claude',
          output: null,
          craftsman_session: null,
          dispatch_status: null,
          dispatched_at: null,
          done_at: null,
        }),
      ]),
    );
    expect(status.flow_log.at(-1)).toMatchObject({
      event: 'unblocked',
      detail: JSON.stringify({
        reason: 'reassign now',
        action: 'reassign',
        reassigned_subtasks: ['reassign-me'],
        assignee: 'claude',
        craftsman_type: 'claude',
      }),
    });
  });

  it('cancels active subtasks and craftsmen executions while capturing a scheduler snapshot', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-105',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'cancel state closure',
      type: 'coding',
      creator: 'archon',
      description: 'ensure cancel closes outstanding work',
      priority: 'high',
    });

    subtasks.insertSubtask({
      id: 'draft-plan',
      task_id: 'OC-105',
      stage_id: 'discuss',
      title: 'Draft the plan',
      assignee: 'opus',
      status: 'pending',
    });
    subtasks.insertSubtask({
      id: 'run-codex',
      task_id: 'OC-105',
      stage_id: 'develop',
      title: 'Run codex',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'success',
      craftsman_session: 'tmux:run-codex',
    });
    subtasks.insertSubtask({
      id: 'keep-done',
      task_id: 'OC-105',
      stage_id: 'review',
      title: 'Done already',
      assignee: 'gpt52',
      status: 'done',
      output: 'kept',
      done_at: '2026-03-09T10:00:00.000Z',
    });

    executions.insertExecution({
      execution_id: 'exec-queued',
      task_id: 'OC-105',
      subtask_id: 'run-codex',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'queued',
      session_id: 'tmux:queued',
    });
    executions.insertExecution({
      execution_id: 'exec-running',
      task_id: 'OC-105',
      subtask_id: 'run-codex',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'running',
      session_id: 'tmux:running',
      started_at: '2026-03-09T10:01:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-succeeded',
      task_id: 'OC-105',
      subtask_id: 'keep-done',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'succeeded',
      session_id: 'tmux:done',
      finished_at: '2026-03-09T10:02:00.000Z',
    });

    const cancelled = service.cancelTask('OC-105', { reason: 'scope dropped' });
    const status = service.getTaskStatus('OC-105');

    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.error_detail).toBe('scope dropped');
    expect(cancelled.scheduler_snapshot).toMatchObject({
      state: 'active',
      current_stage: 'discuss',
    });

    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'draft-plan',
          status: 'cancelled',
          output: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          id: 'run-codex',
          status: 'cancelled',
          output: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          id: 'keep-done',
          status: 'done',
          output: 'kept',
        }),
      ]),
    );

    const executionStates = executions.listBySubtask('OC-105', 'run-codex');
    expect(executionStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          execution_id: 'exec-queued',
          status: 'cancelled',
          error: 'Task cancelled: scope dropped',
        }),
        expect.objectContaining({
          execution_id: 'exec-running',
          status: 'cancelled',
          error: 'Task cancelled: scope dropped',
        }),
      ]),
    );
    expect(executions.getExecution('exec-succeeded')).toMatchObject({
      status: 'succeeded',
      error: null,
    });
  });

  it('cleans up craftsman executions when deleting orphaned tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-106',
    });
    const tasks = new TaskRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    const draft = tasks.insertTask({
      id: 'OC-106',
      title: 'cleanup execution residue',
      description: '',
      type: 'custom',
      priority: 'normal',
      creator: 'archon',
      team: { members: [] },
      workflow: { stages: [] },
    });
    tasks.updateTask('OC-106', draft.version, { state: 'orphaned' });
    subtasks.insertSubtask({
      id: 'cleanup-subtask',
      task_id: 'OC-106',
      stage_id: 'develop',
      title: 'Orphaned craft',
      assignee: 'codex',
      status: 'failed',
      craftsman_type: 'codex',
    });
    executions.insertExecution({
      execution_id: 'exec-orphaned',
      task_id: 'OC-106',
      subtask_id: 'cleanup-subtask',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'failed',
      session_id: 'tmux:orphaned',
      finished_at: '2026-03-09T10:03:00.000Z',
    });

    const cleaned = service.cleanupOrphaned('OC-106');

    expect(cleaned).toBe(1);
    expect(service.getTask('OC-106')).toBeNull();
    expect(executions.getExecution('exec-orphaned')).toBeNull();
  });

  it('rejects craftsmen dispatch when the task is not active', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-paused-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-09T11:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-107',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'paused dispatch guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'paused-subtask',
      task_id: 'OC-107',
      stage_id: 'discuss',
      title: 'Dispatch should fail',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });
    service.pauseTask('OC-107', { reason: 'hold' });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-107',
      subtask_id: 'paused-subtask',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/codex',
    })).toThrow("Task OC-107 is in state 'paused', expected 'active'");
    expect(executions.listBySubtask('OC-107', 'paused-subtask')).toEqual([]);
  });

  it('flushes deferred craftsmen callbacks when resuming a paused task', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-113',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'resume deferred callbacks',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'resume-me',
      task_id: 'OC-113',
      stage_id: 'discuss',
      title: 'Flush on resume',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:resume-me',
    });
    executions.insertExecution({
      execution_id: 'exec-resume-1',
      task_id: 'OC-113',
      subtask_id: 'resume-me',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:resume-me',
      status: 'running',
      started_at: '2026-03-09T12:00:00.000Z',
    });

    service.pauseTask('OC-113', { reason: 'hold' });
    service.handleCraftsmanCallback({
      execution_id: 'exec-resume-1',
      status: 'succeeded',
      session_id: 'tmux:resume-me',
      payload: {
        output: {
          summary: 'done while paused',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-09T12:01:00.000Z',
    });

    const pausedStatus = service.getTaskStatus('OC-113');
    expect(pausedStatus.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume-me',
          status: 'archived',
          dispatch_status: 'running',
        }),
      ]),
    );

    const resumed = service.resumeTask('OC-113');
    const resumedStatus = service.getTaskStatus('OC-113');

    expect(resumed.state).toBe('active');
    expect(resumedStatus.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume-me',
          status: 'done',
          dispatch_status: 'succeeded',
          output: 'done while paused',
          done_at: '2026-03-09T12:01:00.000Z',
        }),
      ]),
    );
    expect(resumedStatus.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_callback_deferred', 'resumed', 'subtask_done']),
    );
  });

  it('enqueues a pending archive job when a task reaches done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-closeout',
      name: 'Closeout Project',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-114',
      projectService,
      projectNomosAuthoringPort: {
        refineProjectNomosDraft: () => ({
          draftDir: '/tmp/project-nomos',
          draftProfilePath: '/tmp/project-nomos/profile.toml',
        }),
        resolveProjectNomosRuntimeContext: () => ({
          nomos_id: 'project/proj-closeout',
          activation_status: 'active_project',
          bootstrap_interview_prompt_path: '/tmp/project-nomos/prompts/bootstrap/interview.md',
          closeout_review_prompt_path: '/tmp/project-nomos/prompts/closeout/review.md',
          doctor_project_prompt_path: '/tmp/project-nomos/prompts/doctor/project.md',
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const archives = new ArchiveJobRepository(db);

    service.createTask({
      title: 'archive when done',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-closeout',
    });
    service.archonApproveTask('OC-114', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-114',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-114', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '草稿完成',
    });
    service.advanceTask('OC-114', { callerId: 'archon' });
    service.approveTask('OC-114', {
      approverId: 'gpt52',
      comment: 'ship it',
    });

    const archiveJobs = archives.listArchiveJobs({ taskId: 'OC-114' });

    expect(service.getTask('OC-114')).toMatchObject({
      state: 'done',
    });
    expect(archiveJobs).toHaveLength(1);
    expect(archiveJobs[0]).toMatchObject({
      task_id: 'OC-114',
      status: 'pending',
      writer_agent: 'writer-agent',
      payload: expect.objectContaining({
        closeout_review: expect.objectContaining({
          required: true,
          state: 'advisory',
          nomos_runtime: expect.objectContaining({
            nomos_id: 'project/proj-closeout',
            activation_status: 'active_project',
            closeout_review_prompt_path: '/tmp/project-nomos/prompts/closeout/review.md',
          }),
        }),
      }),
    });
    expect(archiveJobs[0]?.target_path).toContain('OC-114');
  });

  it('notifies the controller to complete closeout convergence when a task reaches done', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-closeout-1',
    });
    const contextBindings = createTaskContextBindingServiceFromDb(db);
    const brainBindings = createTaskBrainBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CLOSEOUT-REMINDER-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: contextBindings,
      taskBrainBindingService: brainBindings,
    });
    const subtasks = new SubtaskRepository(db);
    const contextBindingRepo = new TaskContextBindingRepository(db);
    const workspacePath = join(makeTempDir('agora-ts-closeout-workspace-'), 'OC-CLOSEOUT-REMINDER-1');
    mkdirSync(join(workspacePath, '07-outputs'), { recursive: true });
    writeFileSync(join(workspacePath, '07-outputs', 'project-harvest-draft.md'), '# draft\n', 'utf8');

    service.createTask({
      title: 'Closeout reminder task',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    contextBindingRepo.insert({
      id: 'binding-closeout-1',
      task_id: 'OC-CLOSEOUT-REMINDER-1',
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-closeout-1',
      status: 'active',
    });
    brainBindings.createBinding({
      task_id: 'OC-CLOSEOUT-REMINDER-1',
      brain_pack_ref: 'agora-project-state',
      brain_task_id: 'OC-CLOSEOUT-REMINDER-1',
      workspace_path: workspacePath,
    });

    service.archonApproveTask('OC-CLOSEOUT-REMINDER-1', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    subtasks.insertSubtask({
      id: 'write-doc',
      task_id: 'OC-CLOSEOUT-REMINDER-1',
      stage_id: 'write',
      title: '写正文',
      assignee: 'glm5',
    });
    service.completeSubtask('OC-CLOSEOUT-REMINDER-1', {
      subtaskId: 'write-doc',
      callerId: 'glm5',
      output: '草稿完成',
    });
    service.advanceTask('OC-CLOSEOUT-REMINDER-1', { callerId: 'archon' });
    service.approveTask('OC-CLOSEOUT-REMINDER-1', {
      approverId: 'gpt52',
      comment: 'ship it',
    });
    await service.drainBackgroundOperations();

    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const reminder = broadcasts.find((message) => message.kind === 'controller_closeout_requested');
    const controllerRef = service.getTask('OC-CLOSEOUT-REMINDER-1')?.team.members.find((member) => member.member_kind === 'controller')?.agentId;

    expect(reminder).toMatchObject({
      participant_refs: [controllerRef],
    });
    expect(reminder?.body).toContain('closeout');
    expect(reminder?.body).toContain(workspacePath);
    expect(reminder?.body).toContain('project-harvest-draft.md');
  });

  it('also emits the controller closeout reminder when force-advance reaches done', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-closeout-force-1',
    });
    const contextBindings = createTaskContextBindingServiceFromDb(db);
    const brainBindings = createTaskBrainBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CLOSEOUT-FORCE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: contextBindings,
      taskBrainBindingService: brainBindings,
    });
    const contextBindingRepo = new TaskContextBindingRepository(db);
    const workspacePath = join(makeTempDir('agora-ts-closeout-force-workspace-'), 'OC-CLOSEOUT-FORCE-1');
    mkdirSync(join(workspacePath, '07-outputs'), { recursive: true });
    writeFileSync(join(workspacePath, '07-outputs', 'project-harvest-draft.md'), '# draft\n', 'utf8');

    service.createTask({
      title: 'Closeout force reminder task',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    contextBindingRepo.insert({
      id: 'binding-closeout-force-1',
      task_id: 'OC-CLOSEOUT-FORCE-1',
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-closeout-force-1',
      status: 'active',
    });
    brainBindings.createBinding({
      task_id: 'OC-CLOSEOUT-FORCE-1',
      brain_pack_ref: 'agora-project-state',
      brain_task_id: 'OC-CLOSEOUT-FORCE-1',
      workspace_path: workspacePath,
    });

    let guard = 0;
    while (guard < 8) {
      const task = service.getTask('OC-CLOSEOUT-FORCE-1');
      if (!task || task.state === 'done') break;
      service.forceAdvanceTask('OC-CLOSEOUT-FORCE-1', { reason: 'force to done' });
      guard += 1;
    }
    await service.drainBackgroundOperations();

    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const reminder = broadcasts.find((message) => message.kind === 'controller_closeout_requested');
    const controllerRef = service.getTask('OC-CLOSEOUT-FORCE-1')?.team.members.find((member) => member.member_kind === 'controller')?.agentId;

    expect(reminder).toMatchObject({
      participant_refs: [controllerRef],
    });
    expect(reminder?.body).toContain(workspacePath);
  });

  it('auto-refines a project nomos draft when a fixed authoring task reaches done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    createProjectServiceFromDb(db).createProject({
      id: 'proj-nomos-loop',
      name: 'Project Nomos Loop',
    });
    const refineProjectNomosDraft = vi.fn(() => ({
      draftDir: '/tmp/project-nomos',
      draftProfilePath: '/tmp/project-nomos/profile.toml',
    }));
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-AUTHORING-1',
      projectNomosAuthoringPort: {
        refineProjectNomosDraft,
      },
    });

    service.createTask({
      title: 'Create Project Nomos: Example',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-nomos-loop',
      control: {
        mode: 'normal',
        nomos_authoring: {
          kind: 'project_nomos',
          project_id: 'proj-nomos-loop',
          auto_refine_on_done: true,
        },
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'author', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['author'],
          nodes: [
            { id: 'author', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'author__complete__done', from: 'author', to: 'done', kind: 'complete' },
          ],
        },
      },
    });

    const done = service.advanceTask('OC-NOMOS-AUTHORING-1', { callerId: 'opus' });

    expect(done).toMatchObject({
      state: 'done',
      current_stage: null,
    });
    expect(refineProjectNomosDraft).toHaveBeenCalledWith('proj-nomos-loop');
  });

  it('auto-refines a project nomos draft when a fixed authoring task is force-advanced to done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    createProjectServiceFromDb(db).createProject({
      id: 'proj-nomos-loop-force',
      name: 'Project Nomos Loop Force',
    });
    const refineProjectNomosDraft = vi.fn(() => ({
      draftDir: '/tmp/project-nomos',
      draftProfilePath: '/tmp/project-nomos/profile.toml',
    }));
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-AUTHORING-2',
      projectNomosAuthoringPort: {
        refineProjectNomosDraft,
      },
    });

    service.createTask({
      title: 'Create Project Nomos: Example Force',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-nomos-loop-force',
      control: {
        mode: 'normal',
        nomos_authoring: {
          kind: 'project_nomos',
          project_id: 'proj-nomos-loop-force',
          auto_refine_on_done: true,
        },
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'author', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['author'],
          nodes: [
            { id: 'author', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'author__complete__done', from: 'author', to: 'done', kind: 'complete' },
          ],
        },
      },
    });

    const done = service.forceAdvanceTask('OC-NOMOS-AUTHORING-2', { reason: 'smoke' });

    expect(done).toMatchObject({
      state: 'done',
      current_stage: null,
    });
    expect(refineProjectNomosDraft).toHaveBeenCalledWith('proj-nomos-loop-force');
  });

  it('rejects project nomos authoring tasks that are not bound to a project', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-AUTHORING-3',
    });

    expect(() => service.createTask({
      title: 'Create Project Nomos: Missing Project',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: {
        mode: 'normal',
        nomos_authoring: {
          kind: 'project_nomos',
          project_id: 'proj-nomos-loop',
          auto_refine_on_done: true,
        },
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'author', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['author'],
          nodes: [
            { id: 'author', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'author__complete__done', from: 'author', to: 'done', kind: 'complete' },
          ],
        },
      },
    })).toThrow('project_nomos authoring tasks must be bound to a project');
  });

  it('rejects project nomos authoring tasks when control and task project ids differ', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOMOS-AUTHORING-4',
    });

    expect(() => service.createTask({
      title: 'Create Project Nomos: Mismatch',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      project_id: 'proj-alpha',
      control: {
        mode: 'normal',
        nomos_authoring: {
          kind: 'project_nomos',
          project_id: 'proj-beta',
          auto_refine_on_done: true,
        },
      },
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'author', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['author'],
          nodes: [
            { id: 'author', kind: 'stage', gate: { type: 'command' } },
            { id: 'done', kind: 'terminal' },
          ],
          edges: [
            { id: 'author__complete__done', from: 'author', to: 'done', kind: 'complete' },
          ],
        },
      },
    })).toThrow('project_nomos authoring project mismatch: task=proj-alpha control=proj-beta');
  });

  it('clears current_stage and blocks further gate decisions after force advancing a terminal stage to done', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DONE-GATE-1',
      archonUsers: ['archon'],
    });

    service.createTask({
      title: 'terminal gate closeout',
      type: 'brainstorm',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: '' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: '' },
        ],
      },
      workflow_override: {
        type: 'brainstorm-summarize',
        stages: [
          { id: 'brainstorm', mode: 'discuss', gate: { type: 'command' } },
          { id: 'summarize', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
      },
    });

    service.advanceTask('OC-DONE-GATE-1', { callerId: 'archon' });
    const done = service.forceAdvanceTask('OC-DONE-GATE-1', { reason: 'operator override' });

    expect(done).toMatchObject({
      id: 'OC-DONE-GATE-1',
      state: 'done',
      current_stage: null,
    });
    expect(() => service.approveTask('OC-DONE-GATE-1', {
      approverId: 'archon',
      comment: 'too late',
    })).toThrow("Task OC-DONE-GATE-1 is in state 'done', expected 'active'");
    expect(() => service.rejectTask('OC-DONE-GATE-1', {
      rejectorId: 'archon',
      reason: 'too late',
    })).toThrow("Task OC-DONE-GATE-1 is in state 'done', expected 'active'");
  });

  it('fails running craftsmen work on resume when the session is no longer alive', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-115',
      isCraftsmanSessionAlive: (sessionId: string) => sessionId !== 'tmux:dead',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'resume dead session',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'dead-subtask',
      task_id: 'OC-115',
      stage_id: 'discuss',
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
      task_id: 'OC-115',
      subtask_id: 'dead-subtask',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T13:00:00.000Z',
    });

    service.pauseTask('OC-115', { reason: 'hold' });
    const resumed = service.resumeTask('OC-115');
    const status = service.getTaskStatus('OC-115');

    expect(resumed.state).toBe('active');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dead-subtask',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on resume: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on resume: tmux:dead',
      finished_at: expect.any(String),
    });
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_session_missing_on_resume', 'resumed']),
    );
  });

  it('blocks active tasks with dead craftsmen sessions during startup recovery scan', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-116',
      isCraftsmanSessionAlive: (sessionId: string) => sessionId !== 'tmux:dead',
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'startup recovery dead session',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'startup-dead',
      task_id: 'OC-116',
      stage_id: 'discuss',
      title: 'Dead on startup',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T14:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-startup-dead-1',
      task_id: 'OC-116',
      subtask_id: 'startup-dead',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T14:00:00.000Z',
    });

    const recovered = service.startupRecoveryScan();
    const status = service.getTaskStatus('OC-116');

    expect(recovered).toEqual({
      scanned_tasks: 1,
      blocked_tasks: 1,
      failed_subtasks: 1,
      failed_executions: 1,
    });
    expect(status.task.state).toBe('blocked');
    expect(status.task.error_detail).toBe('startup recovery blocked task after missing craftsmen sessions');
    expect(status.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'startup-dead',
          status: 'failed',
          dispatch_status: 'failed',
          output: 'Craftsman session not alive on startup recovery: tmux:dead',
        }),
      ]),
    );
    expect(executions.getExecution('exec-startup-dead-1')).toMatchObject({
      status: 'failed',
      error: 'Craftsman session not alive on startup recovery: tmux:dead',
      finished_at: expect.any(String),
    });
    expect(status.flow_log.map((item) => item.event)).toEqual(
      expect.arrayContaining(['craftsman_session_missing_on_startup', 'blocked', 'state_changed']),
    );
  });

  it('mirrors startup recovery blocking into task conversation when an active binding exists', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-116B',
      isCraftsmanSessionAlive: (sessionId: string) => sessionId !== 'tmux:dead',
    });
    const bindings = new TaskContextBindingRepository(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const conversations = new TaskConversationRepository(db);

    service.createTask({
      title: 'startup recovery mirror',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    bindings.insert({
      id: 'bind-116b',
      task_id: 'OC-116B',
      im_provider: 'discord',
      thread_ref: 'thread-116b',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'startup-dead',
      task_id: 'OC-116B',
      stage_id: 'discuss',
      title: 'Dead on startup',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:dead',
      dispatch_status: 'running',
      dispatched_at: '2026-03-09T14:00:00.000Z',
    });
    executions.insertExecution({
      execution_id: 'exec-startup-dead-116b',
      task_id: 'OC-116B',
      subtask_id: 'startup-dead',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:dead',
      status: 'running',
      started_at: '2026-03-09T14:00:00.000Z',
    });

    service.startupRecoveryScan();

    const entries = conversations.listByTask('OC-116B');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        'Task blocked: startup recovery blocked task after missing craftsmen sessions',
      ]),
    );
  });

  it('fires IM provisioning and creates a binding when imProvisioningPort is configured', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-prov-1', 'pb-prov-2', 'pb-prov-3', 'pb-prov-4'];
        return () => ids.shift() ?? 'pb-prov-x';
      })(),
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROV-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Provisioning Test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    // Wait for the async provisioning to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.provisioned).toHaveLength(1);
    expect(provisioningPort.provisioned[0]).toMatchObject({
      task_id: 'OC-PROV-1',
      title: 'Provisioning Test',
      participant_refs: expect.arrayContaining(['opus', 'sonnet', 'glm5']),
    });

    const bindings = new TaskContextBindingRepository(db);
    const binding = bindings.getActiveByTask('OC-PROV-1');
    expect(binding).not.toBeNull();
    expect(binding?.im_provider).toBe('discord');
    expect(binding?.conversation_ref).toBe('discord-parent-channel');
    expect(binding?.thread_ref).toBe('stub-thread-OC-PROV-1');
    expect(taskParticipation.listParticipants('OC-PROV-1')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'opus',
          binding_id: binding?.id,
          join_status: 'joined',
          runtime_provider: 'openclaw',
        }),
      ]),
    );
    expect(taskParticipation.listParticipants('OC-PROV-1')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'claude_code',
        }),
      ]),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: binding?.id,
          participant_ref: 'opus',
          thread_ref: 'stub-thread-OC-PROV-1',
        }),
        expect.objectContaining({
          binding_id: binding?.id,
          participant_ref: 'sonnet',
          thread_ref: 'stub-thread-OC-PROV-1',
        }),
      ]),
    );
    expect(provisioningPort.joined).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participant_ref: 'claude_code',
        }),
      ]),
    );
  });

  it('drains pending detached IM provisioning work before returning', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    let releasePublish: (() => void) | null = null;
    let publishStarted = false;
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-drain-1',
    });
    const originalPublish = provisioningPort.publishMessages.bind(provisioningPort);
    provisioningPort.publishMessages = async (input) => {
      publishStarted = true;
      await new Promise<void>((resolve) => {
        releasePublish = resolve;
      });
      await originalPublish(input);
    };
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-drain-1', 'pb-drain-2', 'pb-drain-3', 'pb-drain-4'];
        return () => ids.shift() ?? 'pb-drain-x';
      })(),
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROV-DRAIN-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Provisioning Drain Test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(publishStarted).toBe(true);

    let drained = false;
    const drainPromise = service.drainBackgroundOperations().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drained).toBe(false);

    const publishRelease = releasePublish ?? (() => {
      throw new Error('expected releasePublish to be set before draining background operations');
    });
    publishRelease();
    await drainPromise;

    expect(drained).toBe(true);
    expect(provisioningPort.published).toHaveLength(1);
  });

  it('publishes bootstrap root and per-agent directed briefs when IM and brain services are configured', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-bootstrap-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const runtimePort = {
      resolveAgent(agentRef: string) {
        return {
          agent_ref: agentRef,
          runtime_provider: 'openclaw',
          runtime_actor_ref: agentRef,
          ...(agentRef === 'opus'
            ? {
                agent_origin: 'agora_managed' as const,
                briefing_mode: 'overlay_delta' as const,
              }
            : {}),
        };
      },
    };
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-bootstrap-1', 'pb-bootstrap-2', 'pb-bootstrap-3', 'pb-bootstrap-4'];
        return () => ids.shift() ?? 'pb-bootstrap-x';
      })(),
      agentRuntimePort: runtimePort,
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BOOTSTRAP-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
      agentRuntimePort: runtimePort,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-bootstrap-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
      skillCatalogPort: {
        listSkills: () => [
          {
            skill_ref: 'planning-with-files',
            relative_path: 'planning-with-files',
            resolved_path: '/tmp/skills/planning-with-files/SKILL.md',
            source_root: '/tmp/skills',
            source_label: 'agora',
            precedence: 0,
            mtime: '2026-03-19T12:00:00.000Z',
            shadowed_paths: [],
          },
          {
            skill_ref: 'brainstorming',
            relative_path: 'brainstorming',
            resolved_path: '/tmp/skills/brainstorming/SKILL.md',
            source_root: '/tmp/skills',
            source_label: 'agora',
            precedence: 0,
            mtime: '2026-03-19T12:00:00.000Z',
            shadowed_paths: [],
          },
          {
            skill_ref: 'refactoring-ui',
            relative_path: 'refactoring-ui',
            resolved_path: '/tmp/skills/refactoring-ui/SKILL.md',
            source_root: '/tmp/skills',
            source_label: 'agora',
            precedence: 0,
            mtime: '2026-03-19T12:00:00.000Z',
            shadowed_paths: [],
          },
        ],
      },
    });

    service.createTask({
      title: 'Bootstrap Task',
      type: 'coding',
      creator: 'archon',
      description: 'bootstrap everyone into context',
      priority: 'normal',
      skill_policy: {
        global_refs: ['planning-with-files'],
        role_refs: {
          architect: ['brainstorming'],
          developer: ['refactoring-ui'],
        },
        enforcement: 'required',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.published).toHaveLength(1);
    expect(provisioningPort.published[0]).toMatchObject({
      binding_id: expect.any(String),
      thread_ref: 'discord-thread-bootstrap-1',
    });
    expect(provisioningPort.published[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'bootstrap_root',
          participant_refs: ['opus', 'sonnet', 'glm5'],
        }),
        expect.objectContaining({
          kind: 'bootstrap_runbook',
          participant_refs: ['opus', 'sonnet', 'glm5'],
        }),
        expect.objectContaining({
          kind: 'bootstrap_mentions',
          participant_refs: ['opus', 'sonnet', 'glm5'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['opus'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['sonnet'],
        }),
        expect.objectContaining({
          kind: 'role_brief',
          participant_refs: ['glm5'],
        }),
      ]),
    );
    const rootBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_root');
    const runbookBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_runbook');
    const mentionBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_mentions');
    expect(rootBrief?.body).toContain('主控: opus');
    expect(rootBrief?.body).toContain(join(brainPackDir, 'tasks', 'OC-BOOTSTRAP-1', '00-bootstrap.md'));
    expect(rootBrief?.body).toContain('opus | architect | controller | agora_managed | overlay_delta');
    expect(rootBrief?.body).toContain('Task Skills:');
    expect(rootBrief?.body).toContain('planning-with-files -> /tmp/skills/planning-with-files/SKILL.md');
    expect(runbookBrief?.body).toContain('Craftsman 循环:');
    expect(runbookBrief?.body).toContain('快速决策表:');
    expect(runbookBrief?.body).toContain('常用命令:');
    expect(runbookBrief?.body).toContain('`one_shot`（单次结果）或 `interactive`（持续交互）');
    expect(runbookBrief?.body).toContain('通过它的 `execution_id` 继续同一个执行');
    expect(runbookBrief?.body).toContain('agora craftsman probe <executionId>');
    expect(mentionBrief?.body).toContain('Discord 提及规则:');
    expect(mentionBrief?.body).toContain('成员 mention 对照表:');
    expect(mentionBrief?.body).toContain('{{participant:opus}}');
    expect(mentionBrief?.body).toContain('`<@USER_ID>`');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus');
    expect(opusBrief?.body).toContain(join(brainPackDir, 'tasks', 'OC-BOOTSTRAP-1', '05-agents', 'opus', '00-role-brief.md'));
    expect(opusBrief?.body).toContain(join(brainPackDir, 'tasks', 'OC-BOOTSTRAP-1', '05-agents', 'opus', '03-citizen-scaffold.md'));
    expect(opusBrief?.body).toContain('architect');
    expect(opusBrief?.body).toContain('简报模式: overlay_delta');
    expect(opusBrief?.body).toContain('快速决策：一次性结果用 `one_shot`；需要后续输入或菜单选择用 `interactive`。');
    expect(opusBrief?.body).toContain(`agora subtasks create OC-BOOTSTRAP-1 --caller-id opus --file subtasks.json`);
    expect(opusBrief?.body).toContain('执行模式：优先 `one_shot`（单次结果）或 `interactive`（持续交互）。');
    expect(opusBrief?.body).toContain('Craftsman 循环：使用正式 subtask 绑定 craftsman');
    expect(opusBrief?.body).toContain('agora craftsman input-text <executionId> "<text>"');
    expect(opusBrief?.body).toContain('agora craftsman probe <executionId>');
    expect(opusBrief?.body).toContain('Discord 提及规则：使用真实 `<@USER_ID>` mention');
    expect(opusBrief?.body).toContain('成员 mention: {{participant:opus}}');
    expect(opusBrief?.body).toContain('Role Skills:');
    expect(opusBrief?.body).toContain('brainstorming -> /tmp/skills/brainstorming/SKILL.md');
    expect(opusBrief?.body).not.toContain('Read role doc:');
    const sonnetBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'sonnet');
    expect(sonnetBrief?.body).toContain('简报模式: overlay_full');
    expect(sonnetBrief?.body).toContain('阅读角色文档:');
    expect(sonnetBrief?.body).toContain('refactoring-ui -> /tmp/skills/refactoring-ui/SKILL.md');
    const conversations = new TaskConversationRepository(db);
    const entries = conversations.listByTask('OC-BOOTSTRAP-1');
    expect(entries.map((entry) => entry.body)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Task **OC-BOOTSTRAP-1** created: Bootstrap Task'),
        expect.stringContaining('Agora 任务启动简报'),
        expect.stringContaining('角色简报 opus'),
        expect.stringContaining('角色简报 sonnet'),
        expect.stringContaining('角色简报 glm5'),
      ]),
    );
  });

  it('refreshes the skill catalog before rendering bootstrap skill paths', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-bootstrap-refresh-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const runtimePort = {
      resolveAgent(agentRef: string) {
        return {
          agent_ref: agentRef,
          runtime_provider: 'openclaw',
          runtime_actor_ref: agentRef,
        };
      },
    };
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-refresh-1', 'pb-refresh-2'];
        return () => ids.shift() ?? 'pb-refresh-x';
      })(),
      agentRuntimePort: runtimePort,
    });
    const listSkills = vi.fn((input?: { refresh?: boolean }) => (
      input?.refresh
        ? [
            {
              skill_ref: 'agent-reach',
              relative_path: 'agent-reach',
              resolved_path: '/tmp/skills/agent-reach/SKILL.md',
              source_root: '/tmp/skills',
              source_label: 'agents',
              precedence: 1,
              mtime: '2026-03-19T12:00:00.000Z',
              shadowed_paths: [],
            },
            {
              skill_ref: 'lizeyu-writing',
              relative_path: 'lizeyu-writing',
              resolved_path: '/tmp/skills/lizeyu-writing/SKILL.md',
              source_root: '/tmp/skills',
              source_label: 'agents',
              precedence: 1,
              mtime: '2026-03-19T12:00:00.000Z',
              shadowed_paths: [],
            },
          ]
        : []
    ));
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-BOOTSTRAP-REFRESH-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
      agentRuntimePort: runtimePort,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-bootstrap-refresh-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
      skillCatalogPort: {
        listSkills,
      },
    });

    service.createTask({
      title: 'Bootstrap Refresh Task',
      type: 'coding',
      creator: 'archon',
      description: 'refresh bootstrap skill catalog before publish',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'analyst', agentId: 'gpt52', member_kind: 'citizen', model_preference: 'analysis' },
        ],
      },
      workflow_override: {
        stages: [{
          id: 'brainstorm',
          mode: 'discuss',
          gate: { type: 'command' },
          execution_kind: 'citizen_discuss',
          allowed_actions: ['discuss'],
        }],
      },
      skill_policy: {
        global_refs: ['agent-reach'],
        role_refs: {
          architect: ['lizeyu-writing'],
        },
        enforcement: 'required',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listSkills).toHaveBeenCalledWith({ refresh: true });
    const rootBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_root');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => (
      message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus'
    ));
    expect(rootBrief?.body).toContain('agent-reach -> /tmp/skills/agent-reach/SKILL.md');
    expect(opusBrief?.body).toContain('lizeyu-writing -> /tmp/skills/lizeyu-writing/SKILL.md');
  });

  it('adds smoke-mode guidance only when task control mode is smoke_test', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-smoke-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke Bootstrap',
      type: 'coding',
      creator: 'archon',
      description: 'validate smoke control mode',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const mentionBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_mentions');
    expect(mentionBrief?.body).toContain('冒烟测试模式:');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus');
    expect(opusBrief?.body).toContain('冒烟测试模式：当前线程仅用于验证');

    const task = new TaskRepository(db).getTask('OC-SMOKE-1');
    expect(task?.control?.mode).toBe('smoke_test');
    const meta = readFileSync(join(brainPackDir, 'tasks', 'OC-SMOKE-1', 'task.meta.yaml'), 'utf8');
    expect(meta).toContain('control_mode: "smoke_test"');
  });

  it('adds regression-mode operator proxy guidance to bootstrap and role briefs', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-regression-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REGRESSION-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-regression-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Regression Bootstrap',
      type: 'coding',
      creator: 'archon',
      description: 'validate regression control mode',
      priority: 'normal',
      control: {
        mode: 'regression_test' as never,
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const mentionBrief = provisioningPort.published[0]?.messages.find((message) => message.kind === 'bootstrap_mentions');
    expect(mentionBrief?.body).toContain('回归代理模式');
    expect(mentionBrief?.body).toContain('AgoraBot 在当前线程里代表开发者执行回归');
    const opusBrief = provisioningPort.published[0]?.messages.find((message) => (
      message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus'
    ));
    expect(opusBrief?.body).toContain('回归代理模式：AgoraBot 在当前线程里代表开发者推进任务');

    const task = new TaskRepository(db).getTask('OC-REGRESSION-1');
    expect(task?.control?.mode).toBe('regression_test');
    const meta = readFileSync(join(brainPackDir, 'tasks', 'OC-REGRESSION-1', 'task.meta.yaml'), 'utf8');
    expect(meta).toContain('control_mode: "regression_test"');
  });

  it('adds smoke-mode guidance to gate and callback status broadcasts only in smoke mode', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-status-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const executions = new CraftsmanExecutionRepository(db);
    const subtasks = new SubtaskRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-STATUS-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-smoke-status-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke status task',
      type: 'coding',
      creator: 'archon',
      description: 'smoke status loop',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;

    expect(() => service.advanceTask('OC-SMOKE-STATUS-1', { callerId: 'archon' })).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const gateWaitingMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'gate_waiting');
    expect(gateWaitingMessage?.body).toContain('冒烟引导:');
    expect(gateWaitingMessage?.body).toContain('现在验证人工审批链路。');
    provisioningPort.published.length = 0;
    expect(() => service.advanceTask('OC-SMOKE-STATUS-1', { callerId: 'archon' })).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'gate_waiting')).toBeUndefined();

    provisioningPort.published.length = 0;
    subtasks.insertSubtask({
      id: 'smoke-subtask-1',
      task_id: 'OC-SMOKE-STATUS-1',
      stage_id: 'develop',
      title: 'smoke callback',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:smoke-status-1',
    });
    executions.insertExecution({
      execution_id: 'exec-smoke-status-1',
      task_id: 'OC-SMOKE-STATUS-1',
      subtask_id: 'smoke-subtask-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:smoke-status-1',
      status: 'running',
      started_at: '2026-03-13T11:00:00.000Z',
    });
    service.handleCraftsmanCallback({
      execution_id: 'exec-smoke-status-1',
      status: 'succeeded',
      session_id: 'tmux:smoke-status-1',
      payload: {
        output: {
          summary: 'smoke callback complete',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-13T11:01:00.000Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_completed');
    expect(callbackMessage?.body).toContain('冒烟引导:');
    expect(callbackMessage?.body).toContain('确认这个 callback 也出现在 Agora conversation 和 Dashboard timeline。');

  });

  it('adds concrete craftsman loop commands to smoke-mode subtask and input broadcasts', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-craftsman-loop-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-smoke-loop-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T10:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-CRAFTSMAN-1',
      craftsmanDispatcher: dispatcher,
      craftsmanInputPort: {
        sendText: () => {},
        sendKeys: () => {},
        submitChoice: () => {},
      },
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-smoke-craftsman-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Smoke craftsman loop',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;

    service.createSubtasks('OC-SMOKE-CRAFTSMAN-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-loop',
          title: 'Build loop',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            workdir: '/tmp/smoke-loop',
            prompt: 'Implement the smoke loop',
          },
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const subtaskMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'subtasks_created');
    expect(subtaskMessage?.body).toContain('Smoke Next Step:');
    expect(subtaskMessage?.body).toContain('agora subtasks list OC-SMOKE-CRAFTSMAN-1');
    expect(subtaskMessage?.body).toContain('agora craftsman input-text exec-smoke-loop-1');

    provisioningPort.published.length = 0;
    service.handleCraftsmanCallback({
      execution_id: 'exec-smoke-loop-1',
      status: 'needs_input',
      session_id: 'codex:exec-smoke-loop-1',
      payload: {
        input_request: {
          transport: 'choice',
          hint: 'Choose continue',
          choice_options: [
            { id: 'continue', label: 'Continue', keys: ['Enter'], submit: true },
            { id: 'abort', label: 'Abort', keys: ['Down', 'Enter'], submit: true },
          ],
        },
      },
      error: null,
      finished_at: '2026-03-13T10:05:00.000Z',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_needs_input');
    expect(callbackMessage?.body).toContain('Smoke Next Step:');
    expect(callbackMessage?.body).toContain('agora craftsman input-text exec-smoke-loop-1');
    expect(callbackMessage?.body).toContain('agora craftsman input-keys exec-smoke-loop-1 Down Enter');
    expect(callbackMessage?.body).toContain('agora craftsman probe exec-smoke-loop-1');

    provisioningPort.published.length = 0;
    service.sendCraftsmanInputText('exec-smoke-loop-1', 'Continue');

    await new Promise((resolve) => setTimeout(resolve, 20));
    const inputSentMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_input_sent');
    expect(inputSentMessage?.body).toContain('Smoke Next Step:');
    expect(inputSentMessage?.body).toContain('agora craftsman probe exec-smoke-loop-1');
  });

  it('adds smoke-mode guidance to probe broadcasts only in smoke mode', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-smoke-probe-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SMOKE-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Smoke probe task',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: {
        mode: 'smoke_test',
      },
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-13T00:00:00.000Z', 'OC-SMOKE-PROBE-1');

    service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-13T01:00:00.000Z'),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const probeMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'controller_pinged');
    expect(probeMessage?.body).toContain('冒烟引导:');
    expect(probeMessage?.body).toContain('controller -> roster -> inbox');
  });

  it('joins explicit im_target participant refs in addition to interactive team members', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROV-HUMAN',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Provisioning Human Viewer Test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
        participant_refs: ['discord-user-123'],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.provisioned).toHaveLength(1);
    expect(provisioningPort.provisioned[0]).toMatchObject({
      task_id: 'OC-PROV-HUMAN',
      participant_refs: expect.arrayContaining(['opus', 'sonnet', 'glm5', 'discord-user-123']),
    });
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'discord-user-123' }),
      ]),
    );
  });

  it('reconciles IM roster on stage create and advance using workflow stage roster rules', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-roster-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-roster-1', 'pb-roster-2', 'pb-roster-3'];
        return () => ids.shift() ?? 'pb-roster-x';
      })(),
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-ROSTER-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Stage roster task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: {
              include_roles: ['developer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: {
              include_roles: ['reviewer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
        expect.objectContaining({ participant_ref: 'sonnet' }),
      ]),
    );
    expect(provisioningPort.joined).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'glm5' }),
      ]),
    );

    provisioningPort.joined.length = 0;
    provisioningPort.removed.length = 0;

    service.advanceTask('OC-ROSTER-1', { callerId: 'archon' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provisioningPort.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'sonnet' }),
      ]),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'glm5' }),
      ]),
    );
    expect(provisioningPort.removed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
      ]),
    );
    const currentStageRoster = service.getTaskStatus('OC-ROSTER-1').current_stage_roster;
    expect(currentStageRoster).toMatchObject({
      stage_id: 'review',
      roster: {
        include_roles: ['reviewer'],
        keep_controller: true,
      },
    });
    expect(currentStageRoster?.desired_participant_refs.slice().sort()).toEqual(['glm5', 'opus']);
    expect(currentStageRoster?.joined_participant_refs.slice().sort()).toEqual(['glm5', 'opus']);
    const roleBriefRefs = provisioningPort.published[0]?.messages
      .filter((message) => message.kind === 'role_brief')
      .map((message) => message.participant_refs?.[0]);
    expect(roleBriefRefs).toEqual(['opus', 'sonnet']);
  });

  it('surfaces reasoned participant reconcile state in current stage roster status', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-roster-status-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-status-1', 'pb-status-2', 'pb-status-3'];
        return () => ids.shift() ?? 'pb-status-x';
      })(),
      runtimeSessionIdGenerator: () => 'rs-status-1',
      agentRuntimePort: {
        resolveAgent(agentRef) {
          return {
            agent_ref: agentRef,
            runtime_provider: 'openclaw',
            runtime_actor_ref: agentRef,
          };
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-STAGE-STATUS-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Reasoned stage roster status',
      type: 'custom',
      creator: 'archon',
      description: 'show why roster members are in or out',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    taskParticipation.syncLiveSession({
      source: 'openclaw',
      agent_id: 'opus',
      session_key: 'agent:opus:discord:thread:status',
      channel: 'discord',
      conversation_id: 'reasoned',
      thread_id: 'discord-thread-roster-status-1',
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-17T11:00:00.000Z',
      metadata: {},
    });

    const status = service.getTaskStatus('OC-STAGE-STATUS-1');

    expect(status.current_stage_roster).toMatchObject({
      stage_id: 'draft',
      desired_participant_refs: ['opus', 'sonnet'],
      participant_states: expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'opus',
          desired_exposure: 'in_thread',
          exposure_reason: 'controller_preserved',
          runtime_provider: 'openclaw',
          runtime_session_ref: 'agent:opus:discord:thread:status',
          presence_state: 'active',
          runtime_binding_reason: 'controller_preserved',
          desired_runtime_presence: 'attached',
        }),
        expect.objectContaining({
          agent_ref: 'sonnet',
          desired_exposure: 'in_thread',
          exposure_reason: 'stage_roster_selected',
        }),
        expect.objectContaining({
          agent_ref: 'glm5',
          desired_exposure: 'hidden',
          exposure_reason: 'stage_roster_excluded',
        }),
      ]),
    });
  });

  it('reconciles IM roster when force advancing into the next stage', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-force-roster-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-force-1', 'pb-force-2', 'pb-force-3'];
        return () => ids.shift() ?? 'pb-force-x';
      })(),
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-FORCE-ROSTER-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
    });

    service.createTask({
      title: 'Force advance roster task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: {
              include_roles: ['developer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: {
              include_roles: ['reviewer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.joined.length = 0;
    provisioningPort.removed.length = 0;
    taskParticipation.syncLiveSession({
      source: 'openclaw',
      agent_id: 'sonnet',
      session_key: 'agent:sonnet:discord:thread:force-roster',
      channel: 'discord',
      conversation_id: 'force-roster',
      thread_id: 'discord-thread-force-roster-1',
      status: 'active',
      last_event: 'session_start',
      last_event_at: '2026-03-17T12:10:00.000Z',
      metadata: {},
    });

    service.forceAdvanceTask('OC-FORCE-ROSTER-1', { reason: 'operator override' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provisioningPort.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'sonnet' }),
      ]),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'glm5' }),
      ]),
    );
    expect(service.getTaskStatus('OC-FORCE-ROSTER-1').current_stage_roster).toMatchObject({
      stage_id: 'review',
      participant_states: expect.arrayContaining([
        expect.objectContaining({
          agent_ref: 'sonnet',
          desired_exposure: 'hidden',
          exposure_reason: 'stage_roster_excluded',
          runtime_session_ref: 'agent:sonnet:discord:thread:force-roster',
          runtime_binding_reason: 'stage_roster_excluded',
          desired_runtime_presence: 'detached',
          runtime_reconcile_stage_id: 'review',
        }),
      ]),
    });
  });

  it('reconciles IM roster back to the reject target stage when review is rejected', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-reject-roster-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const taskParticipation = createTaskParticipationServiceFromDb(db, {
      participantIdGenerator: (() => {
        const ids = ['pb-reject-1', 'pb-reject-2', 'pb-reject-3'];
        return () => ids.shift() ?? 'pb-reject-x';
      })(),
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REJECT-ROSTER-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskParticipationService: taskParticipation,
      archonUsers: ['admin'],
    });

    service.createTask({
      title: 'Reject roster task',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'draft',
            mode: 'discuss',
            roster: {
              include_roles: ['developer'],
              keep_controller: true,
            },
            gate: { type: 'command' },
          },
          {
            id: 'review',
            mode: 'discuss',
            roster: {
              include_roles: ['reviewer'],
              keep_controller: true,
            },
            gate: { type: 'approval', approver: 'reviewer' },
            reject_target: 'draft',
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    service.advanceTask('OC-REJECT-ROSTER-1', { callerId: 'admin' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    provisioningPort.joined.length = 0;
    provisioningPort.removed.length = 0;

    service.rejectTask('OC-REJECT-ROSTER-1', {
      rejectorId: 'glm5',
      reason: 'needs author rework',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(provisioningPort.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'glm5' }),
      ]),
    );
    expect(provisioningPort.joined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'sonnet' }),
      ]),
    );
    expect(provisioningPort.removed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participant_ref: 'opus' }),
      ]),
    );
  });

  it('archives the bound IM context on pause/cancel and restores the same context on resume', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-ctx-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CTX-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-ctx-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Context lifecycle test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const createdBinding = bindingService.listBindings('OC-CTX-1')[0];
    expect(createdBinding?.thread_ref).toBe('discord-thread-ctx-1');

    service.pauseTask('OC-CTX-1', { reason: 'hold for review' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'archive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('archived');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_paused');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已暂停');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: paused');

    service.resumeTask('OC-CTX-1');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'unarchive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('active');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_active');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已恢复');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: active');

    service.cancelTask('OC-CTX-1', { reason: 'manual stop' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(provisioningPort.archived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding_id: createdBinding?.id,
          thread_ref: 'discord-thread-ctx-1',
          mode: 'archive',
        }),
      ]),
    );
    expect(bindingService.listBindings('OC-CTX-1')[0]?.status).toBe('archived');
    expect(provisioningPort.published.at(-1)?.messages[0]?.kind).toBe('task_state_cancelled');
    expect(provisioningPort.published.at(-1)?.messages[0]?.body).toContain('任务已取消');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-CTX-1', '00-current.md'), 'utf8')).toContain('任务状态: cancelled');
  });

  it('broadcasts reject reasons to the controller and rewinds the thread stage state', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-reject-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-REJECT-THREAD-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-reject-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Reject loop test',
      type: 'coding',
      creator: 'archon',
      description: 'walk into review and reject',
      priority: 'normal',
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    db.prepare(
      'INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?, ?, ?, ?)',
    ).run('OC-REJECT-THREAD-1', 'discuss', 'approved', 'lizeyu');
    service.advanceTask('OC-REJECT-THREAD-1', { callerId: 'archon' });

    const subtasks = new SubtaskRepository(db);
    subtasks.insertSubtask({
      id: 'sub-review-1',
      task_id: 'OC-REJECT-THREAD-1',
      stage_id: 'develop',
      title: 'implementation done',
      assignee: 'sonnet',
      status: 'done',
    });
    service.advanceTask('OC-REJECT-THREAD-1', { callerId: 'archon' });

    service.archonRejectTask('OC-REJECT-THREAD-1', {
      reviewerId: 'archon',
      reason: 'Need stronger rollback coverage before merge',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const latestMessages = provisioningPort.published.slice(-2).flatMap((entry) => entry.messages);
    expect(latestMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'gate_rejected',
        }),
        expect.objectContaining({
          kind: 'controller_gate_rejected',
          participant_refs: ['opus'],
        }),
      ]),
    );
    const controllerMessage = latestMessages.find((message) => message.kind === 'controller_gate_rejected');
    expect(controllerMessage?.body).toContain('Need stronger rollback coverage before merge');
    expect(controllerMessage?.body).toContain('请与成员重新规划');
    expect(readFileSync(join(brainPackDir, 'tasks', 'OC-REJECT-THREAD-1', '03-stage-state.md'), 'utf8')).toContain('当前阶段: develop');
  });

  it('probes inactive tasks in staged order: controller, roster, then inbox', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Inactive probe test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-1');

    const first = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:00:00.000Z'),
    });
    expect(first).toMatchObject({ scanned_tasks: 1, controller_pings: 1, roster_pings: 0, inbox_items: 0 });
    expect(provisioningPort.published.at(-1)?.messages[0]).toMatchObject({
      kind: 'controller_pinged',
      participant_refs: ['opus'],
    });

    const second = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:05:00.000Z'),
    });
    expect(second).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 1, inbox_items: 0 });
    expect(provisioningPort.published.at(-1)?.messages[0]).toMatchObject({
      kind: 'roster_pinged',
      participant_refs: ['opus', 'sonnet', 'glm5'],
    });

    const third = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-12T01:10:00.000Z'),
    });
    expect(third).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 0, inbox_items: 1 });
    const inboxRows = db.prepare('SELECT text, source FROM inbox_items ORDER BY id DESC').all() as Array<{ text: string; source: string }>;
    expect(inboxRows[0]).toMatchObject({
      text: 'Task OC-PROBE-1 appears stuck',
      source: 'inbox_escalated',
    });
  });

  it('auto-advances graph-backed auto-timeout stages through timeout edges during inactive probes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-TIMEOUT-PROBE-1',
      archonUsers: ['archon'],
    });

    service.createTask({
      title: 'Timeout edge probe',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'wait', mode: 'discuss', gate: { type: 'auto_timeout', timeout_sec: 30 } },
          { id: 'escalate', mode: 'discuss', gate: { type: 'command' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['wait'],
          nodes: [
            { id: 'wait', kind: 'stage', gate: { type: 'auto_timeout', timeout_sec: 30 } },
            { id: 'escalate', kind: 'stage', gate: { type: 'command' } },
          ],
          edges: [
            { id: 'wait__timeout__escalate', from: 'wait', to: 'escalate', kind: 'timeout' },
          ],
        },
      },
    });

    expect(service.getTaskStatus('OC-TIMEOUT-PROBE-1').task_blueprint).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'wait',
          kind: 'stage',
          gate_type: 'auto_timeout',
        }),
      ]),
      edges: expect.arrayContaining([
        expect.objectContaining({
          from: 'wait',
          to: 'escalate',
          kind: 'timeout',
        }),
      ]),
    });

    db.prepare('UPDATE stage_history SET entered_at = ? WHERE task_id = ? AND stage_id = ?')
      .run('2026-04-11T00:00:00.000Z', 'OC-TIMEOUT-PROBE-1', 'wait');

    const result = service.probeInactiveTasks({
      controllerAfterMs: 60_000,
      rosterAfterMs: 120_000,
      inboxAfterMs: 180_000,
      now: new Date('2026-04-11T00:01:00.000Z'),
    });

    expect(result).toMatchObject({
      scanned_tasks: 1,
      timeout_advances: 1,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 0,
      inbox_items: 0,
    });
    expect(service.getTaskStatus('OC-TIMEOUT-PROBE-1').task.current_stage).toBe('escalate');
    expect(service.getTaskStatus('OC-TIMEOUT-PROBE-1').flow_log.at(-1)).toMatchObject({
      event: 'stage_advanced',
      detail: JSON.stringify({
        from_stage: 'wait',
        to_stage: 'escalate',
        transition_kind: 'timeout',
      }),
    });
  });

  it('suppresses repeated controller pings when sqlite timestamps omit timezone markers', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-sqlite',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-SQLITE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Inactive sqlite timestamp probe test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-SQLITE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-12 00:00:00', 'OC-PROBE-SQLITE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-12 00:00:00', 'OC-PROBE-SQLITE-1');

    const first = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 7_200_000,
      inboxAfterMs: 14_400_000,
      now: new Date('2026-03-12T01:00:00.000Z'),
    });
    expect(first).toMatchObject({ scanned_tasks: 1, controller_pings: 1, roster_pings: 0, inbox_items: 0 });

    const second = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 7_200_000,
      inboxAfterMs: 14_400_000,
      now: new Date('2026-03-12T01:00:30.000Z'),
    });
    expect(second).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 0, inbox_items: 0 });
    expect(
      provisioningPort.published.flatMap((entry) => entry.messages).filter((message) => message.kind === 'controller_pinged'),
    ).toHaveLength(1);
  });

  it('does not treat echoed system status messages as fresh business activity', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-echo',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const conversationRepository = new TaskConversationRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-ECHO-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });

    service.createTask({
      title: 'Inactive self echo probe test',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', visibility: 'private' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ECHO-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ECHO-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-12T00:00:00.000Z', 'OC-PROBE-ECHO-1');

    const first = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 7_200_000,
      inboxAfterMs: 14_400_000,
      now: new Date('2026-03-12T01:00:00.000Z'),
    });
    expect(first).toMatchObject({ scanned_tasks: 1, controller_pings: 1, roster_pings: 0, inbox_items: 0 });
    db.prepare(
      "UPDATE flow_log SET created_at = '2026-03-12 01:00:00' WHERE task_id = ? AND event = 'controller_pinged'",
    ).run('OC-PROBE-ECHO-1');
    db.prepare(
      "UPDATE task_conversation_entries SET occurred_at = '2026-03-12T01:00:00.000Z' WHERE task_id = ? AND author_kind = 'system' AND body LIKE 'Agora 状态更新%'",
    ).run('OC-PROBE-ECHO-1');

    const binding = bindingService.getLatestBinding('OC-PROBE-ECHO-1');
    const echoedBody = conversationRepository
      .listByTask('OC-PROBE-ECHO-1')
      .slice()
      .reverse()
      .find((entry) => entry.author_kind === 'system' && entry.body.includes('事件类型: controller_pinged'))
      ?.body;
    expect(binding).not.toBeNull();
    expect(echoedBody).toBeTruthy();

    conversationRepository.insert({
      id: 'echoed-controller-ping-1',
      task_id: 'OC-PROBE-ECHO-1',
      binding_id: binding!.id,
      provider: 'discord',
      provider_message_ref: 'discord-msg-echo-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: '1480745916225949757',
      display_name: 'Agora',
      body: echoedBody!,
      occurred_at: '2026-03-12T01:00:01.000Z',
      metadata: {
        senderId: '1480745916225949757',
        senderName: 'Agora',
        threadId: 'discord-thread-probe-echo',
      },
    });

    const second = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 7_200_000,
      inboxAfterMs: 14_400_000,
      now: new Date('2026-03-12T01:00:30.000Z'),
    });
    expect(second).toMatchObject({ scanned_tasks: 1, controller_pings: 0, roster_pings: 0, inbox_items: 0 });
    expect(
      provisioningPort.published.flatMap((entry) => entry.messages).filter((message) => message.kind === 'controller_pinged'),
    ).toHaveLength(1);
  });

  it('suppresses controller pings when task is at an approval gate even before advanceTask is called', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-approval-no-advance',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-APPROVAL-NO-ADVANCE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      resolveHumanReminderParticipantRefs: ({ reason }: { reason: string }) =>
        reason === 'approval_waiting' ? ['discord-user-123'] : [],
    });

    service.createTask({
      title: 'Approval gate no advance',
      type: 'custom',
      creator: 'alice',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'review' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'review',
            mode: 'discuss',
            gate: { type: 'approval', approver: 'reviewer' },
          },
        ],
      },
      im_target: { provider: 'discord', visibility: 'private' },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    provisioningPort.published.length = 0;

    // Controller has NOT called advanceTask — no approval_request row exists yet.
    // Task is idle and at an approval gate stage.
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run('2026-03-29T00:00:00.000Z', 'OC-APPROVAL-NO-ADVANCE-1');
    db.prepare('UPDATE flow_log SET created_at = ? WHERE task_id = ?').run('2026-03-29T00:00:00.000Z', 'OC-APPROVAL-NO-ADVANCE-1');
    db.prepare('UPDATE progress_log SET created_at = ? WHERE task_id = ?').run('2026-03-29T00:00:00.000Z', 'OC-APPROVAL-NO-ADVANCE-1');

    const result = service.probeInactiveTasks({
      controllerAfterMs: 1_000,
      rosterAfterMs: 2_000,
      inboxAfterMs: 3_000,
      now: new Date('2026-03-29T01:00:00.000Z'),
    });

    // Should NOT ping the controller — the gate is waiting for human approval.
    expect(result).toMatchObject({
      scanned_tasks: 1,
      controller_pings: 0,
      roster_pings: 0,
      human_pings: 1,
      inbox_items: 0,
    });
    expect(
      provisioningPort.published.flatMap((entry) => entry.messages).filter((m) => m.kind === 'controller_pinged'),
    ).toHaveLength(0);
    expect(provisioningPort.published.at(-1)?.messages[0]).toMatchObject({
      kind: 'human_approval_pinged',
      participant_refs: ['discord-user-123'],
    });
  });

  it('rejects craftsman dispatch when the current stage semantics do not allow craftsman work', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-disallowed-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T15:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GUARD-1',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Guard discuss stage',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'sub-disallowed-1',
      task_id: 'OC-DISPATCH-GUARD-1',
      stage_id: 'discuss',
      title: 'Should not dispatch from discuss',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GUARD-1',
      subtask_id: 'sub-disallowed-1',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/codex',
    })).toThrow(/does not allow craftsman dispatch/i);
    expect(executions.listBySubtask('OC-DISPATCH-GUARD-1', 'sub-disallowed-1')).toEqual([]);
  });

  it('allows craftsman dispatch when the active stage explicitly opts into craftsman execution', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-allowed-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T15:30:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GUARD-2',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Guard execute stage',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-allowed-1',
      task_id: 'OC-DISPATCH-GUARD-2',
      stage_id: 'implement',
      title: 'Should dispatch in craftsman stage',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GUARD-2',
      subtask_id: 'sub-allowed-1',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/codex',
    });

    expect(result.execution).toMatchObject({
      task_id: 'OC-DISPATCH-GUARD-2',
      subtask_id: 'sub-allowed-1',
      adapter: 'codex',
    });
  });

  it('defaults craftsman dispatch workdir to the bound repo for coding tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repoDir = mkdtempSync(join(tmpdir(), 'agora-ts-dispatch-repo-'));
    const projectStateRoot = mkdtempSync(join(tmpdir(), 'agora-ts-dispatch-project-root-'));
    const isolatedRoot = join(tmpdir(), '.agora-task-worktrees', 'proj-repo-workdir');
    tempPaths.push(repoDir, projectStateRoot, isolatedRoot);
    rmSync(isolatedRoot, { recursive: true, force: true });
    initCommittedRepo(repoDir);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-default-workdir-repo-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-31T10:00:00.000Z'),
      },
    });
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-repo-workdir',
      name: 'Repo Workdir',
      owner: 'archon',
      metadata: {
        repo_path: repoDir,
        agora: {
          nomos: {
            project_state_root: projectStateRoot,
          },
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-WORKDIR-REPO',
      craftsmanDispatcher: dispatcher,
      projectService,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Repo workdir dispatch',
      type: 'coding',
      creator: 'archon',
      project_id: 'proj-repo-workdir',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-repo-workdir',
      task_id: 'OC-DISPATCH-WORKDIR-REPO',
      stage_id: 'implement',
      title: 'Dispatch with inferred repo workdir',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-WORKDIR-REPO',
      subtask_id: 'sub-repo-workdir',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: null,
    }) as unknown as { execution: { workdir: string | null } };

    const expected = join(tmpdir(), '.agora-task-worktrees', 'proj-repo-workdir', 'OC-DISPATCH-WORKDIR-REPO');
    expect(result.execution.workdir).toBe(expected);
    expect(readFileSync(join(expected, 'README.md'), 'utf8')).toContain('hello');
    expect(realpathSync(runGit(expected, ['rev-parse', '--show-toplevel']))).toBe(realpathSync(expected));
  });

  it('defaults craftsman dispatch workdir to the canonical project repo for non-code tasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const projectStateRoot = mkdtempSync(join(tmpdir(), 'agora-ts-dispatch-canonical-root-'));
    const isolatedRoot = join(tmpdir(), '.agora-task-worktrees', 'proj-project-workdir');
    tempPaths.push(projectStateRoot, isolatedRoot);
    rmSync(isolatedRoot, { recursive: true, force: true });
    initCommittedRepo(projectStateRoot, { 'index.md': '# project\n' });
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-default-workdir-project-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-31T10:10:00.000Z'),
      },
    });
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-project-workdir',
      name: 'Project Workdir',
      owner: 'archon',
      metadata: {
        agora: {
          nomos: {
            project_state_root: projectStateRoot,
          },
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-WORKDIR-PROJECT',
      craftsmanDispatcher: dispatcher,
      projectService,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Project workdir dispatch',
      type: 'document',
      creator: 'archon',
      project_id: 'proj-project-workdir',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-project-workdir',
      task_id: 'OC-DISPATCH-WORKDIR-PROJECT',
      stage_id: 'implement',
      title: 'Dispatch with inferred project workdir',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-WORKDIR-PROJECT',
      subtask_id: 'sub-project-workdir',
      caller_id: 'glm5',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: null,
    }) as unknown as { execution: { workdir: string | null } };

    const expected = join(tmpdir(), '.agora-task-worktrees', 'proj-project-workdir', 'OC-DISPATCH-WORKDIR-PROJECT');
    expect(result.execution.workdir).toBe(expected);
    expect(readFileSync(join(expected, 'index.md'), 'utf8')).toContain('# project');
    expect(realpathSync(runGit(expected, ['rev-parse', '--show-toplevel']))).toBe(realpathSync(expected));
  });

  it('normalizes craftsman adapter aliases for manual dispatch', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-allowed-alias-1',
      adapters: {
        claude: new StubCraftsmanAdapter('claude', () => '2026-03-14T11:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GUARD-ALIAS-1',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Guard execute stage alias',
      type: 'coding_heavy',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-allowed-alias-1',
      task_id: 'OC-DISPATCH-GUARD-ALIAS-1',
      stage_id: 'implement',
      title: 'Should dispatch in craftsman stage',
      assignee: 'opus',
      status: 'pending',
      craftsman_type: 'claude_code',
      craftsman_prompt: 'Pair with me',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GUARD-ALIAS-1',
      subtask_id: 'sub-allowed-alias-1',
      caller_id: 'opus',
      adapter: 'claude_code',
      mode: 'interactive',
      interaction_expectation: 'needs_input',
      workdir: '/tmp/claude',
    });

    expect(result.execution).toMatchObject({
      task_id: 'OC-DISPATCH-GUARD-ALIAS-1',
      subtask_id: 'sub-allowed-alias-1',
      adapter: 'claude',
    });
  });

  it('materializes a controller-aware execution brief for manual craftsman dispatch when no brief_path is provided', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const captured: Array<{ brief_path: string | null; prompt: string | null }> = [];
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-auto-brief-1',
      adapters: {
        claude: {
          name: 'claude',
          dispatchTask(request) {
            captured.push({ brief_path: request.brief_path, prompt: request.prompt });
            return {
              status: 'running',
              session_id: `claude:${request.execution_id}`,
              started_at: '2026-03-17T10:00:00.000Z',
              payload: null,
            };
          },
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-BRIEF-1',
      craftsmanDispatcher: dispatcher,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-brief-binding-1',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Dispatch with execution brief',
      type: 'custom',
      creator: 'archon',
      description: 'dispatch should get a curated execution brief',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-brief-1',
      task_id: 'OC-DISPATCH-BRIEF-1',
      stage_id: 'implement',
      title: 'Implement auth adapter',
      assignee: 'claude',
      status: 'pending',
      craftsman_type: 'claude',
      craftsman_prompt: 'Implement the auth adapter and report blockers.',
    });

    const result = service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-BRIEF-1',
      subtask_id: 'sub-brief-1',
      caller_id: 'opus',
      adapter: 'claude',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/brief-dispatch',
    }) as unknown as { execution: { brief_path: string | null } };

    expect(captured).toHaveLength(1);
    expect(captured[0]?.brief_path).toBeTruthy();
    expect(result.execution.brief_path).toBe(captured[0]?.brief_path ?? null);
    expect(existsSync(captured[0]!.brief_path!)).toBe(true);
    const briefBody = readFileSync(captured[0]!.brief_path!, 'utf8');
    expect(briefBody).toContain('Execution Brief');
    expect(briefBody).toContain('OC-DISPATCH-BRIEF-1');
    expect(briefBody).toContain('sub-brief-1');
    expect(briefBody).toContain('Implement auth adapter');
    expect(briefBody).toContain('Controller: opus');
    expect(briefBody).toContain('Current Stage: implement');
    expect(briefBody).toContain('Current Stage Participants: opus, sonnet');
  });

  it('routes a project-bound craftsman execution brief to the craftsman context artifact', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const captured: Array<{ brief_path: string | null; prompt: string | null }> = [];
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-audience-brief-1',
      adapters: {
        claude: {
          name: 'claude',
          dispatchTask(request) {
            captured.push({ brief_path: request.brief_path, prompt: request.prompt });
            return {
              status: 'running',
              session_id: `claude:${request.execution_id}`,
              started_at: '2026-03-21T10:00:00.000Z',
              payload: null,
            };
          },
        },
      },
    });
    const projectService = createProjectServiceFromDb(db, {
      knowledgePort: new FilesystemProjectKnowledgeAdapter({
        brainPackRoot: brainPackDir,
      }),
    });
    projectService.createProject({
      id: 'proj-brief-audience',
      name: 'Audience Brief Project',
    });
    const buildBootstrapContext = vi.fn((input: { audience: 'controller' | 'citizen' | 'craftsman' }) => ({
      project_id: 'proj-brief-audience',
      audience: input.audience,
      markdown: `---\ndoc_type: project_brain_bootstrap_context\naudience: ${input.audience}\n---\n# ${input.audience}\n`,
      source_documents: [],
    }));
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-AUDIENCE-BRIEF-1',
      craftsmanDispatcher: dispatcher,
      projectService,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-audience-brief-binding',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
      projectBrainAutomationService: {
        buildBootstrapContext,
        promoteKnowledge: vi.fn(),
        recordTaskCloseRecap: vi.fn(),
      } as unknown as NonNullable<TaskServiceBuilderOptions['projectBrainAutomationService']>,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Audience-specific execution brief',
      type: 'custom',
      creator: 'archon',
      description: 'craftsman should get craftsman context',
      priority: 'normal',
      project_id: 'proj-brief-audience',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-audience-brief-1',
      task_id: 'OC-AUDIENCE-BRIEF-1',
      stage_id: 'implement',
      title: 'Implement audience brief',
      assignee: 'claude',
      status: 'pending',
      craftsman_type: 'claude',
      craftsman_prompt: 'Use the audience-specific context.',
    });

    service.dispatchCraftsman({
      task_id: 'OC-AUDIENCE-BRIEF-1',
      subtask_id: 'sub-audience-brief-1',
      caller_id: 'opus',
      adapter: 'claude',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/audience-brief-dispatch',
    });

    expect(captured).toHaveLength(1);
    const briefBody = readFileSync(captured[0]!.brief_path!, 'utf8');
    expect(briefBody).toContain('project-brain-context-craftsman.md');
    expect(briefBody).not.toContain('project-brain-context-controller.md');
  });

  it('auto-dispatches craftsman subtasks with a materialized execution brief when no brief_path is provided', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const brainPackDir = makeBrainPackDir();
    const captured: Array<{ brief_path: string | null; prompt: string | null }> = [];
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-auto-brief-2',
      adapters: {
        claude: {
          name: 'claude',
          dispatchTask(request) {
            captured.push({ brief_path: request.brief_path, prompt: request.prompt });
            return {
              status: 'running',
              session_id: `claude:${request.execution_id}`,
              started_at: '2026-03-17T10:05:00.000Z',
              payload: null,
            };
          },
        },
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-BRIEF-1',
      craftsmanDispatcher: dispatcher,
      taskBrainBindingService: createTaskBrainBindingServiceFromDb(db, {
        idGenerator: () => 'brain-brief-binding-2',
      }),
      taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
        brainPackRoot: brainPackDir,
      }),
    });

    service.createTask({
      title: 'Auto dispatch with execution brief',
      type: 'custom',
      creator: 'archon',
      description: 'createSubtasks should generate a curated execution brief',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            roster: { include_roles: ['developer'], keep_controller: true },
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    service.createSubtasks('OC-SUBTASK-BRIEF-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-auto-brief-1',
          title: 'Implement execution brief path',
          assignee: 'claude',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'Implement the execution brief path.',
          },
        },
      ],
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.brief_path).toBeTruthy();
    expect(existsSync(captured[0]!.brief_path!)).toBe(true);
    const briefBody = readFileSync(captured[0]!.brief_path!, 'utf8');
    expect(briefBody).toContain('Execution Brief');
    expect(briefBody).toContain('OC-SUBTASK-BRIEF-1');
    expect(briefBody).toContain('sub-auto-brief-1');
    expect(briefBody).toContain('Implement execution brief path');
    expect(briefBody).toContain('Current Stage Participants: opus, sonnet');
  });

  it('rejects craftsman dispatch when the caller is not the controller', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-owner-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-12T16:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-OWNER-1',
      craftsmanDispatcher: dispatcher,
    });
    const subtasks = new SubtaskRepository(db);

    service.createTask({
      title: 'Dispatch ownership guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-owner-1',
      task_id: 'OC-DISPATCH-OWNER-1',
      stage_id: 'implement',
      title: 'Only controller can dispatch',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-OWNER-1',
      subtask_id: 'sub-owner-1',
      caller_id: 'sonnet',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/codex',
    })).toThrow(/controller ownership/i);
  });

  it('rejects craftsman dispatch when per-agent concurrency exceeds the configured limit', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-governance-limit-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T14:00:00.000Z'),
      },
    });
    const executions = new CraftsmanExecutionRepository(db);
    const subtasks = new SubtaskRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-1',
      craftsmanDispatcher: dispatcher,
      craftsmanGovernance: {
        maxConcurrentPerAgent: 1,
      },
    });

    service.createTask({
      title: 'Per-agent concurrency guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-governance-limit-1',
      task_id: 'OC-DISPATCH-GOV-1',
      stage_id: 'implement',
      title: 'Already running elsewhere',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-existing-1',
      task_id: 'OC-DISPATCH-GOV-1',
      subtask_id: 'sub-governance-limit-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:existing',
      status: 'running',
      started_at: '2026-03-13T13:59:00.000Z',
    });
    subtasks.insertSubtask({
      id: 'sub-governance-limit-2',
      task_id: 'OC-DISPATCH-GOV-1',
      stage_id: 'implement',
      title: 'Should be rejected by limit',
      assignee: 'codex',
      status: 'pending',
      craftsman_type: 'codex',
    });

    expect(() => service.dispatchCraftsman({
      task_id: 'OC-DISPATCH-GOV-1',
      subtask_id: 'sub-governance-limit-2',
      caller_id: 'opus',
      adapter: 'codex',
      mode: 'one_shot',
      interaction_expectation: 'one_shot',
      workdir: '/tmp/codex',
    })).toThrow(/per-agent concurrency limit exceeded/i);
  });

  it('rejects subtask creation when host resource limits are exceeded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-2',
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-13T14:10:00.000Z',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 95,
          memory_utilization: 0.95,
          swap_total_bytes: 10,
          swap_used_bytes: 1,
          swap_utilization: 0.1,
        }),
      },
      craftsmanGovernance: {
        maxConcurrentPerAgent: 3,
        hostMemoryUtilizationLimit: 0.9,
      },
    });

    service.createTask({
      title: 'Host resource guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-DISPATCH-GOV-2', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'sub-host-limit-1',
          title: 'Should be blocked by host limit',
          assignee: 'codex',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
          },
        },
      ],
    })).toThrow(/memory utilization/i);
  });

  it('observes stale craftsman executions and probes them forward', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-DISPATCH-GOV-3',
      craftsmanExecutionProbePort: {
        probe: ({ executionId }: CraftsmanProbePortExecution) => ({
          execution_id: executionId,
          status: 'running',
          session_id: 'tmux:observed',
          payload: { summary: 'still running' },
          error: null,
          finished_at: null,
        }),
      },
    });

    service.createTask({
      title: 'Observe stale executions',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-observe-1',
      task_id: 'OC-DISPATCH-GOV-3',
      stage_id: 'implement',
      title: 'Observe me',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:observed',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-observe-1',
      task_id: 'OC-DISPATCH-GOV-3',
      subtask_id: 'sub-observe-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:observed',
      status: 'running',
      started_at: '2026-03-13T13:00:00.000Z',
      finished_at: null,
    });

    db.prepare(`
      UPDATE craftsman_executions
      SET updated_at = ?
      WHERE execution_id = 'exec-observe-1'
    `).run('2026-03-13T13:00:00.000Z');

    const result = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date('2026-03-13T13:05:00.000Z'),
    });

    expect(result).toMatchObject({
      scanned: 1,
      probed: 1,
      progressed: 0,
    });
    expect(service.getCraftsmanExecution('exec-observe-1').status).toBe('running');
    expect(service.getTaskStatus('OC-DISPATCH-GOV-3').flow_log.map((entry) => entry.event)).toContain('craftsman_auto_probe');
  });

  it('applies staircase backoff to repeated craftsman auto-probes with no progress', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-OBSERVE-BACKOFF-1',
      craftsmanExecutionProbePort: {
        probe: () => null,
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const baseNow = new Date();
    const staleAt = new Date(baseNow.getTime() - 5 * 60_000).toISOString();

    service.createTask({
      title: 'Observe stale backoff',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'implement',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-observe-backoff-1',
      task_id: 'OC-OBSERVE-BACKOFF-1',
      stage_id: 'implement',
      title: 'Observe stale backoff',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      craftsman_session: 'tmux:backoff',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-observe-backoff-1',
      task_id: 'OC-OBSERVE-BACKOFF-1',
      subtask_id: 'sub-observe-backoff-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:backoff',
      status: 'running',
      started_at: staleAt,
      finished_at: null,
    });
    db.prepare(`
      UPDATE craftsman_executions
      SET updated_at = ?
      WHERE execution_id = 'exec-observe-backoff-1'
    `).run(staleAt);

    const first = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: baseNow,
    });
    expect(first).toMatchObject({
      scanned: 1,
      probed: 0,
      progressed: 0,
    });
    const probeState = () => (service as unknown as {
      craftsmanProbeStateByExecution: Map<string, { attempts: number; lastProbeMs: number | null }>;
    }).craftsmanProbeStateByExecution.get('exec-observe-backoff-1');

    expect(probeState()).toMatchObject({
      attempts: 1,
    });

    const firstProbeAt = probeState()?.lastProbeMs;
    expect(firstProbeAt).toBeTruthy();
    const second = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date(firstProbeAt! + 30_000),
    });
    expect(second).toMatchObject({
      scanned: 1,
      probed: 0,
      progressed: 0,
    });
    expect(probeState()).toMatchObject({
      attempts: 1,
    });

    const third = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date(firstProbeAt! + 5 * 60_000),
    });
    expect(third).toMatchObject({
      scanned: 1,
      probed: 0,
      progressed: 0,
    });
    expect(probeState()).toMatchObject({
      attempts: 2,
    });

    const secondProbeAt = probeState()?.lastProbeMs;
    expect(secondProbeAt).toBeTruthy();
    const fourth = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date(secondProbeAt! + 120_000),
    });
    expect(fourth).toMatchObject({
      scanned: 1,
      probed: 0,
      progressed: 0,
    });
    expect(probeState()).toMatchObject({
      attempts: 2,
    });

    const fifth = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date(secondProbeAt! + 180_001),
    });
    expect(fifth).toMatchObject({
      scanned: 1,
      probed: 0,
      progressed: 0,
    });
    expect(probeState()).toMatchObject({
      attempts: 3,
    });
  });

  it('creates execute-mode subtasks through the formal service surface and auto-dispatches craftsmen specs', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-subtask-create-1',
      adapters: {
        codex: new StubCraftsmanAdapter('codex', () => '2026-03-13T10:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-1',
      craftsmanDispatcher: dispatcher,
    });

    service.createTask({
      title: 'Formal subtask surface',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    const result = service.createSubtasks('OC-SUBTASK-CREATE-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'build-api',
          title: 'Build API',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            workdir: '/tmp/subtask-build-api',
            prompt: 'Implement the API',
          },
        },
        {
          id: 'write-tests',
          title: 'Write tests',
          assignee: 'gpt52',
          execution_target: 'manual',
        },
      ],
    });

    expect(result.subtasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'build-api',
          task_id: 'OC-SUBTASK-CREATE-1',
          stage_id: 'develop',
          craftsman_type: 'codex',
          dispatch_status: 'running',
        }),
        expect.objectContaining({
          id: 'write-tests',
          assignee: 'gpt52',
          craftsman_type: null,
        }),
      ]),
    );
    expect(result.dispatched_executions).toEqual([
      expect.objectContaining({
        execution_id: 'exec-subtask-create-1',
        task_id: 'OC-SUBTASK-CREATE-1',
        subtask_id: 'build-api',
        adapter: 'codex',
      }),
    ]);
  });

  it('normalizes craftsman adapter aliases during formal subtask creation and auto-dispatch', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const dispatcher = createCraftsmanDispatcherFromDb(db, {
      executionIdGenerator: () => 'exec-subtask-create-alias-1',
      adapters: {
        claude: new StubCraftsmanAdapter('claude', () => '2026-03-14T10:00:00.000Z'),
      },
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-ALIAS-1',
      craftsmanDispatcher: dispatcher,
    });

    service.createTask({
      title: 'Formal subtask adapter alias',
      type: 'coding_heavy',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    const result = service.createSubtasks('OC-SUBTASK-CREATE-ALIAS-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'smoke-claude',
          title: 'Smoke Claude alias',
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude_code',
            mode: 'interactive',
            interaction_expectation: 'needs_input',
            prompt: 'Pair with me',
          },
        },
      ],
    });

    expect(result.subtasks).toEqual([
      expect.objectContaining({
        id: 'smoke-claude',
        craftsman_type: 'claude',
        dispatch_status: 'running',
      }),
    ]);
    expect(result.dispatched_executions).toEqual([
      expect.objectContaining({
        execution_id: 'exec-subtask-create-alias-1',
        adapter: 'claude',
      }),
    ]);
  });

  it('rejects formal subtask creation when the caller is not the controller', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-2',
    });

    service.createTask({
      title: 'Subtask ownership guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-CREATE-2', {
      caller_id: 'sonnet',
      subtasks: [
        {
          id: 'rogue-subtask',
          title: 'Should fail',
          assignee: 'sonnet',
          execution_target: 'manual',
        },
      ],
    })).toThrow(/controller ownership/i);
  });

  it('requires explicit manual intent for non-craftsman subtasks', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-CREATE-MANUAL-1',
    });

    service.createTask({
      title: 'Subtask explicit manual intent',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-CREATE-MANUAL-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'implicit-manual',
          title: 'Should fail without explicit intent',
          assignee: 'sonnet',
        } as never,
      ],
    })).toThrow(/execution_target/i);
  });

  it('rejects manual subtasks in smoke mode when the stage is craftsman-capable', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-SMOKE-MANUAL-1',
    });

    service.createTask({
      title: 'Smoke manual intent guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      control: { mode: 'smoke_test' },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-SMOKE-MANUAL-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'manual-smoke',
          title: 'Should be blocked in smoke mode',
          assignee: 'opus',
          execution_target: 'manual',
        },
      ],
    })).toThrow(/execution_target='manual'/i);
  });

  it('rejects craftsman subtask creation when the per-agent concurrency limit would be exceeded', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-LIMIT-1',
      craftsmanGovernance: {
        maxConcurrentPerAgent: 1,
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Per-agent concurrency guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'existing-runner',
      task_id: 'OC-SUBTASK-LIMIT-1',
      stage_id: 'develop',
      title: 'Existing running execution',
      assignee: 'sonnet',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-existing-runner',
      task_id: 'OC-SUBTASK-LIMIT-1',
      subtask_id: 'existing-runner',
      adapter: 'codex',
      mode: 'one_shot',
      status: 'running',
      started_at: '2026-03-13T14:00:00.000Z',
    });

    expect(() => service.createSubtasks('OC-SUBTASK-LIMIT-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'new-runner',
          title: 'Should be blocked',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'do work',
          },
        },
      ],
    })).toThrow(/per-agent concurrency limit exceeded/i);
  });

  it('rejects craftsman subtask creation when host memory utilization exceeds the configured limit', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-LIMIT-2',
      craftsmanGovernance: {
        hostMemoryUtilizationLimit: 0.5,
      },
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-13T14:10:00.000Z',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 80,
          memory_utilization: 0.8,
          swap_total_bytes: 0,
          swap_used_bytes: 0,
          swap_utilization: null,
        }),
      },
    });

    service.createTask({
      title: 'Host resource guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-LIMIT-2', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'blocked-by-memory',
          title: 'Should not dispatch under memory pressure',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'do work',
          },
        },
      ],
    })).toThrow(/memory utilization/i);
  });

  it('uses macOS memory pressure instead of resident memory and swap for dispatch governance', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-MAC-1',
      craftsmanGovernance: {
        hostMemoryUtilizationLimit: 0.9,
        hostSwapUtilizationLimit: 0.9,
      },
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-14T00:20:00.000Z',
          platform: 'darwin',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 99,
          memory_utilization: 0.99,
          memory_pressure: 0.7,
          swap_total_bytes: 100,
          swap_used_bytes: 95,
          swap_utilization: 0.95,
        }),
      },
    });

    service.createTask({
      title: 'mac pressure guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-MAC-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'allowed-under-pressure',
          title: 'Should still dispatch on mac',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'do work',
          },
        },
      ],
    })).not.toThrow();
  });

  it('includes warning-level host pressure and active execution attribution in governance snapshot', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GOV-SNAPSHOT-1',
      craftsmanGovernance: {
        hostMemoryWarningUtilizationLimit: 0.75,
        hostMemoryUtilizationLimit: 0.95,
      },
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-14T01:00:00.000Z',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 80,
          memory_utilization: 0.8,
          swap_total_bytes: 100,
          swap_used_bytes: 10,
          swap_utilization: 0.1,
        }),
      },
    });

    service.createTask({
      title: 'governance snapshot warnings',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });
    subtasks.insertSubtask({
      id: 'sub-gov-1',
      task_id: 'OC-GOV-SNAPSHOT-1',
      stage_id: 'develop',
      title: 'running execution',
      assignee: 'opus',
      status: 'in_progress',
      craftsman_type: 'claude',
      craftsman_workdir: '/tmp/agora',
      dispatch_status: 'running',
    });
    executions.insertExecution({
      execution_id: 'exec-gov-1',
      task_id: 'OC-GOV-SNAPSHOT-1',
      subtask_id: 'sub-gov-1',
      adapter: 'claude',
      mode: 'one_shot',
      session_id: 'tmux:claude',
      status: 'running',
      started_at: '2026-03-14T01:00:00.000Z',
    });

    const snapshot = service.getCraftsmanGovernanceSnapshot();

    expect(snapshot.host_pressure_status).toBe('warning');
    expect(snapshot.warnings).toContain('Host memory utilization warning: 0.80');
    expect(snapshot.active_execution_details).toEqual([
      expect.objectContaining({
        execution_id: 'exec-gov-1',
        assignee: 'opus',
        adapter: 'claude',
        workdir: '/tmp/agora',
      }),
    ]);
  });

  it('blocks macOS dispatch when memory pressure exceeds the configured limit', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-MAC-2',
      craftsmanGovernance: {
        hostMemoryUtilizationLimit: 0.9,
      },
      hostResourcePort: {
        readSnapshot: () => ({
          observed_at: '2026-03-14T00:25:00.000Z',
          platform: 'darwin',
          cpu_count: 8,
          load_1m: 2,
          memory_total_bytes: 100,
          memory_used_bytes: 70,
          memory_utilization: 0.7,
          memory_pressure: 0.95,
          swap_total_bytes: 100,
          swap_used_bytes: 10,
          swap_utilization: 0.1,
        }),
      },
    });

    service.createTask({
      title: 'mac pressure block',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-MAC-2', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'blocked-under-pressure',
          title: 'Should block on mac pressure',
          assignee: 'sonnet',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'codex',
            mode: 'one_shot',
            interaction_expectation: 'one_shot',
            prompt: 'do work',
          },
        },
      ],
    })).toThrow(/memory pressure/i);
  });

  it('rejects one_shot craftsman subtasks that declare interactive follow-up', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SUBTASK-GUARD-1',
    });

    service.createTask({
      title: 'Interaction guard',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'develop',
            mode: 'execute',
            execution_kind: 'craftsman_dispatch',
            allowed_actions: ['execute', 'dispatch_craftsman'],
            gate: { type: 'all_subtasks_done' },
          },
        ],
      },
    });

    expect(() => service.createSubtasks('OC-SUBTASK-GUARD-1', {
      caller_id: 'opus',
      subtasks: [
        {
          id: 'interactive-mismatch',
          title: 'Should fail',
          assignee: 'opus',
          execution_target: 'craftsman',
          craftsman: {
            adapter: 'claude',
            mode: 'one_shot',
            interaction_expectation: 'needs_input',
            prompt: 'wait for more input',
          },
        },
      ],
    })).toThrow(/execution_mode='one_shot'/i);
  });

  it('applies team/workflow overrides when creating a task', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-OVERRIDE-1',
    });

    const created = service.createTask({
      title: 'Override team and workflow',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'high',
      team_override: {
        members: [
          { role: 'architect', agentId: 'claude-opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'codex', member_kind: 'citizen', model_preference: 'fast_coding' },
          { role: 'craftsman', agentId: 'claude', member_kind: 'craftsman', model_preference: 'coding_cli' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
          { id: 'deliver', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        ],
      },
    });

    expect(created.current_stage).toBe('triage');
    expect(created.team).toEqual({
      members: [
        {
          role: 'architect',
          agentId: 'claude-opus',
          member_kind: 'controller',
          model_preference: 'strong_reasoning',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
        {
          role: 'developer',
          agentId: 'codex',
          member_kind: 'citizen',
          model_preference: 'fast_coding',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
        {
          role: 'craftsman',
          agentId: 'claude',
          member_kind: 'craftsman',
          model_preference: 'coding_cli',
          agent_origin: 'user_managed',
          briefing_mode: 'overlay_full',
        },
      ],
    });
    expect(created.workflow).toMatchObject({
      type: 'custom',
      stages: [
        { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
        { id: 'deliver', mode: 'execute', gate: { type: 'all_subtasks_done' } },
      ],
    });
  });

  it('persists task skill policy and control when creating a task', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-SKILL-POLICY-1',
    });

    const created = service.createTask({
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
          developer: ['refactoring-ui'],
        },
        enforcement: 'required',
      },
    });

    expect(created.skill_policy).toEqual({
      global_refs: ['planning-with-files'],
      role_refs: {
        architect: ['brainstorming'],
        developer: ['refactoring-ui'],
      },
      enforcement: 'required',
    });
    expect(created.control).toMatchObject({
      mode: 'smoke_test',
    });
  });

  it('rejects workflow overrides whose graph semantics are not runtime-supported', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-INVALID-1',
    });

    expect(() => service.createTask({
      title: 'Invalid graph override',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
          { id: 'ship', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['draft', 'review'],
          nodes: [
            { id: 'draft', kind: 'stage', gate: { type: 'command' } },
            { id: 'review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
            { id: 'ship', kind: 'stage', gate: { type: 'all_subtasks_done' } },
          ],
          edges: [
            { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
            { id: 'review__advance__ship', from: 'review', to: 'ship', kind: 'advance' },
            { id: 'review__reject__ship', from: 'review', to: 'ship', kind: 'reject' },
          ],
        },
      },
    })).toThrow(/runtime-supported graph semantics/);
  });

  it('rejects graph-backed workflow overrides whose graph nodes and stages are out of sync', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-GRAPH-ALIGN-1',
    });

    expect(() => service.createTask({
      title: 'Misaligned graph workflow',
      type: 'custom',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning', member_kind: 'controller' },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
          { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' } },
        ],
        graph: {
          graph_version: 1,
          entry_nodes: ['draft'],
          nodes: [
            { id: 'draft', kind: 'stage', gate: { type: 'command' } },
            { id: 'ship', kind: 'stage', gate: { type: 'all_subtasks_done' } },
          ],
          edges: [
            { id: 'draft__advance__ship', from: 'draft', to: 'ship', kind: 'advance' },
          ],
        },
      },
    })).toThrow(/missing from graph nodes|missing from workflow stages/);
  });

  it('broadcasts an immediate thread status update when a craftsman callback settles against an active context binding', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-notify-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOTIFY-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Immediate callback notify',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'notify-subtask-1',
      task_id: 'OC-NOTIFY-1',
      stage_id: 'develop',
      title: 'notify me',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'running',
      craftsman_session: 'tmux:notify-1',
    });
    executions.insertExecution({
      execution_id: 'exec-notify-1',
      task_id: 'OC-NOTIFY-1',
      subtask_id: 'notify-subtask-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:notify-1',
      status: 'running',
      started_at: '2026-03-12T16:00:00.000Z',
    });

    service.handleCraftsmanCallback({
      execution_id: 'exec-notify-1',
      status: 'succeeded',
      session_id: 'tmux:notify-1',
      payload: {
        output: {
          summary: 'implemented and ready',
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-03-12T16:01:00.000Z',
    });

    expect(provisioningPort.published.flatMap((entry) => entry.messages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'craftsman_completed',
        }),
      ]),
    );
    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_completed');
    expect(callbackMessage?.body).toContain('事件类型: craftsman_completed');
    expect(callbackMessage?.body).toContain('Execution: exec-notify-1');
    expect(callbackMessage?.body).toContain('implemented and ready');
    const statusConversation = new TaskConversationRepository(db)
      .listByTask('OC-NOTIFY-1')
      .find((entry) => entry.metadata?.event_type === 'craftsman_completed' && entry.author_ref === 'agora-bot');
    expect(statusConversation?.metadata).toMatchObject({
      event_type: 'craftsman_completed',
      task_id: 'OC-NOTIFY-1',
      task_state: 'active',
      current_stage: 'discuss',
      controller_ref: 'opus',
    });
  });

  it('broadcasts summarized craftsman output instead of raw runtime transcript', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-notify-raw-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-NOTIFY-RAW-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Immediate callback notify raw transcript',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'notify-subtask-raw-1',
      task_id: 'OC-NOTIFY-RAW-1',
      stage_id: 'develop',
      title: 'notify me without transcript spam',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'claude:notify-raw-1',
    });
    executions.insertExecution({
      execution_id: 'exec-notify-raw-1',
      task_id: 'OC-NOTIFY-RAW-1',
      subtask_id: 'notify-subtask-raw-1',
      adapter: 'claude',
      mode: 'one_shot',
      session_id: 'claude:notify-raw-1',
      status: 'running',
      started_at: '2026-04-01T15:00:00.000Z',
    });

    const transcript = [
      '[client] initialize (running)',
      '[client] session/new (running)',
      '我先读取 spec 文件和当前 constitution.md。',
      '[client] session/request_permission (running)',
      '内容已读取，现在填充 constitution.md。',
      '[tool] Write /tmp/constitution.md (failed)',
      '  output:',
      '    User refused permission to run tool',
      '[done] end_turn',
    ].join('\n');

    service.handleCraftsmanCallback({
      execution_id: 'exec-notify-raw-1',
      status: 'succeeded',
      session_id: 'claude:notify-raw-1',
      payload: {
        output: {
          summary: null,
          text: transcript,
          artifacts: [],
        },
      },
      error: null,
      finished_at: '2026-04-01T15:01:00.000Z',
    });

    const callbackMessage = provisioningPort.published.flatMap((entry) => entry.messages).find((message) => message.kind === 'craftsman_completed');
    expect(callbackMessage?.body).toContain('内容已读取，现在填充 constitution.md。');
    expect(callbackMessage?.body).toContain('User refused permission to run tool');
    expect(callbackMessage?.body).not.toContain('[client] session/new (running)');
    expect(callbackMessage?.body).not.toContain('[tool] Write /tmp/constitution.md (failed)');
  });

  it('routes craftsman input by execution id and records the input event', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const inputCalls: Array<{ kind: string; executionId: string; payload: unknown }> = [];
    const provisioningPort = new StubIMProvisioningPort({
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-input-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-INPUT-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      craftsmanInputPort: {
        sendText: (execution: CraftsmanInputPortExecution, text: string, submit = true) => {
          inputCalls.push({ kind: 'text', executionId: execution.executionId, payload: { text, submit } });
        },
        sendKeys: (execution: CraftsmanInputPortExecution, keys: string[]) => {
          inputCalls.push({ kind: 'keys', executionId: execution.executionId, payload: keys });
        },
        submitChoice: (execution: CraftsmanInputPortExecution, keys: string[]) => {
          inputCalls.push({ kind: 'choice', executionId: execution.executionId, payload: keys });
        },
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Craftsman input route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'input-subtask-1',
      task_id: 'OC-INPUT-1',
      stage_id: 'develop',
      title: 'wait for input',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'needs_input',
      craftsman_session: 'tmux:agora-craftsmen:codex',
    });
    executions.insertExecution({
      execution_id: 'exec-input-1',
      task_id: 'OC-INPUT-1',
      subtask_id: 'input-subtask-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'needs_input',
      started_at: '2026-03-13T15:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-input-1', 'Continue');
    service.sendCraftsmanInputKeys('exec-input-1', ['Down']);
    service.submitCraftsmanChoice('exec-input-1', ['Down']);

    expect(inputCalls).toEqual([
      { kind: 'text', executionId: 'exec-input-1', payload: { text: 'Continue', submit: true } },
      { kind: 'keys', executionId: 'exec-input-1', payload: ['Down'] },
      { kind: 'choice', executionId: 'exec-input-1', payload: ['Down'] },
    ]);

    const conversation = new TaskConversationRepository(db).listByTask('OC-INPUT-1');
    const inputEvents = conversation.filter((entry) => entry.metadata?.event_type === 'craftsman_input_sent');
    expect(inputEvents.filter((entry) => entry.author_ref === 'archon')).toHaveLength(3);
    expect(inputEvents.filter((entry) => entry.author_ref === 'agora-bot').length).toBeGreaterThanOrEqual(3);
  });

  it('probes tmux executions after operator input and resumes the execution status loop', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-probe-1',
    });
    const bindingService = createTaskContextBindingServiceFromDb(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-1',
      imProvisioningPort: provisioningPort,
      taskContextBindingService: bindingService,
      craftsmanInputPort: {
        sendText: () => {},
        sendKeys: () => {},
        submitChoice: () => {},
      },
      craftsmanExecutionProbePort: {
        probe: () => ({
          execution_id: 'exec-probe-1',
          status: 'running',
          session_id: 'tmux:agora-craftsmen:codex',
          payload: {
            output: {
              summary: 'codex resumed after input',
              text: null,
              stderr: null,
              artifacts: [],
              structured: null,
            },
          },
          error: null,
          finished_at: null,
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Craftsman probe route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    subtasks.insertSubtask({
      id: 'probe-subtask-1',
      task_id: 'OC-PROBE-1',
      stage_id: 'develop',
      title: 'wait for input then resume',
      assignee: 'codex',
      status: 'in_progress',
      craftsman_type: 'codex',
      dispatch_status: 'needs_input',
      craftsman_session: 'tmux:agora-craftsmen:codex',
    });
    executions.insertExecution({
      execution_id: 'exec-probe-1',
      task_id: 'OC-PROBE-1',
      subtask_id: 'probe-subtask-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:agora-craftsmen:codex',
      status: 'needs_input',
      started_at: '2026-03-13T16:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-probe-1', 'Continue');

    expect(service.getCraftsmanExecution('exec-probe-1').status).toBe('running');
    const subtask = new SubtaskRepository(db).listByTask('OC-PROBE-1').find((entry) => entry.id === 'probe-subtask-1');
    expect(subtask?.dispatch_status).toBe('running');
    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const runningMessage = broadcasts.find((message) => message.kind === 'craftsman_running');
    expect(runningMessage?.body).toContain('Status: running');
  });

  it('returns execution-scoped tmux tail when a tail port is configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-TAIL-1',
      craftsmanExecutionTailPort: {
        tail: (execution: CraftsmanTailPortExecution, lines: number) => ({
          execution_id: execution.executionId,
          available: true,
          output: `tail:${execution.adapter}:${lines}`,
          source: 'tmux',
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Execution tail route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'tail-subtask-1',
      task_id: 'OC-TAIL-1',
      stage_id: 'develop',
      title: 'stream output',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'tmux:agora-craftsmen:claude',
    });
    executions.insertExecution({
      execution_id: 'exec-tail-1',
      task_id: 'OC-TAIL-1',
      subtask_id: 'tail-subtask-1',
      adapter: 'claude',
      mode: 'one_shot',
      session_id: 'tmux:agora-craftsmen:claude',
      status: 'running',
      started_at: '2026-03-14T12:00:00.000Z',
    });

    expect(service.getCraftsmanExecutionTail('exec-tail-1', 50)).toEqual({
      execution_id: 'exec-tail-1',
      available: true,
      output: 'tail:claude:50',
      source: 'tmux',
    });
  });

  it('returns execution-scoped acpx tail when an acp tail port is configured', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-TAIL-ACP-1',
      craftsmanExecutionTailPort: {
        tail: (execution: CraftsmanTailPortExecution, lines: number) => ({
          execution_id: execution.executionId,
          available: true,
          output: `acp-tail:${execution.adapter}:${execution.workdir}:${lines}`,
          source: 'acpx',
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Execution tail route via acpx',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    subtasks.insertSubtask({
      id: 'tail-acp-subtask-1',
      task_id: 'OC-TAIL-ACP-1',
      stage_id: 'develop',
      title: 'stream acp output',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'acpx:exec-tail-acp-1',
      craftsman_workdir: '/tmp/acp-tail',
    });
    executions.insertExecution({
      execution_id: 'exec-tail-acp-1',
      task_id: 'OC-TAIL-ACP-1',
      subtask_id: 'tail-acp-subtask-1',
      adapter: 'claude',
      mode: 'interactive',
      session_id: 'acpx:exec-tail-acp-1',
      workdir: '/tmp/acp-tail',
      status: 'running',
      started_at: '2026-03-16T12:00:00.000Z',
    });

    expect(service.getCraftsmanExecutionTail('exec-tail-acp-1', 25)).toEqual({
      execution_id: 'exec-tail-acp-1',
      available: true,
      output: 'acp-tail:claude:/tmp/acp-tail:25',
      source: 'acpx',
    });
  });

  it('allows execution-scoped input for running continuous tmux executions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const calls: Array<{ kind: string; executionId: string; payload: unknown }> = [];
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CONTINUOUS-INPUT-1',
      craftsmanInputPort: {
        sendText: (execution: CraftsmanInputPortExecution, text: string, submit = true) => {
          calls.push({ kind: 'text', executionId: execution.executionId, payload: { text, submit } });
        },
        sendKeys: () => {},
        submitChoice: () => {},
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Continuous craftsman input route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    subtasks.insertSubtask({
      id: 'continuous-subtask-1',
      task_id: 'OC-CONTINUOUS-INPUT-1',
      stage_id: 'develop',
      title: 'interactive loop',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'tmux:agora-craftsmen:claude',
    });
    executions.insertExecution({
      execution_id: 'exec-continuous-1',
      task_id: 'OC-CONTINUOUS-INPUT-1',
      subtask_id: 'continuous-subtask-1',
      adapter: 'claude',
      mode: 'interactive',
      session_id: 'tmux:agora-craftsmen:claude',
      status: 'running',
      started_at: '2026-03-13T16:30:00.000Z',
    });

    service.sendCraftsmanInputText('exec-continuous-1', 'Continue');

    expect(calls).toEqual([
      { kind: 'text', executionId: 'exec-continuous-1', payload: { text: 'Continue', submit: true } },
    ]);
  });

  it('allows execution-scoped input for running continuous acpx executions', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const calls: Array<{ kind: string; executionId: string; workdir: string | null; payload: unknown }> = [];
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-CONTINUOUS-INPUT-ACP-1',
      craftsmanInputPort: {
        sendText: (execution: CraftsmanInputPortExecution, text: string, submit = true) => {
          calls.push({ kind: 'text', executionId: execution.executionId, workdir: execution.workdir, payload: { text, submit } });
        },
        sendKeys: () => {},
        submitChoice: () => {},
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);

    service.createTask({
      title: 'Continuous acpx craftsman input route',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    subtasks.insertSubtask({
      id: 'continuous-acp-subtask-1',
      task_id: 'OC-CONTINUOUS-INPUT-ACP-1',
      stage_id: 'develop',
      title: 'continue interactive acpx session',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'acpx:exec-cont-acp-1',
      craftsman_workdir: '/tmp/acp-input',
    });
    executions.insertExecution({
      execution_id: 'exec-cont-acp-1',
      task_id: 'OC-CONTINUOUS-INPUT-ACP-1',
      subtask_id: 'continuous-acp-subtask-1',
      adapter: 'claude',
      mode: 'interactive',
      session_id: 'acpx:exec-cont-acp-1',
      workdir: '/tmp/acp-input',
      status: 'running',
      started_at: '2026-03-16T12:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-cont-acp-1', 'Continue via acpx');

    expect(calls).toEqual([
      {
        kind: 'text',
        executionId: 'exec-cont-acp-1',
        workdir: '/tmp/acp-input',
        payload: { text: 'Continue via acpx', submit: true },
      },
    ]);
  });

  it('probes acpx executions after operator input and resumes the execution status loop', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-1',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-PROBE-ACP-1',
      imProvisioningPort: provisioningPort,
      imMessagingPort: provisioningPort,
      taskContextBindingService: createTaskContextBindingServiceFromDb(db),
      craftsmanInputPort: {
        sendText: () => {},
        sendKeys: () => {},
        submitChoice: () => {},
      },
      craftsmanExecutionProbePort: {
        probe: (execution: CraftsmanProbePortExecution) => ({
          execution_id: execution.executionId,
          status: 'running',
          session_id: execution.sessionId,
          payload: {
            output: {
              summary: 'claude resumed after operator input',
              text: null,
              stderr: null,
              artifacts: [],
              structured: { transport: 'acpx' },
            },
          },
          error: null,
          finished_at: null,
        }),
      },
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const bindings = new TaskContextBindingRepository(db);

    service.createTask({
      title: 'Probe acpx session after input',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', conversation_ref: 'channel-1' },
    });
    bindings.insert({
      id: 'binding-acp-probe-1',
      task_id: 'OC-PROBE-ACP-1',
      im_provider: 'discord',
      thread_ref: 'thread-1',
      conversation_ref: 'channel-1',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'probe-acp-subtask-1',
      task_id: 'OC-PROBE-ACP-1',
      stage_id: 'develop',
      title: 'wait for acpx input then resume',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'needs_input',
      craftsman_session: 'acpx:exec-probe-acp-1',
      craftsman_workdir: '/tmp/acp-probe',
    });
    executions.insertExecution({
      execution_id: 'exec-probe-acp-1',
      task_id: 'OC-PROBE-ACP-1',
      subtask_id: 'probe-acp-subtask-1',
      adapter: 'claude',
      mode: 'interactive',
      session_id: 'acpx:exec-probe-acp-1',
      workdir: '/tmp/acp-probe',
      status: 'needs_input',
      started_at: '2026-03-16T12:00:00.000Z',
    });

    service.sendCraftsmanInputText('exec-probe-acp-1', 'Continue');

    expect(service.getCraftsmanExecution('exec-probe-acp-1').status).toBe('running');
    const subtask = new SubtaskRepository(db).listByTask('OC-PROBE-ACP-1').find((entry) => entry.id === 'probe-acp-subtask-1');
    expect(subtask?.dispatch_status).toBe('running');
    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const runningMessage = broadcasts.find((message) => message.kind === 'craftsman_running');
    expect(runningMessage?.body).toContain('Status: running');
  });

  it('settles completed acpx sessions through observeCraftsmanExecutions and preserves callback notifications', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const provisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'thread-1',
    });
    const service = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-OBSERVE-ACP-DONE-1',
      imProvisioningPort: provisioningPort,
      imMessagingPort: provisioningPort,
      taskContextBindingService: createTaskContextBindingServiceFromDb(db),
      craftsmanExecutionProbePort: new AcpCraftsmanProbePort({
        probeExecution: () => ({
          sessionName: 'exec-observe-acp-done-1',
          lifecycleState: 'dead',
          agentSessionId: 'runtime-acp-done-1',
          summary: 'queue owner exited cleanly',
          lastPromptTime: '2026-03-16T12:02:00.000Z',
          rawStatus: {
            action: 'status_snapshot',
            status: 'dead',
            exitCode: 0,
            signal: null,
          },
        }),
        tailExecution: () => ({
          execution_id: 'exec-observe-acp-done-1',
          available: true,
          output: 'Claude finished the ACP cutover patch',
          source: 'acpx',
        }),
      } as never),
    });
    const subtasks = new SubtaskRepository(db);
    const executions = new CraftsmanExecutionRepository(db);
    const bindings = new TaskContextBindingRepository(db);

    service.createTask({
      title: 'Observe finished acpx execution',
      type: 'coding',
      creator: 'archon',
      description: '',
      priority: 'normal',
      im_target: { provider: 'discord', conversation_ref: 'channel-1' },
    });
    bindings.insert({
      id: 'binding-observe-acp-done-1',
      task_id: 'OC-OBSERVE-ACP-DONE-1',
      im_provider: 'discord',
      thread_ref: 'thread-1',
      conversation_ref: 'channel-1',
      status: 'active',
    });
    subtasks.insertSubtask({
      id: 'observe-acp-done-subtask-1',
      task_id: 'OC-OBSERVE-ACP-DONE-1',
      stage_id: 'develop',
      title: 'watch acpx completion',
      assignee: 'claude',
      status: 'in_progress',
      craftsman_type: 'claude',
      dispatch_status: 'running',
      craftsman_session: 'acpx:exec-observe-acp-done-1',
      craftsman_workdir: '/tmp/acp-observe-done',
    });
    executions.insertExecution({
      execution_id: 'exec-observe-acp-done-1',
      task_id: 'OC-OBSERVE-ACP-DONE-1',
      subtask_id: 'observe-acp-done-subtask-1',
      adapter: 'claude',
      mode: 'interactive',
      session_id: 'acpx:exec-observe-acp-done-1',
      workdir: '/tmp/acp-observe-done',
      status: 'running',
      started_at: '2026-03-16T12:00:00.000Z',
      finished_at: null,
    });

    db.prepare(`
      UPDATE craftsman_executions
      SET updated_at = ?
      WHERE execution_id = 'exec-observe-acp-done-1'
    `).run('2026-03-16T12:00:00.000Z');

    const result = service.observeCraftsmanExecutions({
      runningAfterMs: 60_000,
      waitingAfterMs: 60_000,
      now: new Date('2026-03-16T12:05:00.000Z'),
    });

    expect(result).toMatchObject({
      scanned: 1,
      probed: 1,
      progressed: 1,
    });
    expect(service.getCraftsmanExecution('exec-observe-acp-done-1').status).toBe('succeeded');
    const subtask = new SubtaskRepository(db).listByTask('OC-OBSERVE-ACP-DONE-1')
      .find((entry) => entry.id === 'observe-acp-done-subtask-1');
    expect(subtask).toMatchObject({
      status: 'done',
      dispatch_status: 'succeeded',
      output: 'Claude finished the ACP cutover patch',
    });
    const broadcasts = provisioningPort.published.flatMap((entry) => entry.messages);
    const completedMessage = broadcasts.find((message) => message.kind === 'craftsman_completed');
    expect(completedMessage?.body).toContain('事件类型: craftsman_completed');
    expect(completedMessage?.body).toContain('Claude finished the ACP cutover patch');
    const statusConversation = new TaskConversationRepository(db)
      .listByTask('OC-OBSERVE-ACP-DONE-1')
      .find((entry) => entry.metadata?.event_type === 'craftsman_completed' && entry.author_ref === 'agora-bot');
    expect(statusConversation?.metadata).toMatchObject({
      event_type: 'craftsman_completed',
      task_id: 'OC-OBSERVE-ACP-DONE-1',
      current_stage: 'discuss',
    });
  });
});
