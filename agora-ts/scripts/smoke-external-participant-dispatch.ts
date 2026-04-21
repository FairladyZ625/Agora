#!/usr/bin/env tsx
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CraftsmanCallbackService,
  ProjectAgentRosterService,
  ProjectContextWriter,
  ProjectMembershipService,
  ProjectService,
  LiveSessionStore,
  RuntimeThreadMessageRouter,
  StubIMProvisioningPort,
  TaskAuthorityService,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  type RuntimeThreadMessageInput,
} from '../packages/core/src/index.js';
import { CcConnectBridgeReplyRelayService } from '../packages/adapters-cc-connect/src/bridge-reply-relay.js';
import {
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  FlowLogRepository,
  HumanAccountRepository,
  InboxRepository,
  NotificationOutboxRepository,
  ParticipantBindingRepository,
  ProgressLogRepository,
  ProjectAgentRosterRepository,
  ProjectMembershipRepository,
  ProjectRepository,
  ProjectWriteLockRepository,
  RuntimeSessionBindingRepository,
  SqliteGateCommandPort,
  SqliteGateQueryPort,
  SubtaskRepository,
  TaskAuthorityRepository,
  TaskBrainBindingRepository,
  TaskContextBindingRepository,
  TaskConversationReadCursorRepository,
  TaskConversationRepository,
  TaskRepository,
  TemplateRepository,
  TodoRepository,
  createAgoraDatabase,
  runMigrations,
} from '../packages/db/src/index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'agora-external-participant-dispatch-'));
  const db = createAgoraDatabase({ dbPath: join(root, 'agora.db') });
  runMigrations(db);

  try {
    const agentRef = 'cc-connect:agora-codex';
    const projectId = 'proj-external-dispatch';
    const imProvisioningPort = new StubIMProvisioningPort({
      im_provider: 'discord',
      conversation_ref: 'discord-parent-channel',
      thread_ref: 'discord-thread-external-dispatch-1',
    });
    const routed: RuntimeThreadMessageInput[] = [];
    const runtimeThreadMessageRouter = new RuntimeThreadMessageRouter([{
      runtime_provider: 'cc-connect',
      sendInboundMessage: async (input) => {
        routed.push(input);
      },
    }]);
    const agentRuntimePort = {
      resolveAgent(ref: string) {
        if (ref !== agentRef) {
          return null;
        }
        return {
          agent_ref: ref,
          runtime_provider: 'cc-connect',
          runtime_actor_ref: ref,
          agent_origin: 'user_managed' as const,
          briefing_mode: 'overlay_full' as const,
        };
      },
    };
    const taskRepository = new TaskRepository(db);
    const flowLogRepository = new FlowLogRepository(db);
    const progressLogRepository = new ProgressLogRepository(db);
    const subtaskRepository = new SubtaskRepository(db);
    const taskContextBindingRepository = new TaskContextBindingRepository(db);
    const taskConversationRepository = new TaskConversationRepository(db);
    const todoRepository = new TodoRepository(db);
    const archiveJobRepository = new ArchiveJobRepository(db);
    const approvalRequestRepository = new ApprovalRequestRepository(db);
    const inboxRepository = new InboxRepository(db);
    const craftsmanExecutionRepository = new CraftsmanExecutionRepository(db);
    const templateRepository = new TemplateRepository(db);
    const projectMembershipService = new ProjectMembershipService({
      membershipRepository: new ProjectMembershipRepository(db),
      accountRepository: new HumanAccountRepository(db),
    });
    const projectAgentRosterService = new ProjectAgentRosterService({
      repository: new ProjectAgentRosterRepository(db),
    });
    const projectService = new ProjectService({
      projectRepository: new ProjectRepository(db),
      taskRepository,
      membershipService: projectMembershipService,
      agentRosterService: projectAgentRosterService,
      transactionManager: {
        begin: () => db.exec('BEGIN'),
        commit: () => db.exec('COMMIT'),
        rollback: () => db.exec('ROLLBACK'),
      },
    });
    projectService.createProject({
      id: projectId,
      name: 'External Dispatch Runtime Targets',
      metadata: {
        runtime_targets: {
          default_coding: agentRef,
          flavors: {
            codex: agentRef,
          },
        },
      },
    });
    const taskContextBindingService = new TaskContextBindingService({
      repository: taskContextBindingRepository,
    });
    const taskParticipationService = new TaskParticipationService({
      participantRepository: new ParticipantBindingRepository(db),
      runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
      taskBindingRepository: taskContextBindingRepository,
      agentRuntimePort,
    });
    const taskService = new TaskService({
      templatesDir: resolve(process.cwd(), 'templates'),
      taskIdGenerator: () => 'OC-EXTERNAL-DISPATCH-1',
      projectService,
      imProvisioningPort,
      taskContextBindingService,
      taskParticipationService,
      agentRuntimePort,
      runtimeThreadMessageRouter,
      databasePort: db,
      gateCommandPort: new SqliteGateCommandPort(db),
      gateQueryPort: new SqliteGateQueryPort(db),
      repositories: {
        task: taskRepository,
        flowLog: flowLogRepository,
        progressLog: progressLogRepository,
        subtask: subtaskRepository,
        taskContextBinding: taskContextBindingRepository,
        taskConversation: taskConversationRepository,
        todo: todoRepository,
        archiveJob: archiveJobRepository,
        approvalRequest: approvalRequestRepository,
        inbox: inboxRepository,
        craftsmanExecution: craftsmanExecutionRepository,
        template: templateRepository,
      },
      subServices: {
        taskAuthority: new TaskAuthorityService({
          repository: new TaskAuthorityRepository(db),
        }),
        projectMembership: projectMembershipService,
        projectAgentRoster: projectAgentRosterService,
        craftsmanCallback: new CraftsmanCallbackService({
          executionRepository: craftsmanExecutionRepository,
          subtaskRepository,
          taskRepository,
          flowLogRepository,
          progressLogRepository,
          outboxRepository: new NotificationOutboxRepository(db),
          bindingRepository: taskContextBindingRepository,
          conversationRepository: taskConversationRepository,
        }),
        projectContextWriter: new ProjectContextWriter({
          writeLockRepository: new ProjectWriteLockRepository(db),
          projectService,
        }),
      },
    });

    taskService.createTask({
      title: 'External participant dispatch smoke',
      type: 'custom',
      creator: 'archon',
      description: 'prove Agora dispatches the standard role brief to external runtime participants',
      priority: 'normal',
      project_id: projectId,
      team_override: {
        members: [
          {
            role: 'developer',
            agentId: 'developer',
            member_kind: 'citizen',
            model_preference: 'codex',
          },
        ],
      },
      workflow_override: {
        type: 'custom',
        stages: [
          {
            id: 'dispatch',
            mode: 'execute',
            execution_kind: 'citizen_execute',
            allowed_actions: ['execute'],
            roster: { include_roles: ['developer'] },
            gate: { type: 'command' },
          },
        ],
      },
      im_target: {
        provider: 'discord',
        visibility: 'private',
      },
    });

    await taskService.drainBackgroundOperations();

    assert(imProvisioningPort.provisioned.length === 1, 'expected one IM context provision');
    assert(imProvisioningPort.joined.some((join) => join.participant_ref === agentRef), 'expected external participant join');
    assert(imProvisioningPort.published.length === 1, 'expected one bootstrap publish batch');

    const messages = imProvisioningPort.published[0]?.messages ?? [];
    const roleBrief = messages.find((message) => message.kind === 'role_brief' && message.participant_refs?.[0] === agentRef);
    assert(roleBrief, 'expected per-agent role brief in IM bootstrap batch');
    assert(roleBrief.body.includes('prove Agora dispatches the standard role brief'), 'role brief should include task goal');
    assert(roleBrief.body.includes('角色简报 cc-connect:agora-codex'), 'role brief should identify the external participant');

    const participants = taskParticipationService.listParticipants('OC-EXTERNAL-DISPATCH-1');
    assert(routed.length === 1, `expected exactly one external runtime dispatch, got ${routed.length}; participants=${JSON.stringify(participants)} role_refs=${JSON.stringify(roleBrief.participant_refs)}`);
    assert(routed[0]?.agent_ref === agentRef, 'external runtime dispatch should target the cc-connect participant');
    assert(routed[0]?.thread_ref === 'discord-thread-external-dispatch-1', 'external runtime dispatch should preserve the task thread');
    assert(routed[0]?.body === roleBrief.body, 'external runtime dispatch should reuse the canonical role brief body');

    const participant = participants.find((item) => item.agent_ref === agentRef);
    assert(participant, 'expected seeded cc-connect participant');
    const status = taskService.getTaskStatus('OC-EXTERNAL-DISPATCH-1');
    const member = status?.task.team?.members.find((item) => item.role === 'developer');
    assert(member, 'expected developer team member in task status');
    assert(member.agentId === agentRef, 'expected project runtime policy to resolve developer placeholder to external target');
    assert(member.runtime_target_ref === agentRef, 'expected runtime target ref in task status');
    assert(member.runtime_flavor === 'codex', 'expected runtime flavor in task status');
    assert(member.runtime_selection_source === 'project_flavor_default', 'expected runtime selection source in task status');
    assert(
      member.runtime_selection_reason === 'project runtime_targets.flavors.codex',
      'expected runtime selection reason in task status',
    );
    const sessionKey = `agora-discord:discord-thread-external-dispatch-1:${participant.id}`;
    taskParticipationService.bindRuntimeSession({
      participant_binding_id: participant.id,
      runtime_provider: 'cc-connect',
      runtime_session_ref: sessionKey,
      runtime_actor_ref: agentRef,
      presence_state: 'active',
      binding_reason: 'smoke_reply_relay',
      last_seen_at: '2026-04-20T00:00:00.000Z',
    });
    const liveSessionStore = new LiveSessionStore({
      now: () => new Date('2026-04-20T00:00:05.000Z'),
    });
    liveSessionStore.upsert({
      source: 'cc-connect',
      agent_id: agentRef,
      session_key: sessionKey,
      channel: 'discord',
      conversation_id: 'discord-parent-channel',
      thread_id: 'discord-thread-external-dispatch-1',
      status: 'active',
      last_event: 'thread_bridge_dispatch',
      last_event_at: '2026-04-20T00:00:00.000Z',
      metadata: {
        project: 'agora-codex',
        runtime_flavor: 'codex',
        runtime_target_ref: agentRef,
      },
    });
    const taskConversationService = new TaskConversationService({
      bindingRepository: taskContextBindingRepository,
      conversationRepository: taskConversationRepository,
      readCursorRepository: new TaskConversationReadCursorRepository(db),
      idGenerator: () => 'entry-relay-smoke-1',
      now: () => new Date('2026-04-20T00:00:05.000Z'),
    });
    const relay = new CcConnectBridgeReplyRelayService({
      bridgeClient: { onEvent: () => () => undefined },
      imProvisioningPort,
      liveSessionStore,
      taskConversationService,
      taskContextBindingService,
      taskParticipationService,
      now: () => new Date('2026-04-20T00:00:05.000Z'),
    });
    await relay.handleEvent({
      type: 'reply',
      session_key: sessionKey,
      reply_ctx: routed[0].entry_id,
      content: 'Relay smoke reply from cc-connect.',
      format: 'text',
    });

    const relayPublish = imProvisioningPort.published.find((batch) => (
      batch.messages.some((message) => message.kind === 'cc_connect_reply')
    ));
    assert(relayPublish, 'expected cc-connect reply relay publish batch');
    assert(relayPublish.messages[0]?.body === 'Relay smoke reply from cc-connect.', 'expected relay publish body');
    const relayHealth = asRecord(liveSessionStore.get(sessionKey)?.metadata).relay_health;
    assert(asRecord(relayHealth).discord_publish_status === 'succeeded', 'expected relay health publish success');

    const entries = taskConversationRepository.listByTask('OC-EXTERNAL-DISPATCH-1');
    assert(entries.some((entry) => entry.body.includes('角色简报 cc-connect:agora-codex')), 'conversation mirror should include role brief');
    assert(entries.some((entry) => entry.body.includes('Relay smoke reply from cc-connect.')), 'conversation mirror should include relayed cc-connect reply');

    console.log(JSON.stringify({
      ok: true,
      task_id: 'OC-EXTERNAL-DISPATCH-1',
      thread_ref: routed[0].thread_ref,
      external_agent_ref: routed[0].agent_ref,
      runtime_target_ref: member.runtime_target_ref,
      runtime_flavor: member.runtime_flavor,
      runtime_selection_source: member.runtime_selection_source,
      runtime_selection_reason: member.runtime_selection_reason,
      im_bootstrap_messages: messages.map((message) => message.kind),
      external_dispatch_count: routed.length,
      relay_health: relayHealth,
    }, null, 2));
  } finally {
    db.close();
    if (process.env.KEEP_SMOKE_DIR !== '1') {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

await main();
