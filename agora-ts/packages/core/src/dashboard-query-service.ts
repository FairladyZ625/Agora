import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import type {
  AgentsStatusDto,
  ArchiveJobDto,
  CreateTodoRequestDto,
  TemplateDetailDto,
  TemplateSummaryDto,
  UpdateTodoRequestDto,
} from '@agora-ts/contracts';
import { ArchiveJobRepository, CraftsmanExecutionRepository, type AgoraDatabase, SubtaskRepository, TaskRepository, TodoRepository, type TodoRepository as TodoRepositoryType } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type { LiveSessionStore } from './live-session-store.js';
import type {
  AgentInventorySource,
  AgentPresenceHistoryEvent,
  AgentProviderSignalEvent,
  PresenceSource,
} from './runtime-ports.js';
import type { TmuxRuntimeService } from './tmux-runtime-service.js';

export interface DashboardQueryServiceOptions {
  templatesDir: string;
  liveSessions?: LiveSessionStore;
  agentRegistry?: AgentInventorySource;
  presenceSource?: PresenceSource;
  tmuxRuntimeService?: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'>;
}

export class DashboardQueryService {
  private readonly tasks: TaskRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly archives: ArchiveJobRepository;
  private readonly todos: TodoRepositoryType;
  private readonly executions: CraftsmanExecutionRepository;
  private readonly templatesDir: string;
  private readonly liveSessions: LiveSessionStore | undefined;
  private readonly agentRegistry: AgentInventorySource | undefined;
  private readonly presenceSource: PresenceSource | undefined;
  private readonly tmuxRuntimeService: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'> | undefined;

  constructor(
    private readonly db: AgoraDatabase,
    options: DashboardQueryServiceOptions,
  ) {
    this.tasks = new TaskRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.archives = new ArchiveJobRepository(db);
    this.todos = new TodoRepository(db);
    this.executions = new CraftsmanExecutionRepository(db);
    this.templatesDir = options.templatesDir;
    this.liveSessions = options.liveSessions;
    this.agentRegistry = options.agentRegistry;
    this.presenceSource = options.presenceSource;
    this.tmuxRuntimeService = options.tmuxRuntimeService;
  }

  getAgentsStatus(): AgentsStatusDto {
    const activeTasks = this.tasks.listTasks('active');
    const agents = new Map<string, AgentsStatusDto['agents'][number]>();
    const craftsmen = new Map<string, AgentsStatusDto['craftsmen'][number]>();
    const activityMap = new Map<string, string | null>();

    if (activeTasks.length > 0) {
      const placeholders = activeTasks.map(() => '?').join(', ');
      const rows = this.db.prepare(`
        SELECT actor, MAX(created_at) AS last_active_at
        FROM progress_log
        WHERE task_id IN (${placeholders})
        GROUP BY actor
      `).all(...activeTasks.map((task) => task.id)) as Array<{ actor: string; last_active_at: string | null }>;
      for (const row of rows) {
        activityMap.set(row.actor, row.last_active_at);
      }
    }

    for (const task of activeTasks) {
      for (const member of task.team.members) {
        const current = agents.get(member.agentId) ?? {
          id: member.agentId,
          role: member.role,
          status: 'busy',
          presence: 'offline',
          presence_reason: 'task_overlay',
          active_task_ids: [],
          active_subtask_ids: [],
          load: 0,
          last_active_at: activityMap.get(member.agentId) ?? null,
          last_seen_at: null,
          provider: null,
          account_id: null,
        };
        if (!current.active_task_ids.includes(task.id)) {
          current.active_task_ids.push(task.id);
        }
        agents.set(member.agentId, current);
      }

      for (const subtask of this.subtasks.listByTask(task.id)) {
        const current = agents.get(subtask.assignee) ?? {
          id: subtask.assignee,
          role: null,
          status: 'busy',
          presence: 'offline',
          presence_reason: 'subtask_overlay',
          active_task_ids: [],
          active_subtask_ids: [],
          load: 0,
          last_active_at: activityMap.get(subtask.assignee) ?? null,
          last_seen_at: null,
          provider: null,
          account_id: null,
        };
        if (!current.active_task_ids.includes(task.id)) {
          current.active_task_ids.push(task.id);
        }
        if (!current.active_subtask_ids.includes(subtask.id)) {
          current.active_subtask_ids.push(subtask.id);
        }
        agents.set(subtask.assignee, current);

        if (subtask.craftsman_type) {
          const recentExecutions = this.executions
            .listBySubtask(task.id, subtask.id)
            .slice(0, 3)
            .map((execution) => ({
              execution_id: execution.execution_id,
              status: execution.status,
              session_id: execution.session_id,
              transport: toNullableString(execution.callback_payload?.transport),
              runtime_mode: toNullableString(execution.callback_payload?.runtime_mode),
              started_at: execution.started_at,
            }));
          craftsmen.set(subtask.craftsman_type, {
            id: subtask.craftsman_type,
            status: subtask.done_at ? 'idle' : 'busy',
            task_id: task.id,
            subtask_id: subtask.id,
            title: subtask.title,
            running_since: subtask.dispatched_at,
            recent_executions: recentExecutions,
          });
        }
      }
    }

    for (const item of agents.values()) {
      item.load = Math.max(item.active_task_ids.length, item.active_subtask_ids.length);
    }

    for (const session of this.liveSessions?.listActive() ?? []) {
      const current = agents.get(session.agent_id) ?? {
        id: session.agent_id,
        role: null,
        status: 'busy',
        presence: 'online',
        presence_reason: 'live_session',
        active_task_ids: [],
        active_subtask_ids: [],
        load: 0,
        last_active_at: session.last_event_at,
        last_seen_at: session.last_event_at,
        provider: session.channel,
        account_id: null,
      };
      current.status = session.status === 'idle' ? 'idle' : 'busy';
      current.presence = 'online';
      current.presence_reason = 'live_session';
      current.last_active_at = session.last_event_at;
      current.last_seen_at = session.last_event_at;
      current.load = Math.max(current.load, 1);
      current.provider = current.provider ?? session.channel;
      current.source ??= 'live';
      current.primary_model ??= null;
      current.workspace_dir ??= null;
      agents.set(session.agent_id, current);
    }

    for (const item of this.agentRegistry?.listAgents() ?? []) {
      const current = agents.get(item.id) ?? {
        id: item.id,
        role: null,
        status: 'idle',
        presence: 'offline',
        presence_reason: 'inventory_only',
        active_task_ids: [],
        active_subtask_ids: [],
        load: 0,
        last_active_at: null,
        last_seen_at: null,
        provider: inferProvider(item.source),
        account_id: null,
      };
      current.source = item.source;
      current.primary_model = item.primary_model;
      current.workspace_dir = item.workspace_dir;
      current.provider = current.provider ?? inferProvider(item.source);
      agents.set(item.id, current);
    }

    for (const item of this.presenceSource?.listPresence() ?? []) {
      const current = agents.get(item.agent_id) ?? {
        id: item.agent_id,
        role: null,
        status: 'idle',
        presence: item.presence,
        presence_reason: item.reason,
        active_task_ids: [],
        active_subtask_ids: [],
        load: 0,
        last_active_at: null,
        last_seen_at: item.last_seen_at,
        provider: item.provider,
        account_id: item.account_id,
      };
      current.presence = item.presence;
      current.presence_reason = item.reason;
      current.last_seen_at = item.last_seen_at;
      current.provider = item.provider;
      current.account_id = item.account_id;
      agents.set(item.agent_id, current);
    }

    const allAgents = Array.from(agents.values())
      .map((item) => ({
        ...item,
        status: item.load > 0 || item.status === 'busy' ? 'busy' : 'idle',
        presence: item.load > 0 ? 'online' : item.presence,
        presence_reason: item.load > 0 ? 'live_session' : item.presence_reason ?? 'inventory_only',
        last_seen_at: item.last_seen_at ?? item.last_active_at,
        provider: inferProvider(item.source) ?? item.provider ?? null,
        account_id: item.account_id ?? null,
        source: item.source ?? null,
        primary_model: item.primary_model ?? null,
        workspace_dir: item.workspace_dir ?? null,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'busy' ? -1 : 1;
        }
        if (a.presence !== b.presence) {
          return presenceRank(a.presence) - presenceRank(b.presence);
        }
        return a.id.localeCompare(b.id);
      });
    const providerHistory = typeof this.presenceSource?.listHistory === 'function'
      ? this.presenceSource.listHistory()
      : [];
    const providerSignals = typeof this.presenceSource?.listSignals === 'function'
      ? this.presenceSource.listSignals()
      : [];

    return {
      summary: {
        active_tasks: activeTasks.length,
        active_agents: allAgents.filter((item) => item.status === 'busy').length,
        total_agents: allAgents.length,
        online_agents: allAgents.filter((item) => item.presence === 'online').length,
        stale_agents: allAgents.filter((item) => item.presence === 'stale').length,
        disconnected_agents: allAgents.filter((item) => item.presence === 'disconnected').length,
        busy_craftsmen: Array.from(craftsmen.values()).filter((item) => item.status === 'busy').length,
      },
      agents: allAgents,
      craftsmen: Array.from(craftsmen.values()).sort((a, b) => a.id.localeCompare(b.id)),
      provider_summaries: buildProviderSummaries(allAgents, providerHistory, providerSignals),
      tmux_runtime: buildTmuxRuntime(this.tmuxRuntimeService),
    };
  }

  listArchiveJobs(filters: { status?: string; taskId?: string } = {}): ArchiveJobDto[] {
    return this.archives.listArchiveJobs(filters);
  }

  getArchiveJob(jobId: number): ArchiveJobDto {
    const job = this.archives.getArchiveJob(jobId);
    if (!job) {
      throw new NotFoundError(`Archive job ${jobId} not found`);
    }
    return job;
  }

  retryArchiveJob(jobId: number): ArchiveJobDto {
    return this.archives.retryArchiveJob(jobId);
  }

  listTodos(filters: { status?: string } = {}) {
    return this.todos.listTodos(filters.status);
  }

  createTodo(input: CreateTodoRequestDto) {
    return this.todos.insertTodo(input);
  }

  updateTodo(todoId: number, updates: UpdateTodoRequestDto) {
    const existing = this.todos.getTodo(todoId);
    if (!existing) {
      throw new NotFoundError(`Todo ${todoId} not found`);
    }
    const nextUpdates: Record<string, unknown> = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    if (updates.status === 'done') {
      nextUpdates.completed_at = new Date().toISOString();
    }
    if (updates.status === 'pending') {
      nextUpdates.completed_at = null;
    }
    return this.todos.updateTodo(todoId, nextUpdates);
  }

  deleteTodo(todoId: number) {
    const deleted = this.todos.deleteTodo(todoId);
    if (!deleted) {
      throw new NotFoundError(`Todo ${todoId} not found`);
    }
    return { deleted: true };
  }

  listTemplates(): TemplateSummaryDto[] {
    const dir = resolve(this.templatesDir, 'tasks');
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => resolve(dir, name))
      .map((path) => {
        const payload = JSON.parse(readFileSync(path, 'utf8')) as TemplateDetailDto;
        return {
          id: basename(path, '.json'),
          name: payload.name,
          type: payload.type,
          description: payload.description ?? '',
          governance: payload.governance ?? null,
          stage_count: payload.stages?.length ?? 0,
        };
      });
  }

  getTemplate(templateId: string): TemplateDetailDto {
    const path = resolve(this.templatesDir, 'tasks', `${templateId}.json`);
    if (!existsSync(path)) {
      throw new NotFoundError(`Template ${templateId} not found`);
    }
    return JSON.parse(readFileSync(path, 'utf8')) as TemplateDetailDto;
  }
}

function buildTmuxRuntime(
  tmuxRuntimeService: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'> | undefined,
): AgentsStatusDto['tmux_runtime'] {
  if (!tmuxRuntimeService) {
    return null;
  }
  const status = tmuxRuntimeService.status();
  const doctor = tmuxRuntimeService.doctor();
  const byAgent = new Map(doctor.panes.map((item) => [item.agent, item]));
  const agents = new Set<string>([
    ...status.panes.map((item) => item.title),
    ...doctor.panes.map((item) => item.agent),
  ]);

  return {
    session: status.session,
    panes: Array.from(agents)
      .sort((left, right) => left.localeCompare(right))
      .map((agent) => {
        const paneStatus = status.panes.find((item) => item.title === agent);
        const paneDoctor = byAgent.get(agent) ?? null;
        return {
          agent,
          pane_id: paneStatus?.id ?? paneDoctor?.pane ?? null,
          current_command: paneStatus?.currentCommand ?? paneDoctor?.command ?? null,
          active: paneStatus?.active ?? paneDoctor?.active ?? false,
          ready: paneDoctor?.ready ?? paneStatus !== undefined,
          tail_preview: safeTail(tmuxRuntimeService, agent),
          continuity_backend: paneStatus?.continuityBackend ?? paneDoctor?.continuityBackend ?? 'unknown',
          resume_capability: paneStatus?.resumeCapability ?? paneDoctor?.resumeCapability ?? 'none',
          session_reference: paneStatus?.sessionReference ?? paneDoctor?.sessionReference ?? null,
          identity_source: paneStatus?.identitySource ?? paneDoctor?.identitySource ?? 'registry_default',
          identity_path: paneStatus?.identityPath ?? paneDoctor?.identityPath ?? null,
          session_observed_at: paneStatus?.sessionObservedAt ?? paneDoctor?.sessionObservedAt ?? null,
          last_recovery_mode: paneStatus?.lastRecoveryMode ?? paneDoctor?.lastRecoveryMode ?? null,
          transport_session_id: paneStatus?.transportSessionId ?? paneDoctor?.transportSessionId ?? null,
        };
      }),
  };
}

function safeTail(
  tmuxRuntimeService: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'>,
  agent: string,
) {
  try {
    return tmuxRuntimeService.tail(agent, 20);
  } catch {
    return null;
  }
}

function toNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function presenceRank(presence: 'online' | 'offline' | 'disconnected' | 'stale') {
  switch (presence) {
    case 'online':
      return 0;
    case 'stale':
      return 1;
    case 'disconnected':
      return 2;
    default:
      return 3;
  }
}

function inferProvider(source?: string | null) {
  if (!source) {
    return 'openclaw';
  }
  if (source.includes('discord')) {
    return 'discord';
  }
  if (source.includes('whatsapp')) {
    return 'whatsapp';
  }
  if (source.includes('openclaw')) {
    return 'openclaw';
  }
  return source;
}

function buildProviderSummaries(
  agents: AgentsStatusDto['agents'],
  history: AgentPresenceHistoryEvent[],
  signals: AgentProviderSignalEvent[],
): AgentsStatusDto['provider_summaries'] {
  const byProvider = new Map<string, AgentsStatusDto['provider_summaries'][number]>();

  for (const agent of agents) {
    const provider = agent.provider ?? 'unknown';
    const current = byProvider.get(provider) ?? {
      provider,
      total_agents: 0,
      busy_agents: 0,
      online_agents: 0,
      stale_agents: 0,
      disconnected_agents: 0,
      offline_agents: 0,
      overall_presence: 'offline' as const,
      last_seen_at: null,
      presence_reason: null,
      affected_agents: [],
      history: [],
      signal_status: 'unknown' as const,
      last_signal_at: null,
      signal_counts: {
        ready_events: 0,
        restart_events: 0,
        transport_errors: 0,
      },
      signals: [],
    };

    current.total_agents += 1;
    if (agent.status === 'busy') {
      current.busy_agents += 1;
    }

    switch (agent.presence) {
      case 'online':
        current.online_agents += 1;
        break;
      case 'stale':
        current.stale_agents += 1;
        break;
      case 'disconnected':
        current.disconnected_agents += 1;
        break;
      default:
        current.offline_agents += 1;
        break;
    }

    current.last_seen_at = newestTimestamp(current.last_seen_at, agent.last_seen_at);
    current.affected_agents.push({
      id: agent.id,
      status: agent.status,
      presence: agent.presence,
      presence_reason: agent.presence_reason ?? null,
      last_seen_at: agent.last_seen_at,
      account_id: agent.account_id ?? null,
    });
    byProvider.set(provider, current);
  }

  return Array.from(byProvider.values())
    .map((summary) => {
      const affectedAgents = summary.affected_agents.sort(compareAffectedAgents);
      const providerHistory = history
        .filter((item) => inferProviderFromHistory(item) === summary.provider)
        .sort(compareHistoryEvents)
        .slice(0, 8);
      const providerSignals = signals
        .filter((item) => item.provider === summary.provider)
        .sort(compareSignalEvents)
        .slice(0, 12);
      const overallPresence = deriveOverallPresence(summary);
      return {
        ...summary,
        overall_presence: overallPresence,
        presence_reason: overallPresence === 'offline' ? null : (affectedAgents[0]?.presence_reason ?? null),
        affected_agents: affectedAgents,
        history: providerHistory,
        signal_status: deriveSignalStatus(providerSignals),
        last_signal_at: providerSignals[0]?.occurred_at ?? null,
        signal_counts: buildSignalCounts(providerSignals),
        signals: providerSignals,
      };
    })
    .sort(compareProviderSummaries);
}

function deriveOverallPresence(
  summary: AgentsStatusDto['provider_summaries'][number],
): AgentsStatusDto['provider_summaries'][number]['overall_presence'] {
  if (summary.disconnected_agents > 0) {
    return 'disconnected';
  }
  if (summary.stale_agents > 0) {
    return 'stale';
  }
  if (summary.online_agents > 0 || summary.busy_agents > 0) {
    return 'online';
  }
  return 'offline';
}

function compareAffectedAgents(
  left: AgentsStatusDto['provider_summaries'][number]['affected_agents'][number],
  right: AgentsStatusDto['provider_summaries'][number]['affected_agents'][number],
) {
  const presenceDelta = presenceSeverity(left.presence) - presenceSeverity(right.presence);
  if (presenceDelta !== 0) {
    return presenceDelta;
  }
  const leftSeen = left.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
  const rightSeen = right.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
  if (leftSeen !== rightSeen) {
    return rightSeen - leftSeen;
  }
  return left.id.localeCompare(right.id);
}

function compareProviderSummaries(
  left: AgentsStatusDto['provider_summaries'][number],
  right: AgentsStatusDto['provider_summaries'][number],
) {
  const signalDelta = signalSeverity(left.signal_status) - signalSeverity(right.signal_status);
  if (signalDelta !== 0) {
    return signalDelta;
  }
  const presenceDelta = presenceSeverity(left.overall_presence) - presenceSeverity(right.overall_presence);
  if (presenceDelta !== 0) {
    return presenceDelta;
  }
  const leftSeen = left.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
  const rightSeen = right.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
  if (leftSeen !== rightSeen) {
    return rightSeen - leftSeen;
  }
  return left.provider.localeCompare(right.provider);
}

function newestTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function presenceSeverity(presence: 'online' | 'offline' | 'disconnected' | 'stale') {
  switch (presence) {
    case 'disconnected':
      return 0;
    case 'stale':
      return 1;
    case 'online':
      return 2;
    default:
      return 3;
  }
}

function inferProviderFromHistory(event: AgentPresenceHistoryEvent) {
  return event.account_id === null && event.agent_id === 'main' ? 'whatsapp' : 'discord';
}

function compareHistoryEvents(left: AgentPresenceHistoryEvent, right: AgentPresenceHistoryEvent) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function compareSignalEvents(left: AgentProviderSignalEvent, right: AgentProviderSignalEvent) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function deriveSignalStatus(
  signals: AgentProviderSignalEvent[],
): AgentsStatusDto['provider_summaries'][number]['signal_status'] {
  const latest = signals[0];
  if (!latest) {
    return 'unknown';
  }
  if (latest.kind === 'transport_error' || latest.kind === 'health_restart' || latest.kind === 'auto_restart_attempt') {
    return 'degraded';
  }
  if (latest.kind === 'provider_start' || latest.kind === 'gateway_proxy_enabled') {
    return 'recovering';
  }
  if (latest.kind === 'provider_ready' || latest.kind === 'inbound_ready') {
    return 'healthy';
  }
  return 'unknown';
}

function buildSignalCounts(signals: AgentProviderSignalEvent[]) {
  return signals.reduce(
    (acc, signal) => {
      if (signal.kind === 'provider_ready' || signal.kind === 'inbound_ready') {
        acc.ready_events += 1;
      }
      if (signal.kind === 'health_restart' || signal.kind === 'auto_restart_attempt') {
        acc.restart_events += 1;
      }
      if (signal.kind === 'transport_error') {
        acc.transport_errors += 1;
      }
      return acc;
    },
    {
      ready_events: 0,
      restart_events: 0,
      transport_errors: 0,
    },
  );
}

function signalSeverity(status: AgentsStatusDto['provider_summaries'][number]['signal_status']) {
  switch (status) {
    case 'degraded':
      return 0;
    case 'recovering':
      return 1;
    case 'healthy':
      return 2;
    default:
      return 3;
  }
}
