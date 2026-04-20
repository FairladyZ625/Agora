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
  RuntimeThreadMessageRouter,
  StubIMProvisioningPort,
  TaskAuthorityService,
  TaskContextBindingService,
  TaskParticipationService,
  TaskService,
  type RuntimeThreadMessageInput,
} from '../packages/core/src/index.js';
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

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'agora-external-participant-dispatch-'));
  const db = createAgoraDatabase({ dbPath: join(root, 'agora.db') });
  runMigrations(db);

  try {
    const agentRef = 'cc-connect:agora-codex';
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
      team_override: {
        members: [
          {
            role: 'developer',
            agentId: agentRef,
            member_kind: 'citizen',
            model_preference: 'cc-connect',
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
        participant_refs: [agentRef],
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

    const entries = taskConversationRepository.listByTask('OC-EXTERNAL-DISPATCH-1');
    assert(entries.some((entry) => entry.body.includes('角色简报 cc-connect:agora-codex')), 'conversation mirror should include role brief');

    console.log(JSON.stringify({
      ok: true,
      task_id: 'OC-EXTERNAL-DISPATCH-1',
      thread_ref: routed[0].thread_ref,
      external_agent_ref: routed[0].agent_ref,
      im_bootstrap_messages: messages.map((message) => message.kind),
      external_dispatch_count: routed.length,
    }, null, 2));
  } finally {
    db.close();
    if (process.env.KEEP_SMOKE_DIR !== '1') {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

await main();
