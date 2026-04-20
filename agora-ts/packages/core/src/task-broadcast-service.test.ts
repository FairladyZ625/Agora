import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskContextBindingRepository, TaskConversationRepository, TaskRepository, createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { StubIMProvisioningPort } from './im-ports.js';
import { RuntimeThreadMessageRouter } from './runtime-message-ports.js';
import type { RuntimeThreadMessageInput } from './runtime-message-ports.js';
import { TaskBroadcastService } from './task-broadcast-service.js';

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-task-broadcast-'));
  const db = createAgoraDatabase({ dbPath: join(dir, 'task-broadcast.db') });
  runMigrations(db);
  return {
    dir,
    db,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('TaskBroadcastService', () => {
  it('publishes task status updates and mirrors them into task conversation', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });
      const routed: RuntimeThreadMessageInput[] = [];
      const runtimeThreadMessageRouter = new RuntimeThreadMessageRouter([{
        runtime_provider: 'cc-connect',
        sendInboundMessage: async (input) => {
          routed.push(input);
        },
      }]);

      const inserted = taskRepository.insertTask({
        id: 'OC-BROADCAST-1',
        title: 'Broadcast smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'build',
              mode: 'execute',
              execution_kind: 'craftsman_dispatch',
              allowed_actions: ['execute', 'dispatch_craftsman'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      taskRepository.updateTask(inserted.id, inserted.version, {
        state: 'active',
        current_stage: 'build',
        control: { mode: 'normal' },
      });

      taskContextBindingRepository.insert({
        id: 'binding-broadcast-1',
        task_id: 'OC-BROADCAST-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
        taskParticipationService: {
          listParticipants: () => [
            {
              id: 'participant-broadcast-1',
              task_id: 'OC-BROADCAST-1',
              binding_id: 'binding-broadcast-1',
              agent_ref: 'opus',
              runtime_provider: 'cc-connect',
              task_role: 'architect',
              source: 'template',
              join_status: 'joined',
              desired_exposure: 'in_thread',
              exposure_reason: null,
              exposure_stage_id: null,
              reconciled_at: null,
              created_at: '2026-04-19T12:00:00.000Z',
              joined_at: null,
              left_at: null,
            },
          ],
        },
        runtimeThreadMessageRouter,
      });

      service.publishTaskStatusBroadcast(taskRepository.getTask('OC-BROADCAST-1')!, {
        kind: 'controller_pinged',
        participantRefs: ['opus'],
        ensureParticipantRefsJoined: ['opus'],
        bodyLines: ['Task appears inactive for 120 seconds.'],
        occurredAt: '2026-04-02T01:02:00.000Z',
      });

      expect(imProvisioningPort.joined).toHaveLength(1);
      expect(imProvisioningPort.joined[0]).toMatchObject({
        binding_id: 'binding-broadcast-1',
        participant_ref: 'opus',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });
      expect(imProvisioningPort.published).toHaveLength(1);
      expect(imProvisioningPort.published[0]?.messages[0]).toMatchObject({
        kind: 'controller_pinged',
        participant_refs: ['opus'],
      });
      expect(imProvisioningPort.published[0]?.messages[0]?.body).toContain('Task appears inactive for 120 seconds.');

      const entries = taskConversationRepository.listByTask('OC-BROADCAST-1');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        task_id: 'OC-BROADCAST-1',
        provider: 'discord',
        author_ref: 'agora-bot',
        body_format: 'plain_text',
        occurred_at: '2026-04-02T01:02:00.000Z',
      });
      expect(entries[0]?.metadata).toMatchObject({
        event_type: 'controller_pinged',
        participant_refs: ['opus'],
        current_stage: 'build',
        controller_ref: 'opus',
      });
      expect(routed).toEqual([
        expect.objectContaining({
          task_id: 'OC-BROADCAST-1',
          provider: 'discord',
          thread_ref: 'discord-thread',
          conversation_ref: 'discord-parent',
          body: expect.stringContaining('Task appears inactive for 120 seconds.'),
          author_ref: 'agora-bot',
          display_name: 'agora-bot',
          participant_binding_id: 'participant-broadcast-1',
          agent_ref: 'opus',
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('publishes gate decision updates including controller-targeted follow-up', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      const inserted = taskRepository.insertTask({
        id: 'OC-GATE-1',
        title: 'Approval gate smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'review',
              mode: 'discuss',
              execution_kind: 'human_approval',
              allowed_actions: ['approve', 'reject'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });
      const task = taskRepository.updateTask(inserted.id, inserted.version, {
        state: 'active',
        current_stage: 'review',
        control: { mode: 'normal' },
      });

      taskContextBindingRepository.insert({
        id: 'binding-gate-1',
        task_id: task.id,
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.publishGateDecisionBroadcast(task, {
        decision: 'rejected',
        reviewer: 'reviewer-human',
        gateType: 'approval',
        reason: 'Need changes',
      });

      expect(imProvisioningPort.published).toHaveLength(2);
      expect(imProvisioningPort.published[0]?.messages[0]?.kind).toBe('gate_rejected');
      expect(imProvisioningPort.published[0]?.messages[0]?.body).toContain('Gate rejected: approval');
      expect(imProvisioningPort.published[1]?.messages[0]).toMatchObject({
        kind: 'controller_gate_rejected',
        participant_refs: ['opus'],
      });
      expect(imProvisioningPort.published[1]?.messages[0]?.body).toContain('Need changes');
    } finally {
      fixture.cleanup();
    }
  });

  it('archives and restores the latest IM context binding for task state transitions', async () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      taskRepository.insertTask({
        id: 'OC-STATE-1',
        title: 'State transition smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: {
          type: 'custom',
          stages: [
            {
              id: 'build',
              mode: 'execute',
              execution_kind: 'craftsman_dispatch',
              allowed_actions: ['execute', 'dispatch_craftsman'],
            },
          ],
        },
        team: {
          members: [
            { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          ],
        },
      });

      taskContextBindingRepository.insert({
        id: 'binding-state-1',
        task_id: 'OC-STATE-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.syncImContextForTaskState('OC-STATE-1', 'active', 'paused', 'hold for review');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(imProvisioningPort.archived).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            binding_id: 'binding-state-1',
            conversation_ref: 'discord-parent',
            thread_ref: 'discord-thread',
            mode: 'archive',
            reason: 'hold for review',
          }),
        ]),
      );
      expect(taskContextBindingRepository.getById('binding-state-1')?.status).toBe('archived');

      service.syncImContextForTaskState('OC-STATE-1', 'paused', 'active');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(imProvisioningPort.archived).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            binding_id: 'binding-state-1',
            mode: 'unarchive',
          }),
        ]),
      );
      expect(taskContextBindingRepository.getById('binding-state-1')?.status).toBe('active');
    } finally {
      fixture.cleanup();
    }
  });

  it('builds bootstrap root and role brief messages from workspace context and skill catalog', () => {
    const fixture = makeDb();
    const workspaceDir = mkdtempSync(join(tmpdir(), 'agora-ts-bootstrap-workspace-'));
    try {
      const { db } = fixture;
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);

      mkdirSync(join(workspaceDir, '05-agents', 'opus'), { recursive: true });
      writeFileSync(join(workspaceDir, '05-agents', 'opus', '00-role-brief.md'), '# opus brief\n', 'utf8');
      writeFileSync(join(workspaceDir, '05-agents', 'opus', '03-citizen-scaffold.md'), '# opus scaffold\n', 'utf8');

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
      });

      const messages = service.buildBootstrapMessages({
        task: {
          id: 'OC-BOOTSTRAP-UNIT-1',
          version: 1,
          title: 'Bootstrap Unit Task',
          description: 'bootstrap everyone into context',
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: null,
          state: 'active',
          archive_status: null,
          current_stage: 'build',
          skill_policy: {
            global_refs: ['planning-with-files'],
            role_refs: {
              architect: ['brainstorming'],
              developer: ['refactoring-ui'],
            },
            enforcement: 'required',
          },
          team: {
            members: [
              { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning', agent_origin: 'agora_managed', briefing_mode: 'overlay_delta' },
              { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'balanced', agent_origin: 'user_managed', briefing_mode: 'overlay_full' },
            ],
          },
          workflow: {
            type: 'custom',
            stages: [
              {
                id: 'build',
                mode: 'execute',
                execution_kind: 'craftsman_dispatch',
                allowed_actions: ['execute', 'dispatch_craftsman'],
              },
            ],
          },
          control: { mode: 'normal' },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
        workspacePath: workspaceDir,
        imParticipantRefs: ['opus', 'sonnet'],
        skillCatalog: new Map([
          ['planning-with-files', { skill_ref: 'planning-with-files', relative_path: 'planning-with-files', resolved_path: '/tmp/skills/planning-with-files/SKILL.md', source_root: '/tmp/skills', source_label: 'agora', precedence: 0, mtime: '2026-03-19T12:00:00.000Z', shadowed_paths: [] }],
          ['brainstorming', { skill_ref: 'brainstorming', relative_path: 'brainstorming', resolved_path: '/tmp/skills/brainstorming/SKILL.md', source_root: '/tmp/skills', source_label: 'agora', precedence: 0, mtime: '2026-03-19T12:00:00.000Z', shadowed_paths: [] }],
          ['refactoring-ui', { skill_ref: 'refactoring-ui', relative_path: 'refactoring-ui', resolved_path: '/tmp/skills/refactoring-ui/SKILL.md', source_root: '/tmp/skills', source_label: 'agora', precedence: 0, mtime: '2026-03-19T12:00:00.000Z', shadowed_paths: [] }],
        ]),
      });

      const rootBrief = messages.find((message) => message.kind === 'bootstrap_root');
      const opusBrief = messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'opus');
      const sonnetBrief = messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === 'sonnet');

      expect(rootBrief?.body).toContain('主控: opus');
      expect(rootBrief?.body).toContain('Task Skills:');
      expect(rootBrief?.body).toContain('planning-with-files -> /tmp/skills/planning-with-files/SKILL.md');
      expect(opusBrief?.body).toContain('简报模式: overlay_delta');
      expect(opusBrief?.body).toContain(join(workspaceDir, '05-agents', 'opus', '00-role-brief.md'));
      expect(opusBrief?.body).not.toContain('阅读角色文档:');
      expect(sonnetBrief?.body).toContain('简报模式: overlay_full');
      expect(sonnetBrief?.body).toContain('阅读角色文档:');
      expect(sonnetBrief?.body).toContain('refactoring-ui -> /tmp/skills/refactoring-ui/SKILL.md');
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it('dispatches targeted role briefs into external runtime thread ports without replaying shared bootstrap messages', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const routed: RuntimeThreadMessageInput[] = [];
      const runtimeThreadMessageRouter = new RuntimeThreadMessageRouter([{
        runtime_provider: 'cc-connect',
        sendInboundMessage: async (input) => {
          routed.push(input);
        },
      }]);

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        taskParticipationService: {
          listParticipants: () => [
            {
              id: 'participant-1',
              task_id: 'OC-DISPATCH-1',
              binding_id: 'binding-dispatch-1',
              agent_ref: 'cc-connect:agora-codex',
              runtime_provider: 'cc-connect',
              task_role: 'developer',
              source: 'template',
              join_status: 'joined',
              desired_exposure: 'in_thread',
              exposure_reason: null,
              exposure_stage_id: null,
              reconciled_at: null,
              created_at: '2026-04-19T12:00:00.000Z',
              joined_at: null,
              left_at: null,
            },
            {
              id: 'participant-2',
              task_id: 'OC-DISPATCH-1',
              binding_id: 'binding-dispatch-1',
              agent_ref: 'opus',
              runtime_provider: 'openclaw',
              task_role: 'architect',
              source: 'template',
              join_status: 'joined',
              desired_exposure: 'in_thread',
              exposure_reason: null,
              exposure_stage_id: null,
              reconciled_at: null,
              created_at: '2026-04-19T12:00:00.000Z',
              joined_at: null,
              left_at: null,
            },
          ],
        },
        runtimeThreadMessageRouter,
      });

      service.dispatchExternalBootstrapMessages(
        'OC-DISPATCH-1',
        {
          im_provider: 'discord',
          conversation_ref: 'discord-parent',
          thread_ref: 'discord-thread',
        },
        [
          {
            kind: 'bootstrap_root',
            participant_refs: ['cc-connect:agora-codex', 'opus'],
            body: 'shared bootstrap',
          },
          {
            kind: 'role_brief',
            participant_refs: ['cc-connect:agora-codex'],
            body: '角色简报 cc-connect:agora-codex',
          },
          {
            kind: 'role_brief',
            participant_refs: ['opus'],
            body: '角色简报 opus',
          },
        ],
      );

      expect(routed).toEqual([
        expect.objectContaining({
          task_id: 'OC-DISPATCH-1',
          provider: 'discord',
          thread_ref: 'discord-thread',
          conversation_ref: 'discord-parent',
          body: '角色简报 cc-connect:agora-codex',
          author_ref: 'agora-bot',
          display_name: 'agora-bot',
          participant_binding_id: 'participant-1',
          agent_ref: 'cc-connect:agora-codex',
        }),
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  it('publishes craftsman callback settlement updates', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      taskRepository.insertTask({
        id: 'OC-CALLBACK-1',
        title: 'Callback smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: { type: 'custom', stages: [{ id: 'develop', mode: 'execute', execution_kind: 'craftsman_dispatch', allowed_actions: ['execute', 'dispatch_craftsman'] }] },
        team: {
          members: [{ role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' }],
        },
      });

      taskContextBindingRepository.insert({
        id: 'binding-callback-1',
        task_id: 'OC-CALLBACK-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.publishCraftsmanExecutionUpdate({
        task: {
          id: 'OC-CALLBACK-1',
          version: 1,
          title: 'Callback smoke',
          description: '',
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: null,
          state: 'active',
          archive_status: null,
          current_stage: 'develop',
          skill_policy: null,
          team: {
            members: [{ role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' }],
          },
          workflow: { type: 'custom', stages: [{ id: 'develop', mode: 'execute', execution_kind: 'craftsman_dispatch', allowed_actions: ['execute', 'dispatch_craftsman'] }] },
          control: { mode: 'normal' },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
        subtask: {
          id: 'sub-callback-1',
          output: 'implemented and ready',
        },
        execution: {
          execution_id: 'exec-callback-1',
          adapter: 'codex',
          status: 'succeeded',
          callback_payload: {
            output: {
              summary: 'implemented and ready',
              artifacts: [],
              structured: null,
              text: null,
              stderr: null,
            },
          },
          finished_at: '2026-04-02T00:01:00.000Z',
        },
      });

      const message = imProvisioningPort.published[0]?.messages[0];
      expect(message?.kind).toBe('craftsman_completed');
      expect(message?.body).toContain('Execution: exec-callback-1');
      expect(message?.body).toContain('implemented and ready');
      expect(taskConversationRepository.listByTask('OC-CALLBACK-1')[0]?.metadata).toMatchObject({
        event_type: 'craftsman_completed',
        controller_ref: 'opus',
      });
    } finally {
      fixture.cleanup();
    }
  });

  it('mirrors craftsman input updates into conversation and thread broadcasts', () => {
    const fixture = makeDb();
    try {
      const { db } = fixture;
      const taskRepository = new TaskRepository(db);
      const taskContextBindingRepository = new TaskContextBindingRepository(db);
      const taskConversationRepository = new TaskConversationRepository(db);
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
      });

      taskRepository.insertTask({
        id: 'OC-INPUT-UNIT-1',
        title: 'Input smoke',
        description: '',
        type: 'coding',
        creator: 'archon',
        priority: 'normal',
        locale: 'zh-CN',
        workflow: { type: 'custom', stages: [{ id: 'develop', mode: 'execute', execution_kind: 'craftsman_dispatch', allowed_actions: ['execute', 'dispatch_craftsman'] }] },
        team: {
          members: [{ role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' }],
        },
      });

      taskContextBindingRepository.insert({
        id: 'binding-input-1',
        task_id: 'OC-INPUT-UNIT-1',
        im_provider: 'discord',
        conversation_ref: 'discord-parent',
        thread_ref: 'discord-thread',
        status: 'active',
      });

      const service = new TaskBroadcastService({
        taskContextBindingRepository,
        taskConversationRepository,
        imProvisioningPort,
      });

      service.publishCraftsmanInputUpdate({
        task: {
          id: 'OC-INPUT-UNIT-1',
          version: 1,
          title: 'Input smoke',
          description: '',
          type: 'coding',
          priority: 'normal',
          creator: 'archon',
          locale: 'zh-CN',
          project_id: null,
          state: 'active',
          archive_status: null,
          current_stage: 'develop',
          skill_policy: null,
          team: {
            members: [{ role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' }],
          },
          workflow: { type: 'custom', stages: [{ id: 'develop', mode: 'execute', execution_kind: 'craftsman_dispatch', allowed_actions: ['execute', 'dispatch_craftsman'] }] },
          control: { mode: 'normal' },
          scheduler: null,
          scheduler_snapshot: null,
          discord: null,
          metrics: null,
          error_detail: null,
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
        actor: 'archon',
        subtaskId: 'sub-input-1',
        executionId: 'exec-input-1',
        inputType: 'text',
        detail: 'Continue',
      });

      const conversationEntries = taskConversationRepository.listByTask('OC-INPUT-UNIT-1');
      expect(conversationEntries.find((entry) => entry.author_ref === 'archon')?.metadata).toMatchObject({
        event_type: 'craftsman_input_sent',
        execution_id: 'exec-input-1',
      });
      expect(conversationEntries.find((entry) => entry.author_ref === 'agora-bot')?.metadata).toMatchObject({
        event_type: 'craftsman_input_sent',
      });
      const message = imProvisioningPort.published[0]?.messages[0];
      expect(message?.kind).toBe('craftsman_input_sent');
      expect(message?.body).toContain('Input Type: text');
      expect(message?.body).toContain('Detail: Continue');
    } finally {
      fixture.cleanup();
    }
  });
});
