import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ApprovalRequestRepository,
  ArchiveJobRepository,
  CraftsmanExecutionRepository,
  CitizenRepository,
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
  TaskConversationReadCursorRepository,
  TaskConversationRepository,
  TaskRepository,
  TemplateRepository,
  TodoRepository,
  createAgoraDatabase,
  runMigrations,
  type AgoraDatabase,
} from '@agora-ts/db';
import {
  CitizenService,
  ContextMaterializationService,
  CraftsmanCallbackService,
  CraftsmanDispatcher,
  DashboardQueryService,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  InboxService,
  ProjectAgentRosterService,
  ProjectBrainAutomationService,
  ProjectBrainService,
  ProjectContextWriter,
  ProjectMembershipService,
  ProjectService,
  RolePackService,
  ShellCraftsmanAdapter,
  StubCraftsmanAdapter,
  TaskAuthorityService,
  TaskBrainBindingService,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  TemplateAuthoringService,
  type AgentRuntimePort,
  type CraftsmanAdapter,
  type InteractiveRuntimePort,
  type WorkdirIsolator,
} from '@agora-ts/core';
import { FilesystemProjectBrainQueryAdapter, FilesystemProjectKnowledgeAdapter, FilesystemTaskBrainWorkspaceAdapter } from '@agora-ts/adapters-brain';
import { ProjectContextBriefingMaterializer } from '@agora-ts/adapters-materialization';
import { ClaudeCraftsmanAdapter, CodexCraftsmanAdapter, GeminiCraftsmanAdapter } from '@agora-ts/adapters-craftsman';
import { OpenClawCitizenProjectionAdapter } from '@agora-ts/adapters-openclaw';
import { TmuxRuntimeService, type GeminiSessionIdentity } from '@agora-ts/adapters-runtime';

export interface CreateTestRuntimeOptions {
  taskIdGenerator?: () => string;
  templatesDir?: string;
  executionIdGenerator?: () => string;
  craftsmanAdapters?: Record<string, CraftsmanAdapter>;
  isCraftsmanSessionAlive?: (sessionId: string) => boolean;
  maxConcurrentRunning?: number;
  workdirIsolator?: WorkdirIsolator;
  agentRuntimePort?: AgentRuntimePort;
  tmuxExec?: (args: string[]) => string;
  geminiSessionDiscovery?: { resolveIdentity(input: { workspaceRoot: string }): GeminiSessionIdentity | null };
}

export interface TestRuntime {
  dir: string;
  db: AgoraDatabase;
  templatesDir: string;
  archiveOutboxDir: string;
  archiveReceiptDir: string;
  brainPackDir: string;
  projectStateDir: string;
  taskService: TaskService;
  projectService: ProjectService;
  rolePackService: RolePackService;
  citizenService: CitizenService;
  projectBrainService: ProjectBrainService;
  projectBrainAutomationService: ProjectBrainAutomationService;
  dashboardQueryService: DashboardQueryService;
  inboxService: InboxService;
  templateAuthoringService: TemplateAuthoringService;
  craftsmanDispatcher: CraftsmanDispatcher;
  taskContextBindingService: TaskContextBindingService;
  taskConversationService: TaskConversationService;
  taskParticipationService: TaskParticipationService;
  tmuxRuntimeService: InteractiveRuntimePort;
  cleanup: () => void;
}

export function createTestRuntime(options: CreateTestRuntimeOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-runtime-'));
  const dbPath = join(dir, 'agora-test.db');
  const db = createAgoraDatabase({ dbPath });
  runMigrations(db);
  const sourceTemplatesDir = options.templatesDir ?? resolve(process.cwd(), 'templates');
  const rolePacksDir = resolve(process.cwd(), 'role-packs/agora-default');
  const templatesDir = join(dir, 'templates');
  const archiveOutboxDir = join(dir, 'archive-outbox');
  const archiveReceiptDir = join(dir, 'archive-receipts');
  const sourceBrainPackDir = resolve(process.cwd(), '../agora-ai-brain');
  const brainPackDir = join(dir, 'agora-ai-brain');
  const projectStateDir = join(dir, 'projects');
  const tmuxRegistryDir = join(dir, 'tmux-registry');
  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(archiveOutboxDir, { recursive: true });
  mkdirSync(archiveReceiptDir, { recursive: true });
  mkdirSync(brainPackDir, { recursive: true });
  mkdirSync(projectStateDir, { recursive: true });
  mkdirSync(tmuxRegistryDir, { recursive: true });
  cpSync(sourceTemplatesDir, templatesDir, { recursive: true });
  cpSync(sourceBrainPackDir, brainPackDir, { recursive: true });
  const rolePackService = new RolePackService({
    roleDefinitions: new RoleDefinitionRepository(db),
    roleBindings: new RoleBindingRepository(db),
    rolePacksDir,
  });
  const projectMembershipService = new ProjectMembershipService({
    membershipRepository: new ProjectMembershipRepository(db),
    accountRepository: new HumanAccountRepository(db),
  });
  const projectAgentRosterService = new ProjectAgentRosterService({
    repository: new ProjectAgentRosterRepository(db),
  });
  const projectService = new ProjectService({
    projectRepository: new ProjectRepository(db),
    taskRepository: new TaskRepository(db),
    membershipService: projectMembershipService,
    agentRosterService: projectAgentRosterService,
    transactionManager: {
      begin: () => db.exec('BEGIN'),
      commit: () => db.exec('COMMIT'),
      rollback: () => db.exec('ROLLBACK'),
    },
    knowledgePort: new FilesystemProjectKnowledgeAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
  });
  const citizenService = new CitizenService({
    repository: new CitizenRepository(db),
    projectService,
    rolePackService,
    projectionPorts: [new OpenClawCitizenProjectionAdapter()],
  });
  const projectBrainService = new ProjectBrainService({
    projectService,
    citizenService,
    projectBrainQueryPort: new FilesystemProjectBrainQueryAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
  });
  const projectBrainAutomationService = new ProjectBrainAutomationService({
    projectBrainService,
  });
  const contextMaterializationService = new ContextMaterializationService({
    ports: [
      new ProjectContextBriefingMaterializer({
        projectBrainAutomationService,
      }),
    ],
  });
  const taskServiceOptions: { templatesDir: string; taskIdGenerator?: () => string } = {
    templatesDir,
  };
  if (options.taskIdGenerator !== undefined) {
    taskServiceOptions.taskIdGenerator = options.taskIdGenerator;
  }
  const dispatcherOptions: {
    adapters: Record<string, CraftsmanAdapter>;
    executionIdGenerator?: () => string;
    maxConcurrentRunning?: number;
    workdirIsolator?: WorkdirIsolator;
  } = {
    adapters: options.craftsmanAdapters ?? {
      shell: new ShellCraftsmanAdapter(),
      codex: new StubCraftsmanAdapter('codex'),
      claude: new StubCraftsmanAdapter('claude'),
      gemini: new StubCraftsmanAdapter('gemini'),
    },
  };
  if (options.executionIdGenerator !== undefined) {
    dispatcherOptions.executionIdGenerator = options.executionIdGenerator;
  }
  if (options.maxConcurrentRunning !== undefined) {
    dispatcherOptions.maxConcurrentRunning = options.maxConcurrentRunning;
  }
  if (options.workdirIsolator !== undefined) {
    dispatcherOptions.workdirIsolator = options.workdirIsolator;
  }
  const craftsmanDispatcher = new CraftsmanDispatcher({
    executionRepository: new CraftsmanExecutionRepository(db),
    subtaskRepository: new SubtaskRepository(db),
    ...dispatcherOptions,
  });
  const taskContextBindingRepository = new TaskContextBindingRepository(db);
  const taskConversationRepository = new TaskConversationRepository(db);
  const taskContextBindingService = new TaskContextBindingService({ repository: taskContextBindingRepository });
  const taskBrainBindingService = new TaskBrainBindingService({ repository: new TaskBrainBindingRepository(db) });
  const taskConversationService = new TaskConversationService({
    bindingRepository: taskContextBindingRepository,
    conversationRepository: taskConversationRepository,
    readCursorRepository: new TaskConversationReadCursorRepository(db),
  });
  const taskParticipationService = new TaskParticipationService({
    participantRepository: new ParticipantBindingRepository(db),
    runtimeSessionRepository: new RuntimeSessionBindingRepository(db),
    taskBindingRepository: taskContextBindingRepository,
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  });
  const taskAuthorityService = new TaskAuthorityService({
    repository: new TaskAuthorityRepository(db),
  });
  const projectContextWriter = new ProjectContextWriter({
    writeLockRepository: new ProjectWriteLockRepository(db),
    projectService,
    taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
  });
  const craftsmanCallbackService = new CraftsmanCallbackService({
    executionRepository: new CraftsmanExecutionRepository(db),
    subtaskRepository: new SubtaskRepository(db),
    taskRepository: new TaskRepository(db),
    flowLogRepository: new FlowLogRepository(db),
    progressLogRepository: new ProgressLogRepository(db),
    outboxRepository: new NotificationOutboxRepository(db),
    bindingRepository: taskContextBindingRepository,
    conversationRepository: taskConversationRepository,
  });
  const taskServiceOptionsWithRecovery: ConstructorParameters<typeof TaskService>[0] = {
    ...taskServiceOptions,
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
      taskAuthority: taskAuthorityService,
      projectMembership: projectMembershipService,
      projectAgentRoster: projectAgentRosterService,
      craftsmanCallback: craftsmanCallbackService,
      projectContextWriter,
    },
    craftsmanDispatcher,
    taskBrainBindingService,
    taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
    taskContextBindingService,
    taskParticipationService,
    contextMaterializationService,
    projectService,
    projectBrainAutomationService,
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  };
  if (options.isCraftsmanSessionAlive !== undefined) {
    taskServiceOptionsWithRecovery.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
  }
  const taskService = new TaskService(taskServiceOptionsWithRecovery);
  const tmuxRuntimeServiceOptions: ConstructorParameters<typeof TmuxRuntimeService>[0] = {
    exec: options.tmuxExec ?? createDefaultTmuxExec(),
    registryDir: tmuxRegistryDir,
    adapters: {
      codex: new CodexCraftsmanAdapter(),
      claude: new ClaudeCraftsmanAdapter(),
      gemini: new GeminiCraftsmanAdapter(),
    },
  };
  if (options.geminiSessionDiscovery) {
    tmuxRuntimeServiceOptions.geminiSessionDiscovery = options.geminiSessionDiscovery;
  }
  const tmuxRuntimeService = new TmuxRuntimeService(tmuxRuntimeServiceOptions);
  const dashboardQueryService = new DashboardQueryService({
    templatesDir,
    taskRepository: new TaskRepository(db),
    subtaskRepository: new SubtaskRepository(db),
    archiveJobRepository: new ArchiveJobRepository(db),
    todoRepository: new TodoRepository(db),
    executionRepository: new CraftsmanExecutionRepository(db),
    templateRepository: new TemplateRepository(db),
    databasePort: db,
    archiveJobNotifier: new FileArchiveJobNotifier({ outboxDir: archiveOutboxDir }),
    archiveJobReceiptIngestor: new FileArchiveJobReceiptIngestor({ receiptDir: archiveReceiptDir }),
  });
  const inboxService = new InboxService(taskService, {
    inboxRepository: new InboxRepository(db),
    todoRepository: new TodoRepository(db),
  });
  const templateAuthoringService = new TemplateAuthoringService({
    templatesDir,
    templateRepository: new TemplateRepository(db),
  });

  return {
    dir,
    db,
    templatesDir,
    archiveOutboxDir,
    archiveReceiptDir,
    brainPackDir,
    projectStateDir,
    taskService,
    projectService,
    rolePackService,
    citizenService,
    projectBrainService,
    projectBrainAutomationService,
    dashboardQueryService,
    inboxService,
    templateAuthoringService,
    craftsmanDispatcher,
    taskContextBindingService,
    taskConversationService,
    taskParticipationService,
    tmuxRuntimeService,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  } satisfies TestRuntime;
}

function createDefaultTmuxExec() {
  return (args: string[]) => {
    if (args[0] === 'has-session') {
      return '';
    }
    if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}|#{pane_current_command}|#{pane_active}')) {
      return ['%0|codex|bash|1', '%1|claude|bash|0', '%2|gemini|bash|0'].join('\n');
    }
    if (args[0] === 'list-panes' && args.includes('#{pane_id}|#{pane_title}')) {
      return ['%0|codex', '%1|claude', '%2|gemini'].join('\n');
    }
    if (args[0] === 'capture-pane') {
      return 'tmux test tail';
    }
    return '';
  };
}
