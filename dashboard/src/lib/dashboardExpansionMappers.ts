import type {
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
  ApiPromoteTodoResultDto,
} from '@/types/api';
import type {
  AgentsStatus,
  ArchiveJob,
  AgentStatusItem,
  AgentAxisAffectedAgent,
  AgentChannelHistoryEvent,
  AgentChannelSignalEvent,
  AgentChannelSummary,
  AgentHostSummary,
  CraftsmanStatusItem,
  CraftsmanRuntimeStatus,
  PromoteTodoResult,
  TemplateDetail,
  TemplateGraph,
  TemplateGraphEdge,
  TemplateGraphNode,
  TemplateStage,
  TemplateSummary,
  Todo,
} from '@/types/dashboard';
import { templateDetailSchema } from '@agora-ts/contracts';
import { normalizeRoleBindingId, resolveMemberKind } from '@/lib/orchestrationRoles';

function formatGovernance(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return 'default';
}

function summarizePayload(payload: Record<string, unknown> | null): string {
  if (!payload) return 'No payload';
  const errorMessage = payload.error_message;
  if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
    return errorMessage;
  }
  const summary = payload.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary;
  }
  return JSON.stringify(payload);
}

function mapAgentDto(agent: ApiAgentsStatusDto['agents'][number]): AgentStatusItem {
  return {
    id: agent.id,
    inventoryKind: agent.inventory_kind,
    role: agent.role,
    status: agent.status,
    presence: agent.presence,
    selectability: agent.selectability,
    selectabilityReason: agent.selectability_reason ?? null,
    presenceReason: agent.presence_reason ?? null,
    channelProviders: agent.channel_providers,
    hostFramework: agent.host_framework ?? null,
    runtimeProvider: agent.runtime_provider ?? null,
    runtimeFlavor: agent.runtime_flavor ?? null,
    runtimeTargetRef: agent.runtime_target_ref ?? null,
    inventorySources: agent.inventory_sources,
    primaryModel: agent.primary_model ?? null,
    workspaceDir: agent.workspace_dir ?? null,
    accountId: agent.account_id ?? null,
    discordBotUserIds: agent.discord_bot_user_ids ?? [],
    activeTaskIds: agent.active_task_ids,
    activeSubtaskIds: agent.active_subtask_ids,
    taskCount: agent.active_task_ids.length,
    subtaskCount: agent.active_subtask_ids.length,
    load: agent.load,
    lastActiveAt: agent.last_active_at,
    lastSeenAt: agent.last_seen_at,
  };
}

function mapCraftsmanDto(item: ApiAgentsStatusDto['craftsmen'][number]): CraftsmanStatusItem {
  return {
    id: item.id,
    status: item.status,
    taskId: item.task_id,
    subtaskId: item.subtask_id,
    title: item.title,
    runningSince: item.running_since,
    recentExecutions: item.recent_executions.map((execution) => ({
      executionId: execution.execution_id,
      status: execution.status,
      sessionId: execution.session_id,
      transport: execution.transport,
      runtimeMode: execution.runtime_mode,
      startedAt: execution.started_at,
    })),
  };
}

function mapCraftsmanRuntime(dto: ApiAgentsStatusDto['craftsman_runtime']): CraftsmanRuntimeStatus | null {
  if (!dto) {
    return null;
  }
  return {
    providers: dto.providers.map((provider) => ({
      provider: provider.provider,
      session: provider.session,
      slotCount: provider.slot_count,
      readySlots: provider.ready_slots,
      activeSlots: provider.active_slots,
    })),
    slots: dto.slots.map((slot) => ({
      provider: slot.provider,
      agent: slot.agent,
      sessionId: slot.session_id,
      runtimeMode: slot.runtime_mode,
      transport: slot.transport,
      status: slot.status,
      ready: slot.ready,
      active: slot.active,
      currentCommand: slot.current_command,
      tailPreview: slot.tail_preview,
      sessionReference: slot.session_reference,
      executionId: slot.execution_id,
      taskId: slot.task_id,
      subtaskId: slot.subtask_id,
      title: slot.title,
    })),
  };
}

function mapProviderAffectedAgentDto(
  item:
    | ApiAgentsStatusDto['channel_summaries'][number]['affected_agents'][number]
    | ApiAgentsStatusDto['host_summaries'][number]['affected_agents'][number],
): AgentAxisAffectedAgent {
  return {
    id: item.id,
    status: item.status,
    presence: item.presence,
    presenceReason: item.presence_reason ?? null,
    lastSeenAt: item.last_seen_at,
    accountId: item.account_id ?? null,
  };
}

function mapProviderHistoryEventDto(
  item: ApiAgentsStatusDto['channel_summaries'][number]['history'][number],
): AgentChannelHistoryEvent {
  return {
    occurredAt: item.occurred_at,
    agentId: item.agent_id,
    accountId: item.account_id ?? null,
    presence: item.presence,
    reason: item.reason ?? null,
  };
}

function mapProviderSignalEventDto(
  item: ApiAgentsStatusDto['channel_summaries'][number]['signals'][number],
): AgentChannelSignalEvent {
  return {
    occurredAt: item.occurred_at,
    channel: item.channel,
    agentId: item.agent_id ?? null,
    accountId: item.account_id ?? null,
    kind: item.kind,
    severity: item.severity,
    detail: item.detail ?? null,
  };
}

function mapChannelSummaryDto(item: ApiAgentsStatusDto['channel_summaries'][number]): AgentChannelSummary {
  return {
    channel: item.channel,
    totalAgents: item.total_agents,
    busyAgents: item.busy_agents,
    onlineAgents: item.online_agents,
    staleAgents: item.stale_agents,
    disconnectedAgents: item.disconnected_agents,
    offlineAgents: item.offline_agents,
    overallPresence: item.overall_presence,
    lastSeenAt: item.last_seen_at,
    presenceReason: item.presence_reason ?? null,
    affectedAgents: item.affected_agents.map(mapProviderAffectedAgentDto),
    history: item.history.map(mapProviderHistoryEventDto),
    signalStatus: item.signal_status,
    lastSignalAt: item.last_signal_at,
    signalCounts: {
      readyEvents: item.signal_counts.ready_events,
      restartEvents: item.signal_counts.restart_events,
      transportErrors: item.signal_counts.transport_errors,
    },
    signals: item.signals.map(mapProviderSignalEventDto),
  };
}

function mapHostSummaryDto(item: ApiAgentsStatusDto['host_summaries'][number]): AgentHostSummary {
  return {
    host: item.host,
    totalAgents: item.total_agents,
    busyAgents: item.busy_agents,
    onlineAgents: item.online_agents,
    staleAgents: item.stale_agents,
    disconnectedAgents: item.disconnected_agents,
    offlineAgents: item.offline_agents,
    overallPresence: item.overall_presence,
    lastSeenAt: item.last_seen_at,
    presenceReason: item.presence_reason ?? null,
    affectedAgents: item.affected_agents.map(mapProviderAffectedAgentDto),
  };
}

export function mapAgentsStatusDto(dto: ApiAgentsStatusDto): AgentsStatus {
  return {
    summary: {
      activeTasks: dto.summary.active_tasks,
      activeAgents: dto.summary.active_agents,
      totalAgents: dto.summary.total_agents,
      onlineAgents: dto.summary.online_agents,
      staleAgents: dto.summary.stale_agents,
      disconnectedAgents: dto.summary.disconnected_agents,
      busyCraftsmen: dto.summary.busy_craftsmen,
    },
    agents: dto.agents.map(mapAgentDto),
    craftsmen: dto.craftsmen.map(mapCraftsmanDto),
    channelSummaries: dto.channel_summaries.map(mapChannelSummaryDto),
    hostSummaries: dto.host_summaries.map(mapHostSummaryDto),
    craftsmanRuntime: mapCraftsmanRuntime(dto.craftsman_runtime),
  };
}

export function mapTodoDto(dto: ApiTodoDto): Todo {
  return {
    id: dto.id,
    text: dto.text,
    projectId: dto.project_id,
    status: dto.status,
    due: dto.due,
    createdAt: dto.created_at,
    completedAt: dto.completed_at,
    tags: dto.tags,
    tagLabel: dto.tags.length > 0 ? dto.tags.join(' / ') : 'untagged',
    promotedTo: dto.promoted_to,
  };
}

export function mapPromoteTodoResultDto(dto: ApiPromoteTodoResultDto): PromoteTodoResult {
  return {
    todo: mapTodoDto(dto.todo),
    task: {
      id: dto.task.id,
      title: typeof dto.task.title === 'string' ? dto.task.title : null,
    },
  };
}

export function mapArchiveJobDto(dto: ApiArchiveJobDto): ArchiveJob {
  return {
    id: dto.id,
    taskId: dto.task_id,
    taskTitle: dto.task_title,
    taskType: dto.task_type,
    status: dto.status,
    targetPath: dto.target_path,
    writerAgent: dto.writer_agent,
    commitHash: dto.commit_hash,
    requestedAt: dto.requested_at,
    completedAt: dto.completed_at,
    payload: dto.payload,
    payloadSummary: summarizePayload(dto.payload),
    canApprove: false,
    canConfirm: dto.status === 'pending',
    canComplete: dto.status === 'notified',
    canRetry: dto.status === 'failed',
  };
}

export function mapTemplateSummaryDto(dto: ApiTemplateSummaryDto): TemplateSummary {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    description: dto.description,
    governance: formatGovernance(dto.governance),
    stageCount: dto.stage_count,
    stageCountLabel: `${dto.stage_count} stages`,
  };
}

function mapTemplateStage(stage: NonNullable<ApiTemplateDetailDto['stages']>[number]): TemplateStage {
  return {
    id: stage.id,
    name: stage.name ?? stage.id,
    mode: stage.mode ?? 'custom',
    roster: stage.roster
      ? {
          includeRoles: [...(stage.roster.include_roles ?? [])],
          includeAgents: [...(stage.roster.include_agents ?? [])],
          excludeAgents: [...(stage.roster.exclude_agents ?? [])],
          keepController: stage.roster.keep_controller === true,
        }
      : null,
    gateType: stage.gate?.type ?? null,
    gateApprover: stage.gate?.approver ?? null,
    gateRequired: stage.gate?.required ?? null,
    gateTimeoutSec: stage.gate?.timeout_sec ?? null,
    rejectTarget: stage.reject_target ?? null,
  };
}

function deriveTemplateGraphFromStages(stages: TemplateStage[]): TemplateGraph {
  return {
    graphVersion: 1,
    entryNodes: stages[0] ? [stages[0].id] : [],
    nodes: stages.map((stage, index): TemplateGraphNode => ({
      id: stage.id,
      name: stage.name,
      kind: 'stage',
      executionKind: null,
      allowedActions: [],
      roster: stage.roster ?? null,
      gateType: stage.gateType ?? null,
      gateApprover: stage.gateApprover ?? null,
      gateRequired: stage.gateRequired ?? null,
      gateTimeoutSec: stage.gateTimeoutSec ?? null,
      layout: { x: index * 280, y: 0 },
    })),
    edges: stages.flatMap((stage, index) => {
      const edges: TemplateGraphEdge[] = [];
      const nextStage = stages[index + 1];
      if (nextStage) {
        edges.push({
          id: `${stage.id}__advance__${nextStage.id}`,
          from: stage.id,
          to: nextStage.id,
          kind: 'advance',
        });
      }
      if (stage.rejectTarget) {
        edges.push({
          id: `${stage.id}__reject__${stage.rejectTarget}`,
          from: stage.id,
          to: stage.rejectTarget,
          kind: 'reject',
        });
      }
      return edges;
    }),
  };
}

function mapTemplateGraph(dto: ApiTemplateDetailDto, stages: TemplateStage[]): TemplateGraph {
  if (!dto.graph) {
    return deriveTemplateGraphFromStages(stages);
  }
  return {
    graphVersion: dto.graph.graph_version,
    entryNodes: [...dto.graph.entry_nodes],
    nodes: dto.graph.nodes.map((node): TemplateGraphNode => ({
      id: node.id,
      name: node.name ?? node.id,
      kind: node.kind,
      executionKind: node.execution_kind ?? null,
      allowedActions: node.allowed_actions ?? [],
      roster: node.roster
        ? {
            includeRoles: [...(node.roster.include_roles ?? [])],
            includeAgents: [...(node.roster.include_agents ?? [])],
            excludeAgents: [...(node.roster.exclude_agents ?? [])],
            keepController: node.roster.keep_controller === true,
          }
        : null,
      gateType: node.gate?.type ?? null,
      gateApprover: node.gate?.approver ?? node.gate?.approver_role ?? null,
      gateRequired: node.gate?.required ?? null,
      gateTimeoutSec: node.gate?.timeout_sec ?? null,
      layout: node.layout ? { x: node.layout.x, y: node.layout.y } : null,
    })),
    edges: dto.graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
    })),
  };
}

function mapTemplateTeamPreset(dto: ApiTemplateDetailDto): TemplateDetail['defaultTeam'] {
  return Object.entries(dto.defaultTeam ?? {}).map(([role, member]) => ({
    role,
    memberKind: member.member_kind ?? resolveMemberKind(role),
    modelPreference: member.model_preference ?? null,
    suggested: (member.suggested ?? []).map((value) => normalizeRoleBindingId(role, value, member.member_kind ?? resolveMemberKind(role))),
  }));
}

export function mapTemplateDetailDto(id: string, dto: ApiTemplateDetailDto): TemplateDetail {
  const stages = (dto.stages ?? []).map(mapTemplateStage);
  const defaultTeam = mapTemplateTeamPreset(dto);
  return {
    id,
    name: dto.name ?? id,
    type: dto.type ?? id,
    description: dto.description ?? '',
    governance: formatGovernance(dto.governance),
    stageCount: stages.length,
    stages,
    graph: mapTemplateGraph(dto, stages),
    defaultTeamRoles: defaultTeam.map((member) => member.role),
    defaultTeam,
    raw: dto,
  };
}

export function mapTemplateDetailToDto(detail: TemplateDetail): ApiTemplateDetailDto {
  const raw = detail.raw as Partial<ApiTemplateDetailDto>;
  const rawGovernance = typeof raw.governance === 'string' ? raw.governance : undefined;
  const graph = detail.graph ?? deriveTemplateGraphFromStages(detail.stages);

  return templateDetailSchema.parse({
    ...raw,
    name: detail.name,
    type: detail.type,
    description: detail.description,
    ...(detail.governance !== 'default' || rawGovernance
      ? { governance: detail.governance }
      : {}),
    defaultTeam: Object.fromEntries(detail.defaultTeam.map((member) => [
      member.role,
      {
        member_kind: resolveMemberKind(member.role, member.memberKind),
        ...(member.modelPreference ? { model_preference: member.modelPreference } : {}),
        ...(member.suggested.length > 0
          ? { suggested: member.suggested.map((value) => normalizeRoleBindingId(member.role, value, member.memberKind)) }
          : {}),
      },
    ])),
    stages: detail.stages.map((stage) => {
      const gate = (() => {
        if (!stage.gateType) {
          return undefined;
        }
        if (stage.gateType === 'approval') {
          return {
            type: stage.gateType,
            ...(stage.gateApprover ? { approver: stage.gateApprover } : {}),
          };
        }
        if (stage.gateType === 'quorum') {
          return {
            type: stage.gateType,
            ...(typeof stage.gateRequired === 'number' ? { required: stage.gateRequired } : {}),
          };
        }
        if (stage.gateType === 'auto_timeout') {
          return {
            type: stage.gateType,
            ...(typeof stage.gateTimeoutSec === 'number' ? { timeout_sec: stage.gateTimeoutSec } : {}),
          };
        }
        return { type: stage.gateType };
      })();
      return {
        id: stage.id,
        name: stage.name,
        mode: stage.mode,
        ...(stage.roster
          ? {
              roster: {
                ...(stage.roster.includeRoles.length > 0 ? { include_roles: stage.roster.includeRoles } : {}),
                ...(stage.roster.includeAgents.length > 0 ? { include_agents: stage.roster.includeAgents } : {}),
                ...(stage.roster.excludeAgents.length > 0 ? { exclude_agents: stage.roster.excludeAgents } : {}),
                ...(stage.roster.keepController ? { keep_controller: true } : {}),
              },
            }
          : {}),
        ...(gate ? { gate } : {}),
        ...(stage.rejectTarget ? { reject_target: stage.rejectTarget } : {}),
      };
    }),
    graph: {
      graph_version: graph.graphVersion,
      entry_nodes: graph.entryNodes,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        ...(node.name ? { name: node.name } : {}),
        kind: node.kind,
        ...(node.executionKind ? { execution_kind: node.executionKind } : {}),
        ...(node.allowedActions.length > 0 ? { allowed_actions: node.allowedActions } : {}),
        ...(node.roster
          ? {
              roster: {
                ...(node.roster.includeRoles.length > 0 ? { include_roles: node.roster.includeRoles } : {}),
                ...(node.roster.includeAgents.length > 0 ? { include_agents: node.roster.includeAgents } : {}),
                ...(node.roster.excludeAgents.length > 0 ? { exclude_agents: node.roster.excludeAgents } : {}),
                ...(node.roster.keepController ? { keep_controller: true } : {}),
              },
            }
          : {}),
        ...((node.gateType || node.gateApprover || typeof node.gateRequired === 'number' || typeof node.gateTimeoutSec === 'number')
          ? {
              gate: {
                ...(node.gateType ? { type: node.gateType } : {}),
                ...(node.gateApprover ? { approver: node.gateApprover } : {}),
                ...(typeof node.gateRequired === 'number' ? { required: node.gateRequired } : {}),
                ...(typeof node.gateTimeoutSec === 'number' ? { timeout_sec: node.gateTimeoutSec } : {}),
              },
            }
          : {}),
        ...(node.layout ? { layout: node.layout } : {}),
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
      })),
    },
  });
}
