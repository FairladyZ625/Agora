import { loadAgoraConfig, resolveAgoraRuntimeEnvironmentFromConfigPackage, type AgoraConfig } from '@agora-ts/config';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import { resolve as resolvePath } from 'node:path';
import { createDashboardSessionClient, type DashboardSessionClient } from './dashboard-session-client.js';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  createDefaultCraftsmanAdapters,
  CraftsmanDispatcher,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  resolveCraftsmanRuntimeMode,
  TaskService,
  TmuxRuntimeService,
} from '@agora-ts/core';

export interface CreateCliCompositionOptions {
  configPath?: string;
  dbPath?: string;
}

export interface CliCompositionContext {
  config: AgoraConfig;
  runtimeEnv: ReturnType<typeof resolveAgoraRuntimeEnvironmentFromConfigPackage>;
  db: AgoraDatabase;
}

export interface CliCompositionFactories {
  createCraftsmanDispatcher: (context: CliCompositionContext) => CraftsmanDispatcher;
  createTaskService: (context: CliCompositionContext, deps: { craftsmanDispatcher: CraftsmanDispatcher }) => TaskService;
  createTmuxRuntimeService: (context: CliCompositionContext) => TmuxRuntimeService;
  createDashboardSessionClient: (context: CliCompositionContext) => DashboardSessionClient;
}

export interface CliComposition {
  config: AgoraConfig;
  db: AgoraDatabase;
  taskService: TaskService;
  tmuxRuntimeService: TmuxRuntimeService;
  dashboardSessionClient: DashboardSessionClient;
}

export function createDefaultCliCompositionFactories(): CliCompositionFactories {
  return {
    createCraftsmanDispatcher: (context) => {
      const dispatcherOptions: ConstructorParameters<typeof CraftsmanDispatcher>[1] = {
        maxConcurrentRunning: context.config.craftsmen.max_concurrent_running,
        adapters: createDefaultCraftsmanAdapters({
          mode: resolveCraftsmanRuntimeMode('cli'),
          callbackUrl: `${context.runtimeEnv.apiBaseUrl}/api/craftsmen/callback`,
          apiToken: context.config.api_auth.enabled ? context.config.api_auth.token : null,
        }),
      };
      if (context.config.craftsmen.isolate_git_worktrees) {
        dispatcherOptions.workdirIsolator = new GitWorktreeWorkdirIsolator({
          rootDir: resolvePath(context.config.craftsmen.isolated_root),
        });
      }
      return new CraftsmanDispatcher(context.db, dispatcherOptions);
    },
    createTaskService: (context, deps) => new TaskService(context.db, {
      archonUsers: context.config.permissions.archonUsers,
      allowAgents: context.config.permissions.allowAgents,
      craftsmanDispatcher: deps.craftsmanDispatcher,
    }),
    createTmuxRuntimeService: () => new TmuxRuntimeService({
      adapters: {
        codex: new CodexCraftsmanAdapter(),
        claude: new ClaudeCraftsmanAdapter(),
        gemini: new GeminiCraftsmanAdapter(),
      },
    }),
    createDashboardSessionClient: (context) => createDashboardSessionClient({
      apiBaseUrl: context.runtimeEnv.apiBaseUrl,
      sessionFilePath: resolvePath(context.runtimeEnv.projectRoot, '.agora-ts/dashboard-session.json'),
    }),
  };
}

export function createCliComposition(
  options: CreateCliCompositionOptions = {},
  overrides: Partial<CliCompositionFactories> = {},
): CliComposition {
  const config = loadAgoraConfig(options.configPath ?? process.env.AGORA_CONFIG_PATH ?? '');
  const runtimeEnv = resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const db = createAgoraDatabase({ dbPath: options.dbPath ?? process.env.AGORA_DB_PATH ?? config.db_path });
  runMigrations(db);
  const context: CliCompositionContext = {
    config,
    runtimeEnv,
    db,
  };
  const factories = {
    ...createDefaultCliCompositionFactories(),
    ...overrides,
  };
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(context);
  const taskService = factories.createTaskService(context, { craftsmanDispatcher });
  const tmuxRuntimeService = factories.createTmuxRuntimeService(context);
  const dashboardSessionClient = factories.createDashboardSessionClient(context);

  return {
    config,
    db,
    taskService,
    tmuxRuntimeService,
    dashboardSessionClient,
  };
}
