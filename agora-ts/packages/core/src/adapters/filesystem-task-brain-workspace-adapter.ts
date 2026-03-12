import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
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
    const workspacePath = resolve(this.options.brainPackRoot, 'tasks', input.task_id);
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
        controller_ref: input.controller_ref,
        current_stage: input.current_stage,
      },
    } satisfies TaskBrainWorkspaceResult;
    this.writeWorkspace(binding, input, { seedEmptyAgentNotes: true, seedContextFiles: true });
    return binding;
  }

  updateWorkspace(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainWorkspaceRequest): void {
    this.writeWorkspace(binding, input, { seedEmptyAgentNotes: false, seedContextFiles: false });
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
      writeFileSync(
        join(agentDir, '00-role-brief.md'),
        renderRoleBrief(input, workspacePath, member, currentStage),
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
      `brain_task_id: "${binding.brain_task_id}"`,
      `brain_pack_ref: "${binding.brain_pack_ref}"`,
    `workspace_path: "${binding.workspace_path}"`,
    `template_id: "${input.template_id}"`,
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
    `# Current`,
    '',
    `- Task: ${input.task_id}`,
    `- Title: ${input.title}`,
    `- Task State: ${input.state}`,
    `- Controller: ${input.controller_ref ?? '-'}`,
    `- Current Stage: ${input.current_stage ?? '-'}`,
    `- Execution Kind: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `- Allowed Actions: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    '',
  ].join('\n');
}

function renderBootstrap(
  input: TaskBrainWorkspaceRequest,
  workspacePath: string,
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  return [
    '# Bootstrap',
    '',
    `Task ID: ${input.task_id}`,
    `Task State: ${input.state}`,
    `Controller: ${input.controller_ref ?? '-'}`,
    `Current Stage: ${input.current_stage ?? '-'}`,
    `Execution Kind: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `Allowed Actions: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    '',
    'Read these files before acting:',
    `- ~/.agora/skills/agora-bootstrap/SKILL.md`,
    `- ${join(workspacePath, '01-task-brief.md')}`,
    `- ${join(workspacePath, '02-roster.md')}`,
    `- ${join(workspacePath, '03-stage-state.md')}`,
    '',
  ].join('\n');
}

function renderTaskBrief(input: TaskBrainWorkspaceRequest) {
  return [
    '# Task Brief',
    '',
    `## Title`,
    '',
    input.title,
    '',
    `## Description`,
    '',
    input.description.trim() || '(empty description)',
    '',
  ].join('\n');
}

function renderRoster(input: TaskBrainWorkspaceRequest) {
  const rows = input.team_members.map((member) => (
    `- ${member.agentId} | ${member.role} | ${member.member_kind ?? 'citizen'} | ${member.agent_origin ?? 'user_managed'} | ${member.briefing_mode ?? 'overlay_full'}`
  ));
  return ['# Roster', '', ...rows, ''].join('\n');
}

function renderStageState(
  input: TaskBrainWorkspaceRequest,
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  return [
    '# Stage State',
    '',
    `- Current Stage: ${input.current_stage ?? '-'}`,
    `- Task State: ${input.state}`,
    `- Stage Name: ${currentStage?.name ?? '-'}`,
    `- Execution Kind: ${resolveStageExecutionKind(currentStage) ?? '-'}`,
    `- Allowed Actions: ${(resolveStageAllowedActions(currentStage).join(', ') || '-')}`,
    `- Gate: ${currentStage?.gate?.type ?? '-'}`,
    '',
  ].join('\n');
}

function renderRoleBrief(
  input: TaskBrainWorkspaceRequest,
  workspacePath: string,
  member: TaskBrainWorkspaceRequest['team_members'][number],
  currentStage: TaskBrainWorkspaceRequest['workflow_stages'][number] | null,
) {
  const roleDocPath = resolve(workspacePath, '..', '..', 'roles', `${member.role}.md`);
  const roleDoc = readRoleDocSummary(roleDocPath);
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
    '# Role Brief',
    '',
    `You are \`${member.agentId}\` and your Agora role is \`${member.role}\`.`,
    member.briefing_mode === 'overlay_delta'
      ? 'This agent already carries Agora-managed base role context; this brief contains task-specific delta only.'
      : 'This agent needs the full Agora role overlay for this task context.',
    '',
    `Read first: ${roleDocPath}`,
    `Task workspace: ${workspacePath}`,
    `Task brief: ${join(workspacePath, '01-task-brief.md')}`,
    `Stage state: ${join(workspacePath, '03-stage-state.md')}`,
    '',
    `Controller: ${input.controller_ref ?? '-'}`,
    `Current Stage: ${input.current_stage ?? '-'}`,
    '',
  ].join('\n');
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

function readRoleDocSummary(roleDocPath: string): { summary: string; mission: string } {
  if (!existsSync(roleDocPath)) {
    return { summary: '', mission: '' };
  }
  const content = readFileSync(roleDocPath, 'utf8');
  const frontmatter = extractFrontmatter(content);
  const mission = extractSection(content, 'Mission');
  return {
    summary: frontmatter.summary ?? '',
    mission,
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

function escapeYaml(value: string) {
  return value.replaceAll('"', '\\"');
}
