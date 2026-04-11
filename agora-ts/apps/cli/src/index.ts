#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  BUILT_IN_AGORA_NOMOS_PACK,
  DEFAULT_AGORA_NOMOS_ID,
  DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS,
  DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES,
  buildBuiltInAgoraNomosSeededAssets,
  buildBuiltInAgoraNomosProjectProfile,
  assessPublishedNomosCatalogEntryTrust,
  assessRegisteredNomosSourceTrust,
  diagnoseProjectNomosDrift,
  diffProjectNomos,
  exportNomosShareBundle,
  exportProjectNomosPack,
  activateProjectNomosDraft,
  inspectRegisteredNomosSource,
  importNomosSource,
  importNomosShareBundle,
  inspectPublishedNomosCatalogPack,
  installLocalNomosPackToProject,
  installCatalogNomosPackToProject,
  installNomosFromRegisteredSource,
  installNomosFromSource,
  listPublishedNomosCatalog,
  listRegisteredNomosSources,
  publishProjectNomosPack,
  registerNomosSource,
  refineProjectNomosDraftFromSpec,
  NOMOS_LIFECYCLE_MODULES,
  prepareProjectNomosInstall,
  REPO_AGENTS_SHIM_SECTION_ORDER,
  requireSupportedNomosId,
  resolveProjectNomosProvenance,
  resolveProjectNomosState,
  resolveProjectNomosRuntimePaths,
  resolveInstalledCreateNomosPackTemplateDir,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  reviewProjectNomosDraft,
  scaffoldNomosPack,
  syncRegisteredNomosSource,
  validateProjectNomos,
} from '@agora-ts/config';
import type { StartCommandRunner } from './start-command.js';
import type { CliCompositionFactories } from './composition.js';
import { createCliComposition } from './composition.js';
import {
  deriveGraphFromStages,
  CcConnectInspectionService,
  CcConnectManagementService,
  type InteractiveRuntimePort,
  OrchestratorDirectCreateService,
  ProjectBootstrapService,
  ProjectBrainDoctorService,
  ProjectBrainIndexQueueService,
  ProjectBrainIndexWorkerService,
  type RetrievalService,
  isDeveloperRegressionEnabled,
} from '@agora-ts/core';
import { OpenAiCompatibleProjectBrainEmbeddingAdapter } from '@agora-ts/adapters-brain';
import { ProjectBrainIndexJobRepository } from '@agora-ts/db';
import { LiveRegressionActor } from '@agora-ts/testing';
import type { DashboardSessionClient } from './dashboard-session-client.js';
import type {
  CitizenService,
  DashboardQueryService,
  ProjectBrainAutomationService,
  ProjectBrainDoctorService as ProjectBrainDoctorServiceContract,
  ProjectBrainIndexService,
  ProjectBrainIndexWorkerService as ProjectBrainIndexWorkerServiceContract,
  ProjectBrainRetrievalService,
  ProjectBrainService,
  ProjectService,
  RolePackService,
  TaskContextBindingService,
  TaskConversationService,
  TaskService,
  TemplateAuthoringService,
  IMProvisioningPort,
} from '@agora-ts/core';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanInteractionExpectationDto,
  CraftsmanModeDto,
  CraftsmanExecutionStatusDto,
  CraftsmanInputKeyDto,
  CraftsmanRuntimeIdentitySourceDto,
  CreateCitizenRequestDto,
  OrchestratorDirectCreateRequestDto,
  CreateProjectRequestDto,
  CreateSubtasksRequestDto,
  TaskPriority,
  TemplateDetailDto,
  TemplateGraphDto,
  ValidateWorkflowRequestDto,
} from '@agora-ts/contracts';
import {
  craftsmanExecutionSendKeysRequestSchema,
  craftsmanExecutionSendTextRequestSchema,
  craftsmanExecutionSubmitChoiceRequestSchema,
  craftsmanExecutionTailResponseSchema,
  createCitizenRequestSchema,
  createProjectRequestSchema,
  createSubtasksRequestSchema,
  createTaskRequestSchema,
} from '@agora-ts/contracts';
import { runInitCommand } from './init-command.js';
import { runStartCommand } from './start-command.js';
import { classifyCliError, CliError, CLI_EXIT_CODES, renderCliError } from './errors.js';
import { cliText, resolveCliLocale } from './locale.js';
import type { HumanAccountService } from '@agora-ts/core';

type Writable = {
  write: (chunk: string) => void;
};

type CreateTaskInputLike = Parameters<TaskService['createTask']>[0];

type CreateProjectInputLike = CreateProjectRequestDto;
type CreateCitizenInputLike = CreateCitizenRequestDto;

const CLI_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export interface CliDependencies {
  taskService?: TaskService;
  projectService?: ProjectService;
  projectBrainService?: ProjectBrainService;
  projectBrainAutomationService?: ProjectBrainAutomationService;
  projectBrainIndexService?: ProjectBrainIndexService;
  projectBrainRetrievalService?: ProjectBrainRetrievalService;
  projectBrainDoctorService?: ProjectBrainDoctorServiceContract;
  projectBrainIndexWorkerService?: ProjectBrainIndexWorkerServiceContract;
  contextRetrievalService?: Pick<RetrievalService, 'retrieve'>;
  citizenService?: CitizenService;
  legacyRuntimeService?: LegacyRuntimeServiceLike;
  tmuxRuntimeService?: LegacyRuntimeServiceLike;
  dashboardSessionClient?: DashboardSessionClient;
  humanAccountService?: HumanAccountService;
  taskConversationService?: TaskConversationService;
  taskContextBindingService?: TaskContextBindingService;
  templateAuthoringService?: TemplateAuthoringService;
  rolePackService?: RolePackService;
  dashboardQueryService?: DashboardQueryService;
  ccConnectInspectionService?: CcConnectInspectionService;
  ccConnectManagementService?: CcConnectManagementService;
  imProvisioningPort?: IMProvisioningPort;
  factories?: Partial<CliCompositionFactories>;
  startCommandRunner?: StartCommandRunner;
  startCommandCwd?: string;
  startCommandFallbackRoot?: string;
  configPath?: string;
  dbPath?: string;
  stdout?: Writable;
  stderr?: Writable;
}

type LegacyRuntimeServiceLike = Pick<InteractiveRuntimePort, 'up' | 'status' | 'send' | 'sendText' | 'sendKeys' | 'submitChoice' | 'start' | 'resume' | 'task' | 'tail' | 'doctor' | 'down' | 'recordIdentity'>;

function writeLine(stream: Writable, message: string) {
  stream.write(`${message}\n`);
}

function parseJsonOption(raw: string | undefined, context: string): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  return parseJsonString(raw, context);
}

function collectOption(value: string, previous: string[] = []) {
  return [...previous, value];
}

function collectStringOption(value: string, previous: string[]) {
  return [...previous, value];
}

function parseNumericOptionList(rawValues: string[] = [], optionName: string): number[] {
  return rawValues.map((value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`invalid ${optionName} value: ${value}. Expected positive integer.`);
    }
    return parsed;
  });
}

function parseRequiredNumericOption(rawValue: string, optionName: string): number {
  const [parsed] = parseNumericOptionList([rawValue], optionName);
  if (parsed === undefined) {
    throw new Error(`missing ${optionName} value`);
  }
  return parsed;
}

function parseIntegerOption(rawValue: string): number {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid integer value: ${rawValue}`);
  }
  return parsed;
}

function resolveAccountLabel(humanAccountService: HumanAccountService, accountId: number) {
  const user = humanAccountService.listUsers().find((item) => item.id === accountId);
  return user?.username ?? String(accountId);
}

function parseRoleBindings(rawBindings: string[] = []): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const raw of rawBindings) {
    const [role, target] = raw.split('=');
    if (!role || !target) {
      throw new Error(`invalid --bind value: ${raw}. Expected role=target.`);
    }
    bindings.set(role, target);
  }
  return bindings;
}

function parseRoleSkillBindings(rawBindings: string[] = []): Record<string, string[]> {
  const bindings: Record<string, string[]> = {};
  for (const raw of rawBindings) {
    const [role, skillRef] = raw.split('=');
    if (!role || !skillRef) {
      throw new Error(`invalid --role-skill value: ${raw}. Expected role=skill.`);
    }
    bindings[role] = [...(bindings[role] ?? []), skillRef];
  }
  return bindings;
}

function buildSkillPolicy(skillRefs: string[] = [], rawRoleSkills: string[] = []) {
  const roleRefs = parseRoleSkillBindings(rawRoleSkills);
  if (skillRefs.length === 0 && Object.keys(roleRefs).length === 0) {
    return undefined;
  }
  return {
    global_refs: skillRefs,
    role_refs: roleRefs,
    enforcement: 'required' as const,
  };
}

function readDashboardLoginCredentials(env: NodeJS.ProcessEnv = process.env) {
  const username = (
    env.AGORA_DASHBOARD_LOGIN_USER
    ?? env.AGORA_DASHBOARD_USER
    ?? env.DASHBOARD_LOGIN_USER
    ?? ''
  ).trim();
  const password = (
    env.AGORA_DASHBOARD_LOGIN_PASSWORD
    ?? env.AGORA_DASHBOARD_PASSWORD
    ?? env.DASHBOARD_LOGIN_PASSWORD
    ?? ''
  ).trim();
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

function resolveDashboardSessionLoginInput(
  options: { username?: string; password?: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const username = options.username?.trim() ?? '';
  const password = options.password?.trim() ?? '';
  if (username || password) {
    if (!username || !password) {
      throw new Error('dashboard session login requires both --username and --password.');
    }
    return { username, password };
  }

  if (!isDeveloperRegressionEnabled(env)) {
    throw new Error(
      'dashboard session login requires --username/--password, or enable AGORA_DEV_REGRESSION_MODE=true and set AGORA_DASHBOARD_LOGIN_USER / AGORA_DASHBOARD_LOGIN_PASSWORD.',
    );
  }

  const fromEnv = readDashboardLoginCredentials(env);
  if (!fromEnv) {
    throw new Error(
      'developer regression mode is enabled, but AGORA_DASHBOARD_LOGIN_USER / AGORA_DASHBOARD_LOGIN_PASSWORD are not set.',
    );
  }
  return fromEnv;
}

function buildTemplateMembers(
  templateId: string,
  template: TemplateDetailDto,
  rolePackService: RolePackService,
): NonNullable<CreateTaskInputLike['team_override']>['members'] {
  return rolePackService.resolveTemplateTeam(templateId, template, [{ scope: 'workspace', scope_ref: 'default' }]).map((member) => {
    if (!member.agentId) {
      throw new Error(`template role ${member.role} has no resolved agent; use --bind ${member.role}=<agent>`);
    }
    return member;
  });
}

function applyTaskCreateOverrides(
  input: CreateTaskInputLike,
  templateId: string,
  template: TemplateDetailDto | null,
  rolePackService: RolePackService,
  controllerRef: string | undefined,
  binds: Map<string, string>,
) {
  const shouldResolveTemplateTeam = !input.team_override && !!template;
  if (!shouldResolveTemplateTeam && !controllerRef && binds.size === 0) {
    return input;
  }

  const baseMembers = input.team_override?.members
    ? [...input.team_override.members]
    : template
      ? buildTemplateMembers(templateId, template, rolePackService)
      : [];

  if (baseMembers.length === 0) {
    throw new Error('cannot apply --controller/--bind without a template defaultTeam or explicit --team-json');
  }

  const nextMembers = baseMembers.map((member) => {
    if (controllerRef && member.member_kind === 'controller') {
      return { ...member, agentId: controllerRef };
    }
    const explicitBinding = binds.get(member.role);
    if (explicitBinding) {
      return { ...member, agentId: explicitBinding };
    }
    return member;
  });

  if (controllerRef && !nextMembers.some((member) => member.member_kind === 'controller' && member.agentId === controllerRef)) {
    throw new Error('template/team override does not declare a controller role to receive --controller');
  }

  return createTaskRequestSchema.parse({
    ...input,
    team_override: {
      members: nextMembers,
    },
  });
}

function renderTemplateGraphMermaid(graph: TemplateGraphDto) {
  const lines = ['flowchart TD'];
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}["${node.name ?? node.id}"]`);
  }
  for (const edge of graph.edges) {
    const arrow = edge.kind === 'reject' ? '-. reject .->' : '-->';
    lines.push(`  ${edge.from} ${arrow} ${edge.to}`);
  }
  return lines.join('\n');
}

function loadGraphSource(
  templateAuthoringService: TemplateAuthoringService,
  input: { template?: string; file?: string },
): TemplateGraphDto {
  if (input.file) {
    const parsed = parseJsonFile(input.file, 'workflow file') as ValidateWorkflowRequestDto & { graph_version?: number };
    if (typeof parsed.graph_version === 'number') {
      return parsed as unknown as TemplateGraphDto;
    }
    return deriveGraphFromStages(parsed.stages ?? []);
  }
  if (input.template) {
    return templateAuthoringService.getTemplateGraph(input.template);
  }
  throw new Error('graph command requires --template or --file');
}

function parseJsonString(raw: string, context: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON for ${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJsonFile(path: string, context: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid JSON in ${context} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readTextOption(raw: string | undefined, file: string | undefined, context: string) {
  if (raw && file) {
    throw new Error(`${context} accepts either inline text or --body-file, not both`);
  }
  if (file) {
    return readFileSync(file, 'utf8');
  }
  return raw ?? '';
}

function addRedirectCommand(
  program: Command,
  name: string,
  movedTo: string,
  examples: string[],
) {
  const locale = resolveCliLocale();
  program
    .command(name)
    .description(`redirect to \`${movedTo}\``)
    .allowUnknownOption(true)
    .argument('[args...]')
    .addHelpText('after', [
      '',
      cliText(locale, `已迁移到：${movedTo}`, `Moved to: ${movedTo}`),
      cliText(locale, '示例：', 'Examples:'),
      ...examples.map((example) => `  ${example}`),
    ].join('\n'))
    .action(() => {
      throw new CliError(
        cliText(locale, `\`agora ${name}\` 已迁移到 \`${movedTo}\`。`, `\`agora ${name}\` has moved under \`${movedTo}\`.`),
        'usage',
        CLI_EXIT_CODES.usage,
        [
          cliText(locale, `请改用 \`${movedTo} --help\` 查看真实命令树。`, `Use \`${movedTo} --help\` for the real command tree.`),
          ...examples.map((example) => `- ${example}`),
        ].join('\n'),
      );
    });
}

function insertStage(
  stages: NonNullable<TemplateDetailDto['stages']>,
  stage: NonNullable<TemplateDetailDto['stages']>[number],
) {
  return [...stages, stage];
}

function removeStage(
  stages: NonNullable<TemplateDetailDto['stages']>,
  stageId: string,
) {
  return stages
    .filter((stage) => stage.id !== stageId)
    .map((stage) => (
      stage.reject_target === stageId
        ? { ...stage, reject_target: undefined }
        : stage
    ));
}

function moveStage(
  stages: NonNullable<TemplateDetailDto['stages']>,
  stageId: string,
  beforeId?: string,
  afterId?: string,
) {
  const currentIndex = stages.findIndex((stage) => stage.id === stageId);
  if (currentIndex === -1) {
    throw new Error(`unknown stage id: ${stageId}`);
  }
  const stage = stages[currentIndex];
  if (!stage) {
    throw new Error(`unknown stage id: ${stageId}`);
  }
  const remaining = stages.filter((candidate) => candidate.id !== stageId);
  if (beforeId) {
    const targetIndex = remaining.findIndex((candidate) => candidate.id === beforeId);
    if (targetIndex === -1) {
      throw new Error(`unknown --before target: ${beforeId}`);
    }
    return [...remaining.slice(0, targetIndex), stage, ...remaining.slice(targetIndex)];
  }
  if (afterId) {
    const targetIndex = remaining.findIndex((candidate) => candidate.id === afterId);
    if (targetIndex === -1) {
      throw new Error(`unknown --after target: ${afterId}`);
    }
    return [...remaining.slice(0, targetIndex + 1), stage, ...remaining.slice(targetIndex + 1)];
  }
  throw new Error('stage move requires --before or --after');
}

function createLazyObject<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const value = Reflect.get(resolve(), prop, receiver);
      return typeof value === 'function'
        ? value.bind(resolve())
        : value;
    },
  });
}

export function createCliProgram(deps: CliDependencies = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  let composition: ReturnType<typeof createCliComposition> | null = null;
  function resolveComposition() {
    if (!composition) {
      composition = createCliComposition({
        ...(deps.configPath ? { configPath: deps.configPath } : {}),
        ...(deps.dbPath ? { dbPath: deps.dbPath } : {}),
      }, deps.factories);
    }
    return composition;
  }
  const taskService = createLazyObject(() => deps.taskService ?? resolveComposition().taskService);
  const legacyRuntimeService = createLazyObject(() => deps.legacyRuntimeService ?? deps.tmuxRuntimeService ?? resolveComposition().tmuxRuntimeService);
  const dashboardSessionClient = createLazyObject(() => deps.dashboardSessionClient ?? resolveComposition().dashboardSessionClient);
  const humanAccountService = createLazyObject(() => deps.humanAccountService ?? resolveComposition().humanAccountService);
  const taskConversationService = createLazyObject(() => deps.taskConversationService ?? resolveComposition().taskConversationService);
  const taskContextBindingService = createLazyObject(() => deps.taskContextBindingService ?? resolveComposition().taskContextBindingService);
  const templateAuthoringService = createLazyObject(() => deps.templateAuthoringService ?? resolveComposition().templateAuthoringService);
  const rolePackService = createLazyObject(() => deps.rolePackService ?? resolveComposition().rolePackService);
  const dashboardQueryService = createLazyObject(() => deps.dashboardQueryService ?? resolveComposition().dashboardQueryService);
  const getCcConnectInspectionService = () => deps.ccConnectInspectionService ?? new CcConnectInspectionService();
  const getCcConnectManagementService = () => deps.ccConnectManagementService ?? new CcConnectManagementService();
  const getImProvisioningPort = () => deps.imProvisioningPort ?? resolveComposition().imProvisioningPort;
  const getContextRetrievalService = () => deps.contextRetrievalService ?? resolveComposition().contextRetrievalService;
  const projectService = createLazyObject(() => deps.projectService ?? resolveComposition().projectService);
  const projectBrainService = createLazyObject(() => deps.projectBrainService ?? resolveComposition().projectBrainService);
  const projectBrainAutomationService = createLazyObject(() => deps.projectBrainAutomationService ?? resolveComposition().projectBrainAutomationService);
  const getProjectBrainIndexService = () => deps.projectBrainIndexService ?? resolveComposition().projectBrainIndexService;
  const getProjectBrainRetrievalService = () => deps.projectBrainRetrievalService ?? resolveComposition().projectBrainRetrievalService;
  let projectBrainDoctorService: ProjectBrainDoctorServiceContract | null | undefined;
  let projectBrainIndexWorkerService: ProjectBrainIndexWorkerServiceContract | null | undefined;
  const getProjectBrainDoctorService = () => {
    if (deps.projectBrainDoctorService) {
      return deps.projectBrainDoctorService;
    }
    if (projectBrainDoctorService !== undefined) {
      return projectBrainDoctorService ?? undefined;
    }
    const composition = resolveComposition();
    const embeddingPort = process.env.OPENAI_API_KEY
      ? new OpenAiCompatibleProjectBrainEmbeddingAdapter()
      : undefined;
    projectBrainDoctorService = new ProjectBrainDoctorService({
      dbPath: deps.dbPath ?? composition.config.db_path,
      projectBrainService: composition.projectBrainService,
      queueService: new ProjectBrainIndexQueueService({ repository: new ProjectBrainIndexJobRepository(composition.db) }),
      ...(embeddingPort ? { embeddingPort } : {}),
    });
    return projectBrainDoctorService;
  };
  const getProjectBrainIndexWorkerService = () => {
    if (deps.projectBrainIndexWorkerService) {
      return deps.projectBrainIndexWorkerService;
    }
    if (projectBrainIndexWorkerService !== undefined) {
      return projectBrainIndexWorkerService ?? undefined;
    }
    const composition = resolveComposition();
    if (!composition.projectBrainIndexService) {
      projectBrainIndexWorkerService = null;
      return undefined;
    }
    projectBrainIndexWorkerService = new ProjectBrainIndexWorkerService({
      queueService: new ProjectBrainIndexQueueService({ repository: new ProjectBrainIndexJobRepository(composition.db) }),
      indexService: composition.projectBrainIndexService,
    });
    return projectBrainIndexWorkerService;
  };
  const maybeDrainProjectBrainIndexJobs = async (limit = 5) => {
    const worker = getProjectBrainIndexWorkerService();
    if (!worker) {
      return;
    }
    try {
      await worker.drainPendingJobs({ limit });
    } catch (error) {
      writeLine(stderr, `[agora] project brain index auto-drain failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const citizenService = createLazyObject(() => deps.citizenService ?? resolveComposition().citizenService);
  const program = new Command();

  program
    .name('agora-ts')
    .description('Agora v2 TypeScript CLI')
    .version('0.0.0');

  program.configureOutput({
    writeOut: (text) => stdout.write(text),
    writeErr: (text) => stderr.write(text),
  });

  const health = program
    .command('health')
    .description('health commands')
    .action(() => {
      writeLine(stdout, 'agora-ts bootstrap ok');
    });

  health
    .command('snapshot')
    .description('print unified health snapshot')
    .option('--json', 'emit JSON')
    .action((options: { json?: boolean }) => {
      const snapshot = taskService.getHealthSnapshot();
      if (options.json) {
        writeLine(stdout, JSON.stringify(snapshot, null, 2));
        return;
      }
      writeLine(stdout, `generated_at: ${snapshot.generated_at}`);
      writeLine(stdout, `tasks: total=${snapshot.tasks.total_tasks} active=${snapshot.tasks.active_tasks} blocked=${snapshot.tasks.blocked_tasks} paused=${snapshot.tasks.paused_tasks} done=${snapshot.tasks.done_tasks} status=${snapshot.tasks.status}`);
      writeLine(stdout, `im: bindings=${snapshot.im.active_bindings} threads=${snapshot.im.active_threads} status=${snapshot.im.status}`);
      writeLine(stdout, `runtime: available=${snapshot.runtime.available} active=${snapshot.runtime.active_sessions} idle=${snapshot.runtime.idle_sessions} closed=${snapshot.runtime.closed_sessions} status=${snapshot.runtime.status}`);
      writeLine(stdout, `craftsman: active=${snapshot.craftsman.active_executions} running=${snapshot.craftsman.running_executions} waiting_input=${snapshot.craftsman.waiting_input_executions} awaiting_choice=${snapshot.craftsman.awaiting_choice_executions} status=${snapshot.craftsman.status}`);
      if (snapshot.host.snapshot) {
        const host = snapshot.host.snapshot;
        const memoryLabel = host.platform === 'darwin' && host.memory_pressure != null
          ? `pressure=${host.memory_pressure}`
          : `memory=${host.memory_utilization ?? '-'}`;
        writeLine(stdout, `host: ${memoryLabel} swap=${host.swap_utilization ?? '-'} load_1m=${host.load_1m ?? '-'} status=${snapshot.host.status}`);
      } else {
        writeLine(stdout, `host: unavailable status=${snapshot.host.status}`);
      }
      writeLine(
        stdout,
        `escalation: controller=${snapshot.escalation.controller_pinged_tasks} roster=${snapshot.escalation.roster_pinged_tasks} inbox=${snapshot.escalation.inbox_escalated_tasks} runtime_unhealthy=${snapshot.escalation.runtime_unhealthy} status=${snapshot.escalation.status}`,
      );
    });

  program
    .command('create')
    .description('创建新任务')
    .argument('<title>', '任务标题')
    .option('-t, --type <type>', '任务类型', 'coding')
    .option('-p, --priority <priority>', '优先级', 'normal')
    .option('-c, --creator <creator>', '创建者', 'archon')
    .option('--locale <locale>', '任务语言 (zh-CN|en-US)', 'zh-CN')
    .option('--team-json <json>', 'team override JSON')
    .option('--workflow-json <json>', 'workflow override JSON')
    .option('--im-target-json <json>', 'IM target override JSON')
    .option('--project-id <projectId>', 'bind task to an existing project')
    .option('--authority-json <json>', 'task authority JSON')
    .option('--smoke-test', 'mark this task as smoke/test mode', false)
    .option('--skill <ref>', 'global skill ref', collectOption, [])
    .option('--role-skill <binding>', 'role-scoped skill ref (role=skill)', collectOption, [])
    .option('--controller <agentId>', 'controller agent override')
    .option('--bind <binding>', 'role binding override (role=agent)', collectOption, [])
    .action((title: string, options: {
      type: string;
      priority: TaskPriority;
      creator: string;
      locale: 'zh-CN' | 'en-US';
      teamJson?: string;
      workflowJson?: string;
      imTargetJson?: string;
      projectId?: string;
      authorityJson?: string;
      smokeTest?: boolean;
      skill?: string[];
      roleSkill?: string[];
      controller?: string;
      bind?: string[];
    }) => {
      const skillPolicy = buildSkillPolicy(options.skill, options.roleSkill);
      const input = createTaskRequestSchema.parse({
        title,
        type: options.type,
        creator: options.creator,
        description: '',
        priority: options.priority,
        locale: options.locale,
        ...(options.projectId ? { project_id: options.projectId } : {}),
        ...(options.authorityJson ? { authority: parseJsonOption(options.authorityJson, '--authority-json') } : {}),
        ...(options.teamJson ? { team_override: parseJsonOption(options.teamJson, '--team-json') } : {}),
        ...(options.workflowJson ? { workflow_override: parseJsonOption(options.workflowJson, '--workflow-json') } : {}),
        ...(options.imTargetJson ? { im_target: parseJsonOption(options.imTargetJson, '--im-target-json') } : {}),
        ...(skillPolicy ? { skill_policy: skillPolicy } : {}),
        ...(options.smokeTest ? { control: { mode: 'smoke_test' } } : {}),
      });
      const template = (() => {
        try {
          return templateAuthoringService.getTemplate(options.type);
        } catch {
          return null;
        }
      })();
      const task = taskService.createTask(applyTaskCreateOverrides(
        input,
        options.type,
        template,
        rolePackService,
        options.controller,
        parseRoleBindings(options.bind),
      ));
      writeLine(stdout, `任务已创建: ${task.id}`);
      writeLine(stdout, `标题: ${task.title}`);
      writeLine(stdout, `类型: ${task.type}`);
      writeLine(stdout, `Project: ${task.project_id ?? '-'}`);
      writeLine(stdout, `状态: ${task.state}`);
      writeLine(stdout, `阶段: ${task.current_stage ?? '-'}`);
    });

  const orchestrator = program
    .command('orchestrator')
    .description('orchestrator entry commands');

  orchestrator
    .command('direct-create')
    .description('create a task from an orchestrator confirmation payload')
    .requiredOption('--request-json <json>', 'direct-create request JSON')
    .action((options: { requestJson: string }) => {
      const request = parseJsonString(
        options.requestJson,
        '--request-json',
      ) as unknown as OrchestratorDirectCreateRequestDto;
      const service = new OrchestratorDirectCreateService({ taskService });
      const task = service.createFromConversationConfirmation(request);
      writeLine(stdout, `任务已创建: ${task.id}`);
      writeLine(stdout, `标题: ${task.title}`);
      writeLine(stdout, `类型: ${task.type}`);
      writeLine(stdout, `Project: ${task.project_id ?? '-'}`);
      writeLine(stdout, `状态: ${task.state}`);
      writeLine(stdout, `阶段: ${task.current_stage ?? '-'}`);
    });

  program
    .command('status')
    .description('查看任务状态详情')
    .argument('<taskId>', '任务 ID')
    .action((taskId: string) => {
      const status = taskService.getTaskStatus(taskId);
      const task = status.task;
      writeLine(stdout, `${task.id} — ${task.title}`);
      writeLine(stdout, `类型: ${task.type}`);
      writeLine(stdout, `优先级: ${task.priority}`);
      writeLine(stdout, `状态: ${task.state}`);
      writeLine(stdout, `阶段: ${task.current_stage ?? '-'}`);
      writeLine(stdout, `Flow Log: ${status.flow_log.length}`);
    });

  const regression = program
    .command('regression')
    .description('developer live regression commands');

  regression
    .command('live')
    .description('publish a live regression prompt into a bound task thread')
    .option('--task-id <taskId>', 'existing task id')
    .option('--title <title>', 'create a fresh regression task with this title')
    .option('--type <type>', 'task type for create mode', 'coding')
    .option('--priority <priority>', 'task priority for create mode', 'normal')
    .option('--creator <creator>', 'task creator for create mode', 'archon')
    .option('--locale <locale>', 'task locale for create mode (zh-CN|en-US)', 'zh-CN')
    .option('--team-json <json>', 'team override JSON for create mode')
    .option('--workflow-json <json>', 'workflow override JSON for create mode')
    .option('--im-target-json <json>', 'IM target override JSON for create mode')
    .option('--project-id <projectId>', 'bind create-mode regression task to an existing project')
    .option('--controller <agentId>', 'controller agent override for create mode')
    .option('--bind <binding>', 'role binding override for create mode (role=agent)', collectOption, [])
    .requiredOption('--goal <goal>', 'regression goal')
    .option('--message <text>', 'prompt text')
    .option('--body-file <path>', 'prompt text file')
    .option('--participant <ref>', 'participant ref to mention', collectOption, [])
    .option('--action <kind>', 'optional fallback task action')
    .option('--action-actor <actor>', 'actor id used for the fallback action')
    .option('--next-stage-id <id>', 'branch target for advance_current')
    .option('--comment <text>', 'comment for approve/confirm actions')
    .option('--reason <text>', 'reason for reject actions')
    .option('--vote <vote>', 'vote for confirm_current (approve|reject)')
    .option('--wait-stage <stage>', 'wait until the task reaches this stage')
    .option('--wait-state <state>', 'wait until the task reaches this state')
    .option('--wait-body-includes <text>', 'wait until the latest conversation contains this text')
    .option('--wait-timeout-ms <ms>', 'overall observation timeout in milliseconds')
    .option('--wait-poll-ms <ms>', 'observation poll interval in milliseconds')
    .option('--json', 'emit JSON', false)
    .action(async (options: {
      taskId?: string;
      title?: string;
      type: string;
      priority: TaskPriority;
      creator: string;
      locale: 'zh-CN' | 'en-US';
      teamJson?: string;
      workflowJson?: string;
      imTargetJson?: string;
      projectId?: string;
      controller?: string;
      bind?: string[];
      goal: string;
      message?: string;
      bodyFile?: string;
      participant?: string[];
      action?: string;
      actionActor?: string;
      nextStageId?: string;
      comment?: string;
      reason?: string;
      vote?: 'approve' | 'reject';
      waitStage?: string;
      waitState?: string;
      waitBodyIncludes?: string;
      waitTimeoutMs?: string;
      waitPollMs?: string;
      json?: boolean;
    }) => {
      if (!isDeveloperRegressionEnabled(process.env)) {
        throw new CliError(
          'AGORA_DEV_REGRESSION_MODE is not enabled.',
          'usage',
          CLI_EXIT_CODES.usage,
          'Set AGORA_DEV_REGRESSION_MODE=true before running developer live regression commands.',
        );
      }
      const imProvisioningPort = getImProvisioningPort();
      if (!imProvisioningPort) {
        throw new Error('IM provisioning port is not configured');
      }
      if ((options.taskId ? 1 : 0) + (options.title ? 1 : 0) !== 1) {
        throw new Error('regression live requires exactly one target: --task-id or --title');
      }
      const message = readTextOption(options.message, options.bodyFile, 'regression live').trim();
      if (!message) {
        throw new Error('regression live requires --message or --body-file');
      }
      const taskAction = options.action
        ? {
            kind: options.action as 'approve_current' | 'reject_current' | 'advance_current' | 'confirm_current',
            actor_ref: options.actionActor ?? '',
            ...(options.nextStageId ? { next_stage_id: options.nextStageId } : {}),
            ...(options.comment ? { comment: options.comment } : {}),
            ...(options.reason ? { reason: options.reason } : {}),
            ...(options.vote ? { vote: options.vote } : {}),
          }
        : undefined;
      const waitFor = (
        options.waitStage
        || options.waitState
        || options.waitBodyIncludes
        || options.waitTimeoutMs
        || options.waitPollMs
      )
        ? {
            ...(options.waitStage ? { currentStage: options.waitStage } : {}),
            ...(options.waitState ? { state: options.waitState } : {}),
            ...(options.waitBodyIncludes ? { latestConversationBodyIncludes: options.waitBodyIncludes } : {}),
            ...(options.waitTimeoutMs ? { timeoutMs: Number(options.waitTimeoutMs) } : {}),
            ...(options.waitPollMs ? { pollIntervalMs: Number(options.waitPollMs) } : {}),
          }
        : undefined;
      if (taskAction && !taskAction.actor_ref) {
        throw new Error('--action-actor is required when --action is provided');
      }
      const actor = new LiveRegressionActor({
        taskService,
        taskContextBindingService,
        taskConversationService,
        imProvisioningPort,
      });
      const target = options.taskId
        ? { taskId: options.taskId }
        : (() => {
            const input = createTaskRequestSchema.parse({
              title: options.title,
              type: options.type,
              creator: options.creator,
              description: '',
              priority: options.priority,
              locale: options.locale,
              ...(options.projectId ? { project_id: options.projectId } : {}),
              ...(options.teamJson ? { team_override: parseJsonOption(options.teamJson, '--team-json') } : {}),
              ...(options.workflowJson ? { workflow_override: parseJsonOption(options.workflowJson, '--workflow-json') } : {}),
              ...(options.imTargetJson ? { im_target: parseJsonOption(options.imTargetJson, '--im-target-json') } : {}),
              control: { mode: 'regression_test' },
            });
            const template = (() => {
              try {
                return templateAuthoringService.getTemplate(options.type);
              } catch {
                return null;
              }
            })();
            return {
              createTask: applyTaskCreateOverrides(
                input,
                options.type,
                template,
                rolePackService,
                options.controller,
                parseRoleBindings(options.bind),
              ),
            };
          })();
      const result = await actor.run({
        target,
        actorRef: 'agora-bot',
        displayName: 'AgoraBot',
        goal: options.goal,
        message,
        ...(options.participant ? { participantRefs: options.participant } : {}),
        ...(taskAction ? { taskAction } : {}),
        ...(waitFor ? { waitFor } : {}),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, `Regression task: ${result.taskId}`);
      writeLine(stdout, `Thread: ${result.threadRef ?? '-'}`);
      writeLine(stdout, `State: ${result.state}`);
      writeLine(stdout, `Stage: ${result.currentStage ?? '-'}`);
      writeLine(stdout, `Conversation Entry: ${result.conversationEntryId ?? '-'}`);
      writeLine(stdout, `Goal Satisfied: ${result.goalSatisfied}`);
      writeLine(stdout, `Timed Out: ${result.timedOut}`);
    });

  const roles = program
    .command('roles')
    .description('Agora role pack commands');

  roles
    .command('list')
    .description('列出 canonical roles')
    .option('--json', '输出 JSON', false)
    .action((options: { json?: boolean }) => {
      const items = rolePackService.listRoleDefinitions();
      if (options.json) {
        writeLine(stdout, JSON.stringify(items, null, 2));
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.id}\t${item.member_kind}\t${item.source}\t${item.prompt_asset_path}`);
      }
    });

  roles
    .command('show')
    .description('查看单个 role')
    .argument('<roleId>', 'role id')
    .option('--json', '输出 JSON', false)
    .action((roleId: string, options: { json?: boolean }) => {
      const role = rolePackService.getRoleDefinition(roleId);
      if (!role) {
        throw new Error(`role not found: ${roleId}`);
      }
      if (options.json) {
        writeLine(stdout, JSON.stringify(role, null, 2));
        return;
      }
      writeLine(stdout, `${role.id} — ${role.name}`);
      writeLine(stdout, `kind: ${role.member_kind}`);
      writeLine(stdout, `source: ${role.source}`);
      writeLine(stdout, `prompt: ${role.prompt_asset_path}`);
      writeLine(stdout, `summary: ${role.summary}`);
    });

  const bindings = program
    .command('bindings')
    .description('Agora role binding commands');

  bindings
    .command('list')
    .description('按 scope 列出绑定')
    .requiredOption('--scope <scope>', 'workspace|template|task')
    .requiredOption('--ref <scopeRef>', 'scope ref')
    .option('--json', '输出 JSON', false)
    .action((options: { scope: 'workspace' | 'template' | 'task'; ref: string; json?: boolean }) => {
      const items = rolePackService.listBindingsByScope(options.scope, options.ref);
      if (options.json) {
        writeLine(stdout, JSON.stringify(items, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, '没有找到 bindings');
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.role_id}\t${item.scope}:${item.scope_ref}\t${item.target_kind}\t${item.target_adapter}:${item.target_ref}`);
      }
    });

  bindings
    .command('set')
    .description('设置 role binding')
    .requiredOption('--scope <scope>', 'workspace|template|task')
    .requiredOption('--ref <scopeRef>', 'scope ref')
    .requiredOption('--role <roleId>', 'role id')
    .requiredOption('--target-kind <targetKind>', 'runtime_agent|craftsman_executor')
    .requiredOption('--target-adapter <targetAdapter>', 'target adapter')
    .requiredOption('--target-ref <targetRef>', 'target ref')
    .option('--binding-mode <bindingMode>', 'overlay|generated', 'overlay')
    .option('--id <id>', 'binding id')
    .action((options: {
      scope: 'workspace' | 'template' | 'task';
      ref: string;
      role: string;
      targetKind: 'runtime_agent' | 'craftsman_executor';
      targetAdapter: string;
      targetRef: string;
      bindingMode: 'overlay' | 'generated';
      id?: string;
    }) => {
      const binding = rolePackService.saveBinding({
        id: options.id ?? `binding-${Date.now()}`,
        role_id: options.role,
        scope: options.scope,
        scope_ref: options.ref,
        target_kind: options.targetKind,
        target_adapter: options.targetAdapter,
        target_ref: options.targetRef,
        binding_mode: options.bindingMode,
      });
      writeLine(stdout, `binding 已设置: ${binding.role_id} -> ${binding.target_adapter}:${binding.target_ref}`);
    });

  const templates = program
    .command('templates')
    .description('template authoring commands');
  const projects = program
    .command('projects')
    .description('project thin-slice commands');
  const nomos = program
    .command('nomos')
    .description('Nomos pack and project-state commands');
  const skills = program
    .command('skills')
    .description('local skill catalog commands');
  const citizens = program
    .command('citizens')
    .description('citizen definition and projection preview commands');
  const context = program
    .command('context')
    .description('project-scoped unified context retrieval commands');

  const graph = program
    .command('graph')
    .description('workflow graph commands');
  const archive = program
    .command('archive')
    .description('archive control commands');

  addRedirectCommand(program, 'users', 'agora dashboard users', [
    'agora dashboard users list',
    'agora dashboard users add --username alice --password secret',
  ]);

  templates
    .command('show')
    .description('查看模板详情')
    .argument('<templateId>', 'template id')
    .option('--json', '输出 JSON', false)
    .action((templateId: string, options: { json?: boolean }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(template, null, 2));
        return;
      }
      writeLine(stdout, `${templateId} — ${template.name}`);
      writeLine(stdout, `roles: ${Object.keys(template.defaultTeam ?? {}).join(', ') || '-'}`);
      writeLine(stdout, `stages: ${(template.stages ?? []).map((stage) => stage.id).join(' -> ') || '-'}`);
    });

  nomos
    .command('list')
    .description('列出当前可用的 Nomos packs')
    .option('--json', '输出 JSON', false)
    .action((options: { json?: boolean }) => {
      const packs = [{
        ...BUILT_IN_AGORA_NOMOS_PACK,
        lifecycle_modules: [...NOMOS_LIFECYCLE_MODULES],
        shim_sections: [...REPO_AGENTS_SHIM_SECTION_ORDER],
      }];
      if (options.json) {
        writeLine(stdout, JSON.stringify({ nomos: packs }, null, 2));
        return;
      }
      for (const pack of packs) {
        writeLine(stdout, `${pack.id}\t${pack.version}\t${pack.name}`);
      }
    });

  nomos
    .command('show')
    .description('查看 Nomos pack 详情')
    .argument('[nomosId]', 'Nomos pack id', DEFAULT_AGORA_NOMOS_ID)
    .option('--json', '输出 JSON', false)
    .action((nomosId: string, options: { json?: boolean }) => {
      const supportedNomosId = requireSupportedNomosId(nomosId);
      const profile = buildBuiltInAgoraNomosProjectProfile('__preview__');
      const payload = {
        id: supportedNomosId,
        pack: profile.pack,
        repository_shim: profile.repository_shim,
        project_state: profile.project_state,
        bootstrap: profile.bootstrap,
        docs: profile.docs,
        lifecycle: profile.lifecycle,
        doctor: profile.doctor,
        seeded_assets: buildBuiltInAgoraNomosSeededAssets(),
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, `${payload.pack.id} — ${payload.pack.name}`);
      writeLine(stdout, `version: ${payload.pack.version}`);
      writeLine(stdout, `install_mode: ${payload.pack.install_mode}`);
      writeLine(stdout, `project_state_root: ${payload.project_state.root_template}`);
      writeLine(stdout, `lifecycle: ${payload.lifecycle.modules.join(', ')}`);
      writeLine(stdout, `shim sections: ${payload.repository_shim.required_sections.join(', ')}`);
      writeLine(stdout, `seeded references: ${payload.seeded_assets.docs.reference.join(', ')}`);
      writeLine(stdout, `seeded lifecycle docs: ${payload.seeded_assets.lifecycle.join(', ')}`);
      writeLine(stdout, `seeded bootstrap prompts: ${payload.seeded_assets.prompts.bootstrap.join(', ')}`);
    });

  nomos
    .command('scaffold')
    .description('生成一个可分享的自定义 Nomos pack 骨架')
    .requiredOption('--id <packId>', 'pack id, e.g. acme/web')
    .requiredOption('--name <name>', 'pack display name')
    .requiredOption('--description <description>', 'pack description')
    .requiredOption('--output-dir <path>', 'output directory for the generated pack')
    .option('--version <version>', 'pack version', '0.1.0')
    .option('--module <module>', 'lifecycle module to include', collectStringOption, [])
    .option('--doctor-check <check>', 'doctor check to include', collectStringOption, [])
    .option('--json', '输出 JSON', false)
    .action((options: {
      id: string;
      name: string;
      description: string;
      outputDir: string;
      version?: string;
      module?: string[];
      doctorCheck?: string[];
      json?: boolean;
    }) => {
      const lifecycleModules = (options.module?.length ?? 0) > 0
        ? options.module!.map((module) => module.trim()).map((module) => {
          if (!NOMOS_LIFECYCLE_MODULES.includes(module as (typeof NOMOS_LIFECYCLE_MODULES)[number])) {
            throw new Error(`Unsupported Nomos lifecycle module: ${module}`);
          }
          return module as (typeof NOMOS_LIFECYCLE_MODULES)[number];
        })
        : [...DEFAULT_CUSTOM_NOMOS_PACK_LIFECYCLE_MODULES];
      const doctorChecks = (options.doctorCheck?.length ?? 0) > 0
        ? options.doctorCheck!.map((check) => check.trim())
        : [...DEFAULT_CUSTOM_NOMOS_PACK_DOCTOR_CHECKS];
      const installedTemplateDir = resolveInstalledCreateNomosPackTemplateDir();
      const bundledTemplateDir = resolve(CLI_REPO_ROOT, '.skills', 'create-nomos', 'assets', 'pack-template');
      const templateDir = existsSync(installedTemplateDir) ? installedTemplateDir : bundledTemplateDir;

      const scaffolded = scaffoldNomosPack({
        outputDir: options.outputDir,
        templateDir,
        id: options.id,
        name: options.name,
        description: options.description,
        lifecycleModules,
        doctorChecks,
        ...(options.version ? { version: options.version } : {}),
      });

      if (options.json) {
        writeLine(stdout, JSON.stringify({
          pack_id: options.id,
          pack_name: options.name,
          version: options.version ?? '0.1.0',
          output_dir: scaffolded.outputDir,
          profile_path: scaffolded.profilePath,
          constitution_path: scaffolded.constitutionPath,
          readme_path: scaffolded.readmePath,
          template_dir: templateDir,
          lifecycle_modules: lifecycleModules,
          doctor_checks: doctorChecks,
        }, null, 2));
        return;
      }

      writeLine(stdout, `Nomos pack 已生成: ${options.name}`);
      writeLine(stdout, `Pack: ${options.id}@${options.version ?? '0.1.0'}`);
      writeLine(stdout, `Output Dir: ${scaffolded.outputDir}`);
      writeLine(stdout, `Profile: ${scaffolded.profilePath}`);
      writeLine(stdout, `Template: ${templateDir}`);
    });

  nomos
    .command('inspect-project')
    .description('查看某个 project 的 Nomos 安装状态')
    .argument('<projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: { json?: boolean }) => {
      const project = projectService.requireProject(projectId);
      const payload = {
        ...resolveProjectNomosState(project.id, project.metadata ?? null),
        project_name: project.name,
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, `${payload.project_id} — ${payload.project_name}`);
      writeLine(stdout, `nomos: ${payload.nomos_id}`);
      writeLine(stdout, `activation_status: ${payload.activation_status}`);
      writeLine(stdout, `project_state_root: ${payload.project_state_root}`);
      writeLine(stdout, `profile_installed: ${payload.profile_installed}`);
      writeLine(stdout, `repo_path: ${payload.repo_path ?? '-'}`);
      writeLine(stdout, `repo_shim_installed: ${payload.repo_shim_installed}`);
      writeLine(stdout, `bootstrap_prompts_dir: ${payload.bootstrap_prompts_dir}`);
      writeLine(stdout, `draft_root: ${payload.draft_root}`);
      writeLine(stdout, `active_root: ${payload.active_root}`);
    });

  nomos
    .command('list-published')
    .description('列出本机 local catalog 中已发布的 Nomos pack')
    .option('--json', '输出 JSON', false)
    .action((options: { json?: boolean }) => {
      const listed = listPublishedNomosCatalog();
      if (options.json) {
        writeLine(stdout, JSON.stringify(listed, null, 2));
        return;
      }
      writeLine(stdout, `catalog_root: ${listed.catalog_root}`);
      writeLine(stdout, `total: ${listed.total}`);
      if (listed.entries.length === 0) {
        writeLine(stdout, 'entries: 0');
        return;
      }
      for (const entry of listed.entries) {
        const trust = assessPublishedNomosCatalogEntryTrust(entry);
        writeLine(stdout, `${entry.pack_id} — ${entry.pack.version} [${entry.source_kind}] (${entry.source_project_id}/${entry.source_target}) trust=${trust.trust_state} freshness=${trust.freshness_state} activate=${trust.activation_eligibility}`);
      }
    });

  nomos
    .command('show-published')
    .description('查看 local catalog 中某个已发布的 Nomos pack')
    .argument('<packId>', 'published pack id')
    .option('--json', '输出 JSON', false)
    .action((packId: string, options: { json?: boolean }) => {
      const entry = inspectPublishedNomosCatalogPack(packId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(entry, null, 2));
        return;
      }
      writeLine(stdout, `${entry.pack_id} — ${entry.pack.name}`);
      writeLine(stdout, `published_at: ${entry.published_at}`);
      writeLine(stdout, `source_kind: ${entry.source_kind}`);
      writeLine(stdout, `published_by: ${entry.published_by ?? '-'}`);
      writeLine(stdout, `source_project_id: ${entry.source_project_id}`);
      writeLine(stdout, `source_target: ${entry.source_target}`);
      writeLine(stdout, `source_activation_status: ${entry.source_activation_status}`);
      writeLine(stdout, `source_repo_path: ${entry.source_repo_path ?? '-'}`);
      writeLine(stdout, `published_note: ${entry.published_note ?? '-'}`);
      writeLine(stdout, `published_root: ${entry.published_root}`);
      const trust = assessPublishedNomosCatalogEntryTrust(entry);
      writeLine(stdout, `trust_state: ${trust.trust_state}`);
      writeLine(stdout, `freshness_state: ${trust.freshness_state}`);
      writeLine(stdout, `activation_eligibility: ${trust.activation_eligibility}`);
      writeLine(stdout, `trust_reasons: ${trust.reasons.join(' | ')}`);
    });

  nomos
    .command('export-bundle')
    .description('把 local catalog 中的已发布 Nomos pack 导出为可分享 bundle')
    .requiredOption('--pack-id <packId>', 'published pack id')
    .requiredOption('--output-dir <path>', 'output directory for share bundle')
    .option('--json', '输出 JSON', false)
    .action((options: { packId: string; outputDir: string; json?: boolean }) => {
      const exported = exportNomosShareBundle({
        packId: options.packId,
        outputDir: options.outputDir,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(exported, null, 2));
        return;
      }
      writeLine(stdout, `Nomos share bundle 已导出: ${exported.pack_id}`);
      writeLine(stdout, `output_dir: ${exported.output_dir}`);
      writeLine(stdout, `manifest_path: ${exported.manifest_path}`);
    });

  nomos
    .command('import-bundle')
    .description('把 share bundle 导入当前机器的 local catalog')
    .requiredOption('--source-dir <path>', 'bundle source directory')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceDir: string; json?: boolean }) => {
      const imported = importNomosShareBundle({
        sourceDir: options.sourceDir,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(imported, null, 2));
        return;
      }
      writeLine(stdout, `Nomos share bundle 已导入: ${imported.entry.pack_id}`);
      writeLine(stdout, `catalog_root: ${imported.entry.published_root}`);
    });

  nomos
    .command('sync-bundle')
    .description('重新同步 share bundle 到当前机器的 local catalog')
    .requiredOption('--source-dir <path>', 'bundle source directory')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceDir: string; json?: boolean }) => {
      const imported = importNomosShareBundle({
        sourceDir: options.sourceDir,
        replaceExisting: true,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(imported, null, 2));
        return;
      }
      writeLine(stdout, `Nomos share bundle 已同步: ${imported.entry.pack_id}`);
      writeLine(stdout, `catalog_root: ${imported.entry.published_root}`);
    });

  nomos
    .command('import-source')
    .description('把 external source（share bundle 或直接 pack root）导入当前机器的 local catalog')
    .requiredOption('--source-dir <path>', 'source directory')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceDir: string; json?: boolean }) => {
      const imported = importNomosSource({
        sourceDir: options.sourceDir,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(imported, null, 2));
        return;
      }
      writeLine(stdout, `Nomos source 已导入: ${imported.entry.pack_id}`);
      writeLine(stdout, `source_kind: ${imported.source_kind}`);
      writeLine(stdout, `catalog_root: ${imported.entry.published_root}`);
    });

  nomos
    .command('sync-source')
    .description('重新同步 external source（share bundle 或直接 pack root）到当前机器的 local catalog')
    .requiredOption('--source-dir <path>', 'source directory')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceDir: string; json?: boolean }) => {
      const imported = importNomosSource({
        sourceDir: options.sourceDir,
        replaceExisting: true,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(imported, null, 2));
        return;
      }
      writeLine(stdout, `Nomos source 已同步: ${imported.entry.pack_id}`);
      writeLine(stdout, `source_kind: ${imported.source_kind}`);
      writeLine(stdout, `catalog_root: ${imported.entry.published_root}`);
    });

  nomos
    .command('register-source')
    .description('把 external source 注册为可长期同步的 source descriptor')
    .requiredOption('--source-id <sourceId>', 'source descriptor id')
    .requiredOption('--source-dir <path>', 'source directory')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceId: string; sourceDir: string; json?: boolean }) => {
      const entry = registerNomosSource({
        sourceId: options.sourceId,
        sourceDir: options.sourceDir,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(entry, null, 2));
        return;
      }
      writeLine(stdout, `Nomos source 已注册: ${entry.source_id}`);
      writeLine(stdout, `source_kind: ${entry.source_kind}`);
      writeLine(stdout, `source_dir: ${entry.source_dir}`);
    });

  nomos
    .command('list-sources')
    .description('列出已注册的 Nomos sources')
    .option('--json', '输出 JSON', false)
    .action((options: { json?: boolean }) => {
      const listed = listRegisteredNomosSources();
      if (options.json) {
        writeLine(stdout, JSON.stringify(listed, null, 2));
        return;
      }
      writeLine(stdout, `registry_root: ${listed.registry_root}`);
      writeLine(stdout, `total: ${listed.total}`);
      if (listed.entries.length === 0) {
        writeLine(stdout, 'entries: 0');
        return;
      }
      for (const entry of listed.entries) {
        const trust = assessRegisteredNomosSourceTrust(entry);
        writeLine(stdout, `${entry.source_id} — ${entry.source_kind}/${entry.authority_kind} (${entry.last_sync_status}) trust=${trust.trust_state} freshness=${trust.freshness_state} activate=${trust.activation_eligibility}`);
      }
    });

  nomos
    .command('show-source')
    .description('查看已注册的 Nomos source descriptor')
    .argument('<sourceId>', 'registered source id')
    .option('--json', '输出 JSON', false)
    .action((sourceId: string, options: { json?: boolean }) => {
      const entry = inspectRegisteredNomosSource(sourceId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(entry, null, 2));
        return;
      }
      writeLine(stdout, `${entry.source_id} — ${entry.source_kind}`);
      writeLine(stdout, `source_dir: ${entry.source_dir}`);
      writeLine(stdout, `authority_kind: ${entry.authority_kind}`);
      writeLine(stdout, `authority_id: ${entry.authority_id ?? '-'}`);
      writeLine(stdout, `authority_label: ${entry.authority_label ?? '-'}`);
      writeLine(stdout, `last_sync_status: ${entry.last_sync_status}`);
      writeLine(stdout, `last_catalog_pack_id: ${entry.last_catalog_pack_id ?? '-'}`);
      const trust = assessRegisteredNomosSourceTrust(entry);
      writeLine(stdout, `trust_state: ${trust.trust_state}`);
      writeLine(stdout, `freshness_state: ${trust.freshness_state}`);
      writeLine(stdout, `activation_eligibility: ${trust.activation_eligibility}`);
      writeLine(stdout, `trust_reasons: ${trust.reasons.join(' | ')}`);
    });

  nomos
    .command('sync-registered-source')
    .description('同步已注册的 Nomos source 到当前机器的 local catalog')
    .requiredOption('--source-id <sourceId>', 'registered source id')
    .option('--json', '输出 JSON', false)
    .action((options: { sourceId: string; json?: boolean }) => {
      const synced = syncRegisteredNomosSource({
        sourceId: options.sourceId,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(synced, null, 2));
        return;
      }
      writeLine(stdout, `Nomos source 已同步: ${synced.source.source_id}`);
      writeLine(stdout, `source_kind: ${synced.source.source_kind}`);
      writeLine(stdout, `imported_source_kind: ${synced.imported.source_kind}`);
      writeLine(stdout, `pack_id: ${synced.imported.entry.pack_id}`);
    });

  nomos
    .command('export-project')
    .description('导出某个 project 当前的 draft/active Nomos pack 到本地目录')
    .argument('<projectId>', 'project id')
    .requiredOption('--output-dir <path>', 'output directory for exported pack')
    .option('--target <target>', 'export target: draft | active', 'draft')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: {
      outputDir: string;
      target?: 'draft' | 'active';
      json?: boolean;
    }) => {
      const project = projectService.requireProject(projectId);
      const exported = exportProjectNomosPack(project.id, project.metadata ?? null, {
        target: options.target === 'active' ? 'active' : 'draft',
        outputDir: options.outputDir,
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(exported, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos pack 已导出: ${project.id}`);
      writeLine(stdout, `target: ${exported.target}`);
      writeLine(stdout, `output_dir: ${exported.output_dir}`);
      writeLine(stdout, `pack_id: ${exported.pack?.pack_id ?? '-'}`);
    });

  nomos
    .command('publish-project')
    .description('把某个 project 当前的 draft/active Nomos pack 发布到本机 local catalog')
    .argument('<projectId>', 'project id')
    .option('--target <target>', 'publish target: draft | active', 'draft')
    .option('--actor <actor>', 'published by actor id')
    .option('--note <note>', 'publish note')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: { target?: 'draft' | 'active'; actor?: string; note?: string; json?: boolean }) => {
      const project = projectService.requireProject(projectId);
      const published = publishProjectNomosPack(project.id, project.metadata ?? null, {
        target: options.target === 'active' ? 'active' : 'draft',
        ...(options.actor ? { publishedBy: options.actor } : {}),
        ...(options.note ? { publishedNote: options.note } : {}),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(published, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos pack 已发布到 catalog: ${project.id}`);
      writeLine(stdout, `target: ${published.target}`);
      writeLine(stdout, `pack_id: ${published.entry.pack_id}`);
      writeLine(stdout, `published_by: ${published.entry.published_by ?? '-'}`);
      writeLine(stdout, `catalog_pack_root: ${published.catalog_pack_root}`);
    });

  nomos
    .command('install-pack')
    .description('把本地 Nomos pack 安装到某个 project 的 draft 槽位')
    .requiredOption('--project-id <projectId>', 'project id')
    .requiredOption('--pack-dir <path>', 'local pack directory')
    .option('--json', '输出 JSON', false)
    .action((options: {
      projectId: string;
      packDir: string;
      json?: boolean;
    }) => {
      const project = projectService.requireProject(options.projectId);
      const installed = installLocalNomosPackToProject(project.id, project.metadata ?? null, {
        packDir: options.packDir,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      if (options.json) {
        writeLine(stdout, JSON.stringify(installed, null, 2));
        return;
      }
      writeLine(stdout, `Nomos pack 已安装到 draft: ${project.id}`);
      writeLine(stdout, `pack_id: ${installed.pack.pack_id}`);
      writeLine(stdout, `installed_root: ${installed.installed_root}`);
    });

  nomos
    .command('install-from-catalog')
    .description('把 local catalog 中的已发布 Nomos pack 安装到某个 project 的 draft 槽位')
    .requiredOption('--project-id <projectId>', 'project id')
    .requiredOption('--pack-id <packId>', 'published pack id')
    .option('--json', '输出 JSON', false)
    .action((options: {
      projectId: string;
      packId: string;
      json?: boolean;
    }) => {
      const project = projectService.requireProject(options.projectId);
      const installed = installCatalogNomosPackToProject(project.id, project.metadata ?? null, {
        packId: options.packId,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      if (options.json) {
        writeLine(stdout, JSON.stringify(installed, null, 2));
        return;
      }
      writeLine(stdout, `Catalog Nomos pack 已安装到 draft: ${project.id}`);
      writeLine(stdout, `pack_id: ${installed.pack.pack_id}`);
      writeLine(stdout, `installed_root: ${installed.installed_root}`);
    });

  nomos
    .command('install-from-source')
    .description('从 share bundle source 直接导入并安装到某个 project 的 draft 槽位')
    .requiredOption('--project-id <projectId>', 'project id')
    .requiredOption('--source-dir <path>', 'bundle source directory')
    .option('--json', '输出 JSON', false)
    .action((options: {
      projectId: string;
      sourceDir: string;
      json?: boolean;
    }) => {
      const project = projectService.requireProject(options.projectId);
      const installed = installNomosFromSource(project.id, project.metadata ?? null, {
        sourceDir: options.sourceDir,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      if (options.json) {
        writeLine(stdout, JSON.stringify(installed, null, 2));
        return;
      }
      writeLine(stdout, `Nomos source 已导入并安装: ${project.id}`);
      writeLine(stdout, `source_kind: ${installed.imported.source_kind}`);
      writeLine(stdout, `pack_id: ${installed.pack.pack_id}`);
      writeLine(stdout, `installed_root: ${installed.installed_root}`);
    });

  nomos
    .command('install-from-registered-source')
    .description('从已注册 source 同步并安装到某个 project 的 draft 槽位')
    .requiredOption('--project-id <projectId>', 'project id')
    .requiredOption('--source-id <sourceId>', 'registered source id')
    .option('--json', '输出 JSON', false)
    .action((options: {
      projectId: string;
      sourceId: string;
      json?: boolean;
    }) => {
      const project = projectService.requireProject(options.projectId);
      const installed = installNomosFromRegisteredSource(project.id, project.metadata ?? null, {
        sourceId: options.sourceId,
      });
      projectService.updateProjectMetadata(project.id, installed.metadata);
      if (options.json) {
        writeLine(stdout, JSON.stringify(installed, null, 2));
        return;
      }
      writeLine(stdout, `Registered Nomos source 已同步并安装: ${project.id}`);
      writeLine(stdout, `source_id: ${installed.source.source_id}`);
      writeLine(stdout, `pack_id: ${installed.pack.pack_id}`);
      writeLine(stdout, `installed_root: ${installed.installed_root}`);
    });

  nomos
    .command('validate-project')
    .description('校验某个 project 的 Nomos pack 是否满足激活/运行时要求')
    .argument('<projectId>', 'project id')
    .option('--target <target>', 'validation target: draft | active', 'draft')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: { target?: 'draft' | 'active'; json?: boolean }) => {
      const project = projectService.requireProject(projectId);
      const validation = validateProjectNomos(project.id, project.metadata ?? null, {
        target: options.target === 'active' ? 'active' : 'draft',
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(validation, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos validation: ${project.id} (${validation.target})`);
      writeLine(stdout, `activation_status: ${validation.activation_status}`);
      writeLine(stdout, `valid: ${validation.valid}`);
      writeLine(stdout, `pack_id: ${validation.pack?.pack_id ?? '-'}`);
      writeLine(stdout, `profile_path: ${validation.pack?.profile_path ?? '-'}`);
      writeLine(stdout, `provenance_kind: ${validation.provenance?.kind ?? '-'}`);
      writeLine(stdout, `trust_state: ${validation.provenance?.trust_state ?? '-'}`);
      writeLine(stdout, `freshness_state: ${validation.provenance?.freshness_state ?? '-'}`);
      writeLine(stdout, `activation_eligibility: ${validation.provenance?.activation_eligibility ?? '-'}`);
      if (validation.issues.length > 0) {
        for (const issue of validation.issues) {
          writeLine(stdout, `${issue.severity}: ${issue.code}: ${issue.message}`);
        }
      }
    });

  nomos
    .command('diff-project')
    .description('比较某个 project 的 Nomos pack 差异')
    .argument('<projectId>', 'project id')
    .option('--base <base>', 'diff base: builtin | active', 'active')
    .option('--candidate <candidate>', 'diff candidate: draft | active', 'draft')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: {
      base?: 'builtin' | 'active';
      candidate?: 'draft' | 'active';
      json?: boolean;
    }) => {
      const project = projectService.requireProject(projectId);
      const diff = diffProjectNomos(project.id, project.metadata ?? null, {
        base: options.base === 'builtin' ? 'builtin' : 'active',
        candidate: options.candidate === 'active' ? 'active' : 'draft',
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(diff, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos diff: ${project.id}`);
      writeLine(stdout, `base: ${diff.base}`);
      writeLine(stdout, `candidate: ${diff.candidate}`);
      writeLine(stdout, `changed: ${diff.changed}`);
      writeLine(stdout, `base_pack: ${diff.base_pack?.pack_id ?? '-'}`);
      writeLine(stdout, `candidate_pack: ${diff.candidate_pack?.pack_id ?? '-'}`);
      for (const entry of diff.differences) {
        writeLine(stdout, `${entry.field}: ${JSON.stringify(entry.from)} -> ${JSON.stringify(entry.to)}`);
      }
    });

  nomos
    .command('review-project')
    .description('review 某个 project 当前的 draft Nomos 是否可激活')
    .argument('<projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: { json?: boolean }) => {
      const project = projectService.requireProject(projectId);
      const review = reviewProjectNomosDraft(project.id, project.metadata ?? null);
      if (options.json) {
        writeLine(stdout, JSON.stringify(review, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos draft review: ${project.id}`);
      writeLine(stdout, `activation_status: ${review.activation_status}`);
      writeLine(stdout, `can_activate: ${review.can_activate}`);
      writeLine(stdout, `draft_pack: ${review.draft?.pack_id ?? '-'}`);
      writeLine(stdout, `active_provenance_kind: ${review.active_provenance.kind}`);
      writeLine(stdout, `active_trust_state: ${review.active_provenance.trust_state}`);
      writeLine(stdout, `draft_provenance_kind: ${review.draft_provenance?.kind ?? '-'}`);
      writeLine(stdout, `draft_trust_state: ${review.draft_provenance?.trust_state ?? '-'}`);
      if (review.issues.length > 0) {
        writeLine(stdout, `issues: ${review.issues.join(' | ')}`);
      }
    });

  nomos
    .command('activate-project')
    .description('激活某个 project 当前的 draft Nomos')
    .requiredOption('--project-id <projectId>', 'project id')
    .requiredOption('--actor <actor>', 'activation actor')
    .option('--json', '输出 JSON', false)
    .action((options: { projectId: string; actor: string; json?: boolean }) => {
      const project = projectService.requireProject(options.projectId);
      const activation = activateProjectNomosDraft(project.id, {
        metadata: project.metadata ?? null,
        actor: options.actor,
      });
      projectService.updateProjectMetadata(project.id, activation.metadata);
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          project_id: activation.project_id,
          nomos_id: activation.nomos_id,
          activation_status: activation.activation_status,
          active_root: activation.active_root,
          active_profile_path: activation.active_profile_path,
          activated_at: activation.activated_at,
          activated_by: activation.activated_by,
        }, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos 已激活: ${activation.nomos_id}`);
      writeLine(stdout, `project_id: ${activation.project_id}`);
      writeLine(stdout, `activation_status: ${activation.activation_status}`);
      writeLine(stdout, `active_root: ${activation.active_root}`);
    });

  nomos
    .command('refine-project')
    .description('根据 project-nomos authoring spec 重写该 project 的 draft pack')
    .requiredOption('--project-id <projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action((options: { projectId: string; json?: boolean }) => {
      const refined = refineProjectNomosDraftFromSpec(options.projectId);
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          project_id: options.projectId,
          spec: refined.spec,
          draft_dir: refined.draftDir,
          draft_profile_path: refined.draftProfilePath,
        }, null, 2));
        return;
      }
      writeLine(stdout, `Project Nomos draft 已更新: ${options.projectId}`);
      writeLine(stdout, `Draft Dir: ${refined.draftDir}`);
      writeLine(stdout, `Profile: ${refined.draftProfilePath}`);
    });

  nomos
    .command('install')
    .description('为已有 project 安装或重装 built-in Nomos')
    .requiredOption('--project-id <projectId>', 'project id')
    .option('--repo-path <path>', 'bind to an existing or new repo path')
    .option('--initialize-repo', 'create the repo path if it does not exist and initialize git', false)
    .option('--force-write-repo-shim', 'overwrite repo-root AGENTS.md shim', false)
    .option('--skip-bootstrap-task', 'do not create a bootstrap task after install', false)
    .option('--creator <creator>', 'creator used for bootstrap task', 'archon')
    .option('--json', '输出 JSON', false)
    .action((options: {
      projectId: string;
      repoPath?: string;
      initializeRepo?: boolean;
      forceWriteRepoShim?: boolean;
      skipBootstrapTask?: boolean;
      creator?: string;
      json?: boolean;
    }) => {
      const project = projectService.requireProject(options.projectId);
      const preparedNomos = prepareProjectNomosInstall({
        projectId: project.id,
        projectName: project.name,
        projectOwner: project.owner,
        metadata: project.metadata ?? {},
        repoPath: options.repoPath,
        initializeRepo: options.initializeRepo ?? false,
        forceWriteRepoShim: options.forceWriteRepoShim ?? false,
      });
      projectService.updateProjectMetadata(project.id, preparedNomos.persistedMetadata);
      let bootstrapTaskId: string | null = null;
      if (!options.skipBootstrapTask && taskService) {
        const bootstrapTask = new ProjectBootstrapService({
          projectService,
          taskService,
        }).createHarnessBootstrapTask({
          project_id: project.id,
          project_name: project.name,
          creator: options.creator ?? project.owner ?? 'archon',
          repo_path: options.repoPath,
          project_state_root: preparedNomos.installedNomos.layout.root,
          nomos_id: preparedNomos.effectiveNomosState.nomos_id,
          project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
          project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
          bootstrap_prompt_path: preparedNomos.effectiveRuntimePaths.bootstrap_interview_prompt_path,
          bootstrap_mode: preparedNomos.bootstrapMode,
        });
        bootstrapTaskId = bootstrapTask.id;
      }
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          project_id: project.id,
          nomos: preparedNomos.installedNomos.profile.pack,
          project_state_root: preparedNomos.installedNomos.layout.root,
          repo_shim_path: preparedNomos.installedNomos.repoShimPath,
          repo_git_initialized: preparedNomos.installedNomos.repoGitInitialized,
          project_state_git_initialized: preparedNomos.installedNomos.projectStateGitInitialized,
          project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
          project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
          bootstrap_task_id: bootstrapTaskId,
        }, null, 2));
        return;
      }
      writeLine(stdout, `Nomos 已安装: ${preparedNomos.installedNomos.profile.pack.id}@${preparedNomos.installedNomos.profile.pack.version}`);
      writeLine(stdout, `Project: ${project.id}`);
      writeLine(stdout, `Project State: ${preparedNomos.installedNomos.layout.root}`);
      if (preparedNomos.installedNomos.repoShimPath) {
        writeLine(stdout, `Repo Shim: ${preparedNomos.installedNomos.repoShimPath}`);
      }
      writeLine(stdout, `Project Nomos Spec: ${preparedNomos.authoringDraft.specPath}`);
      writeLine(stdout, `Project Nomos Draft: ${preparedNomos.authoringDraft.draftDir}`);
      writeLine(stdout, `Repo Git Initialized: ${preparedNomos.installedNomos.repoGitInitialized}`);
      writeLine(stdout, `Project State Git Initialized: ${preparedNomos.installedNomos.projectStateGitInitialized}`);
      if (bootstrapTaskId) {
        writeLine(stdout, `Bootstrap Task: ${bootstrapTaskId}`);
      }
    });

  projects
    .command('list')
    .description('列出 projects')
    .option('--status <status>', 'active|archived')
    .option('--json', '输出 JSON', false)
    .action((options: { status?: string; json?: boolean }) => {
      const items = projectService.listProjects(options.status);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ projects: items }, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, '没有找到 projects');
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.id}\t${item.status}\t${item.name}\t${item.owner ?? '-'}`);
      }
    });

  projects
    .command('archive')
    .description('归档 project')
    .argument('<projectId>', 'project id')
    .action((projectId: string) => {
      const project = projectService.archiveProject(projectId);
      writeLine(stdout, `Project 已归档: ${project.id}`);
      writeLine(stdout, `状态: ${project.status}`);
    });

  projects
    .command('delete')
    .description('删除 project')
    .argument('<projectId>', 'project id')
    .action((projectId: string) => {
      projectService.deleteProject(projectId);
      writeLine(stdout, `Project 已删除: ${projectId}`);
    });

  projects
    .command('create')
    .description('创建 project，并走 Nomos-first 安装/bootstrap 流程')
    .requiredOption('--id <projectId>', 'project id')
    .requiredOption('--name <name>', 'project name')
    .option('--summary <summary>', 'project summary')
    .option('--owner <owner>', 'project owner')
    .option('--admin-account-id <accountId>', 'project admin account id', collectStringOption, [])
    .option('--member-account-id <accountId>', 'project member account id', collectStringOption, [])
    .option('--repo-path <path>', 'bind to an existing or new repo path')
    .option('--new-repo', 'create the repo path if it does not exist and initialize git', false)
    .option('--nomos-id <nomosId>', 'Nomos pack id (currently only agora/default)', DEFAULT_AGORA_NOMOS_ID)
    .option('--metadata-json <json>', 'project metadata JSON')
    .action((options: {
      id: string;
      name: string;
      summary?: string;
      owner?: string;
      adminAccountId?: string[];
      memberAccountId?: string[];
      repoPath?: string;
      newRepo?: boolean;
      nomosId?: string;
      metadataJson?: string;
    }) => {
      const nomosId = requireSupportedNomosId(options.nomosId);
      const adminAccountIds = parseNumericOptionList(options.adminAccountId, '--admin-account-id');
      const memberAccountIds = parseNumericOptionList(options.memberAccountId, '--member-account-id');
      const derivedOwner = options.owner
        ?? (adminAccountIds[0] ? resolveAccountLabel(humanAccountService, adminAccountIds[0]) : undefined);
      const input = createProjectRequestSchema.parse({
        id: options.id,
        name: options.name,
        ...(options.summary !== undefined ? { summary: options.summary } : {}),
        ...(derivedOwner !== undefined ? { owner: derivedOwner } : {}),
        ...(adminAccountIds.length > 0 ? { admins: adminAccountIds.map((account_id) => ({ account_id })) } : {}),
        ...(memberAccountIds.length > 0 ? { members: memberAccountIds.map((account_id) => ({ account_id, role: 'member' as const })) } : {}),
        ...(options.repoPath ? { repo_path: options.repoPath } : {}),
        ...(options.newRepo ? { initialize_repo: true } : {}),
        nomos_id: nomosId,
        ...(options.metadataJson ? { metadata: parseJsonOption(options.metadataJson, '--metadata-json') } : {}),
      }) satisfies CreateProjectInputLike;
      const project = projectService.createProject(input);
      const preparedNomos = prepareProjectNomosInstall({
        projectId: project.id,
        projectName: project.name,
        projectOwner: project.owner,
        metadata: input.metadata ?? {},
        repoPath: input.repo_path,
        initializeRepo: input.initialize_repo ?? false,
      });
      projectService.updateProjectMetadata(project.id, preparedNomos.persistedMetadata);
      const bootstrapTask = taskService
        ? new ProjectBootstrapService({
          projectService,
          taskService,
        }).createHarnessBootstrapTask({
          project_id: project.id,
          project_name: project.name,
          creator: project.owner ?? 'archon',
          repo_path: input.repo_path,
          project_state_root: preparedNomos.installedNomos.layout.root,
          nomos_id: preparedNomos.nomosState.nomos_id,
          project_nomos_spec_path: preparedNomos.authoringDraft.specPath,
          project_nomos_draft_root: preparedNomos.authoringDraft.draftDir,
          bootstrap_prompt_path: preparedNomos.runtimePaths.bootstrap_interview_prompt_path,
          bootstrap_mode: preparedNomos.bootstrapMode,
        })
        : null;
      writeLine(stdout, `Project 已创建: ${project.id}`);
      writeLine(stdout, `名称: ${project.name}`);
      writeLine(stdout, `状态: ${project.status}`);
      writeLine(stdout, `Nomos: ${preparedNomos.installedNomos.profile.pack.id}@${preparedNomos.installedNomos.profile.pack.version}`);
      writeLine(stdout, `Project State: ${preparedNomos.installedNomos.layout.root}`);
      if (preparedNomos.installedNomos.repoShimPath) {
        writeLine(stdout, `Repo Shim: ${preparedNomos.installedNomos.repoShimPath}`);
      }
      writeLine(stdout, `Project Nomos Spec: ${preparedNomos.authoringDraft.specPath}`);
      writeLine(stdout, `Project Nomos Draft: ${preparedNomos.authoringDraft.draftDir}`);
      if (bootstrapTask) {
        writeLine(stdout, `Bootstrap Task: ${bootstrapTask.id}`);
      }
    });

  const projectMembers = projects
    .command('members')
    .description('project membership commands');

  projectMembers
    .command('list')
    .argument('<projectId>', 'project id')
    .action((projectId: string) => {
      const memberships = projectService.listProjectMemberships(projectId);
      if (memberships.length === 0) {
        writeLine(stdout, '没有找到 project members');
        return;
      }
      for (const membership of memberships) {
        writeLine(
          stdout,
          `${membership.account_id}\t${resolveAccountLabel(humanAccountService, membership.account_id)}\t${membership.role}\t${membership.status}`,
        );
      }
    });

  projectMembers
    .command('add')
    .argument('<projectId>', 'project id')
    .requiredOption('--account-id <accountId>', 'human account id')
    .option('--role <role>', 'admin|member', 'member')
    .action((projectId: string, options: { accountId: string; role?: 'admin' | 'member' }) => {
      const accountId = parseRequiredNumericOption(options.accountId, '--account-id');
      const membership = projectService.addProjectMembership({
        projectId,
        account_id: accountId,
        role: options.role === 'admin' ? 'admin' : 'member',
      });
      writeLine(stdout, `Project member 已添加: ${resolveAccountLabel(humanAccountService, membership.account_id)}`);
      writeLine(stdout, `${membership.account_id}\t${membership.role}\t${membership.status}`);
    });

  projectMembers
    .command('remove')
    .argument('<projectId>', 'project id')
    .requiredOption('--account-id <accountId>', 'human account id')
    .action((projectId: string, options: { accountId: string }) => {
      const accountId = parseRequiredNumericOption(options.accountId, '--account-id');
      const membership = projectService.removeProjectMembership(projectId, accountId);
      writeLine(stdout, `Project member 已移除: ${resolveAccountLabel(humanAccountService, membership.account_id)}`);
      writeLine(stdout, `${membership.account_id}\t${membership.role}\t${membership.status}`);
    });

  projects
    .command('show')
    .description('查看 project index 与 recent recaps')
    .argument('<projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action((projectId: string, options: { json?: boolean }) => {
      const project = projectService.requireProject(projectId);
      const index = projectService.getProjectIndex(projectId);
      const recaps = projectService.listProjectRecaps(projectId);
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          project,
          index,
          recaps,
        }, null, 2));
        return;
      }
      writeLine(stdout, `${project.id} — ${project.name}`);
      writeLine(stdout, `status: ${project.status}`);
      writeLine(stdout, `owner: ${project.owner ?? '-'}`);
      writeLine(stdout, `index: ${index?.path ?? '-'}`);
      writeLine(stdout, `recaps: ${recaps.length}`);
      if (index?.content) {
        writeLine(stdout, '');
        writeLine(stdout, index.content.trimEnd());
      }
    });

  skills
    .command('list')
    .description('列出本机可解析的 skills')
    .option('--json', '输出 JSON', false)
    .action((options: { json?: boolean }) => {
      const items = dashboardQueryService.listSkills();
      if (options.json) {
        writeLine(stdout, JSON.stringify({ skills: items }, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, '没有找到 skills');
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.skill_ref}\t${item.source_label}\t${item.relative_path}\t${item.resolved_path}`);
      }
    });

  const projectKnowledge = projects
    .command('knowledge')
    .description('project knowledge CRUD');
  const projectBrain = projects
    .command('brain')
    .description('project brain query / append commands');

  context
    .command('retrieve')
    .description('通过统一 retrieval surface 检索 project context')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--query <query>', 'search query')
    .option('--task <taskId>', 'optional task id for task-aware lookup')
    .option('--audience <audience>', 'controller|citizen|craftsman')
    .option('--mode <mode>', 'lookup|task_context')
    .option('--provider <provider>', 'limit retrieval providers', collectOption, [])
    .option('--source <sourceId>', 'limit retrieval source ids', collectOption, [])
    .option('--limit <n>', 'max result count', parseIntegerOption)
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project: string;
      query: string;
      task?: string;
      audience?: 'controller' | 'citizen' | 'craftsman';
      mode?: string;
      provider?: string[];
      source?: string[];
      limit?: number;
      json?: boolean;
    }) => {
      const retrievalService = getContextRetrievalService();
      const mode = options.task ? (options.mode ?? 'task_context') : (options.mode ?? 'lookup');
      const results = await retrievalService.retrieve({
        scope: 'project_context',
        mode,
        query: {
          text: options.query,
        },
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        context: {
          project_id: options.project,
          ...(options.task ? { task_id: options.task } : {}),
          ...(options.audience ? { audience: options.audience } : {}),
        },
        ...(options.provider && options.provider.length > 0 ? {
          metadata: {
            providers: options.provider,
            ...(options.source && options.source.length > 0 ? { source_ids: options.source } : {}),
          },
        } : {}),
        ...(!options.provider?.length && options.source?.length ? {
          metadata: {
            source_ids: options.source,
          },
        } : {}),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          scope: 'project_context',
          mode,
          results,
        }, null, 2));
        return;
      }
      if (results.length === 0) {
        writeLine(stdout, '没有匹配结果');
        return;
      }
      for (const item of results) {
        writeLine(stdout, `${item.provider}\t${item.reference_key}\t${item.path}`);
        writeLine(stdout, `  ${item.preview}`);
      }
    });

  projectKnowledge
    .command('add')
    .description('新增或更新 project knowledge doc')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'decision|fact|open_question|reference')
    .requiredOption('--slug <slug>', 'knowledge doc slug')
    .requiredOption('--title <title>', 'knowledge doc title')
    .option('--summary <summary>', 'knowledge summary')
    .option('--body <body>', 'knowledge body')
    .option('--body-file <path>', 'load body from file')
    .option('--source-task <taskId>', 'source task id', collectOption, [])
    .action(async (options: {
      project: string;
      kind: 'decision' | 'fact' | 'open_question' | 'reference';
      slug: string;
      title: string;
      summary?: string;
      body?: string;
      bodyFile?: string;
      sourceTask?: string[];
    }) => {
      const body = readTextOption(options.body, options.bodyFile, 'projects knowledge add').trim();
      if (!body) {
        throw new Error('knowledge body is required');
      }
      const doc = projectService.upsertKnowledgeEntry({
        project_id: options.project,
        kind: options.kind,
        slug: options.slug,
        title: options.title,
        body,
        ...(options.summary !== undefined ? { summary: options.summary } : {}),
        ...(options.sourceTask && options.sourceTask.length > 0 ? { source_task_ids: options.sourceTask } : {}),
      });
      writeLine(stdout, `Knowledge 已写入: ${doc.path}`);
      writeLine(stdout, `kind: ${doc.kind}`);
      writeLine(stdout, `slug: ${doc.slug}`);
      await maybeDrainProjectBrainIndexJobs();
    });

  projectKnowledge
    .command('list')
    .description('列出 project knowledge docs')
    .requiredOption('--project <projectId>', 'project id')
    .option('--kind <kind>', 'decision|fact|open_question|reference')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind?: 'decision' | 'fact' | 'open_question' | 'reference';
      json?: boolean;
    }) => {
      const docs = projectService.listKnowledgeEntries(options.project, options.kind);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ knowledge: docs }, null, 2));
        return;
      }
      if (docs.length === 0) {
        writeLine(stdout, '没有找到 knowledge docs');
        return;
      }
      for (const doc of docs) {
        writeLine(stdout, `${doc.kind}\t${doc.slug}\t${doc.title ?? '-'}\t${doc.path}`);
      }
    });

  projectKnowledge
    .command('show')
    .description('查看单个 knowledge doc')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'decision|fact|open_question|reference')
    .requiredOption('--slug <slug>', 'knowledge doc slug')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind: 'decision' | 'fact' | 'open_question' | 'reference';
      slug: string;
      json?: boolean;
    }) => {
      const doc = projectService.getKnowledgeEntry(options.project, options.kind, options.slug);
      if (!doc) {
        throw new Error(`knowledge doc not found: ${options.kind}/${options.slug}`);
      }
      if (options.json) {
        writeLine(stdout, JSON.stringify(doc, null, 2));
        return;
      }
      writeLine(stdout, `${doc.kind}/${doc.slug}`);
      writeLine(stdout, `path: ${doc.path}`);
      writeLine(stdout, '');
      writeLine(stdout, doc.content.trimEnd());
    });

  projects
    .command('search')
    .description('搜索 project knowledge / recap / index / timeline')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--query <query>', 'search query')
    .option('--kind <kind>', 'decision|fact|open_question|reference|recap')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      query: string;
      kind?: 'decision' | 'fact' | 'open_question' | 'reference' | 'recap';
      json?: boolean;
    }) => {
      const results = projectService.searchProjectKnowledge(options.project, options.query, options.kind);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ results }, null, 2));
        return;
      }
      if (results.length === 0) {
        writeLine(stdout, '没有匹配结果');
        return;
      }
      for (const item of results) {
        writeLine(stdout, `${item.kind}\t${item.slug}\t${item.title ?? '-'}\t${item.path}`);
        writeLine(stdout, `  ${item.snippet}`);
      }
    });

  projectBrain
    .command('list')
    .description('列出 project brain docs')
    .requiredOption('--project <projectId>', 'project id')
    .option('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind?: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      json?: boolean;
    }) => {
      const docs = projectBrainService.listDocuments(options.project, options.kind);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ documents: docs }, null, 2));
        return;
      }
      if (docs.length === 0) {
        writeLine(stdout, '没有找到 brain docs');
        return;
      }
      for (const doc of docs) {
        writeLine(stdout, `${doc.kind}\t${doc.slug}\t${doc.title ?? '-'}\t${doc.path}`);
      }
    });

  projectBrain
    .command('show')
    .description('查看单个 project brain doc')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .option('--slug <slug>', 'doc slug; required for recap/knowledge/citizen_scaffold')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      slug?: string;
      json?: boolean;
    }) => {
      const doc = projectBrainService.getDocument(options.project, options.kind, options.slug);
      if (!doc) {
        throw new Error(`brain doc not found: ${options.kind}${options.slug ? `/${options.slug}` : ''}`);
      }
      if (options.json) {
        writeLine(stdout, JSON.stringify(doc, null, 2));
        return;
      }
      writeLine(stdout, `${doc.kind}/${doc.slug}`);
      writeLine(stdout, `path: ${doc.path}`);
      writeLine(stdout, '');
      writeLine(stdout, doc.content.trimEnd());
    });

  projectBrain
    .command('query')
    .description('搜索 project brain docs')
    .option('--project <projectId>', 'project id')
    .option('--task <taskId>', 'task id for task-aware query')
    .option('--audience <audience>', 'controller|citizen|craftsman', 'controller')
    .requiredOption('--query <query>', 'search query')
    .option('--mode <mode>', 'auto|hybrid|raw', 'raw')
    .option('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project?: string;
      task?: string;
      audience?: 'controller' | 'citizen' | 'craftsman';
      query: string;
      mode?: 'auto' | 'hybrid' | 'raw';
      kind?: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      json?: boolean;
    }) => {
      if (options.task) {
        const projectBrainRetrievalService = getProjectBrainRetrievalService();
        const shouldUseHybrid = options.mode !== 'raw' && !!projectBrainRetrievalService;
        if (shouldUseHybrid) {
          const results = await projectBrainRetrievalService.searchTaskContext({
            task_id: options.task,
            audience: options.audience ?? 'controller',
            query: options.query,
            max_results: 5,
          });
          if (options.json) {
            writeLine(stdout, JSON.stringify({
              retrieval_mode: results[0]?.retrieval_mode ?? 'hybrid',
              results,
            }, null, 2));
            return;
          }
          if (results.length === 0) {
            writeLine(stdout, '没有匹配结果');
            return;
          }
          for (const item of results) {
            writeLine(stdout, `${item.kind}\t${item.slug}\t${item.title ?? '-'}\t${item.path}`);
            writeLine(stdout, `  ${item.snippet}`);
          }
          return;
        }
        const task = taskService.getTask(options.task);
        if (!task?.project_id) {
          throw new Error(`task ${options.task} is not bound to a project`);
        }
        const rawResults = projectBrainService.queryDocuments(task.project_id, options.query, options.kind);
        const results = rawResults.map((result) => ({
          ...result,
          retrieval_mode: 'raw',
        }));
        if (options.json) {
          writeLine(stdout, JSON.stringify({ retrieval_mode: 'raw', results }, null, 2));
          return;
        }
        if (results.length === 0) {
          writeLine(stdout, '没有匹配结果');
          return;
        }
        for (const item of results) {
          writeLine(stdout, `${item.kind}\t${item.slug}\t${item.title ?? '-'}\t${item.path}`);
          writeLine(stdout, `  ${item.snippet}`);
        }
        return;
      }
      if (!options.project) {
        throw new Error('brain query requires either --project or --task');
      }
      const results = projectBrainService.queryDocuments(options.project, options.query, options.kind);
      if (options.json) {
        writeLine(stdout, JSON.stringify({
          retrieval_mode: 'raw',
          results: results.map((result) => ({
            ...result,
            retrieval_mode: 'raw',
          })),
        }, null, 2));
        return;
      }
      if (results.length === 0) {
        writeLine(stdout, '没有匹配结果');
        return;
      }
      for (const item of results) {
        writeLine(stdout, `${item.kind}\t${item.slug}\t${item.title ?? '-'}\t${item.path}`);
        writeLine(stdout, `  ${item.snippet}`);
      }
    });

  const projectBrainIndex = projectBrain
    .command('index')
    .description('project brain vector index management commands');

  projectBrainIndex
    .command('rebuild')
    .requiredOption('--project <projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action(async (options: { project: string; json?: boolean }) => {
      const projectBrainIndexService = getProjectBrainIndexService();
      if (projectBrainIndexService) {
        const result = await projectBrainIndexService.rebuildProjectIndex(options.project);
        if (options.json) {
          writeLine(stdout, JSON.stringify(result, null, 2));
          return;
        }
        writeLine(stdout, `project ${result.project_id} rebuilt: ${result.indexed_documents} docs / ${result.indexed_chunks} chunks`);
        return;
      }
      const payload = {
        project_id: options.project,
        status: 'not_wired',
        message: 'project brain index rebuild is not wired yet',
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, payload.message);
    });

  projectBrainIndex
    .command('sync')
    .requiredOption('--project <projectId>', 'project id')
    .option('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .option('--slug <slug>', 'doc slug')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind?: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      slug?: string;
      json?: boolean;
    }) => {
      const projectBrainIndexService = getProjectBrainIndexService();
      if (projectBrainIndexService) {
        return projectBrainIndexService.syncProjectIndex({
          project_id: options.project,
          ...(options.kind ? { kind: options.kind } : {}),
          ...(options.slug ? { slug: options.slug } : {}),
        }).then((result) => {
          if (options.json) {
            writeLine(stdout, JSON.stringify(result, null, 2));
            return;
          }
          writeLine(stdout, `project ${result.project_id} synced: ${result.indexed_documents} docs / ${result.indexed_chunks} chunks`);
        });
      }
      const payload = {
        project_id: options.project,
        kind: options.kind ?? null,
        slug: options.slug ?? null,
        status: 'not_wired',
        message: 'project brain index sync is not wired yet',
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, payload.message);
    });

  projectBrainIndex
    .command('status')
    .requiredOption('--project <projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action(async (options: { project: string; json?: boolean }) => {
      const projectBrainIndexService = getProjectBrainIndexService();
      if (projectBrainIndexService) {
        const result = await projectBrainIndexService.getProjectIndexStatus(options.project);
        if (options.json) {
          writeLine(stdout, JSON.stringify(result, null, 2));
          return;
        }
        writeLine(stdout, `provider=${result.provider} healthy=${result.healthy} chunks=${result.chunk_count ?? 0}`);
        return;
      }
      const payload = {
        project_id: options.project,
        status: 'not_wired',
        message: 'project brain index status is not wired yet',
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, payload.message);
    });

  const projectBrainChunk = projectBrain
    .command('chunk')
    .description('project brain chunk inspection commands');

  projectBrainChunk
    .command('inspect')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .requiredOption('--slug <slug>', 'doc slug')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      kind: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      slug: string;
      json?: boolean;
    }) => {
      const projectBrainIndexService = getProjectBrainIndexService();
      if (projectBrainIndexService) {
        return Promise.resolve(projectBrainIndexService.inspectDocumentChunks({
          project_id: options.project,
          kind: options.kind,
          slug: options.slug,
        })).then((result) => {
          if (options.json) {
            writeLine(stdout, JSON.stringify(result, null, 2));
            return;
          }
          writeLine(stdout, `chunks: ${result.chunks.length}`);
        });
      }
      const payload = {
        project_id: options.project,
        kind: options.kind,
        slug: options.slug,
        status: 'not_wired',
        message: 'project brain chunk inspection is not wired yet',
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, payload.message);
    });

  projectBrain
    .command('bootstrap-context')
    .description('生成 agent-facing project brain bootstrap context')
    .option('--project <projectId>', 'project id')
    .option('--task <taskId>', 'task id for task-aware bootstrap')
    .option('--audience <audience>', 'controller|citizen|craftsman', 'controller')
    .option('--citizen <citizenId>', 'citizen id for citizen-scoped bootstrap')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project?: string;
      task?: string;
      audience?: 'controller' | 'citizen' | 'craftsman';
      citizen?: string;
      json?: boolean;
    }) => {
      let projectId = options.project;
      let taskTitle: string | undefined;
      let taskDescription: string | undefined;
      let allowedCitizenIds: string[] = [];
      if (options.task) {
        const task = taskService.getTask(options.task);
        if (!task?.project_id) {
          throw new Error(`task ${options.task} is not bound to a project`);
        }
        projectId = task.project_id;
        taskTitle = task.title;
        taskDescription = task.description ?? undefined;
        allowedCitizenIds = task.team.members
          .filter((member) => member.member_kind === 'citizen')
          .map((member) => member.agentId);
      }
      if (!projectId) {
        throw new Error('brain bootstrap-context requires either --project or --task');
      }
      const bootstrapInput = {
        project_id: projectId,
        ...(options.task ? { task_id: options.task } : {}),
        ...(taskTitle ? { task_title: taskTitle } : {}),
        ...(taskDescription ? { task_description: taskDescription } : {}),
        ...(allowedCitizenIds.length > 0 ? { allowed_citizen_ids: allowedCitizenIds } : {}),
        audience: options.audience ?? 'controller',
        ...(options.citizen ? { citizen_id: options.citizen } : {}),
      };
      const context = options.task
        ? await projectBrainAutomationService.buildBootstrapContextAsync(bootstrapInput)
        : projectBrainAutomationService.buildBootstrapContext(bootstrapInput);
      if (options.json) {
        writeLine(stdout, JSON.stringify(context, null, 2));
        return;
      }
      writeLine(stdout, context.markdown.trimEnd());
    });

  projectBrain
    .command('doctor')
    .description('诊断 project brain embedding/vector/queue 状态')
    .requiredOption('--project <projectId>', 'project id')
    .option('--json', '输出 JSON', false)
    .action(async (options: { project: string; json?: boolean }) => {
      const doctorService = getProjectBrainDoctorService();
      if (doctorService) {
        const result = await doctorService.diagnoseProject(options.project);
        const nomosDiagnosis = projectService
          ? (() => {
            const project = projectService.requireProject(options.project);
            const state = resolveProjectNomosState(options.project, project.metadata ?? null);
            const runtimePaths = resolveProjectNomosRuntimePaths(options.project, project.metadata ?? null);
            return {
              runtime: {
                nomos_id: state.nomos_id,
                activation_status: state.activation_status,
                bootstrap_interview_prompt_path: runtimePaths.bootstrap_interview_prompt_path,
                closeout_review_prompt_path: runtimePaths.closeout_review_prompt_path,
                doctor_project_prompt_path: runtimePaths.doctor_project_prompt_path,
              },
              validation: {
                draft: validateProjectNomos(options.project, project.metadata ?? null, { target: 'draft' }),
                active: validateProjectNomos(options.project, project.metadata ?? null, { target: 'active' }),
              },
              provenance: {
                draft: resolveProjectNomosProvenance(options.project, project.metadata ?? null, { target: 'draft' }),
                active: resolveProjectNomosProvenance(options.project, project.metadata ?? null, { target: 'active' }),
              },
              diff: diffProjectNomos(options.project, project.metadata ?? null, {
                base: state.activation_status === 'active_project' ? 'active' : 'builtin',
                candidate: 'draft',
              }),
              drift: diagnoseProjectNomosDrift(options.project, project.metadata ?? null),
            };
          })()
          : null;
        const payload = nomosDiagnosis
          ? {
            ...result,
            nomos_runtime: nomosDiagnosis.runtime,
            nomos_validation: nomosDiagnosis.validation,
            nomos_provenance: nomosDiagnosis.provenance,
            nomos_diff: nomosDiagnosis.diff,
            nomos_drift: nomosDiagnosis.drift,
          }
          : result;
        if (options.json) {
          writeLine(stdout, JSON.stringify(payload, null, 2));
          return;
        }
        writeLine(stdout, `project=${result.project_id} db=${result.db_path}`);
        writeLine(stdout, `embedding configured=${result.embedding.configured} healthy=${result.embedding.healthy} provider=${result.embedding.provider} model=${result.embedding.model ?? '-'}`);
        writeLine(stdout, `vector configured=${result.vector_index.configured} healthy=${result.vector_index.healthy} provider=${result.vector_index.provider} chunks=${result.vector_index.chunk_count ?? 0}`);
        writeLine(stdout, `jobs pending=${result.jobs.pending} running=${result.jobs.running} failed=${result.jobs.failed} succeeded=${result.jobs.succeeded}`);
        writeLine(stdout, `drift detected=${result.drift.detected} documents_without_jobs=${result.drift.documents_without_jobs}`);
        if (nomosDiagnosis) {
          writeLine(stdout, `nomos_runtime id=${nomosDiagnosis.runtime.nomos_id} activation=${nomosDiagnosis.runtime.activation_status}`);
          writeLine(stdout, `nomos_doctor_prompt=${nomosDiagnosis.runtime.doctor_project_prompt_path}`);
          writeLine(stdout, `nomos_validation draft_valid=${nomosDiagnosis.validation.draft.valid} active_valid=${nomosDiagnosis.validation.active.valid}`);
          writeLine(
            stdout,
            `nomos_provenance draft=${nomosDiagnosis.provenance.draft?.kind ?? '-'}:${nomosDiagnosis.provenance.draft?.trust_state ?? '-'}:${nomosDiagnosis.provenance.draft?.activation_eligibility ?? '-'} active=${nomosDiagnosis.provenance.active?.kind ?? '-'}:${nomosDiagnosis.provenance.active?.trust_state ?? '-'}:${nomosDiagnosis.provenance.active?.activation_eligibility ?? '-'}`,
          );
          writeLine(stdout, `nomos_diff changed=${nomosDiagnosis.diff.changed} fields=${nomosDiagnosis.diff.differences.map((entry) => entry.field).join(',') || '-'}`);
          writeLine(stdout, `nomos_drift risk=${nomosDiagnosis.drift.risk_level} blockers=${nomosDiagnosis.drift.activation_blockers} warnings=${nomosDiagnosis.drift.structural_warnings}`);
        }
        return;
      }
      const payload = {
        project_id: options.project,
        status: 'not_wired',
        message: 'project brain doctor is not wired yet',
      };
      if (options.json) {
        writeLine(stdout, JSON.stringify(payload, null, 2));
        return;
      }
      writeLine(stdout, payload.message);
    });

  projectBrain
    .command('append')
    .description('向 project brain 追加 Markdown 内容')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'timeline|decision|fact|open_question|reference')
    .option('--slug <slug>', 'knowledge doc slug')
    .option('--title <title>', 'knowledge doc title (required when creating a new knowledge doc)')
    .option('--summary <summary>', 'knowledge summary')
    .option('--heading <heading>', 'optional heading before appended content')
    .option('--body <body>', 'markdown body')
    .option('--body-file <path>', 'load body from file')
    .option('--source-task <taskId>', 'source task id', collectOption, [])
    .action(async (options: {
      project: string;
      kind: 'timeline' | 'decision' | 'fact' | 'open_question' | 'reference';
      slug?: string;
      title?: string;
      summary?: string;
      heading?: string;
      body?: string;
      bodyFile?: string;
      sourceTask?: string[];
    }) => {
      const body = readTextOption(options.body, options.bodyFile, 'projects brain append').trim();
      if (!body) {
        throw new Error('brain append body is required');
      }
      const doc = projectBrainService.appendDocument({
        project_id: options.project,
        kind: options.kind,
        ...(options.slug ? { slug: options.slug } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options.summary !== undefined ? { summary: options.summary } : {}),
        ...(options.heading ? { heading: options.heading } : {}),
        ...(options.sourceTask && options.sourceTask.length > 0 ? { source_task_ids: options.sourceTask } : {}),
        body,
      });
      writeLine(stdout, `Brain 已追加: ${doc.kind}/${doc.slug}`);
      writeLine(stdout, `path: ${doc.path}`);
      await maybeDrainProjectBrainIndexJobs();
    });

  projectBrain
    .command('promote')
    .description('显式提升内容到 stable project knowledge')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--kind <kind>', 'decision|fact|open_question|reference')
    .option('--slug <slug>', 'knowledge doc slug')
    .option('--title <title>', 'knowledge doc title (required when creating a new knowledge doc)')
    .option('--summary <summary>', 'knowledge summary')
    .option('--heading <heading>', 'optional heading before appended content')
    .option('--body <body>', 'markdown body')
    .option('--body-file <path>', 'load body from file')
    .option('--source-task <taskId>', 'source task id', collectOption, [])
    .action(async (options: {
      project: string;
      kind: 'decision' | 'fact' | 'open_question' | 'reference';
      slug?: string;
      title?: string;
      summary?: string;
      heading?: string;
      body?: string;
      bodyFile?: string;
      sourceTask?: string[];
    }) => {
      const body = readTextOption(options.body, options.bodyFile, 'projects brain promote').trim();
      if (!body) {
        throw new Error('brain promote body is required');
      }
      const doc = projectBrainAutomationService.promoteKnowledge({
        project_id: options.project,
        kind: options.kind,
        ...(options.slug ? { slug: options.slug } : {}),
        ...(options.title ? { title: options.title } : {}),
        ...(options.summary !== undefined ? { summary: options.summary } : {}),
        ...(options.heading ? { heading: options.heading } : {}),
        ...(options.sourceTask && options.sourceTask.length > 0 ? { source_task_ids: options.sourceTask } : {}),
        body,
      });
      writeLine(stdout, `Brain 已提升: ${doc.kind}/${doc.slug}`);
      writeLine(stdout, `path: ${doc.path}`);
      await maybeDrainProjectBrainIndexJobs();
    });

  citizens
    .command('create')
    .description('创建 citizen definition')
    .requiredOption('--id <citizenId>', 'citizen id')
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--role <roleId>', 'role id')
    .requiredOption('--name <displayName>', 'display name')
    .option('--persona <persona>', 'persona text')
    .option('--boundary <line>', 'boundary line', collectOption, [])
    .option('--skill <ref>', 'skill ref', collectOption, [])
    .option('--channel-policies-json <json>', 'channel policies JSON')
    .option('--adapter <adapter>', 'projection adapter', 'openclaw')
    .option('--auto-provision', 'enable adapter-side auto provision', false)
    .action((options: {
      id: string;
      project: string;
      role: string;
      name: string;
      persona?: string;
      boundary?: string[];
      skill?: string[];
      channelPoliciesJson?: string;
      adapter: string;
      autoProvision?: boolean;
    }) => {
      const citizen = citizenService.createCitizen(createCitizenRequestSchema.parse({
        citizen_id: options.id,
        project_id: options.project,
        role_id: options.role,
        display_name: options.name,
        ...(options.persona !== undefined ? { persona: options.persona } : {}),
        ...(options.boundary && options.boundary.length > 0 ? { boundaries: options.boundary } : {}),
        ...(options.skill && options.skill.length > 0 ? { skills_ref: options.skill } : {}),
        ...(options.channelPoliciesJson ? { channel_policies: parseJsonOption(options.channelPoliciesJson, '--channel-policies-json') } : {}),
        runtime_projection: {
          adapter: options.adapter,
          auto_provision: Boolean(options.autoProvision),
        },
      }) satisfies CreateCitizenInputLike);
      writeLine(stdout, `Citizen 已创建: ${citizen.citizen_id}`);
      writeLine(stdout, `Project: ${citizen.project_id}`);
      writeLine(stdout, `Role: ${citizen.role_id}`);
    });

  citizens
    .command('list')
    .description('列出 citizens')
    .option('--project <projectId>', 'project id')
    .option('--status <status>', 'active|archived')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project?: string;
      status?: 'active' | 'archived';
      json?: boolean;
    }) => {
      const items = citizenService.listCitizens(options.project, options.status);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ citizens: items }, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, '没有找到 citizens');
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.citizen_id}\t${item.project_id}\t${item.role_id}\t${item.status}\t${item.display_name}`);
      }
    });

  citizens
    .command('show')
    .description('查看 citizen definition')
    .argument('<citizenId>', 'citizen id')
    .option('--json', '输出 JSON', false)
    .action((citizenId: string, options: { json?: boolean }) => {
      const citizen = citizenService.requireCitizen(citizenId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(citizen, null, 2));
        return;
      }
      writeLine(stdout, `${citizen.citizen_id} — ${citizen.display_name}`);
      writeLine(stdout, `project: ${citizen.project_id}`);
      writeLine(stdout, `role: ${citizen.role_id}`);
      writeLine(stdout, `adapter: ${citizen.runtime_projection.adapter}`);
      writeLine(stdout, `status: ${citizen.status}`);
    });

  citizens
    .command('preview')
    .description('预览 citizen projection adapter 输出')
    .argument('<citizenId>', 'citizen id')
    .option('--json', '输出 JSON', false)
    .action((citizenId: string, options: { json?: boolean }) => {
      const preview = citizenService.previewProjection(citizenId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(preview, null, 2));
        return;
      }
      writeLine(stdout, preview.summary);
      for (const file of preview.files) {
        writeLine(stdout, file.path);
      }
    });

  const templateRole = templates.command('role').description('template role CRUD');

  templateRole
    .command('add')
    .description('新增模板角色')
    .argument('<templateId>', 'template id')
    .requiredOption('--role <roleId>', 'role id')
    .option('--member-kind <memberKind>', 'controller|citizen|craftsman')
    .option('--model-preference <modelPreference>', 'model preference')
    .option('--suggested <agentId>', 'suggested agent', collectOption, [])
    .action((templateId: string, options: {
      role: string;
      memberKind?: 'controller' | 'citizen' | 'craftsman';
      modelPreference?: string;
      suggested?: string[];
    }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      const existingTeam = template.defaultTeam ?? {};
      if (existingTeam[options.role]) {
        throw new Error(`template role already exists: ${options.role}`);
      }
      const hasController = Object.values(existingTeam).some((member) => member.member_kind === 'controller');
      const memberKind = options.memberKind ?? (options.role === 'craftsman' ? 'craftsman' : (hasController ? 'citizen' : 'controller'));
      const saved = templateAuthoringService.saveTemplate(templateId, {
        ...template,
        defaultTeam: {
          ...existingTeam,
          [options.role]: {
            member_kind: memberKind,
            ...(options.modelPreference ? { model_preference: options.modelPreference } : {}),
            ...((options.suggested ?? []).length > 0 ? { suggested: options.suggested ?? [] } : {}),
          },
        },
      });
      writeLine(stdout, `模板角色已新增: ${templateId} -> ${options.role}`);
      writeLine(stdout, `当前角色数: ${Object.keys(saved.template.defaultTeam ?? {}).length}`);
    });

  templateRole
    .command('remove')
    .description('删除模板角色')
    .argument('<templateId>', 'template id')
    .requiredOption('--role <roleId>', 'role id')
    .action((templateId: string, options: { role: string }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      const nextTeam = { ...(template.defaultTeam ?? {}) };
      delete nextTeam[options.role];
      const saved = templateAuthoringService.saveTemplate(templateId, {
        ...template,
        defaultTeam: nextTeam,
      });
      writeLine(stdout, `模板角色已删除: ${templateId} -> ${options.role}`);
      writeLine(stdout, `当前角色数: ${Object.keys(saved.template.defaultTeam ?? {}).length}`);
    });

  const templateStage = templates.command('stage').description('template stage CRUD');

  templateStage
    .command('add')
    .description('新增模板阶段')
    .argument('<templateId>', 'template id')
    .requiredOption('--id <stageId>', 'stage id')
    .option('--name <name>', 'stage name')
    .option('--mode <mode>', 'discuss|execute', 'discuss')
    .action((templateId: string, options: { id: string; name?: string; mode: 'discuss' | 'execute' }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      const stages = template.stages ?? [];
      const saved = templateAuthoringService.saveTemplate(templateId, {
        ...template,
        stages: insertStage(stages, {
          id: options.id,
          ...(options.name ? { name: options.name } : {}),
          mode: options.mode,
        }),
        graph: deriveGraphFromStages(insertStage(stages, {
          id: options.id,
          ...(options.name ? { name: options.name } : {}),
          mode: options.mode,
        })),
      });
      writeLine(stdout, `模板阶段已新增: ${templateId} -> ${options.id}`);
      writeLine(stdout, `当前阶段: ${(saved.template.stages ?? []).map((stage) => stage.id).join(' -> ')}`);
    });

  graph
    .command('show')
    .description('查看 canonical graph')
    .requiredOption('--template <templateId>', 'template id')
    .option('--json', '输出 JSON', false)
    .action((options: { template: string; json?: boolean }) => {
      const graphPayload = templateAuthoringService.getTemplateGraph(options.template);
      if (options.json) {
        writeLine(stdout, JSON.stringify(graphPayload, null, 2));
        return;
      }
      writeLine(stdout, `graph version: ${graphPayload.graph_version}`);
      writeLine(stdout, `entry nodes: ${graphPayload.entry_nodes.join(', ')}`);
      writeLine(stdout, `nodes: ${graphPayload.nodes.length}`);
      writeLine(stdout, `edges: ${graphPayload.edges.length}`);
    });

  graph
    .command('validate')
    .description('校验 workflow graph')
    .option('--template <templateId>', 'template id')
    .option('--file <filePath>', 'workflow json file')
    .action((options: { template?: string; file?: string }) => {
      const graphPayload = loadGraphSource(templateAuthoringService, options);
      const result = templateAuthoringService.validateGraph(graphPayload);
      if (!result.valid) {
        throw new Error(result.errors.join('; '));
      }
      writeLine(stdout, 'workflow graph valid');
    });

  graph
    .command('render')
    .description('渲染 workflow graph')
    .requiredOption('--format <format>', 'currently supports mermaid')
    .option('--template <templateId>', 'template id')
    .option('--file <filePath>', 'workflow json file')
    .action((options: { format: string; template?: string; file?: string }) => {
      if (options.format !== 'mermaid') {
        throw new Error(`unsupported graph render format: ${options.format}`);
      }
      const graphPayload = loadGraphSource(templateAuthoringService, options);
      writeLine(stdout, renderTemplateGraphMermaid(graphPayload));
    });

  graph
    .command('apply')
    .description('把 workflow json 应用到模板')
    .requiredOption('--template <templateId>', 'template id')
    .requiredOption('--file <filePath>', 'workflow json file')
    .action((options: { template: string; file: string }) => {
      const graphPayload = loadGraphSource(templateAuthoringService, { file: options.file });
      const saved = templateAuthoringService.updateTemplateGraph(options.template, { graph: graphPayload });
      writeLine(stdout, `workflow graph 已应用到模板: ${options.template}`);
      writeLine(stdout, `当前阶段: ${(saved.template.stages ?? []).map((stage) => stage.id).join(' -> ')}`);
    });

  templateStage
    .command('remove')
    .description('删除模板阶段')
    .argument('<templateId>', 'template id')
    .requiredOption('--id <stageId>', 'stage id')
    .action((templateId: string, options: { id: string }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      const nextStages = removeStage(template.stages ?? [], options.id);
      const saved = templateAuthoringService.saveTemplate(templateId, {
        ...template,
        stages: nextStages,
        graph: deriveGraphFromStages(nextStages),
      });
      writeLine(stdout, `模板阶段已删除: ${templateId} -> ${options.id}`);
      writeLine(stdout, `当前阶段: ${(saved.template.stages ?? []).map((stage) => stage.id).join(' -> ')}`);
    });

  templateStage
    .command('move')
    .description('调整模板阶段顺序')
    .argument('<templateId>', 'template id')
    .requiredOption('--id <stageId>', 'stage id')
    .option('--before <targetStageId>', 'move before target stage')
    .option('--after <targetStageId>', 'move after target stage')
    .action((templateId: string, options: { id: string; before?: string; after?: string }) => {
      const template = templateAuthoringService.getTemplate(templateId);
      const nextStages = moveStage(template.stages ?? [], options.id, options.before, options.after);
      const saved = templateAuthoringService.saveTemplate(templateId, {
        ...template,
        stages: nextStages,
        graph: deriveGraphFromStages(nextStages),
      });
      writeLine(stdout, `模板阶段已重排: ${templateId} -> ${options.id}`);
      writeLine(stdout, `当前阶段: ${(saved.template.stages ?? []).map((stage) => stage.id).join(' -> ')}`);
    });

  const archiveJobs = archive
    .command('jobs')
    .description('archive job control commands');

  archiveJobs
    .command('list')
    .description('列出 archive jobs')
    .option('--status <status>', 'pending|notified|synced|failed')
    .option('--task-id <taskId>', 'task id filter')
    .option('--json', '输出 JSON', false)
    .action((options: { status?: string; taskId?: string; json?: boolean }) => {
      const items = dashboardQueryService.listArchiveJobs({
        ...(options.status ? { status: options.status } : {}),
        ...(options.taskId ? { taskId: options.taskId } : {}),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(items, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, '没有找到 archive jobs');
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.id}\t${item.task_id}\t${item.status}\t${item.writer_agent}\t${item.target_path}`);
      }
    });

  archiveJobs
    .command('show')
    .description('查看 archive job 详情')
    .argument('<jobId>', 'archive job id')
    .option('--json', '输出 JSON', false)
    .action((jobId: string, options: { json?: boolean }) => {
      const job = dashboardQueryService.getArchiveJob(Number(jobId));
      if (options.json) {
        writeLine(stdout, JSON.stringify(job, null, 2));
        return;
      }
      writeLine(stdout, `${job.id} — ${job.task_id}`);
      writeLine(stdout, `status: ${job.status}`);
      writeLine(stdout, `writer: ${job.writer_agent}`);
      writeLine(stdout, `target: ${job.target_path}`);
      writeLine(stdout, `requested_at: ${job.requested_at}`);
      writeLine(stdout, `completed_at: ${job.completed_at ?? '-'}`);
    });

  archiveJobs
    .command('retry')
    .description('重置 archive job 为 pending')
    .argument('<jobId>', 'archive job id')
    .action((jobId: string) => {
      const job = dashboardQueryService.retryArchiveJob(Number(jobId));
      writeLine(stdout, `archive job 已重置: ${job.id} -> ${job.status}`);
    });

  archiveJobs
    .command('notify')
    .description('通知 archive writer')
    .argument('<jobId>', 'archive job id')
    .action((jobId: string) => {
      const job = dashboardQueryService.notifyArchiveJob(Number(jobId));
      writeLine(stdout, `archive job 已通知: ${job.id} -> ${job.status}`);
    });

  archiveJobs
    .command('complete')
    .description('标记 archive job synced')
    .argument('<jobId>', 'archive job id')
    .requiredOption('--commit-hash <commitHash>', 'writer commit hash')
    .action(async (jobId: string, options: { commitHash: string }) => {
      const job = dashboardQueryService.updateArchiveJob(Number(jobId), {
        status: 'synced',
        commit_hash: options.commitHash,
      });
      await dashboardQueryService.drainBackgroundOperations();
      writeLine(stdout, `archive job 已完成: ${job.id} -> ${job.status}`);
    });

  archiveJobs
    .command('fail')
    .description('标记 archive job failed')
    .argument('<jobId>', 'archive job id')
    .requiredOption('--error-message <message>', 'failure reason')
    .action((jobId: string, options: { errorMessage: string }) => {
      const job = dashboardQueryService.updateArchiveJob(Number(jobId), {
        status: 'failed',
        error_message: options.errorMessage,
      });
      writeLine(stdout, `archive job 已失败: ${job.id} -> ${job.status}`);
    });

  archiveJobs
    .command('scan-stale')
    .description('扫描超时 notified jobs 并标记 failed')
    .requiredOption('--timeout-ms <timeoutMs>', 'timeout in ms')
    .option('--json', '输出 JSON', false)
    .action((options: { timeoutMs: string; json?: boolean }) => {
      const result = dashboardQueryService.failStaleArchiveJobs({
        timeoutMs: Number(options.timeoutMs),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, `stale archive jobs failed: ${result.failed}`);
    });

  archiveJobs
    .command('scan-receipts')
    .description('摄取 archive writer receipts')
    .option('--json', '输出 JSON', false)
    .action(async (options: { json?: boolean }) => {
      const result = dashboardQueryService.ingestArchiveJobReceipts();
      await dashboardQueryService.drainBackgroundOperations();
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, `archive receipts processed=${result.processed} synced=${result.synced} failed=${result.failed}`);
    });

  program
    .command('list')
    .description('列出任务')
    .option('-s, --state <state>', '按状态筛选')
    .action((options: { state?: string }) => {
      const tasks = taskService.listTasks(options.state);
      if (tasks.length === 0) {
        writeLine(stdout, '没有找到任务');
        return;
      }
      for (const task of tasks) {
        writeLine(
          stdout,
          `${task.id}\t${task.title}\t${task.type}\t${task.state}\t${task.current_stage ?? '-'}`,
        );
      }
    });

  program
    .command('advance')
    .description('推进任务到下一阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .action((taskId: string, options: { callerId: string }) => {
      const task = taskService.advanceTask(taskId, { callerId: options.callerId });
      if (task.state === 'done') {
        writeLine(stdout, `任务 ${taskId} 已完成`);
      } else {
        writeLine(stdout, `任务 ${taskId} 已推进到阶段: ${task.current_stage ?? '-'}`);
      }
    });

  program
    .command('approve')
    .description('审批通过当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--approver-id <approverId>', '审批者 ID')
    .option('--comment <comment>', '审批备注', '')
    .action((taskId: string, options: { approverId: string; comment: string }) => {
      taskService.approveTask(taskId, {
        approverId: options.approverId,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已审批通过`);
    });

  program
    .command('reject')
    .description('驳回当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--rejector-id <rejectorId>', '驳回者 ID')
    .option('--reason <reason>', '驳回原因', '')
    .action((taskId: string, options: { rejectorId: string; reason: string }) => {
      taskService.rejectTask(taskId, {
        rejectorId: options.rejectorId,
        reason: options.reason,
      });
      writeLine(stdout, `任务 ${taskId} 已驳回`);
    });

  program
    .command('archon-approve')
    .description('Archon 审批通过当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--reviewer-id <reviewerId>', 'Archon ID')
    .option('--comment <comment>', '备注', '')
    .action((taskId: string, options: { reviewerId: string; comment: string }) => {
      taskService.archonApproveTask(taskId, {
        reviewerId: options.reviewerId,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已 Archon 审批通过`);
    });

  program
    .command('archon-reject')
    .description('Archon 驳回当前阶段')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--reviewer-id <reviewerId>', 'Archon ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reviewerId: string; reason: string }) => {
      taskService.archonRejectTask(taskId, {
        reviewerId: options.reviewerId,
        reason: options.reason,
      });
      writeLine(stdout, `任务 ${taskId} 已 Archon 驳回`);
    });

  program
    .command('confirm')
    .description('记录 quorum 投票')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--voter-id <voterId>', '投票者 ID')
    .option('--vote <vote>', '投票结果', 'approve')
    .option('--comment <comment>', '备注', '')
    .action((taskId: string, options: { voterId: string; vote: 'approve' | 'reject'; comment: string }) => {
      const result = taskService.confirmTask(taskId, {
        voterId: options.voterId,
        vote: options.vote,
        comment: options.comment,
      });
      writeLine(stdout, `任务 ${taskId} 已记录投票，当前票数: approved=${result.quorum.approved} total=${result.quorum.total}`);
    });

  program
    .command('subtask-done')
    .description('完成子任务')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--subtask-id <subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .option('--output <output>', '输出', '')
    .action((taskId: string, options: { subtaskId: string; callerId: string; output: string }) => {
      taskService.completeSubtask(taskId, {
        subtaskId: options.subtaskId,
        callerId: options.callerId,
        output: options.output,
      });
      writeLine(stdout, `任务 ${taskId} 的子任务 ${options.subtaskId} 已完成`);
    });

  const subtasks = program
    .command('subtasks')
    .description('subtask execute-mode commands');

  subtasks
    .command('list')
    .description('列出任务 subtasks')
    .argument('<taskId>', '任务 ID')
    .option('--json', '输出 JSON', false)
    .action((taskId: string, options: { json?: boolean }) => {
      const items = taskService.listSubtasks(taskId);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ subtasks: items }, null, 2));
        return;
      }
      if (items.length === 0) {
        writeLine(stdout, `任务 ${taskId} 暂无 subtasks`);
        return;
      }
      for (const item of items) {
        writeLine(stdout, `${item.id}\t${item.stage_id}\t${item.assignee}\t${item.status}\t${item.craftsman_type ?? '-'}`);
      }
    });

  subtasks
    .command('create')
    .description('为当前执行阶段创建 subtasks')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID（当前默认要求 controller）')
    .requiredOption('--file <file>', 'subtasks json file')
    .action((taskId: string, options: { callerId: string; file: string }) => {
      const parsed = JSON.parse(readFileSync(options.file, 'utf8')) as { subtasks?: CreateSubtasksRequestDto['subtasks'] };
      const payload = createSubtasksRequestSchema.parse({
        caller_id: options.callerId,
        subtasks: parsed.subtasks ?? [],
      });
      const result = taskService.createSubtasks(taskId, payload);
      writeLine(stdout, `任务 ${taskId} 已创建 ${result.subtasks.length} 个 subtasks`);
      if (result.dispatched_executions.length > 0) {
        writeLine(stdout, `auto-dispatched executions: ${result.dispatched_executions.map((item) => item.execution_id).join(', ')}`);
      }
    });

  subtasks
    .command('close')
    .description('关闭 subtask（标记为 done）')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--subtask-id <subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .option('--note <note>', '备注', '')
    .action((taskId: string, options: { subtaskId: string; callerId: string; note: string }) => {
      taskService.completeSubtask(taskId, {
        subtaskId: options.subtaskId,
        callerId: options.callerId,
        output: options.note,
      });
      writeLine(stdout, `任务 ${taskId} 的子任务 ${options.subtaskId} 已关闭`);
    });

  subtasks
    .command('archive')
    .description('归档 subtask')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--subtask-id <subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .option('--note <note>', '备注', '')
    .action((taskId: string, options: { subtaskId: string; callerId: string; note: string }) => {
      taskService.archiveSubtask(taskId, {
        subtaskId: options.subtaskId,
        callerId: options.callerId,
        note: options.note,
      });
      writeLine(stdout, `任务 ${taskId} 的子任务 ${options.subtaskId} 已归档`);
    });

  subtasks
    .command('cancel')
    .description('取消 subtask')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--subtask-id <subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 ID')
    .option('--note <note>', '备注', '')
    .action((taskId: string, options: { subtaskId: string; callerId: string; note: string }) => {
      taskService.cancelSubtask(taskId, {
        subtaskId: options.subtaskId,
        callerId: options.callerId,
        note: options.note,
      });
      writeLine(stdout, `任务 ${taskId} 的子任务 ${options.subtaskId} 已取消`);
    });

  program
    .command('force-advance')
    .description('强制推进任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      const task = taskService.forceAdvanceTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已强制推进到阶段: ${task.current_stage ?? '-'}`);
    });

  program
    .command('pause')
    .description('暂停任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      taskService.pauseTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已暂停`);
    });

  program
    .command('resume')
    .description('恢复任务')
    .argument('<taskId>', '任务 ID')
    .action((taskId: string) => {
      taskService.resumeTask(taskId);
      writeLine(stdout, `任务 ${taskId} 已恢复`);
    });

  program
    .command('cancel')
    .description('取消任务')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .action((taskId: string, options: { reason: string }) => {
      taskService.cancelTask(taskId, { reason: options.reason });
      writeLine(stdout, `任务 ${taskId} 已取消`);
    });

  program
    .command('unblock')
    .description('解除阻塞')
    .argument('<taskId>', '任务 ID')
    .option('--reason <reason>', '原因', '')
    .option('--action <action>', '恢复策略（当前支持 retry|skip|reassign）')
    .option('--assignee <assignee>', 'reassign 时的新 assignee')
    .option('--craftsman-type <craftsmanType>', 'reassign 时的新 craftsman type')
    .action((taskId: string, options: {
      reason: string;
      action?: 'retry' | 'skip' | 'reassign';
      assignee?: string;
      craftsmanType?: string;
    }) => {
      taskService.unblockTask(
        taskId,
        options.action
          ? {
            reason: options.reason,
            action: options.action,
            ...(options.assignee ? { assignee: options.assignee } : {}),
            ...(options.craftsmanType ? { craftsman_type: options.craftsmanType } : {}),
          }
          : { reason: options.reason },
      );
      writeLine(stdout, `任务 ${taskId} 已解除阻塞`);
    });

  program
    .command('cleanup')
    .description('清理 orphaned 任务')
    .option('--task-id <taskId>', '指定任务 ID')
    .action((options: { taskId?: string }) => {
      const cleaned = taskService.cleanupOrphaned(options.taskId);
      writeLine(stdout, `已清理 orphaned 任务: ${cleaned}`);
    });

  program
    .command('probe-stuck')
    .description('探测长时间未推进的 active 任务并触发 staged escalation')
    .option('--controller-ms <ms>', 'controller ping threshold', '300000')
    .option('--roster-ms <ms>', 'roster ping threshold', '900000')
    .option('--inbox-ms <ms>', 'inbox threshold', '1800000')
    .action((options: {
      controllerMs: string;
      rosterMs: string;
      inboxMs: string;
    }) => {
      const result = taskService.probeInactiveTasks({
        controllerAfterMs: Number(options.controllerMs),
        rosterAfterMs: Number(options.rosterMs),
        inboxAfterMs: Number(options.inboxMs),
      });
      writeLine(stdout, `scanned_tasks: ${result.scanned_tasks}`);
      writeLine(stdout, `controller_pings: ${result.controller_pings}`);
      writeLine(stdout, `roster_pings: ${result.roster_pings}`);
      writeLine(stdout, `human_pings: ${result.human_pings}`);
      writeLine(stdout, `inbox_items: ${result.inbox_items}`);
    });

  const runtimeCommand = program
    .command('runtime')
    .description('runtime recovery commands');

  runtimeCommand
    .command('diagnose')
    .description('request runtime diagnosis for a task agent')
    .argument('<taskId>', '任务 ID')
    .argument('<agentRef>', 'agent ref')
    .requiredOption('--caller-id <callerId>', 'caller id')
    .option('--reason <reason>', 'reason', '')
    .action((taskId: string, agentRef: string, options: { callerId: string; reason: string }) => {
      const result = taskService.requestRuntimeDiagnosis(taskId, {
        task_id: taskId,
        agent_ref: agentRef,
        caller_id: options.callerId,
        ...(options.reason ? { reason: options.reason } : {}),
      });
      writeLine(stdout, JSON.stringify(result, null, 2));
    });

  runtimeCommand
    .command('restart')
    .description('request citizen runtime restart for a task agent')
    .argument('<taskId>', '任务 ID')
    .argument('<agentRef>', 'agent ref')
    .requiredOption('--caller-id <callerId>', 'caller id')
    .option('--reason <reason>', 'reason', '')
    .action((taskId: string, agentRef: string, options: { callerId: string; reason: string }) => {
      const result = taskService.restartCitizenRuntime(taskId, {
        task_id: taskId,
        agent_ref: agentRef,
        caller_id: options.callerId,
        ...(options.reason ? { reason: options.reason } : {}),
      });
      writeLine(stdout, JSON.stringify(result, null, 2));
    });

  const task = program
    .command('task')
    .description('task read-model commands');

  task
    .command('conversation')
    .description('读取任务 conversation timeline')
    .argument('<taskId>', '任务 ID')
    .option('--json', '输出 JSON', false)
    .action((taskId: string, options: { json?: boolean }) => {
      const entries = taskConversationService.listByTask(taskId);
      if (options.json) {
        writeLine(stdout, JSON.stringify({ entries }, null, 2));
        return;
      }
      if (entries.length === 0) {
        writeLine(stdout, `任务 ${taskId} 暂无 conversation entries`);
        return;
      }
      for (const entry of entries) {
        writeLine(
          stdout,
          `[${entry.occurred_at}] ${entry.author_kind}:${entry.display_name ?? entry.author_ref ?? '-'} ${entry.body}`,
        );
      }
    });

  task
    .command('conversation-summary')
    .description('读取任务 conversation summary')
    .argument('<taskId>', '任务 ID')
    .option('--json', '输出 JSON', false)
    .action((taskId: string, options: { json?: boolean }) => {
      const summary = taskConversationService.getSummaryByTask(taskId);
      if (options.json) {
        writeLine(stdout, JSON.stringify(summary, null, 2));
        return;
      }
      writeLine(stdout, `任务 ${taskId} conversation entries: ${summary.total_entries}`);
      if (!summary.latest_entry_id) {
        writeLine(stdout, 'latest: -');
        return;
      }
      writeLine(
        stdout,
        `latest: [${summary.latest_occurred_at}] ${summary.latest_author_kind}:${summary.latest_display_name ?? '-'} ${summary.latest_body_excerpt ?? '-'}`,
      );
    });

  task
    .command('conversation-read')
    .description('标记任务 conversation 已读')
    .argument('<taskId>', '任务 ID')
    .requiredOption('--account-id <accountId>', 'human account id')
    .option('--entry-id <entryId>', 'last read entry id')
    .option('--read-at <readAt>', 'read timestamp')
    .option('--json', '输出 JSON', false)
    .action((taskId: string, options: {
      accountId: string;
      entryId?: string;
      readAt?: string;
      json?: boolean;
    }) => {
      const summary = taskConversationService.markRead(taskId, Number(options.accountId), {
        ...(options.entryId ? { last_read_entry_id: options.entryId } : {}),
        ...(options.readAt ? { read_at: options.readAt } : {}),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(summary, null, 2));
        return;
      }
      writeLine(stdout, `任务 ${taskId} conversation 已读，未读消息: ${summary.unread_count}`);
    });

  const craftsman = program
    .command('craftsman')
    .description('craftsman execution commands');
  const dashboard = program
    .command('dashboard')
    .description('dashboard auth commands');

  craftsman
    .command('dispatch')
    .description('派发 craftsmen 子任务（execution mode: one_shot|interactive）')
    .argument('<taskId>', '任务 ID')
    .argument('<subtaskId>', '子任务 ID')
    .requiredOption('--caller-id <callerId>', '调用者 agent id（默认要求 controller）')
    .requiredOption('--adapter <adapter>', 'adapter 名称')
    .option('--mode <mode>', '执行模式（one_shot|interactive）', 'one_shot')
    .option('--interaction <interactionExpectation>', '交互预期（one_shot|needs_input|awaiting_choice）')
    .option('--workdir <workdir>', '工作目录')
    .option('--brief-path <briefPath>', 'brief 路径')
    .action((taskId: string, subtaskId: string, options: {
      callerId: string;
      adapter: string;
      mode: CraftsmanModeDto;
      interaction?: CraftsmanInteractionExpectationDto;
      workdir?: string;
      briefPath?: string;
    }) => {
      const result = taskService.dispatchCraftsman({
        task_id: taskId,
        subtask_id: subtaskId,
        caller_id: options.callerId,
        adapter: options.adapter,
        mode: options.mode,
        interaction_expectation: options.interaction ?? (options.mode === 'interactive' ? 'needs_input' : 'one_shot'),
        workdir: options.workdir ?? null,
        brief_path: options.briefPath ?? null,
      });
      writeLine(stdout, `craftsman execution 已派发: ${result.execution.execution_id}`);
      writeLine(stdout, `adapter: ${result.execution.adapter}`);
      writeLine(stdout, `execution mode: ${result.execution.mode}`);
      writeLine(stdout, `status: ${result.execution.status}`);
      writeLine(stdout, `workdir: ${result.execution.workdir ?? '-'}`);
    });

  craftsman
    .command('status')
    .description('查看 craftsmen execution 状态')
    .argument('<executionId>', 'execution ID')
    .action((executionId: string) => {
      const execution = taskService.getCraftsmanExecution(executionId);
      writeLine(stdout, `${execution.execution_id}`);
      writeLine(stdout, `adapter: ${execution.adapter}`);
      writeLine(stdout, `status: ${execution.status}`);
    });

  craftsman
    .command('history')
    .description('查看某个 subtask 的 craftsmen execution 历史')
    .argument('<taskId>', '任务 ID')
    .argument('<subtaskId>', '子任务 ID')
    .action((taskId: string, subtaskId: string) => {
      const executions = taskService.listCraftsmanExecutions(taskId, subtaskId);
      if (executions.length === 0) {
        writeLine(stdout, '没有找到 craftsmen execution 历史');
        return;
      }
      for (const execution of executions) {
        writeLine(
          stdout,
          `${execution.execution_id}\t${execution.adapter}\t${execution.status}\t${execution.session_id ?? '-'}\t${execution.started_at ?? '-'}`,
        );
      }
    });

  craftsman
    .command('governance')
    .description('查看 craftsman 治理与主机资源快照')
    .option('--json', 'emit JSON')
    .action((options: { json?: boolean }) => {
      const snapshot = taskService.getCraftsmanGovernanceSnapshot();
      if (options.json) {
        writeLine(stdout, JSON.stringify(snapshot, null, 2));
        return;
      }
      writeLine(stdout, `active executions: ${snapshot.active_executions}`);
      writeLine(
        stdout,
        `limits: global=${snapshot.limits.max_concurrent_running ?? '-'} per_agent=${snapshot.limits.max_concurrent_per_agent ?? '-'}`,
      );
      writeLine(
        stdout,
        `host limits: memory_warn=${snapshot.limits.host_memory_warning_utilization_limit ?? '-'} memory_hard=${snapshot.limits.host_memory_utilization_limit ?? '-'} swap_warn=${snapshot.limits.host_swap_warning_utilization_limit ?? '-'} swap_hard=${snapshot.limits.host_swap_utilization_limit ?? '-'} load_warn=${snapshot.limits.host_load_per_cpu_warning_limit ?? '-'} load_hard=${snapshot.limits.host_load_per_cpu_limit ?? '-'}`,
      );
      writeLine(stdout, `host pressure status: ${snapshot.host_pressure_status}`);
      if (snapshot.host) {
        const memoryLabel = snapshot.host.platform === 'darwin' && snapshot.host.memory_pressure != null
          ? `pressure=${snapshot.host.memory_pressure}`
          : `memory=${snapshot.host.memory_utilization ?? '-'}`;
        writeLine(
          stdout,
          `host: ${memoryLabel} swap=${snapshot.host.swap_utilization ?? '-'} load_1m=${snapshot.host.load_1m ?? '-'} cpu_count=${snapshot.host.cpu_count ?? '-'} platform=${snapshot.host.platform ?? '-'}`,
        );
      } else {
        writeLine(stdout, 'host: unavailable');
      }
      for (const warning of snapshot.warnings) {
        writeLine(stdout, `warning: ${warning}`);
      }
      if (snapshot.active_by_assignee.length === 0) {
        writeLine(stdout, 'active by assignee: none');
      } else {
        for (const item of snapshot.active_by_assignee) {
          writeLine(stdout, `${item.assignee}\t${item.count}`);
        }
      }
      if (snapshot.active_execution_details.length === 0) {
        writeLine(stdout, 'active execution details: none');
        return;
      }
      for (const detail of snapshot.active_execution_details) {
        writeLine(stdout, `${detail.execution_id}\t${detail.assignee}\t${detail.adapter}\t${detail.status}\t${detail.session_id ?? '-'}\t${detail.workdir ?? '-'}`);
      }
    });

  craftsman
    .command('observe')
    .description('探测超时的 craftsman executions，并尽量推进状态')
    .option('--running-after-ms <ms>', 'probe running/queued executions after this idle time', '300000')
    .option('--waiting-after-ms <ms>', 'probe waiting-input executions after this idle time', '120000')
    .action((options: { runningAfterMs: string; waitingAfterMs: string }) => {
      const result = taskService.observeCraftsmanExecutions({
        runningAfterMs: Number(options.runningAfterMs),
        waitingAfterMs: Number(options.waitingAfterMs),
      });
      writeLine(stdout, JSON.stringify(result, null, 2));
    });

  craftsman
    .command('stop')
    .description('request a stop signal for a running craftsman execution')
    .argument('<executionId>', 'execution ID')
    .requiredOption('--caller-id <callerId>', 'caller id')
    .option('--reason <reason>', 'reason', '')
    .action((executionId: string, options: { callerId: string; reason: string }) => {
      const result = taskService.stopCraftsmanExecution(executionId, {
        caller_id: options.callerId,
        ...(options.reason ? { reason: options.reason } : {}),
      });
      writeLine(stdout, JSON.stringify(result, null, 2));
    });

  craftsman
    .command('tail')
    .description('查看指定 execution 的最近输出')
    .argument('<executionId>', 'execution ID')
    .option('--lines <lines>', '最近输出行数', '120')
    .action((executionId: string, options: { lines: string }) => {
      const lines = Number(options.lines);
      const result = craftsmanExecutionTailResponseSchema.parse(taskService.getCraftsmanExecutionTail(executionId, lines));
      if (!result.available) {
        writeLine(stdout, `craftsman tail 不可用: ${executionId}`);
        return;
      }
      writeLine(stdout, result.output ?? '');
    });

  craftsman
    .command('callback')
    .description('提交 craftsmen callback')
    .argument('<executionId>', 'execution ID')
    .requiredOption('--status <status>', '回调状态')
    .option('--session-id <sessionId>', 'session ID')
    .option('--payload <payload>', 'JSON payload')
    .option('--error <error>', 'error message')
    .option('--finished-at <finishedAt>', 'finished timestamp')
    .action((executionId: string, options: {
      status: CraftsmanExecutionStatusDto;
      sessionId?: string;
      payload?: string;
      error?: string;
      finishedAt?: string;
    }) => {
      const result = taskService.handleCraftsmanCallback({
        execution_id: executionId,
        status: options.status as CraftsmanCallbackRequestDto['status'],
        session_id: options.sessionId ?? null,
        payload: parseJsonOption(options.payload, '--payload'),
        error: options.error ?? null,
        finished_at: options.finishedAt ?? null,
      });
      writeLine(stdout, `craftsman callback 已处理: ${result.execution.execution_id}`);
      writeLine(stdout, `status: ${result.execution.status}`);
      writeLine(stdout, `${result.subtask.output ?? ''}`);
    });

  craftsman
    .command('probe')
    .description('探测某个 craftsmen execution 的运行态并同步 callback 状态')
    .argument('<executionId>', 'execution ID')
    .action((executionId: string) => {
      const result = taskService.probeCraftsmanExecution(executionId);
      writeLine(stdout, `craftsman probe 已执行: ${executionId}`);
      writeLine(stdout, `status: ${result.execution.status}`);
    });

  craftsman
    .command('input-text')
    .description('向 waiting craftsman execution 发送文本输入')
    .argument('<executionId>', 'execution ID')
    .argument('<text>', 'text input')
    .option('--no-submit', '发送后不自动回车')
    .action((executionId: string, text: string, options: { submit?: boolean }) => {
      const payload = craftsmanExecutionSendTextRequestSchema.parse({
        execution_id: executionId,
        text,
        submit: options.submit ?? true,
      });
      const execution = taskService.sendCraftsmanInputText(payload.execution_id, payload.text, payload.submit);
      writeLine(stdout, `craftsman input 已发送: ${execution.executionId}`);
    });

  craftsman
    .command('input-keys')
    .description('向 waiting craftsman execution 发送结构化按键')
    .argument('<executionId>', 'execution ID')
    .argument('<keys...>', 'keys like Down Tab Enter')
    .action((executionId: string, keys: CraftsmanInputKeyDto[]) => {
      const payload = craftsmanExecutionSendKeysRequestSchema.parse({
        execution_id: executionId,
        keys,
      });
      const execution = taskService.sendCraftsmanInputKeys(payload.execution_id, payload.keys);
      writeLine(stdout, `craftsman keys 已发送: ${execution.executionId}`);
    });

  craftsman
    .command('submit-choice')
    .description('向 waiting craftsman execution 提交 choice，自动补 Enter')
    .argument('<executionId>', 'execution ID')
    .argument('[keys...]', 'optional navigation keys before submit')
    .action((executionId: string, keys: CraftsmanInputKeyDto[] = []) => {
      const payload = craftsmanExecutionSubmitChoiceRequestSchema.parse({
        execution_id: executionId,
        keys,
      });
      const execution = taskService.submitCraftsmanChoice(payload.execution_id, payload.keys);
      writeLine(stdout, `craftsman choice 已提交: ${execution.executionId}`);
    });

  const runtime = craftsman
    .command('runtime')
    .description('generic runtime identity and observability commands');
  const dashboardSession = dashboard
    .command('session')
    .description('dashboard session auth commands');
  const dashboardUsers = dashboard
    .command('users')
    .description('dashboard human account commands');

  runtime
    .command('identity')
    .description('回填运行时 identity 元数据')
    .argument('<agent>', 'agent pane name')
    .requiredOption('--identity-source <identitySource>', 'identity source')
    .option('--session-reference <sessionReference>', 'session reference')
    .option('--identity-path <identityPath>', 'identity file path')
    .option('--session-observed-at <sessionObservedAt>', 'identity observed timestamp')
    .option('--workspace-root <workspaceRoot>', 'workspace root')
    .action((agent: string, options: {
      identitySource: CraftsmanRuntimeIdentitySourceDto;
      sessionReference?: string;
      identityPath?: string;
      sessionObservedAt?: string;
      workspaceRoot?: string;
    }) => {
      const result = legacyRuntimeService.recordIdentity(agent, {
        sessionReference: options.sessionReference ?? null,
        identitySource: options.identitySource,
        identityPath: options.identityPath ?? null,
        sessionObservedAt: options.sessionObservedAt ?? null,
        workspaceRoot: options.workspaceRoot ?? null,
      });
      writeLine(stdout, `runtime identity 已回填: ${agent}`);
      writeLine(stdout, `source: ${result.identitySource}`);
      writeLine(stdout, `session: ${result.sessionReference ?? '-'}`);
    });

  dashboardSession
    .command('login')
    .description('登录 dashboard session 并缓存 cookie；在 developer regression mode 下可直接读取 .env 中的 dashboard 登录变量')
    .option('--username <username>', '用户名')
    .option('--password <password>', '密码')
    .action(async (options: { username?: string; password?: string }) => {
      const credentials = resolveDashboardSessionLoginInput(options);
      const result = await dashboardSessionClient.login({
        username: credentials.username,
        password: credentials.password,
      });
      writeLine(stdout, `dashboard session 已建立: ${result.username}`);
      writeLine(stdout, `method: ${result.method}`);
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  dashboardSession
    .command('status')
    .description('查看当前 dashboard session 状态')
    .action(async () => {
      const result = await dashboardSessionClient.status();
      writeLine(stdout, `authenticated: ${result.authenticated}`);
      writeLine(stdout, `method: ${result.method ?? '-'}`);
      writeLine(stdout, `username: ${result.username ?? '-'}`);
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  dashboardSession
    .command('logout')
    .description('退出当前 dashboard session 并清理本地 cookie')
    .action(async () => {
      await dashboardSessionClient.logout();
      writeLine(stdout, 'dashboard session 已清除');
      writeLine(stdout, `session file: ${dashboardSessionClient.sessionFilePath}`);
    });

  dashboardUsers
    .command('add')
    .description('创建 dashboard 人类账号')
    .requiredOption('--username <username>', '用户名')
    .requiredOption('--password <password>', '密码')
    .action((options: { username: string; password: string }) => {
      const user = humanAccountService.createUser({
        username: options.username,
        password: options.password,
        role: 'member',
      });
      writeLine(stdout, `dashboard 用户已创建: ${user.username}`);
      writeLine(stdout, `role: ${user.role}`);
    });

  dashboardUsers
    .command('list')
    .description('列出 dashboard 人类账号')
    .action(() => {
      const users = humanAccountService.listUsers();
      if (users.length === 0) {
        writeLine(stdout, '没有 dashboard 用户');
        return;
      }
      for (const user of users) {
        writeLine(stdout, `${user.username}\t${user.role}\t${user.enabled ? 'enabled' : 'disabled'}`);
      }
    });

  dashboardUsers
    .command('disable')
    .description('禁用 dashboard 人类账号')
    .requiredOption('--username <username>', '用户名')
    .action((options: { username: string }) => {
      const user = humanAccountService.disableUser(options.username);
      writeLine(stdout, `dashboard 用户已禁用: ${user.username}`);
    });

  dashboardUsers
    .command('set-password')
    .description('重置 dashboard 人类账号密码')
    .requiredOption('--username <username>', '用户名')
    .requiredOption('--password <password>', '新密码')
    .action((options: { username: string; password: string }) => {
      const user = humanAccountService.setPassword(options.username, options.password);
      writeLine(stdout, `dashboard 用户密码已更新: ${user.username}`);
    });

  dashboardUsers
    .command('bind-identity')
    .description('绑定人类账号到外部 IM 身份')
    .requiredOption('--username <username>', '用户名')
    .requiredOption('--provider <provider>', 'provider')
    .requiredOption('--external-user-id <externalUserId>', '外部用户 ID')
    .action((options: { username: string; provider: string; externalUserId: string }) => {
      const binding = humanAccountService.bindIdentity({
        username: options.username,
        provider: options.provider,
        externalUserId: options.externalUserId,
      });
      writeLine(stdout, `identity 已绑定: ${options.username} -> ${binding.provider}:${binding.external_user_id}`);
    });

  program
    .command('init')
    .description('交互式配置向导（配置 Discord 等 IM 集成）')
    .action(async () => {
      await runInitCommand({
        humanAccountService,
        });
    });

  const externalBridge = program
    .command('external-bridge')
    .description('external bridge diagnostics and compatibility commands');

  const ccConnect = externalBridge
    .command('cc-connect')
    .description('inspect a local or remote cc-connect bridge');

  const runCcConnectDetect = async (options: {
    command?: string;
    config?: string;
    baseUrl?: string;
    token?: string;
    timeout?: string;
    json?: boolean;
  }) => {
    const timeoutSeconds = options.timeout ? Number(options.timeout) : 5;
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error(`invalid --timeout value: ${options.timeout}. Expected positive number.`);
    }
    const result = await getCcConnectInspectionService().inspect({
      timeoutMs: Math.round(timeoutSeconds * 1000),
      ...(options.command !== undefined ? { command: options.command } : {}),
      ...(options.config !== undefined ? { configPath: options.config } : {}),
      ...(options.baseUrl !== undefined ? { managementBaseUrl: options.baseUrl } : {}),
      ...(options.token !== undefined ? { managementToken: options.token } : {}),
    });
    if (options.json) {
      writeLine(stdout, JSON.stringify(result, null, 2));
      return;
    }
    writeLine(stdout, `cc-connect binary: ${result.binary.found ? 'found' : 'missing'}`);
    writeLine(stdout, `  command=${result.binary.command}`);
    writeLine(stdout, `  path=${result.binary.resolvedPath ?? '-'}`);
    writeLine(stdout, `  version=${result.binary.version ?? '-'}`);
    if (result.binary.reason) {
      writeLine(stdout, `  reason=${result.binary.reason}`);
    }
    if (result.binary.error) {
      writeLine(stdout, `  error=${result.binary.error}`);
    }
    writeLine(stdout, `cc-connect config: ${result.config.exists ? 'found' : 'missing'}`);
    writeLine(stdout, `  path=${result.config.path}`);
    writeLine(stdout, `  management_enabled=${result.config.management.enabled ?? 'unknown'}`);
    writeLine(stdout, `  management_port=${result.config.management.port ?? '-'}`);
    writeLine(stdout, `  management_token_present=${result.config.management.tokenPresent}`);
    writeLine(stdout, `management api: ${result.management.reachable ? 'reachable' : 'unreachable'}`);
    writeLine(stdout, `  url=${result.management.url ?? '-'}`);
    writeLine(stdout, `  version=${result.management.version ?? '-'}`);
    writeLine(stdout, `  projects=${result.management.projectsCount ?? '-'}`);
    writeLine(stdout, `  bridge_adapters=${result.management.bridgeAdapterCount ?? '-'}`);
    writeLine(stdout, `  connected_platforms=${result.management.connectedPlatforms.join(',') || '-'}`);
    if (result.management.reason) {
      writeLine(stdout, `  reason=${result.management.reason}`);
    }
    if (result.management.error) {
      writeLine(stdout, `  error=${result.management.error}`);
    }
  };

  for (const commandName of ['detect', 'status'] as const) {
    ccConnect
      .command(commandName)
      .option('--command <command>', 'cc-connect executable name or path', 'cc-connect')
      .option('--config <path>', 'cc-connect config path')
      .option('--base-url <url>', 'management api base url override')
      .option('--token <token>', 'management api token override')
      .option('--timeout <seconds>', 'probe timeout in seconds', '5')
      .option('--json', '输出 JSON', false)
      .action(runCcConnectDetect);
  }

  function parseCcConnectTimeout(options: { timeout?: string }) {
    const timeoutSeconds = options.timeout ? Number(options.timeout) : 5;
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error(`invalid --timeout value: ${options.timeout}. Expected positive number.`);
    }
    return Math.round(timeoutSeconds * 1000);
  }

  function buildCcConnectManagementInput(options: {
    config?: string;
    baseUrl?: string;
    token?: string;
    timeout?: string;
  }) {
    return {
      timeoutMs: parseCcConnectTimeout(options),
      ...(options.config !== undefined ? { configPath: options.config } : {}),
      ...(options.baseUrl !== undefined ? { managementBaseUrl: options.baseUrl } : {}),
      ...(options.token !== undefined ? { managementToken: options.token } : {}),
    };
  }

  ccConnect
    .command('projects')
    .description('list cc-connect projects through the management api')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const result = await getCcConnectManagementService().listProjects(buildCcConnectManagementInput(options));
      if (options.json) {
        writeLine(stdout, JSON.stringify({ projects: result }, null, 2));
        return;
      }
      if (result.length === 0) {
        writeLine(stdout, '没有检测到 cc-connect projects');
        return;
      }
      for (const item of result) {
        writeLine(stdout, `${item.name}\t${item.agent_type}\t${item.platforms.join(',')}\t${item.sessions_count}\theartbeat=${item.heartbeat_enabled}`);
      }
    });

  ccConnect
    .command('project')
    .description('show cc-connect project detail')
    .argument('<projectName>', 'cc-connect project name')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (projectName: string, options: {
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const result = await getCcConnectManagementService().getProject({
        project: projectName,
        ...buildCcConnectManagementInput(options),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, `${result.name}\t${result.agent_type}\tsessions=${result.sessions_count}\tmode=${result.agent_mode ?? result.mode ?? '-'}`);
      writeLine(stdout, `platforms=${result.platforms.map((item) => `${item.type}:${item.connected ? 'connected' : 'disconnected'}`).join(',') || '-'}`);
      writeLine(stdout, `active_session_keys=${result.active_session_keys.join(',') || '-'}`);
      writeLine(stdout, `work_dir=${result.work_dir ?? '-'}`);
      writeLine(stdout, `show_context_indicator=${result.show_context_indicator ?? '-'}`);
      writeLine(stdout, `allow_from=${result.platform_configs.map((item) => `${item.type}:${item.allow_from ?? '-'}`).join(',') || '-'}`);
    });

  ccConnect
    .command('sessions')
    .description('list cc-connect sessions for a project')
    .requiredOption('--project <projectName>', 'cc-connect project name')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project: string;
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const result = await getCcConnectManagementService().listSessions({
        project: options.project,
        ...buildCcConnectManagementInput(options),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify({ sessions: result }, null, 2));
        return;
      }
      if (result.length === 0) {
        writeLine(stdout, '没有检测到 cc-connect sessions');
        return;
      }
      for (const item of result) {
        writeLine(stdout, `${item.id}\t${item.session_key}\t${item.agent_type}\tactive=${item.active}\tlive=${item.live}\thistory=${item.history_count}`);
      }
    });

  ccConnect
    .command('session')
    .description('show cc-connect session detail')
    .requiredOption('--project <projectName>', 'cc-connect project name')
    .requiredOption('--session <sessionId>', 'cc-connect session id')
    .option('--history-limit <count>', 'history entries to return', '20')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project: string;
      session: string;
      historyLimit?: string;
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const historyLimit = options.historyLimit ? Number(options.historyLimit) : 20;
      if (!Number.isInteger(historyLimit) || historyLimit <= 0) {
        throw new Error(`invalid --history-limit value: ${options.historyLimit}. Expected positive integer.`);
      }
      const result = await getCcConnectManagementService().getSession({
        project: options.project,
        sessionId: options.session,
        historyLimit,
        ...buildCcConnectManagementInput(options),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, `${result.id}\t${result.session_key}\t${result.agent_type}\tactive=${result.active}\tlive=${result.live}\thistory=${result.history_count}`);
      for (const entry of result.history) {
        writeLine(stdout, `${entry.timestamp ?? '-'}\t${entry.role}\t${entry.content}`);
      }
    });

  ccConnect
    .command('bridges')
    .description('list connected cc-connect bridge adapters')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const result = await getCcConnectManagementService().listBridgeAdapters(buildCcConnectManagementInput(options));
      if (options.json) {
        writeLine(stdout, JSON.stringify({ adapters: result }, null, 2));
        return;
      }
      if (result.length === 0) {
        writeLine(stdout, '没有检测到已连接的 bridge adapters');
        return;
      }
      for (const item of result) {
        writeLine(stdout, `${item.platform}\t${item.project ?? '-'}\t${item.capabilities.join(',') || '-'}\t${item.connected_at ?? '-'}`);
      }
    });

  ccConnect
    .command('send')
    .description('send a message into a live cc-connect session')
    .requiredOption('--project <projectName>', 'cc-connect project name')
    .requiredOption('--session-key <sessionKey>', 'cc-connect session key')
    .requiredOption('--message <text>', 'message body to send')
    .option('--config <path>', 'cc-connect config path')
    .option('--base-url <url>', 'management api base url override')
    .option('--token <token>', 'management api token override')
    .option('--timeout <seconds>', 'probe timeout in seconds', '5')
    .option('--json', '输出 JSON', false)
    .action(async (options: {
      project: string;
      sessionKey: string;
      message: string;
      config?: string;
      baseUrl?: string;
      token?: string;
      timeout?: string;
      json?: boolean;
    }) => {
      const result = await getCcConnectManagementService().sendMessage({
        project: options.project,
        sessionKey: options.sessionKey,
        message: options.message,
        ...buildCcConnectManagementInput(options),
      });
      if (options.json) {
        writeLine(stdout, JSON.stringify(result, null, 2));
        return;
      }
      writeLine(stdout, result.message);
    });

  program
    .command('start')
    .alias('run')
    .description('一键启动本地开发栈（后端 + Dashboard）')
    .action(async () => {
      await runStartCommand({
        cwd: deps.startCommandCwd ?? process.cwd(),
        ...(deps.startCommandFallbackRoot ? { fallbackRoot: deps.startCommandFallbackRoot } : {}),
        ...(deps.startCommandRunner ? { runner: deps.startCommandRunner } : {}),
      });
    });

  return program;
}

export async function runCli(argv: string[]) {
  const program = createCliProgram();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (error: unknown) {
    const classified = classifyCliError(error, argv);
    process.stderr.write(`${renderCliError(classified, argv)}\n`);
    process.exitCode = classified.exitCode;
  }
}

export function isCliEntrypoint(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

const isEntrypoint = isCliEntrypoint(import.meta.url, process.argv[1]);

if (isEntrypoint) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const classified = classifyCliError(error, process.argv.slice(2));
    process.stderr.write(`${renderCliError(classified, process.argv.slice(2))}\n`);
    process.exitCode = classified.exitCode;
  });
}
