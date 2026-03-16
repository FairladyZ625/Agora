import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  TaskBrainCloseRecapRequest,
  TaskBrainWorkspaceBindingRef,
  TaskBrainWorkspacePort,
  TaskBrainWorkspaceRequest,
  TaskBrainWorkspaceResult,
} from '../task-brain-port.js';

export interface FilesystemTaskBrainWorkspaceAdapterOptions {
  brainPackRoot: string;
}

export class FilesystemTaskBrainWorkspaceAdapter implements TaskBrainWorkspacePort {
  constructor(private readonly options: FilesystemTaskBrainWorkspaceAdapterOptions) {}

  createWorkspace(input: TaskBrainWorkspaceRequest): TaskBrainWorkspaceResult {
    const workspacePath = resolve(
      this.options.brainPackRoot,
      ...(input.project_id ? ['projects', input.project_id, 'tasks'] : ['tasks']),
      input.task_id,
    );
    mkdirSync(workspacePath, { recursive: true });
    mkdirSync(join(workspacePath, '04-context'), { recursive: true });
    mkdirSync(join(workspacePath, '05-agents'), { recursive: true });
    mkdirSync(join(workspacePath, '06-artifacts'), { recursive: true });
    mkdirSync(join(workspacePath, '07-outputs'), { recursive: true });

    const binding = {
      brain_pack_ref: 'agora-ai-brain',
      brain_task_id: input.task_id,
      workspace_path: workspacePath,
      metadata: {
        project_id: input.project_id,
        controller_ref: input.controller_ref,
        current_stage: input.current_stage,
        control_mode: input.control_mode,
      },
    } satisfies TaskBrainWorkspaceResult;
    this.writeWorkspace(binding, input, { seedEmptyAgentNotes: true, seedContextFiles: true });
    return binding;
  }

  updateWorkspace(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainWorkspaceRequest): void {
    this.writeWorkspace(binding, input, { seedEmptyAgentNotes: false, seedContextFiles: false });
  }

  writeTaskCloseRecap(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainCloseRecapRequest): void {
    const taskRecapPath = join(binding.workspace_path, '07-outputs', 'task-close-recap.md');
    const recapBody = renderTaskCloseRecap(input);
    writeFileSync(taskRecapPath, recapBody, 'utf8');

    if (input.project_id) {
      const projectRecapDir = resolve(this.options.brainPackRoot, 'projects', input.project_id, 'recaps');
      mkdirSync(projectRecapDir, { recursive: true });
      writeFileSync(join(projectRecapDir, `${input.task_id}.md`), recapBody, 'utf8');
    }
  }

  destroyWorkspace(binding: TaskBrainWorkspaceBindingRef): void {
    if (!binding.workspace_path) {
      return;
    }
    rmSync(binding.workspace_path, { recursive: true, force: true });
  }

  private writeWorkspace(
    binding: TaskBrainWorkspaceBindingRef,
    input: TaskBrainWorkspaceRequest,
    options: { seedEmptyAgentNotes: boolean; seedContextFiles: boolean },
  ) {
    const workspacePath = binding.workspace_path;
    const currentStage = input.workflow_stages.find((stage) => stage.id === input.current_stage) ?? null;
    writeFileSync(join(workspacePath, 'task.meta.yaml'), renderTaskMeta(input, binding), 'utf8');
    writeFileSync(join(workspacePath, '00-current.md'), renderCurrent(input, currentStage), 'utf8');
    writeFileSync(join(workspacePath, '00-bootstrap.md'), renderBootstrap(input, workspacePath, currentStage), 'utf8');
    writeFileSync(join(workspacePath, '01-task-brief.md'), renderTaskBrief(input), 'utf8');
    writeFileSync(join(workspacePath, '02-roster.md'), renderRoster(input), 'utf8');
    writeFileSync(join(workspacePath, '03-stage-state.md'), renderStageState(input, currentStage), 'utf8');
    if (options.seedContextFiles) {
      writeFileSync(join(workspacePath, '04-context', 'user-input.md'), `${input.description.trim() || '(empty description)'}\n`, 'utf8');
      writeFileSync(join(workspacePath, '04-context', 'references.md'), '', 'utf8');
      writeFileSync(join(workspacePath, '04-context', 'linked-docs.md'), '', 'utf8');
    }
    for (const member of input.team_members) {
      const agentDir = join(workspacePath, '05-agents', member.agentId);
      mkdirSync(agentDir, { recursive: true });
      const roleDocPath = resolve(this.options.brainPackRoot, 'roles', `${member.role}.md`);
      const roleDoc = readRoleDocSummary(roleDocPath);
      writeFileSync(
        join(agentDir, '00-role-brief.md'),
        renderRoleBrief(input, workspacePath, member, currentStage, roleDoc, roleDocPath),
        'utf8',
      );
      writeFileSync(
        join(agentDir, '03-citizen-scaffold.md'),
        renderCitizenScaffold(input, member, roleDoc),
        'utf8',
      );
      if (options.seedEmptyAgentNotes) {
        writeFileSync(join(agentDir, '01-working-notes.md'), '', 'utf8');
        writeFileSync(join(agentDir, '02-outputs.md'), '', 'utf8');
      }
    }
  }
}

function renderTaskMeta(input: TaskBrainWorkspaceRequest, binding: TaskBrainWorkspaceResult) {
  const currentStage = input.workflow_stages.find((stage) => stage.id === input.current_stage) ?? null;
  return [
    `task_id: "${input.task_id}"`,
    `project_id: "${input.project_id ?? ''}"`,
    `brain_task_id: "${binding.brain_task_id}"`,
    `brain_pack_ref: "${binding.brain_pack_ref}"`,
    `workspace_path: "${binding.workspace_path}"`,
    `locale: "${input.locale}"`,
    `template_id: "${input.template_id}"`,
    `control_mode: "${input.control_mode}"`,
    `controller_ref: "${input.controller_ref ?? ''}"`,
    `task_state: "${input.state}"`,
    `current_stage: "${input.current_stage ?? ''}"`,
    `execution_kind: "${resolveStageExecutionKind(currentStage) ?? ''}"`,
    '',
  ].join('\n');
}

function renderCurrent(
  input: TaskBrainWorkspaceRequest,
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  return [
    `# ${brainText(input.locale, '当前状态', 'Current')}`,
    '',
    `- ${brainText(input.locale, '任务', 'Task')}: ${input.task_id}`,
    `- ${brainText(input.locale, 'Project', 'Project')}: ${input.project_id ?? '-'}`,
    `- ${brainText(input.locale, '标题', 'Title')}: ${input.title}`,
    `- ${brainText(input.locale, '任务状态', 'Task State')}: ${input.state}`,
    `- ${brainText(input.locale, '控制模式', 'Control Mode')}: ${input.control_mode}`,
    `- ${brainText(input.locale, '主控', 'Controller')}: ${input.controller_ref ?? '-'}`,
    `- ${brainText(input.locale, '当前阶段', 'Current Stage')}: ${input.current_stage ?? '-'}`,
    `- ${brainText(input.locale, '执行语义', 'Execution Kind')}: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `- ${brainText(input.locale, '允许动作', 'Allowed Actions')}: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    '',
  ].join('\n');
}

function renderBootstrap(
  input: TaskBrainWorkspaceRequest,
  workspacePath: string,
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  return [
    `# ${brainText(input.locale, '启动上下文', 'Bootstrap')}`,
    '',
    `${brainText(input.locale, '任务 ID', 'Task ID')}: ${input.task_id}`,
    `${brainText(input.locale, 'Project', 'Project')}: ${input.project_id ?? '-'}`,
    `${brainText(input.locale, '任务状态', 'Task State')}: ${input.state}`,
    `${brainText(input.locale, '控制模式', 'Control Mode')}: ${input.control_mode}`,
    `${brainText(input.locale, '主控', 'Controller')}: ${input.controller_ref ?? '-'}`,
    `${brainText(input.locale, '当前阶段', 'Current Stage')}: ${input.current_stage ?? '-'}`,
    `${brainText(input.locale, '执行语义', 'Execution Kind')}: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `${brainText(input.locale, '允许动作', 'Allowed Actions')}: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    '',
    `${brainText(input.locale, '执行前请先阅读以下文件', 'Read these files before acting')}:`,
    `- ~/.agora/skills/agora-bootstrap/SKILL.md`,
    `- ~/.codex/skills/agora-bootstrap/SKILL.md`,
    `- ${join(workspacePath, '01-task-brief.md')}`,
    `- ${join(workspacePath, '02-roster.md')}`,
    `- ${join(workspacePath, '03-stage-state.md')}`,
    '',
  ].join('\n');
}

function renderTaskBrief(input: TaskBrainWorkspaceRequest) {
  return [
    `# ${brainText(input.locale, '任务简报', 'Task Brief')}`,
    '',
    `## ${brainText(input.locale, '标题', 'Title')}`,
    '',
    input.title,
    '',
    `## ${brainText(input.locale, '描述', 'Description')}`,
    '',
    input.description.trim() || brainText(input.locale, '(空描述)', '(empty description)'),
    '',
  ].join('\n');
}

function renderRoster(input: TaskBrainWorkspaceRequest) {
  const rows = input.team_members.map((member) => (
    `- ${member.agentId} | ${member.role} | ${member.member_kind ?? 'citizen'} | ${member.agent_origin ?? 'user_managed'} | ${member.briefing_mode ?? 'overlay_full'}`
  ));
  return [`# ${brainText(input.locale, '成员清单', 'Roster')}`, '', ...rows, ''].join('\n');
}

function renderStageState(
  input: TaskBrainWorkspaceRequest,
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  return [
    `# ${brainText(input.locale, '阶段状态', 'Stage State')}`,
    '',
    `- ${brainText(input.locale, '当前阶段', 'Current Stage')}: ${input.current_stage ?? '-'}`,
    `- ${brainText(input.locale, '任务状态', 'Task State')}: ${input.state}`,
    `- ${brainText(input.locale, '控制模式', 'Control Mode')}: ${input.control_mode}`,
    `- ${brainText(input.locale, '阶段名称', 'Stage Name')}: ${currentStage?.name ?? '-'}`,
    `- ${brainText(input.locale, '执行语义', 'Execution Kind')}: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `- ${brainText(input.locale, '允许动作', 'Allowed Actions')}: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    `- ${brainText(input.locale, '门禁', 'Gate')}: ${currentStage?.gate?.type ?? '-'}`,
    '',
  ].join('\n');
}

function renderRoleBrief(
  input: TaskBrainWorkspaceRequest,
  workspacePath: string,
  member: TaskBrainWorkspaceRequest['team_members'][number],
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
  roleDoc: ReturnType<typeof readRoleDocSummary>,
  roleDocPath: string,
) {
  const scaffoldPath = join(workspacePath, '05-agents', member.agentId, '03-citizen-scaffold.md');
  return [
    '---',
    `role_id: "${member.role}"`,
    `agent_id: "${member.agentId}"`,
    `member_kind: "${member.member_kind ?? 'citizen'}"`,
    `agent_origin: "${member.agent_origin ?? 'user_managed'}"`,
    `briefing_mode: "${member.briefing_mode ?? 'overlay_full'}"`,
    `summary: "${escapeYaml(roleDoc.summary)}"`,
    `mission: "${escapeYaml(roleDoc.mission)}"`,
    `allowed_actions: [${resolveStageAllowedActions(currentStage).map((action) => `"${action}"`).join(', ')}]`,
    `forbidden_actions: []`,
    `escalate_to: "${input.controller_ref ?? ''}"`,
    `task_id: "${input.task_id}"`,
    `current_stage: "${input.current_stage ?? ''}"`,
    `execution_kind: "${resolveStageExecutionKind(currentStage) ?? ''}"`,
    `role_doc_path: "${roleDocPath}"`,
    '---',
    '',
    `# ${brainText(input.locale, '角色简报', 'Role Brief')}`,
    '',
    brainText(
      input.locale,
      `你是 \`${member.agentId}\`，当前在 Agora 中承担 \`${member.role}\` 角色。`,
      `You are \`${member.agentId}\` and your Agora role is \`${member.role}\`.`,
    ),
    member.briefing_mode === 'overlay_delta'
      ? brainText(input.locale, '该 Agent 已带有 Agora 托管的基础角色上下文；本简报仅补充本任务的增量信息。', 'This agent already carries Agora-managed base role context; this brief contains task-specific delta only.')
      : brainText(input.locale, '该 Agent 需要为本任务加载完整的 Agora 角色覆盖上下文。', 'This agent needs the full Agora role overlay for this task context.'),
    '',
    `${brainText(input.locale, '首先阅读', 'Read first')}: ${roleDocPath}`,
    `${brainText(input.locale, '任务工作区', 'Task workspace')}: ${workspacePath}`,
    `${brainText(input.locale, '任务简报', 'Task brief')}: ${join(workspacePath, '01-task-brief.md')}`,
    `${brainText(input.locale, '阶段状态', 'Stage state')}: ${join(workspacePath, '03-stage-state.md')}`,
    `${brainText(input.locale, 'Citizen Scaffold', 'Citizen Scaffold')}: ${scaffoldPath}`,
    '',
    `${brainText(input.locale, '主控', 'Controller')}: ${input.controller_ref ?? '-'}`,
    `${brainText(input.locale, '当前阶段', 'Current Stage')}: ${input.current_stage ?? '-'}`,
    `${brainText(input.locale, '控制模式', 'Control Mode')}: ${input.control_mode}`,
    '',
  ].join('\n');
}

function renderCitizenScaffold(
  input: TaskBrainWorkspaceRequest,
  member: TaskBrainWorkspaceRequest['team_members'][number],
  roleDoc: ReturnType<typeof readRoleDocSummary>,
) {
  const boundaries = roleDoc.boundaries.length > 0 ? roleDoc.boundaries : [
    brainText(input.locale, '沿用角色文档中的边界，不要越权。', 'Follow the role boundaries and do not overreach.'),
  ];
  const heartbeat = roleDoc.heartbeat.length > 0 ? roleDoc.heartbeat : [
    brainText(input.locale, '保持当前目标、阻塞与下一步动作可见。', 'Keep the current objective, blockers, and next action visible.'),
  ];
  const recap = roleDoc.recapExpectations.length > 0 ? roleDoc.recapExpectations : [
    brainText(input.locale, '留下当前进展、风险与下一步。', 'Leave current progress, risks, and next action.'),
  ];

  return [
    `# ${brainText(input.locale, 'Citizen Scaffold', 'Citizen Scaffold')}`,
    '',
    `- ${brainText(input.locale, 'Agent', 'Agent')}: ${member.agentId}`,
    `- ${brainText(input.locale, 'Agora 角色', 'Agora Role')}: ${member.role}`,
    `- ${brainText(input.locale, '成员类型', 'Member Kind')}: ${member.member_kind ?? 'citizen'}`,
    '',
    `## ${brainText(input.locale, 'Soul', 'Soul')}`,
    '',
    roleDoc.soul || brainText(input.locale, '保持该角色的核心职责与行为约束。', 'Preserve the role’s core responsibility and behavioral constraints.'),
    '',
    `## ${brainText(input.locale, 'Boundaries', 'Boundaries')}`,
    '',
    ...boundaries.map((item) => `- ${item}`),
    '',
    `## ${brainText(input.locale, 'Heartbeat', 'Heartbeat')}`,
    '',
    ...heartbeat.map((item) => `- ${item}`),
    '',
    `## ${brainText(input.locale, 'Recap Expectations', 'Recap Expectations')}`,
    '',
    ...recap.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function renderTaskCloseRecap(input: TaskBrainCloseRecapRequest) {
  return [
    `# ${brainText(input.locale, '任务收口回写', 'Task Close Recap')}`,
    '',
    `- ${brainText(input.locale, '任务', 'Task')}: ${input.task_id}`,
    `- ${brainText(input.locale, 'Project', 'Project')}: ${input.project_id ?? '-'}`,
    `- ${brainText(input.locale, '标题', 'Title')}: ${input.title}`,
    `- ${brainText(input.locale, '任务状态', 'Task State')}: ${input.state}`,
    `- ${brainText(input.locale, '当前阶段', 'Current Stage')}: ${input.current_stage ?? '-'}`,
    `- ${brainText(input.locale, '主控', 'Controller')}: ${input.controller_ref ?? '-'}`,
    `- ${brainText(input.locale, '完成人', 'Completed By')}: ${input.completed_by}`,
    `- ${brainText(input.locale, '完成时间', 'Completed At')}: ${input.completed_at}`,
    '',
    `## ${brainText(input.locale, '摘要', 'Summary')}`,
    '',
    ...input.summary_lines.map((line) => `- ${line}`),
    '',
  ].join('\n');
}

function brainText(locale: TaskBrainWorkspaceRequest['locale'], zh: string, en: string) {
  return locale === 'en-US' ? en : zh;
}

function resolveStageExecutionKind(stage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null) {
  if (!stage) {
    return null;
  }
  if (stage.execution_kind) {
    return stage.execution_kind;
  }
  if (stage.mode === 'execute') {
    return 'citizen_execute';
  }
  if (stage.mode === 'discuss') {
    return 'citizen_discuss';
  }
  return null;
}

function resolveStageAllowedActions(stage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null) {
  if (!stage) {
    return [];
  }
  if (stage.allowed_actions?.length) {
    return stage.allowed_actions;
  }
  const executionKind = resolveStageExecutionKind(stage);
  switch (executionKind) {
    case 'craftsman_dispatch':
      return ['dispatch_craftsman'];
    case 'citizen_execute':
      return ['execute'];
    case 'human_approval':
      return ['approve', 'reject'];
    case 'citizen_discuss':
      return ['discuss'];
    default:
      return [];
  }
}

function readRoleDocSummary(roleDocPath: string): {
  summary: string;
  mission: string;
  soul: string;
  boundaries: string[];
  heartbeat: string[];
  recapExpectations: string[];
} {
  if (!existsSync(roleDocPath)) {
    return { summary: '', mission: '', soul: '', boundaries: [], heartbeat: [], recapExpectations: [] };
  }
  const content = readFileSync(roleDocPath, 'utf8');
  const frontmatter = extractFrontmatter(content);
  const mission = extractSection(content, 'Mission');
  return {
    summary: frontmatter.summary ?? '',
    mission,
    soul: frontmatter.soul ?? '',
    boundaries: extractBulletSection(content, 'Boundaries'),
    heartbeat: splitFrontmatterList(frontmatter.heartbeat),
    recapExpectations: splitFrontmatterList(frontmatter.recap_expectations),
  };
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }
  const lines = (match[1] ?? '').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
    result[key] = value;
  }
  return result;
}

function extractSection(content: string, heading: string) {
  const pattern = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(\\n## |$)`);
  const match = content.match(pattern);
  return match?.[1]?.trim().replace(/\n+/g, ' ') ?? '';
}

function extractBulletSection(content: string, heading: string) {
  const pattern = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(\\n## |$)`);
  const match = content.match(pattern)?.[1] ?? '';
  return match
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function splitFrontmatterList(value: string | undefined) {
  return (value ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function escapeYaml(value: string) {
  return value.replaceAll('"', '\\"');
}
