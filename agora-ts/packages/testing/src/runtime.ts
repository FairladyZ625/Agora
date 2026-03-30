import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import {
  CitizenService,
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  CraftsmanDispatcher,
  DashboardQueryService,
  FilesystemProjectBrainQueryAdapter,
  FilesystemProjectKnowledgeAdapter,
  FilesystemTaskBrainWorkspaceAdapter,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GeminiCraftsmanAdapter,
  InboxService,
  OpenClawCitizenProjectionAdapter,
  ProjectBrainAutomationService,
  ProjectBrainService,
  ProjectService,
  RolePackService,
  ShellCraftsmanAdapter,
  StubCraftsmanAdapter,
  TaskBrainBindingService,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
  type AgentRuntimePort,
  type CraftsmanAdapter,
  type GeminiSessionDiscovery,
  type WorkdirIsolator,
} from '@agora-ts/core';

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
  geminiSessionDiscovery?: Pick<GeminiSessionDiscovery, 'resolveIdentity'>;
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
  tmuxRuntimeService: TmuxRuntimeService;
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
  const rolePackService = new RolePackService({ db, rolePacksDir });
  const projectService = new ProjectService(db, {
    knowledgePort: new FilesystemProjectKnowledgeAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
  });
  const citizenService = new CitizenService(db, {
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
  const craftsmanDispatcher = new CraftsmanDispatcher(db, dispatcherOptions);
  const taskContextBindingService = new TaskContextBindingService(db);
  const taskBrainBindingService = new TaskBrainBindingService(db);
  const taskConversationService = new TaskConversationService(db);
  const taskParticipationService = new TaskParticipationService(db, {
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  });
  const taskServiceOptionsWithRecovery: ConstructorParameters<typeof TaskService>[1] = {
    ...taskServiceOptions,
    craftsmanDispatcher,
    taskBrainBindingService,
    taskBrainWorkspacePort: new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: brainPackDir,
      projectStateRootResolver: (projectId) => join(projectStateDir, projectId),
    }),
    taskContextBindingService,
    taskParticipationService,
    projectService,
    projectBrainAutomationService,
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  };
  if (options.isCraftsmanSessionAlive !== undefined) {
    taskServiceOptionsWithRecovery.isCraftsmanSessionAlive = options.isCraftsmanSessionAlive;
  }
  const taskService = new TaskService(db, taskServiceOptionsWithRecovery);
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
  const dashboardQueryService = new DashboardQueryService(db, {
    templatesDir,
    archiveJobNotifier: new FileArchiveJobNotifier({ outboxDir: archiveOutboxDir }),
    archiveJobReceiptIngestor: new FileArchiveJobReceiptIngestor({ receiptDir: archiveReceiptDir }),
  });
  const inboxService = new InboxService(db, taskService);
  const templateAuthoringService = new TemplateAuthoringService({ db, templatesDir });

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
