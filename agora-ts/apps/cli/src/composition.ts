import { cpSync, existsSync, mkdirSync } from 'node:fs';
import {
  agoraDataDirPath,
  ensureBundledAgoraAssetsInstalled,
  loadAgoraConfig,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  type AgoraConfig,
} from '@agora-ts/config';
import { createAgoraDatabase, runMigrations, type AgoraDatabase } from '@agora-ts/db';
import { resolve as resolvePath } from 'node:path';
import { createDashboardSessionClient, type DashboardSessionClient } from './dashboard-session-client.js';
import {
  ClaudeCraftsmanAdapter,
  CodexCraftsmanAdapter,
  createDefaultCraftsmanAdapters,
  CraftsmanDispatcher,
  DashboardQueryService,
  FilesystemTaskBrainWorkspaceAdapter,
  GeminiCraftsmanAdapter,
  GitWorktreeWorkdirIsolator,
  HumanAccountService,
  InventoryBackedAgentRuntimePort,
  OsHostResourcePort,
  StubIMMessagingPort,
  RolePackService,
  TaskBrainBindingService,
  TmuxCraftsmanInputPort,
  TmuxCraftsmanProbePort,
  type TaskBrainWorkspacePort,
  resolveCraftsmanRuntimeMode,
  TaskContextBindingService,
  TaskConversationService,
  TaskParticipationService,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
  type AgentRuntimePort,
  type IMMessagingPort,
  type IMProvisioningPort,
} from '@agora-ts/core';
import { loadOpenClawDiscordAccountTokens, OpenClawAgentRegistry } from '@agora-ts/adapters-openclaw';
import { DiscordIMMessagingAdapter, DiscordIMProvisioningAdapter } from '@agora-ts/adapters-discord';

export interface CreateCliCompositionOptions {
  configPath?: string;
  dbPath?: string;
}

export interface CliCompositionContext {
  config: AgoraConfig;
  runtimeEnv: ReturnType<typeof resolveAgoraRuntimeEnvironmentFromConfigPackage>;
  db: AgoraDatabase;
  templatesDir: string;
  rolePackDir: string;
  brainPackDir: string;
}

export interface CliCompositionFactories {
  createCraftsmanDispatcher: (context: CliCompositionContext) => CraftsmanDispatcher;
  createAgentRuntimePort: (context: CliCompositionContext) => AgentRuntimePort;
  createIMMessagingPort: (context: CliCompositionContext) => IMMessagingPort;
  createIMProvisioningPort: (context: CliCompositionContext) => IMProvisioningPort | undefined;
  createTaskContextBindingService: (context: CliCompositionContext) => TaskContextBindingService;
  createTaskParticipationService: (
    context: CliCompositionContext,
    deps: { agentRuntimePort: AgentRuntimePort },
  ) => TaskParticipationService;
  createTaskService: (
    context: CliCompositionContext,
    deps: {
      craftsmanDispatcher: CraftsmanDispatcher;
      taskBrainBindingService: TaskBrainBindingService;
      taskBrainWorkspacePort: TaskBrainWorkspacePort;
      imProvisioningPort: IMProvisioningPort | undefined;
      messagingPort: IMMessagingPort;
      taskContextBindingService: TaskContextBindingService;
      taskParticipationService: TaskParticipationService;
      agentRuntimePort: AgentRuntimePort;
      craftsmanInputPort: TmuxCraftsmanInputPort;
      craftsmanExecutionProbePort: TmuxCraftsmanProbePort;
    },
  ) => TaskService;
  createTmuxRuntimeService: (context: CliCompositionContext) => TmuxRuntimeService;
  createDashboardSessionClient: (context: CliCompositionContext) => DashboardSessionClient;
  createHumanAccountService: (context: CliCompositionContext) => HumanAccountService;
  createTaskConversationService: (context: CliCompositionContext) => TaskConversationService;
  createTemplateAuthoringService: (context: CliCompositionContext) => TemplateAuthoringService;
  createRolePackService: (context: CliCompositionContext) => RolePackService;
  createDashboardQueryService: (context: CliCompositionContext) => DashboardQueryService;
  createTaskBrainBindingService: (context: CliCompositionContext) => TaskBrainBindingService;
  createTaskBrainWorkspacePort: (context: CliCompositionContext) => TaskBrainWorkspacePort;
}

export interface CliComposition {
  config: AgoraConfig;
  db: AgoraDatabase;
  taskService: TaskService;
  tmuxRuntimeService: TmuxRuntimeService;
  dashboardSessionClient: DashboardSessionClient;
  humanAccountService: HumanAccountService;
  taskConversationService: TaskConversationService;
  templateAuthoringService: TemplateAuthoringService;
  rolePackService: RolePackService;
  dashboardQueryService: DashboardQueryService;
  taskBrainBindingService: TaskBrainBindingService;
}

function ensureRuntimeBrainPackRoot(projectRoot: string): string {
  const explicitRoot = process.env.AGORA_BRAIN_PACK_ROOT;
  const runtimeBrainPackDir = explicitRoot
    ? resolvePath(explicitRoot)
    : resolvePath(agoraDataDirPath(), 'agora-ai-brain');
  if (existsSync(runtimeBrainPackDir)) {
    return runtimeBrainPackDir;
  }
  const bundledBrainPackDir = resolvePath(projectRoot, 'agora-ai-brain');
  mkdirSync(runtimeBrainPackDir, { recursive: true });
  cpSync(bundledBrainPackDir, runtimeBrainPackDir, {
    recursive: true,
    filter: (source) => !source.startsWith(resolvePath(bundledBrainPackDir, 'tasks')),
  });
  mkdirSync(resolvePath(runtimeBrainPackDir, 'tasks'), { recursive: true });
  return runtimeBrainPackDir;
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
    createAgentRuntimePort: () => {
      const registry = new OpenClawAgentRegistry(
        process.env.AGORA_OPENCLAW_CONFIG_PATH
          ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
          : {},
      );
      return new InventoryBackedAgentRuntimePort(registry);
    },
    createIMMessagingPort: (context) => {
      const { im } = context.config;
      if (im.provider === 'discord' && im.discord?.bot_token) {
        return new DiscordIMMessagingAdapter({ botToken: im.discord.bot_token });
      }
      return new StubIMMessagingPort();
    },
    createIMProvisioningPort: (context) => {
      const { im } = context.config;
      if (im.provider === 'discord' && im.discord?.bot_token && im.discord?.default_channel_id) {
        const accountTokens = loadOpenClawDiscordAccountTokens(
          process.env.AGORA_OPENCLAW_CONFIG_PATH
            ? { configPath: process.env.AGORA_OPENCLAW_CONFIG_PATH }
            : {},
        );
        const primaryAccountId = Object.entries(accountTokens).find(([, token]) => token === im.discord?.bot_token)?.[0] ?? null;
        return new DiscordIMProvisioningAdapter({
          botToken: im.discord.bot_token,
          defaultChannelId: im.discord.default_channel_id,
          participantTokens: accountTokens,
          primaryAccountId,
        });
      }
      return undefined;
    },
    createTaskContextBindingService: (context) => new TaskContextBindingService(context.db),
    createTaskParticipationService: (context, deps) => new TaskParticipationService(context.db, {
      agentRuntimePort: deps.agentRuntimePort,
    }),
    createTaskService: (context, deps) => new TaskService(context.db, {
      archonUsers: context.config.permissions.archonUsers,
      allowAgents: context.config.permissions.allowAgents,
      craftsmanDispatcher: deps.craftsmanDispatcher,
      taskBrainBindingService: deps.taskBrainBindingService,
      taskBrainWorkspacePort: deps.taskBrainWorkspacePort,
      imMessagingPort: deps.messagingPort,
      taskContextBindingService: deps.taskContextBindingService,
      taskParticipationService: deps.taskParticipationService,
      agentRuntimePort: deps.agentRuntimePort,
      craftsmanInputPort: deps.craftsmanInputPort,
      craftsmanExecutionProbePort: deps.craftsmanExecutionProbePort,
      hostResourcePort: new OsHostResourcePort(),
      craftsmanGovernance: {
        maxConcurrentPerAgent: context.config.craftsmen.max_concurrent_per_agent,
        hostMemoryUtilizationLimit: context.config.craftsmen.host_memory_utilization_limit,
        hostSwapUtilizationLimit: context.config.craftsmen.host_swap_utilization_limit,
        hostLoadPerCpuLimit: context.config.craftsmen.host_load_per_cpu_limit,
      },
      ...(deps.imProvisioningPort ? { imProvisioningPort: deps.imProvisioningPort } : {}),
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
    createHumanAccountService: (context) => new HumanAccountService(context.db),
    createTaskConversationService: (context) => new TaskConversationService(context.db),
    createTemplateAuthoringService: (context) => new TemplateAuthoringService({
      db: context.db,
      templatesDir: context.templatesDir,
    }),
    createRolePackService: (context) => new RolePackService({
      db: context.db,
      rolePacksDir: context.rolePackDir,
    }),
    createDashboardQueryService: (context) => new DashboardQueryService(context.db, {
      templatesDir: context.templatesDir,
    }),
    createTaskBrainBindingService: (context) => new TaskBrainBindingService(context.db),
    createTaskBrainWorkspacePort: (context) => new FilesystemTaskBrainWorkspaceAdapter({
      brainPackRoot: context.brainPackDir,
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
  ensureBundledAgoraAssetsInstalled({
    projectRoot: runtimeEnv.projectRoot ?? new URL('../../../../', import.meta.url).pathname,
  });
  const templatesDir = resolvePath(runtimeEnv.projectRoot, 'agora-ts/templates');
  const rolePackDir = resolvePath(runtimeEnv.projectRoot, 'agora-ts/role-packs/agora-default');
  const brainPackDir = ensureRuntimeBrainPackRoot(runtimeEnv.projectRoot);
  const context: CliCompositionContext = {
    config,
    runtimeEnv,
    db,
    templatesDir,
    rolePackDir,
    brainPackDir,
  };
  const factories = {
    ...createDefaultCliCompositionFactories(),
    ...overrides,
  };
  const craftsmanDispatcher = factories.createCraftsmanDispatcher(context);
  const agentRuntimePort = factories.createAgentRuntimePort(context);
  const messagingPort = factories.createIMMessagingPort(context);
  const imProvisioningPort = factories.createIMProvisioningPort(context);
  const taskContextBindingService = factories.createTaskContextBindingService(context);
  const taskParticipationService = factories.createTaskParticipationService(context, {
    agentRuntimePort,
  });
  const tmuxRuntimeService = factories.createTmuxRuntimeService(context);
  const taskBrainBindingService = factories.createTaskBrainBindingService(context);
  const taskBrainWorkspacePort = factories.createTaskBrainWorkspacePort(context);
  const taskService = factories.createTaskService(context, {
    craftsmanDispatcher,
    craftsmanInputPort: new TmuxCraftsmanInputPort(tmuxRuntimeService),
    craftsmanExecutionProbePort: new TmuxCraftsmanProbePort(tmuxRuntimeService),
    taskBrainBindingService,
    taskBrainWorkspacePort,
    imProvisioningPort,
    messagingPort,
    taskContextBindingService,
    taskParticipationService,
    agentRuntimePort,
  });
  const dashboardSessionClient = factories.createDashboardSessionClient(context);
  const humanAccountService = factories.createHumanAccountService(context);
  const taskConversationService = factories.createTaskConversationService(context);
  const templateAuthoringService = factories.createTemplateAuthoringService(context);
  const rolePackService = factories.createRolePackService(context);
  const dashboardQueryService = factories.createDashboardQueryService(context);
  return {
    config,
    db,
    taskService,
    tmuxRuntimeService,
    dashboardSessionClient,
    humanAccountService,
    taskConversationService,
    templateAuthoringService,
    rolePackService,
    dashboardQueryService,
    taskBrainBindingService,
  };
}
