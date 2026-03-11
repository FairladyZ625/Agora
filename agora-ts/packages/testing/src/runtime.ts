import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  CraftsmanDispatcher,
  DashboardQueryService,
  FileArchiveJobNotifier,
  FileArchiveJobReceiptIngestor,
  GeminiCraftsmanAdapter,
  InboxService,
  ShellCraftsmanAdapter,
  StubCraftsmanAdapter,
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
  taskService: TaskService;
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
  const templatesDir = join(dir, 'templates');
  const archiveOutboxDir = join(dir, 'archive-outbox');
  const archiveReceiptDir = join(dir, 'archive-receipts');
  const tmuxRegistryDir = join(dir, 'tmux-registry');
  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(archiveOutboxDir, { recursive: true });
  mkdirSync(archiveReceiptDir, { recursive: true });
  mkdirSync(tmuxRegistryDir, { recursive: true });
  cpSync(sourceTemplatesDir, templatesDir, { recursive: true });
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
  const taskConversationService = new TaskConversationService(db);
  const taskParticipationService = new TaskParticipationService(db, {
    ...(options.agentRuntimePort ? { agentRuntimePort: options.agentRuntimePort } : {}),
  });
  const taskServiceOptionsWithRecovery: ConstructorParameters<typeof TaskService>[1] = {
    ...taskServiceOptions,
    craftsmanDispatcher,
    taskContextBindingService,
    taskParticipationService,
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
  const templateAuthoringService = new TemplateAuthoringService({ templatesDir });

  return {
    dir,
    db,
    templatesDir,
    archiveOutboxDir,
    archiveReceiptDir,
    taskService,
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
