#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import type { StartCommandRunner } from './start-command.js';
import type { CliCompositionFactories } from './composition.js';
import { createCliComposition } from './composition.js';
import { deriveGraphFromStages } from '@agora-ts/core';
import type { DashboardSessionClient } from './dashboard-session-client.js';
import type {
  CitizenService,
  DashboardQueryService,
  ProjectBrainService,
  ProjectService,
  RolePackService,
  TaskConversationService,
  TaskService,
  TemplateAuthoringService,
  TmuxRuntimeService,
} from '@agora-ts/core';
import type {
  CraftsmanCallbackRequestDto,
  CraftsmanInteractionExpectationDto,
  CraftsmanModeDto,
  CraftsmanExecutionStatusDto,
  CraftsmanInputKeyDto,
  CraftsmanRuntimeIdentitySourceDto,
  CreateCitizenRequestDto,
  CreateProjectRequestDto,
  CreateSubtasksRequestDto,
  CreateTaskRequestDto,
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
  tmuxSendKeysRequestSchema,
  tmuxSendTextRequestSchema,
  tmuxSubmitChoiceRequestSchema,
} from '@agora-ts/contracts';
import { runInitCommand } from './init-command.js';
import { runStartCommand } from './start-command.js';
import { classifyCliError, CliError, CLI_EXIT_CODES, renderCliError } from './errors.js';
import { cliText, resolveCliLocale } from './locale.js';
import type { HumanAccountService } from '@agora-ts/core';

type Writable = {
  write: (chunk: string) => void;
};

type CreateTaskInputLike = Omit<CreateTaskRequestDto, 'locale'> & {
  locale?: 'zh-CN' | 'en-US';
};

type CreateProjectInputLike = CreateProjectRequestDto;
type CreateCitizenInputLike = CreateCitizenRequestDto;

export interface CliDependencies {
  taskService?: TaskService;
  projectService?: ProjectService;
  projectBrainService?: ProjectBrainService;
  citizenService?: CitizenService;
  tmuxRuntimeService?: TmuxRuntimeServiceLike;
  dashboardSessionClient?: DashboardSessionClient;
  humanAccountService?: HumanAccountService;
  taskConversationService?: TaskConversationService;
  templateAuthoringService?: TemplateAuthoringService;
  rolePackService?: RolePackService;
  dashboardQueryService?: DashboardQueryService;
  factories?: Partial<CliCompositionFactories>;
  startCommandRunner?: StartCommandRunner;
  startCommandCwd?: string;
  startCommandFallbackRoot?: string;
  configPath?: string;
  dbPath?: string;
  stdout?: Writable;
  stderr?: Writable;
}

type TmuxRuntimeServiceLike = Pick<TmuxRuntimeService, 'up' | 'status' | 'send' | 'sendText' | 'sendKeys' | 'submitChoice' | 'start' | 'resume' | 'task' | 'tail' | 'doctor' | 'down' | 'recordIdentity'>;

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
  const tmuxRuntimeService = createLazyObject(() => deps.tmuxRuntimeService ?? resolveComposition().tmuxRuntimeService);
  const dashboardSessionClient = createLazyObject(() => deps.dashboardSessionClient ?? resolveComposition().dashboardSessionClient);
  const humanAccountService = createLazyObject(() => deps.humanAccountService ?? resolveComposition().humanAccountService);
  const taskConversationService = createLazyObject(() => deps.taskConversationService ?? resolveComposition().taskConversationService);
  const templateAuthoringService = createLazyObject(() => deps.templateAuthoringService ?? resolveComposition().templateAuthoringService);
  const rolePackService = createLazyObject(() => deps.rolePackService ?? resolveComposition().rolePackService);
  const dashboardQueryService = createLazyObject(() => deps.dashboardQueryService ?? resolveComposition().dashboardQueryService);
  const projectService = createLazyObject(() => deps.projectService ?? resolveComposition().projectService);
  const projectBrainService = createLazyObject(() => deps.projectBrainService ?? resolveComposition().projectBrainService);
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
    .option('--smoke-test', 'mark this task as smoke/test mode', false)
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
      smokeTest?: boolean;
      controller?: string;
      bind?: string[];
    }) => {
      const input = createTaskRequestSchema.parse({
        title,
        type: options.type,
        creator: options.creator,
        description: '',
        priority: options.priority,
        locale: options.locale,
        ...(options.projectId ? { project_id: options.projectId } : {}),
        ...(options.teamJson ? { team_override: parseJsonOption(options.teamJson, '--team-json') } : {}),
        ...(options.workflowJson ? { workflow_override: parseJsonOption(options.workflowJson, '--workflow-json') } : {}),
        ...(options.imTargetJson ? { im_target: parseJsonOption(options.imTargetJson, '--im-target-json') } : {}),
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
  const citizens = program
    .command('citizens')
    .description('citizen definition and projection preview commands');

  const graph = program
    .command('graph')
    .description('workflow graph commands');
  const archive = program
    .command('archive')
    .description('archive control commands');

  addRedirectCommand(program, 'tmux', 'agora craftsman tmux', [
    'agora craftsman tmux --help',
    'agora craftsman tmux status',
  ]);
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
    .command('create')
    .description('创建 project')
    .requiredOption('--id <projectId>', 'project id')
    .requiredOption('--name <name>', 'project name')
    .option('--summary <summary>', 'project summary')
    .option('--owner <owner>', 'project owner')
    .option('--metadata-json <json>', 'project metadata JSON')
    .action((options: {
      id: string;
      name: string;
      summary?: string;
      owner?: string;
      metadataJson?: string;
    }) => {
      const input = createProjectRequestSchema.parse({
        id: options.id,
        name: options.name,
        ...(options.summary !== undefined ? { summary: options.summary } : {}),
        ...(options.owner !== undefined ? { owner: options.owner } : {}),
        ...(options.metadataJson ? { metadata: parseJsonOption(options.metadataJson, '--metadata-json') } : {}),
      }) satisfies CreateProjectInputLike;
      const project = projectService.createProject(input);
      writeLine(stdout, `Project 已创建: ${project.id}`);
      writeLine(stdout, `名称: ${project.name}`);
      writeLine(stdout, `状态: ${project.status}`);
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

  const projectKnowledge = projects
    .command('knowledge')
    .description('project knowledge CRUD');
  const projectBrain = projects
    .command('brain')
    .description('project brain query / append commands');

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
    .action((options: {
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
    .requiredOption('--project <projectId>', 'project id')
    .requiredOption('--query <query>', 'search query')
    .option('--kind <kind>', 'index|timeline|recap|decision|fact|open_question|reference|citizen_scaffold')
    .option('--json', '输出 JSON', false)
    .action((options: {
      project: string;
      query: string;
      kind?: 'index' | 'timeline' | 'recap' | 'decision' | 'fact' | 'open_question' | 'reference' | 'citizen_scaffold';
      json?: boolean;
    }) => {
      const results = projectBrainService.queryDocuments(options.project, options.query, options.kind);
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
    .action((options: {
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
    .action((jobId: string, options: { commitHash: string }) => {
      const job = dashboardQueryService.updateArchiveJob(Number(jobId), {
        status: 'synced',
        commit_hash: options.commitHash,
      });
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
    .action((options: { json?: boolean }) => {
      const result = dashboardQueryService.ingestArchiveJobReceipts();
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

  const tmux = craftsman
    .command('tmux')
    .description('legacy debug tmux runtime commands for craftsmen panes');

  const runtime = craftsman
    .command('runtime')
    .description('generic runtime identity and observability commands');
  const dashboardSession = dashboard
    .command('session')
    .description('dashboard session auth commands');
  const dashboardUsers = dashboard
    .command('users')
    .description('dashboard human account commands');

  tmux
    .command('up')
    .description('初始化 tmux craftsmen session')
    .action(() => {
      const result = tmuxRuntimeService.up();
      writeLine(stdout, `tmux session 已就绪: ${result.session}`);
      for (const pane of result.panes) {
        writeLine(stdout, `${pane.id}\t${pane.title}\t${pane.currentCommand}\t${pane.active ? 'active' : 'idle'}`);
      }
    });

  tmux
    .command('status')
    .description('查看 tmux pane 状态')
    .action(() => {
      const result = tmuxRuntimeService.status();
      for (const pane of result.panes) {
        writeLine(
          stdout,
          `${pane.id}\t${pane.title}\t${pane.currentCommand}\t${pane.active ? 'active' : 'idle'}\t${pane.continuityBackend}\t${pane.identitySource}\t${pane.sessionReference ?? '-'}\t${pane.identityPath ?? '-'}\t${pane.sessionObservedAt ?? '-'}`,
        );
      }
    });

  tmux
    .command('send')
    .description('向指定 tmux pane 发送原始命令')
    .argument('<agent>', 'agent pane name')
    .argument('<command>', 'raw shell command')
    .action((agent: string, command: string) => {
      tmuxRuntimeService.send(agent, command);
      writeLine(stdout, `tmux command 已发送: ${agent}`);
    });

  tmux
    .command('send-text')
    .description('向指定 tmux pane 发送文本输入')
    .argument('<agent>', 'agent pane name')
    .argument('<text>', 'text input')
    .option('--no-submit', '发送后不自动回车')
    .action((agent: string, text: string, options: { submit?: boolean }) => {
      const payload = tmuxSendTextRequestSchema.parse({
        agent,
        text,
        submit: options.submit ?? true,
      });
      tmuxRuntimeService.sendText(payload.agent, payload.text, payload.submit);
      writeLine(stdout, `tmux text 已发送: ${agent}`);
    });

  tmux
    .command('send-keys')
    .description('向指定 tmux pane 发送结构化按键')
    .argument('<agent>', 'agent pane name')
    .argument('<keys...>', 'keys like Down Tab Enter')
    .action((agent: string, keys: CraftsmanInputKeyDto[]) => {
      const payload = tmuxSendKeysRequestSchema.parse({
        agent,
        keys,
      });
      tmuxRuntimeService.sendKeys(payload.agent, payload.keys);
      writeLine(stdout, `tmux keys 已发送: ${agent}`);
    });

  tmux
    .command('submit-choice')
    .description('向指定 tmux pane 提交 choice，自动补 Enter')
    .argument('<agent>', 'agent pane name')
    .argument('[keys...]', 'optional navigation keys before submit')
    .action((agent: string, keys: CraftsmanInputKeyDto[] = []) => {
      const payload = tmuxSubmitChoiceRequestSchema.parse({
        agent,
        keys,
      });
      tmuxRuntimeService.submitChoice(payload.agent, payload.keys);
      writeLine(stdout, `tmux choice 已提交: ${agent}`);
    });

  tmux
    .command('start')
    .description('启动指定 agent 的 interactive runtime')
    .argument('<agent>', 'agent pane name')
    .action((agent: string) => {
      const result = tmuxRuntimeService.start(agent, process.cwd());
      writeLine(stdout, `tmux runtime 已启动: ${agent}`);
      writeLine(stdout, `pane: ${result.pane ?? '-'}`);
      writeLine(stdout, `mode: ${result.recoveryMode}`);
      writeLine(stdout, `command: ${result.command}`);
    });

  tmux
    .command('resume')
    .description('恢复指定 agent 的 interactive runtime')
    .argument('<agent>', 'agent pane name')
    .argument('[sessionReference]', 'resume session reference')
    .action((agent: string, sessionReference?: string) => {
      const result = tmuxRuntimeService.resume(agent, sessionReference ?? null, process.cwd());
      writeLine(stdout, `tmux runtime 已恢复: ${agent}`);
      writeLine(stdout, `pane: ${result.pane ?? '-'}`);
      writeLine(stdout, `mode: ${result.recoveryMode}`);
      writeLine(stdout, `command: ${result.command}`);
    });

  tmux
    .command('task')
    .description('通过 tmux pane 派发一条简短 CLI 任务')
    .argument('<agent>', 'agent pane name')
    .argument('<prompt>', 'prompt')
    .option('--workdir <workdir>', '工作目录')
    .action((agent: string, prompt: string, options: { workdir?: string }) => {
      const result = tmuxRuntimeService.task(agent, {
        execution_id: `tmux-${Date.now()}`,
        task_id: 'TMUX',
        stage_id: 'dispatch',
        subtask_id: `${agent}-tmux-task`,
        adapter: agent,
        mode: 'one_shot',
        workdir: options.workdir ?? process.cwd(),
        prompt,
        brief_path: null,
      });
      writeLine(stdout, `tmux task 已派发: ${result.session_id ?? '-'}`);
    });

  tmux
    .command('tail')
    .description('查看 tmux pane 最近输出')
    .argument('<agent>', 'agent pane name')
    .option('--lines <lines>', '输出行数', '40')
    .action((agent: string, options: { lines: string }) => {
      writeLine(stdout, tmuxRuntimeService.tail(agent, Number(options.lines)));
    });

  tmux
    .command('doctor')
    .description('查看 tmux pane readiness')
    .action(() => {
      const result = tmuxRuntimeService.doctor();
      for (const pane of result.panes) {
        writeLine(
          stdout,
          `${pane.agent}\t${pane.pane ?? '-'}\t${pane.command ?? '-'}\t${pane.ready ? 'ready' : 'missing'}\t${pane.continuityBackend}\t${pane.identitySource}\t${pane.sessionReference ?? '-'}\t${pane.identityPath ?? '-'}\t${pane.sessionObservedAt ?? '-'}`,
        );
      }
    });

  tmux
    .command('down')
    .description('关闭 tmux craftsmen session')
    .action(() => {
      const result = tmuxRuntimeService.status();
      tmuxRuntimeService.down();
      writeLine(stdout, `tmux session 已关闭: ${result.session}`);
    });

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
      const result = tmuxRuntimeService.recordIdentity(agent, {
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
    .description('登录 dashboard session 并缓存 cookie')
    .requiredOption('--username <username>', '用户名')
    .requiredOption('--password <password>', '密码')
    .action(async (options: { username: string; password: string }) => {
      const result = await dashboardSessionClient.login({
        username: options.username,
        password: options.password,
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
