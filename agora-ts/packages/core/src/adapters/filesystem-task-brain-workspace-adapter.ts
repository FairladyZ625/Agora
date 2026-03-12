import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TaskBrainWorkspacePort, TaskBrainWorkspaceRequest, TaskBrainWorkspaceResult } from '../task-brain-port.js';

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

    writeFileSync(
      join(workspacePath, 'task.meta.yaml'),
      renderTaskMeta(input, {
        brain_pack_ref: 'agora-ai-brain',
        brain_task_id: input.task_id,
        workspace_path: workspacePath,
      }),
      'utf8',
    );
    writeFileSync(join(workspacePath, '00-current.md'), renderCurrent(input), 'utf8');
    writeFileSync(join(workspacePath, '00-bootstrap.md'), renderBootstrap(input), 'utf8');
    writeFileSync(join(workspacePath, '01-task-brief.md'), renderTaskBrief(input), 'utf8');
    writeFileSync(join(workspacePath, '02-roster.md'), renderRoster(input), 'utf8');
    writeFileSync(join(workspacePath, '03-stage-state.md'), renderStageState(input), 'utf8');
    writeFileSync(join(workspacePath, '04-context', 'user-input.md'), `${input.description.trim() || '(empty description)'}\n`, 'utf8');
    writeFileSync(join(workspacePath, '04-context', 'references.md'), '', 'utf8');
    writeFileSync(join(workspacePath, '04-context', 'linked-docs.md'), '', 'utf8');

    const roleBriefTemplate = resolve(this.options.brainPackRoot, 'templates', '00-role-brief.md');
    for (const member of input.team_members) {
      const agentDir = join(workspacePath, '05-agents', member.agentId);
      mkdirSync(agentDir, { recursive: true });
      if (existsSync(roleBriefTemplate)) {
        copyFileSync(roleBriefTemplate, join(agentDir, '00-role-brief.md'));
      } else {
        writeFileSync(join(agentDir, '00-role-brief.md'), renderFallbackRoleBrief(input, member), 'utf8');
      }
      writeFileSync(join(agentDir, '01-working-notes.md'), '', 'utf8');
      writeFileSync(join(agentDir, '02-outputs.md'), '', 'utf8');
    }

    return {
      brain_pack_ref: 'agora-ai-brain',
      brain_task_id: input.task_id,
      workspace_path: workspacePath,
      metadata: {
        controller_ref: input.controller_ref,
        current_stage: input.current_stage,
      },
    };
  }

  destroyWorkspace(binding: TaskBrainWorkspaceResult): void {
    if (!binding.workspace_path) {
      return;
    }
    rmSync(binding.workspace_path, { recursive: true, force: true });
  }
}

function renderTaskMeta(input: TaskBrainWorkspaceRequest, binding: TaskBrainWorkspaceResult) {
  return [
    `task_id: "${input.task_id}"`,
    `brain_task_id: "${binding.brain_task_id}"`,
    `brain_pack_ref: "${binding.brain_pack_ref}"`,
    `workspace_path: "${binding.workspace_path}"`,
    `template_id: "${input.template_id}"`,
    `controller_ref: "${input.controller_ref ?? ''}"`,
    `current_stage: "${input.current_stage ?? ''}"`,
    `execution_kind: ""`,
    '',
  ].join('\n');
}

function renderCurrent(input: TaskBrainWorkspaceRequest) {
  return [
    `# Current`,
    '',
    `- Task: ${input.task_id}`,
    `- Title: ${input.title}`,
    `- Controller: ${input.controller_ref ?? '-'}`,
    `- Current Stage: ${input.current_stage ?? '-'}`,
    '',
  ].join('\n');
}

function renderBootstrap(input: TaskBrainWorkspaceRequest) {
  return [
    '# Bootstrap',
    '',
    `Task ID: ${input.task_id}`,
    `Controller: ${input.controller_ref ?? '-'}`,
    `Current Stage: ${input.current_stage ?? '-'}`,
    '',
    'Use the Agora bootstrap skill and this workspace before acting.',
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
  const rows = input.team_members.map((member) => `- ${member.agentId} | ${member.role} | ${member.member_kind ?? 'citizen'}`);
  return ['# Roster', '', ...rows, ''].join('\n');
}

function renderStageState(input: TaskBrainWorkspaceRequest) {
  return [
    '# Stage State',
    '',
    `- Current Stage: ${input.current_stage ?? '-'}`,
    `- Execution Kind: (pending)`,
    '',
  ].join('\n');
}

function renderFallbackRoleBrief(
  input: TaskBrainWorkspaceRequest,
  member: TaskBrainWorkspaceRequest['team_members'][number],
) {
  return [
    '---',
    `role_id: "${member.role}"`,
    `agent_id: "${member.agentId}"`,
    `member_kind: "${member.member_kind ?? 'citizen'}"`,
    `summary: ""`,
    `mission: ""`,
    'allowed_actions: []',
    'forbidden_actions: []',
    `escalate_to: "${input.controller_ref ?? ''}"`,
    `task_id: "${input.task_id}"`,
    `current_stage: "${input.current_stage ?? ''}"`,
    'execution_kind: ""',
    '---',
    '',
    '# Role Brief',
    '',
  ].join('\n');
}
