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
  AgentProviderAffectedAgent,
  AgentProviderHistoryEvent,
  AgentProviderSignalEvent,
  AgentProviderSummary,
  CraftsmanStatusItem,
  PromoteTodoResult,
  TemplateDetail,
  TemplateStage,
  TemplateSummary,
  TmuxRuntimeStatus,
  Todo,
} from '@/types/dashboard';

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
    role: agent.role,
    status: agent.status,
    presence: agent.presence,
    presenceReason: agent.presence_reason ?? null,
    source: agent.source ?? null,
    primaryModel: agent.primary_model ?? null,
    workspaceDir: agent.workspace_dir ?? null,
    provider: agent.provider ?? null,
    accountId: agent.account_id ?? null,
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

function mapTmuxRuntime(dto: ApiAgentsStatusDto['tmux_runtime']): TmuxRuntimeStatus | null {
  if (!dto) {
    return null;
  }
  return {
    session: dto.session,
    panes: dto.panes.map((pane) => ({
      agent: pane.agent,
      paneId: pane.pane_id,
      currentCommand: pane.current_command,
      active: pane.active,
      ready: pane.ready,
      tailPreview: pane.tail_preview,
    })),
  };
}

function mapProviderAffectedAgentDto(
  item: ApiAgentsStatusDto['provider_summaries'][number]['affected_agents'][number],
): AgentProviderAffectedAgent {
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
  item: ApiAgentsStatusDto['provider_summaries'][number]['history'][number],
): AgentProviderHistoryEvent {
  return {
    occurredAt: item.occurred_at,
    agentId: item.agent_id,
    accountId: item.account_id ?? null,
    presence: item.presence,
    reason: item.reason ?? null,
  };
}

function mapProviderSignalEventDto(
  item: ApiAgentsStatusDto['provider_summaries'][number]['signals'][number],
): AgentProviderSignalEvent {
  return {
    occurredAt: item.occurred_at,
    provider: item.provider,
    agentId: item.agent_id ?? null,
    accountId: item.account_id ?? null,
    kind: item.kind,
    severity: item.severity,
    detail: item.detail ?? null,
  };
}

function mapProviderSummaryDto(item: ApiAgentsStatusDto['provider_summaries'][number]): AgentProviderSummary {
  return {
    provider: item.provider,
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
    providerSummaries: dto.provider_summaries.map(mapProviderSummaryDto),
    tmuxRuntime: mapTmuxRuntime(dto.tmux_runtime),
  };
}

export function mapTodoDto(dto: ApiTodoDto): Todo {
  return {
    id: dto.id,
    text: dto.text,
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
    gateType: stage.gate?.type ?? null,
  };
}

export function mapTemplateDetailDto(id: string, dto: ApiTemplateDetailDto): TemplateDetail {
  const stages = (dto.stages ?? []).map(mapTemplateStage);
  return {
    id,
    name: dto.name ?? id,
    type: dto.type ?? id,
    description: dto.description ?? '',
    governance: formatGovernance(dto.governance),
    stageCount: stages.length,
    stages,
    defaultTeamRoles: Object.keys(dto.defaultTeam ?? {}),
    raw: dto,
  };
}
