import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ITemplateRepository,
  TaskBlueprintDto,
  TaskRecord,
  TaskStatusDto,
  WorkflowDto,
} from '@agora-ts/contracts';
import type { IMPublishMessageInput } from './im-ports.js';
import type { AgentRuntimePort } from './runtime-ports.js';
import type { SkillCatalogEntry, SkillCatalogPort } from './skill-catalog-port.js';
import type { TaskAuthorityService } from './task-authority-service.js';
import type {
  TaskBrainContextArtifact,
  TaskBrainContextAudience,
  TaskBrainWorkspacePort,
} from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskBroadcastService } from './task-broadcast-service.js';
import type { TaskParticipationService } from './task-participation-service.js';
import type { ContextMaterializationService } from './context-materialization-service.js';
import type { ProjectBrainAutomationService } from './project-brain-automation-service.js';
import type { StageRosterService } from './stage-roster-service.js';
import { resolveControllerRef } from './team-member-kind.js';

const TASK_BRAIN_CONTEXT_AUDIENCES: TaskBrainContextAudience[] = ['controller', 'craftsman', 'citizen'];

export type TaskTemplate = {
  name: string;
  defaultWorkflow?: string;
  defaultTeam?: Record<
    string,
    {
      member_kind?: 'controller' | 'citizen' | 'craftsman';
      model_preference?: string;
      suggested?: string[];
    }
  >;
  stages?: WorkflowDto['stages'];
  graph?: WorkflowDto['graph'];
};

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

export interface TaskLifecycleSupportOptions {
  templateRepository: ITemplateRepository;
  taskAuthorities: Pick<TaskAuthorityService, 'getTaskAuthority'>;
  stageRosterService: StageRosterService;
  taskBroadcastService: TaskBroadcastService;
  agentRuntimePort: AgentRuntimePort | undefined;
  taskBrainWorkspacePort: TaskBrainWorkspacePort | undefined;
  taskBrainBindingService: TaskBrainBindingService | undefined;
  taskParticipationService: TaskParticipationService | undefined;
  contextMaterializationService: Pick<ContextMaterializationService, 'materializeSync'> | undefined;
  projectBrainAutomationService: ProjectBrainAutomationService | undefined;
  skillCatalogPort: SkillCatalogPort | undefined;
}

export class TaskLifecycleSupport {
  private readonly templateRepository: ITemplateRepository;
  private readonly taskAuthorities: Pick<TaskAuthorityService, 'getTaskAuthority'>;
  private readonly stageRosterService: StageRosterService;
  private readonly taskBroadcastService: TaskBroadcastService;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;
  private readonly taskBrainWorkspacePort: TaskBrainWorkspacePort | undefined;
  private readonly taskBrainBindingService: TaskBrainBindingService | undefined;
  private readonly taskParticipationService: TaskParticipationService | undefined;
  private readonly contextMaterializationService: Pick<ContextMaterializationService, 'materializeSync'> | undefined;
  private readonly projectBrainAutomationService: ProjectBrainAutomationService | undefined;
  private readonly skillCatalogPort: SkillCatalogPort | undefined;

  constructor(options: TaskLifecycleSupportOptions) {
    this.templateRepository = options.templateRepository;
    this.taskAuthorities = options.taskAuthorities;
    this.stageRosterService = options.stageRosterService;
    this.taskBroadcastService = options.taskBroadcastService;
    this.agentRuntimePort = options.agentRuntimePort;
    this.taskBrainWorkspacePort = options.taskBrainWorkspacePort;
    this.taskBrainBindingService = options.taskBrainBindingService;
    this.taskParticipationService = options.taskParticipationService;
    this.contextMaterializationService = options.contextMaterializationService;
    this.projectBrainAutomationService = options.projectBrainAutomationService;
    this.skillCatalogPort = options.skillCatalogPort;
  }

  tryLoadTemplate(taskType: string): TaskTemplate | null {
    const stored = this.templateRepository.getTemplate(taskType);
    return stored ? stored.template as TaskTemplate : null;
  }

  buildWorkflow(template: TaskTemplate): WorkflowDto {
    return {
      type: template.defaultWorkflow ?? 'linear',
      stages: template.stages ?? [],
      ...(template.graph ? { graph: template.graph } : {}),
    };
  }

  buildTeam(template: TaskTemplate): TaskRecord['team'] {
    const members = Object.entries(template.defaultTeam ?? {}).map(([role, config]) => ({
      role,
      agentId: config.suggested?.[0] ?? role,
      ...(config.member_kind ? { member_kind: config.member_kind } : {}),
      model_preference: config.model_preference ?? '',
    }));
    return { members };
  }

  enrichTeam(team: TaskRecord['team']): TaskRecord['team'] {
    return {
      members: team.members.map((member) => {
        const resolved = this.agentRuntimePort?.resolveAgent(member.agentId);
        const agentOrigin: 'agora_managed' | 'user_managed' = member.agent_origin
          ?? resolved?.agent_origin
          ?? 'user_managed';
        const briefingMode: 'overlay_full' | 'overlay_delta' = member.briefing_mode
          ?? resolved?.briefing_mode
          ?? (agentOrigin === 'agora_managed' ? 'overlay_delta' : 'overlay_full');
        return {
          ...member,
          agent_origin: agentOrigin,
          briefing_mode: briefingMode,
        };
      }),
    };
  }

  withControllerRef(task: TaskRecord): TaskRecord & {
    controller_ref: string | null;
    authority: ReturnType<TaskAuthorityService['getTaskAuthority']>;
  } {
    return {
      ...task,
      authority: this.taskAuthorities.getTaskAuthority(task.id),
      controller_ref: resolveControllerRef(task.team.members),
    };
  }

  getStageByIdOrThrow(task: TaskRecord, stageId: string) {
    const stage = (task.workflow.stages ?? []).find((item) => item.id === stageId);
    if (!stage) {
      throw new Error(`Task ${task.id} is missing workflow stage '${stageId}'`);
    }
    return stage;
  }

  collectImParticipantRefs(
    task: Pick<TaskRecord, 'team'>,
    stage: WorkflowStageLike | null,
    explicitRefs?: string[] | null,
  ): string[] {
    const rosterRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage ?? undefined);
    return Array.from(new Set([
      ...rosterRefs,
      ...(explicitRefs ?? []),
    ]));
  }

  buildTaskBlueprint(task: TaskRecord): TaskBlueprintDto {
    if (task.workflow.graph) {
      const graph = task.workflow.graph;
      return {
        graph_version: graph.graph_version,
        entry_nodes: [...graph.entry_nodes],
        controller_ref: resolveControllerRef(task.team.members),
        nodes: graph.nodes.map((node) => ({
          id: node.id,
          name: node.name ?? null,
          mode: resolveStageModeFromExecutionKind(node.execution_kind ?? null),
          execution_kind: node.execution_kind ?? null,
          ...(node.allowed_actions?.length ? { allowed_actions: node.allowed_actions } : {}),
          ...(node.roster ? { roster: node.roster } : {}),
          gate_type: node.gate?.type ?? null,
        })),
        edges: graph.edges
          .filter((edge): edge is typeof edge & { kind: 'advance' | 'reject' | 'branch' | 'complete' } => (
            edge.kind === 'advance'
            || edge.kind === 'reject'
            || edge.kind === 'branch'
            || edge.kind === 'complete'
          ))
          .map((edge) => ({
            from: edge.from,
            to: edge.to,
            kind: edge.kind,
          })),
        artifact_contracts: graph.nodes
          .filter((node) => node.execution_kind === 'citizen_execute' || node.execution_kind === 'craftsman_dispatch')
          .map((node) => ({
            node_id: node.id,
            artifact_type: 'stage_output',
          })),
        role_bindings: task.team.members,
      };
    }

    const stages = task.workflow.stages ?? [];
    const nodes: TaskBlueprintDto['nodes'] = stages.map((stage) => ({
      id: stage.id,
      name: stage.name ?? null,
      mode: stage.mode ?? null,
      execution_kind: resolveStageExecutionKind(stage),
      ...(resolveAllowedActions(stage).length > 0 ? { allowed_actions: resolveAllowedActions(stage) } : {}),
      ...(stage.roster ? { roster: stage.roster } : {}),
      gate_type: stage.gate?.type ?? null,
    }));

    const edges: TaskBlueprintDto['edges'] = [];
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      const nextStageId = stages[index + 1]?.id;
      if (nextStageId) {
        edges.push({
          from: stage.id,
          to: nextStageId,
          kind: 'advance',
        });
      }
      if (stage.reject_target) {
        edges.push({
          from: stage.id,
          to: stage.reject_target,
          kind: 'reject',
        });
      }
    }

    return {
      graph_version: 1,
      entry_nodes: stages[0] ? [stages[0].id] : [],
      controller_ref: resolveControllerRef(task.team.members),
      nodes,
      edges,
      artifact_contracts: stages
        .filter((stage) => stage.mode === 'execute')
        .map((stage) => ({
          node_id: stage.id,
          artifact_type: 'stage_output',
        })),
      role_bindings: task.team.members,
    };
  }

  buildTaskBrainWorkspaceRequest(task: TaskRecord, templateId: string) {
    const projectBrainContexts = this.buildProjectBrainContexts(task);
    return {
      task_id: task.id,
      project_id: task.project_id ?? null,
      locale: task.locale,
      title: task.title,
      description: task.description ?? '',
      type: task.type,
      priority: task.priority,
      creator: task.creator,
      template_id: templateId,
      control_mode: task.control?.mode ?? 'normal',
      state: task.state,
      controller_ref: resolveControllerRef(task.team.members),
      current_stage: task.current_stage,
      current_stage_participants: this.stageRosterService.resolveDesiredRefs(
        task.team,
        task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : undefined,
      ),
      workflow_stages: (task.workflow.stages ?? []).map((stage) => ({
        id: stage.id,
        ...(stage.name ? { name: stage.name } : {}),
        ...(stage.mode ? { mode: stage.mode } : {}),
        ...(stage.execution_kind ? { execution_kind: stage.execution_kind } : {}),
        ...(stage.allowed_actions ? { allowed_actions: stage.allowed_actions } : {}),
        ...(stage.roster ? { roster: stage.roster } : {}),
        ...(stage.gate ? { gate: { ...(stage.gate.type ? { type: stage.gate.type } : {}) } } : {}),
      })),
      team_members: task.team.members.map((member) => ({
        role: member.role,
        agentId: member.agentId,
        ...(member.member_kind ? { member_kind: member.member_kind } : {}),
        model_preference: member.model_preference,
        ...(member.agent_origin ? { agent_origin: member.agent_origin } : {}),
        ...(member.briefing_mode ? { briefing_mode: member.briefing_mode } : {}),
      })),
      ...(projectBrainContexts ? { project_brain_contexts: projectBrainContexts } : {}),
    } satisfies Parameters<NonNullable<TaskBrainWorkspacePort>['createWorkspace']>[0];
  }

  private buildProjectBrainContexts(task: TaskRecord): Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> | null {
    if (!task.project_id || (!this.contextMaterializationService && !this.projectBrainAutomationService)) {
      return null;
    }
    const allowedCitizenIds = task.team.members
      .filter((member) => member.member_kind === 'citizen')
      .map((member) => member.agentId);
    const contexts: Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> = {};
    for (const audience of TASK_BRAIN_CONTEXT_AUDIENCES) {
      const context = this.contextMaterializationService
        ? (() => {
          const result = this.contextMaterializationService.materializeSync({
          target: 'project_context_briefing',
          project_id: task.project_id,
          task_id: task.id,
          task_title: task.title,
          ...(task.description ? { task_description: task.description } : {}),
          ...(allowedCitizenIds.length > 0 ? { allowed_citizen_ids: allowedCitizenIds } : {}),
          audience,
          });
          if (result.target !== 'project_context_briefing') {
            throw new Error(`Unexpected materialization target: ${result.target}`);
          }
          return result.artifact;
        })()
        : this.projectBrainAutomationService!.buildBootstrapContext({
          project_id: task.project_id,
          task_id: task.id,
          task_title: task.title,
          ...(task.description ? { task_description: task.description } : {}),
          ...(allowedCitizenIds.length > 0 ? { allowed_citizen_ids: allowedCitizenIds } : {}),
          audience,
        });
      contexts[audience] = {
        audience: context.audience,
        source_documents: context.source_documents,
        markdown: context.markdown,
      };
    }
    return contexts;
  }

  refreshTaskBrainWorkspace(task: TaskRecord) {
    if (!this.taskBrainWorkspacePort || !this.taskBrainBindingService) {
      return;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    this.taskBrainWorkspacePort.updateWorkspace({
      brain_pack_ref: binding.brain_pack_ref,
      brain_task_id: binding.brain_task_id,
      workspace_path: binding.workspace_path,
      metadata: binding.metadata,
    }, this.buildTaskBrainWorkspaceRequest(task, task.type));
  }

  materializeExecutionBrief(
    task: TaskRecord,
    input: {
      subtask_id: string;
      subtask_title: string;
      assignee: string;
      adapter: string;
      mode: 'one_shot' | 'interactive';
      prompt: string | null;
      workdir: string | null;
    },
  ): string | null {
    if (!this.taskBrainWorkspacePort || !this.taskBrainBindingService) {
      return null;
    }
    const binding = this.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return null;
    }
    const workspacePath = binding.workspace_path;
    const roleBriefPath = join(workspacePath, '05-agents', input.assignee, '00-role-brief.md');
    const projectBrainContextPath = resolveProjectBrainContextPath(
      workspacePath,
      resolveTaskBrainContextAudienceForAssignee(task, input.assignee),
    );
    const currentStage = task.current_stage ? this.getStageByIdOrThrow(task, task.current_stage) : null;
    const controllerRef = resolveControllerRef(task.team.members);
    const currentStageParticipants = this.stageRosterService.resolveDesiredRefs(task.team, currentStage ?? undefined);
    const orderedParticipants = controllerRef && currentStageParticipants.includes(controllerRef)
      ? [controllerRef, ...currentStageParticipants.filter((participantRef) => participantRef !== controllerRef)]
      : currentStageParticipants;
    return this.taskBrainWorkspacePort.writeExecutionBrief({
      brain_pack_ref: binding.brain_pack_ref,
      brain_task_id: binding.brain_task_id,
      workspace_path: binding.workspace_path,
      metadata: binding.metadata,
    }, {
      task_id: task.id,
      project_id: task.project_id ?? null,
      locale: task.locale,
      title: task.title,
      description: task.description ?? '',
      controller_ref: controllerRef,
      current_stage: task.current_stage,
      current_stage_participants: orderedParticipants,
      subtask_id: input.subtask_id,
      subtask_title: input.subtask_title,
      assignee: input.assignee,
      adapter: input.adapter,
      mode: input.mode,
      prompt: input.prompt,
      workdir: input.workdir,
      references: {
        current_path: join(workspacePath, '00-current.md'),
        task_brief_path: join(workspacePath, '01-task-brief.md'),
        roster_path: join(workspacePath, '02-roster.md'),
        stage_state_path: join(workspacePath, '03-stage-state.md'),
        role_brief_path: existsSync(roleBriefPath) ? roleBriefPath : null,
        project_brain_context_path: existsSync(projectBrainContextPath) ? projectBrainContextPath : null,
      },
    }).brief_path;
  }

  buildBootstrapMessages(
    task: TaskRecord,
    brainWorkspace: ReturnType<NonNullable<TaskBrainWorkspacePort['createWorkspace']>> | null,
    imParticipantRefs: string[],
  ): IMPublishMessageInput[] {
    const skillCatalog = new Map<string, SkillCatalogEntry>(
      (this.skillCatalogPort?.listSkills({ refresh: true }) ?? []).map((entry) => [entry.skill_ref, entry]),
    );
    return this.taskBroadcastService.buildBootstrapMessages({
      task,
      workspacePath: brainWorkspace?.workspace_path ?? null,
      imParticipantRefs,
      skillCatalog,
    });
  }

  buildCurrentStageRoster(task: TaskRecord): TaskStatusDto['current_stage_roster'] {
    if (!task.current_stage) {
      return undefined;
    }
    const stage = this.getStageByIdOrThrow(task, task.current_stage);
    const desiredParticipantRefs = this.stageRosterService.resolveDesiredRefs(task.team, stage);
    const controllerRef = resolveControllerRef(task.team.members);
    const orderedDesiredParticipantRefs = controllerRef && desiredParticipantRefs.includes(controllerRef)
      ? [controllerRef, ...desiredParticipantRefs.filter((participantRef) => participantRef !== controllerRef)]
      : desiredParticipantRefs;
    const participants = this.taskParticipationService?.listParticipants(task.id) ?? [];
    const runtimeSessions = this.taskParticipationService?.listRuntimeSessions(task.id) ?? [];
    const runtimeByParticipantId = new Map(runtimeSessions.map((session) => [session.participant_binding_id, session]));
    const joinedParticipantRefs = participants
      .filter((participant) => participant.join_status === 'joined')
      .map((participant) => participant.agent_ref)
      .filter((participantRef) => orderedDesiredParticipantRefs.includes(participantRef));
    return {
      stage_id: stage.id,
      roster: stage.roster ?? undefined,
      desired_participant_refs: orderedDesiredParticipantRefs,
      joined_participant_refs: joinedParticipantRefs,
      participant_states: participants.map((participant) => {
        const runtime = runtimeByParticipantId.get(participant.id);
        return {
          agent_ref: participant.agent_ref,
          task_role: participant.task_role,
          join_status: participant.join_status,
          desired_exposure: participant.desired_exposure as 'in_thread' | 'hidden',
          exposure_reason: participant.exposure_reason,
          runtime_provider: runtime?.runtime_provider ?? participant.runtime_provider,
          runtime_session_ref: runtime?.runtime_session_ref ?? null,
          presence_state: runtime?.presence_state ?? null,
          runtime_binding_reason: runtime?.binding_reason ?? null,
          desired_runtime_presence: (runtime?.desired_runtime_presence as 'attached' | 'detached' | null | undefined) ?? null,
          runtime_reconcile_stage_id: runtime?.reconcile_stage_id ?? null,
          runtime_reconciled_at: runtime?.reconciled_at ?? null,
          runtime_closed_at: runtime?.closed_at ?? null,
        };
      }),
    };
  }
}

function resolveStageExecutionKind(stage: WorkflowStageLike | null | undefined) {
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

function resolveStageModeFromExecutionKind(executionKind: string | null) {
  if (executionKind === 'citizen_execute' || executionKind === 'craftsman_dispatch') {
    return 'execute';
  }
  if (executionKind === 'citizen_discuss' || executionKind === 'human_approval') {
    return 'discuss';
  }
  return null;
}

function resolveAllowedActions(stage: WorkflowStageLike | null | undefined) {
  if (!stage) {
    return [];
  }
  if (stage.allowed_actions?.length) {
    return stage.allowed_actions;
  }
  switch (resolveStageExecutionKind(stage)) {
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

function resolveTaskBrainContextAudienceForAssignee(task: TaskRecord, assignee: string): TaskBrainContextAudience {
  const member = task.team.members.find((candidate) => candidate.agentId === assignee);
  switch (member?.member_kind) {
    case 'craftsman':
      return 'craftsman';
    case 'citizen':
      return 'citizen';
    case 'controller':
    default:
      return 'controller';
  }
}

function resolveProjectBrainContextPath(workspacePath: string, audience: TaskBrainContextAudience) {
  return join(workspacePath, '04-context', `project-brain-context-${audience}.md`);
}
