import { fileURLToPath } from 'node:url';
import type { TransactionManager } from '@agora-ts/contracts';
import {
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CitizenRepository,
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
  RoleBindingRepository,
  RoleDefinitionRepository,
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
  type AgoraDatabase,
} from '@agora-ts/db';
import {
  CitizenService,
  ContextMaterializationService,
  CraftsmanCallbackService,
  CraftsmanDispatcher,
  DashboardQueryService,
  InboxService,
  ProjectAgentRosterService,
  ProjectContextWriter,
  ProjectMembershipService,
  ProjectService,
  RolePackService,
  TaskAuthorityService,
  TaskBrainBindingService,
  TaskContextBindingService,
  TaskParticipationService,
  TaskService,
  WorkspaceBootstrapService,
  type CitizenServiceOptions,
  type CraftsmanCallbackServiceOptions,
  type CraftsmanDispatcherOptions,
  type DashboardQueryServiceOptions,
  type InboxServiceOptions,
  type ProjectServiceOptions,
  type TaskServiceOptions,
  type WorkspaceBootstrapServiceOptions,
} from '@agora-ts/core';
import { ProjectContextBriefingMaterializer } from '@agora-ts/adapters-materialization';

const DEFAULT_TEMPLATES_DIR = fileURLToPath(new URL('../../../templates', import.meta.url));

function createTransactionManager(db: AgoraDatabase): TransactionManager {
  return {
    begin: () => db.exec('BEGIN'),
    commit: () => db.exec('COMMIT'),
    rollback: () => db.exec('ROLLBACK'),
  };
}

export function createProjectServiceFromDb(
  db: AgoraDatabase,
  options: Partial<ProjectServiceOptions> = {},
): ProjectService {
  return new ProjectService({
    projectRepository: options.projectRepository ?? new ProjectRepository(db),
    taskRepository: options.taskRepository ?? new TaskRepository(db),
    membershipService: options.membershipService ?? new ProjectMembershipService({
      membershipRepository: new ProjectMembershipRepository(db),
      accountRepository: new HumanAccountRepository(db),
    }),
    agentRosterService: options.agentRosterService ?? new ProjectAgentRosterService({
      repository: new ProjectAgentRosterRepository(db),
    }),
    transactionManager: options.transactionManager ?? createTransactionManager(db),
    ...(options.knowledgePort ? { knowledgePort: options.knowledgePort } : {}),
    ...(options.projectBrainIndexQueueService ? { projectBrainIndexQueueService: options.projectBrainIndexQueueService } : {}),
  });
}

export function createRolePackServiceFromDb(
  db: AgoraDatabase,
  options: { rolePacksDir?: string | null } = {},
): RolePackService {
  return new RolePackService({
    roleDefinitions: new RoleDefinitionRepository(db),
    roleBindings: new RoleBindingRepository(db),
    ...(options.rolePacksDir !== undefined ? { rolePacksDir: options.rolePacksDir } : {}),
  });
}

export function createTaskBrainBindingServiceFromDb(
  db: AgoraDatabase,
  options: Partial<ConstructorParameters<typeof TaskBrainBindingService>[0]> = {},
): TaskBrainBindingService {
  return new TaskBrainBindingService({
    repository: options.repository ?? new TaskBrainBindingRepository(db),
    ...(options.idGenerator ? { idGenerator: options.idGenerator } : {}),
  });
}

export function createTaskContextBindingServiceFromDb(
  db: AgoraDatabase,
  options: Partial<ConstructorParameters<typeof TaskContextBindingService>[0]> = {},
): TaskContextBindingService {
  return new TaskContextBindingService({
    repository: options.repository ?? new TaskContextBindingRepository(db),
    ...(options.idGenerator ? { idGenerator: options.idGenerator } : {}),
  });
}

export function createTaskParticipationServiceFromDb(
  db: AgoraDatabase,
  options: Partial<Omit<ConstructorParameters<typeof TaskParticipationService>[0], 'participantRepository' | 'runtimeSessionRepository' | 'taskBindingRepository'>> & {
    participantRepository?: ConstructorParameters<typeof TaskParticipationService>[0]['participantRepository'];
    runtimeSessionRepository?: ConstructorParameters<typeof TaskParticipationService>[0]['runtimeSessionRepository'];
    taskBindingRepository?: ConstructorParameters<typeof TaskParticipationService>[0]['taskBindingRepository'];
  } = {},
): TaskParticipationService {
  return new TaskParticipationService({
    participantRepository: options.participantRepository ?? new ParticipantBindingRepository(db),
    runtimeSessionRepository: options.runtimeSessionRepository ?? new RuntimeSessionBindingRepository(db),
    taskBindingRepository: options.taskBindingRepository ?? new TaskContextBindingRepository(db),
    ...(options.participantIdGenerator ? { participantIdGenerator: options.participantIdGenerator } : {}),
    ...(options.runtimeSessionIdGenerator ? { runtimeSessionIdGenerator: options.runtimeSessionIdGenerator } : {}),
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  });
}

export function createCitizenServiceFromDb(
  db: AgoraDatabase,
  options: Omit<CitizenServiceOptions, 'repository'>,
): CitizenService {
  return new CitizenService({
    repository: new CitizenRepository(db),
    ...options,
  });
}

export function createCraftsmanDispatcherFromDb(
  db: AgoraDatabase,
  options: Omit<CraftsmanDispatcherOptions, 'executionRepository' | 'subtaskRepository'>,
): CraftsmanDispatcher {
  return new CraftsmanDispatcher({
    executionRepository: new CraftsmanExecutionRepository(db),
    subtaskRepository: new SubtaskRepository(db),
    ...options,
  });
}

export function createCraftsmanCallbackServiceFromDb(
  db: AgoraDatabase,
  options: Partial<CraftsmanCallbackServiceOptions> = {},
): CraftsmanCallbackService {
  return new CraftsmanCallbackService({
    executionRepository: options.executionRepository ?? new CraftsmanExecutionRepository(db),
    subtaskRepository: options.subtaskRepository ?? new SubtaskRepository(db),
    taskRepository: options.taskRepository ?? new TaskRepository(db),
    flowLogRepository: options.flowLogRepository ?? new FlowLogRepository(db),
    progressLogRepository: options.progressLogRepository ?? new ProgressLogRepository(db),
    outboxRepository: options.outboxRepository ?? new NotificationOutboxRepository(db),
    bindingRepository: options.bindingRepository ?? new TaskContextBindingRepository(db),
    conversationRepository: options.conversationRepository ?? new TaskConversationRepository(db),
  });
}

export function createTaskServiceFromDb(
  db: AgoraDatabase,
  options: Partial<Omit<TaskServiceOptions, 'databasePort' | 'gateCommandPort' | 'gateQueryPort' | 'repositories' | 'subServices'>> = {},
): TaskService {
  const taskContextBindingRepository = new TaskContextBindingRepository(db);
  const taskConversationRepository = new TaskConversationRepository(db);
  const projectService = options.projectService ?? createProjectServiceFromDb(db);
  const taskBrainBindingService = options.taskBrainBindingService ?? createTaskBrainBindingServiceFromDb(db);
  const taskContextBindingService = options.taskContextBindingService ?? createTaskContextBindingServiceFromDb(db, {
    repository: taskContextBindingRepository,
  });
  const taskParticipationService = options.taskParticipationService ?? createTaskParticipationServiceFromDb(db, {
    taskBindingRepository: taskContextBindingRepository,
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  });
  const contextMaterializationService = options.contextMaterializationService
    ?? (options.projectBrainAutomationService
      ? new ContextMaterializationService({
        ports: [
          new ProjectContextBriefingMaterializer({
            projectBrainAutomationService: options.projectBrainAutomationService,
          }),
        ],
      })
      : undefined);

  return new TaskService({
    templatesDir: options.templatesDir ?? DEFAULT_TEMPLATES_DIR,
    ...(options.taskIdGenerator ? { taskIdGenerator: options.taskIdGenerator } : {}),
    ...(options.archonUsers ? { archonUsers: options.archonUsers } : {}),
    ...(options.allowAgents ? { allowAgents: options.allowAgents } : {}),
    projectService,
    ...(options.craftsmanDispatcher ? { craftsmanDispatcher: options.craftsmanDispatcher } : {}),
    ...(options.isCraftsmanSessionAlive ? { isCraftsmanSessionAlive: options.isCraftsmanSessionAlive } : {}),
    ...(options.imProvisioningPort ? { imProvisioningPort: options.imProvisioningPort } : {}),
    ...(options.imMessagingPort ? { imMessagingPort: options.imMessagingPort } : {}),
    ...(options.taskBrainWorkspacePort ? { taskBrainWorkspacePort: options.taskBrainWorkspacePort } : {}),
    taskBrainBindingService,
    taskContextBindingService,
    taskParticipationService,
    ...(contextMaterializationService ? { contextMaterializationService } : {}),
    ...(options.projectBrainAutomationService ? { projectBrainAutomationService: options.projectBrainAutomationService } : {}),
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
    ...(options.runtimeRecoveryPort ? { runtimeRecoveryPort: options.runtimeRecoveryPort } : {}),
    ...(options.craftsmanInputPort ? { craftsmanInputPort: options.craftsmanInputPort } : {}),
    ...(options.craftsmanExecutionProbePort ? { craftsmanExecutionProbePort: options.craftsmanExecutionProbePort } : {}),
    ...(options.craftsmanExecutionTailPort ? { craftsmanExecutionTailPort: options.craftsmanExecutionTailPort } : {}),
    ...(options.hostResourcePort ? { hostResourcePort: options.hostResourcePort } : {}),
    ...(options.liveSessionStore ? { liveSessionStore: options.liveSessionStore } : {}),
    ...(options.skillCatalogPort ? { skillCatalogPort: options.skillCatalogPort } : {}),
    ...(options.projectNomosAuthoringPort ? { projectNomosAuthoringPort: options.projectNomosAuthoringPort } : {}),
    ...(options.craftsmanGovernance ? { craftsmanGovernance: options.craftsmanGovernance } : {}),
    ...(options.escalationPolicy ? { escalationPolicy: options.escalationPolicy } : {}),
    ...(options.resolveHumanReminderParticipantRefs ? { resolveHumanReminderParticipantRefs: options.resolveHumanReminderParticipantRefs } : {}),
    databasePort: db,
    gateCommandPort: new SqliteGateCommandPort(db),
    gateQueryPort: new SqliteGateQueryPort(db),
    repositories: {
      task: new TaskRepository(db),
      flowLog: new FlowLogRepository(db),
      progressLog: new ProgressLogRepository(db),
      subtask: new SubtaskRepository(db),
      taskContextBinding: taskContextBindingRepository,
      taskConversation: taskConversationRepository,
      todo: new TodoRepository(db),
      archiveJob: new ArchiveJobRepository(db),
      approvalRequest: new ApprovalRequestRepository(db),
      inbox: new InboxRepository(db),
      craftsmanExecution: new CraftsmanExecutionRepository(db),
      template: new TemplateRepository(db),
    },
    subServices: {
      taskAuthority: new TaskAuthorityService({
        repository: new TaskAuthorityRepository(db),
      }),
      projectMembership: new ProjectMembershipService({
        membershipRepository: new ProjectMembershipRepository(db),
        accountRepository: new HumanAccountRepository(db),
      }),
      projectAgentRoster: new ProjectAgentRosterService({
        repository: new ProjectAgentRosterRepository(db),
      }),
      craftsmanCallback: createCraftsmanCallbackServiceFromDb(db, {
        bindingRepository: taskContextBindingRepository,
        conversationRepository: taskConversationRepository,
      }),
      projectContextWriter: new ProjectContextWriter({
        writeLockRepository: new ProjectWriteLockRepository(db),
        projectService,
        ...(options.taskBrainWorkspacePort ? { taskBrainWorkspacePort: options.taskBrainWorkspacePort } : {}),
      }),
    },
  });
}

export function createDashboardQueryServiceFromDb(
  db: AgoraDatabase,
  options: Partial<Omit<DashboardQueryServiceOptions, 'taskRepository' | 'subtaskRepository' | 'archiveJobRepository' | 'todoRepository' | 'executionRepository' | 'progressLogRepository' | 'templateRepository'>> & { templatesDir?: string } = {},
): DashboardQueryService {
  return new DashboardQueryService({
    templatesDir: options.templatesDir ?? DEFAULT_TEMPLATES_DIR,
    taskRepository: new TaskRepository(db),
    subtaskRepository: new SubtaskRepository(db),
    archiveJobRepository: new ArchiveJobRepository(db),
    todoRepository: new TodoRepository(db),
    executionRepository: new CraftsmanExecutionRepository(db),
    progressLogRepository: new ProgressLogRepository(db),
    templateRepository: new TemplateRepository(db),
    ...(options.archiveJobNotifier ? { archiveJobNotifier: options.archiveJobNotifier } : {}),
    ...(options.archiveJobReceiptIngestor ? { archiveJobReceiptIngestor: options.archiveJobReceiptIngestor } : {}),
    ...(options.imProvisioningPort ? { imProvisioningPort: options.imProvisioningPort } : {}),
    ...(options.taskBrainBindingService ? { taskBrainBindingService: options.taskBrainBindingService } : {}),
    ...(options.taskBrainWorkspacePort ? { taskBrainWorkspacePort: options.taskBrainWorkspacePort } : {}),
    ...(options.taskContextBindingService ? { taskContextBindingService: options.taskContextBindingService } : {}),
    ...(options.liveSessions ? { liveSessions: options.liveSessions } : {}),
    ...(options.agentRegistry ? { agentRegistry: options.agentRegistry } : {}),
    ...(options.presenceSource ? { presenceSource: options.presenceSource } : {}),
    ...(options.legacyRuntimeService ? { legacyRuntimeService: options.legacyRuntimeService } : {}),
    ...(options.tmuxRuntimeService ? { tmuxRuntimeService: options.tmuxRuntimeService } : {}),
    ...(options.skillCatalogPort ? { skillCatalogPort: options.skillCatalogPort } : {}),
    ...(options.agentsStatusCacheTtlMs !== undefined ? { agentsStatusCacheTtlMs: options.agentsStatusCacheTtlMs } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}

export function createInboxServiceFromDb(
  db: AgoraDatabase,
  taskService: TaskService,
  options: Partial<InboxServiceOptions> = {},
): InboxService {
  return new InboxService(taskService, {
    inboxRepository: options.inboxRepository ?? new InboxRepository(db),
    todoRepository: options.todoRepository ?? new TodoRepository(db),
  });
}

export function createWorkspaceBootstrapServiceFromDb(
  db: AgoraDatabase,
  options: Omit<WorkspaceBootstrapServiceOptions, 'taskRepository'>,
): WorkspaceBootstrapService {
  return new WorkspaceBootstrapService({
    taskRepository: new TaskRepository(db),
    ...options,
  });
}
