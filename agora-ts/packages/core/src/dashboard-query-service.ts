import type {
  AgentsStatusDto,
  ArchiveJobDto,
  ArchiveJobReceiptScanResponseDto,
  ArchiveJobScanResponseDto,
  ArchiveJobStatusUpdateRequestDto,
  CreateTodoRequestDto,
  TemplateDetailDto,
  TemplateSummaryDto,
  UpdateTodoRequestDto,
} from '@agora-ts/contracts';
import { ArchiveJobRepository, CraftsmanExecutionRepository, type AgoraDatabase, SubtaskRepository, TaskRepository, TemplateRepository, TodoRepository, type TodoRepository as TodoRepositoryType } from '@agora-ts/db';
import type { ArchiveJobNotifier, ArchiveJobReceiptIngestor } from './archive-job-notifier.js';
import { NotFoundError } from './errors.js';
import type { IMProvisioningPort } from './im-ports.js';
import type { LiveSessionStore } from './live-session-store.js';
import type {
  AgentInventorySource,
  AgentPresenceHistoryEvent,
  AgentProviderSignalEvent,
  PresenceSource,
} from './runtime-ports.js';
import type { TaskContextBindingService } from './task-context-binding-service.js';
import type { TmuxRuntimeService } from './tmux-runtime-service.js';
import { normalizeCraftsmanAdapter } from './craftsman-adapter-aliases.js';
import { parseAcpSessionId } from './adapters/acp-session-ref.js';

export interface DashboardQueryServiceOptions {
  templatesDir: string;
  archiveJobNotifier?: ArchiveJobNotifier;
  archiveJobReceiptIngestor?: ArchiveJobReceiptIngestor;
  imProvisioningPort?: IMProvisioningPort;
  taskContextBindingService?: TaskContextBindingService;
  liveSessions?: LiveSessionStore;
  agentRegistry?: AgentInventorySource;
  presenceSource?: PresenceSource;
  tmuxRuntimeService?: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'>;
  agentsStatusCacheTtlMs?: number;
  now?: () => Date;
}

export class DashboardQueryService {
  private readonly tasks: TaskRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly archives: ArchiveJobRepository;
  private readonly todos: TodoRepositoryType;
  private readonly executions: CraftsmanExecutionRepository;
  private readonly templateRepository: TemplateRepository;
  private readonly archiveJobNotifier: ArchiveJobNotifier | undefined;
  private readonly archiveJobReceiptIngestor: ArchiveJobReceiptIngestor | undefined;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly taskContextBindingService: TaskContextBindingService | undefined;
  private readonly liveSessions: LiveSessionStore | undefined;
  private readonly agentRegistry: AgentInventorySource | undefined;
  private readonly presenceSource: PresenceSource | undefined;
  private readonly tmuxRuntimeService: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'> | undefined;
  private readonly agentsStatusCacheTtlMs: number;
  private readonly now: () => Date;
  private agentsStatusCache: { value: AgentsStatusDto; expiresAtMs: number } | null = null;

  constructor(
    private readonly db: AgoraDatabase,
    options: DashboardQueryServiceOptions,
  ) {
    this.tasks = new TaskRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.archives = new ArchiveJobRepository(db);
    this.todos = new TodoRepository(db);
    this.executions = new CraftsmanExecutionRepository(db);
    this.templateRepository = new TemplateRepository(db);
    this.templateRepository.seedFromDir(options.templatesDir);
    this.templateRepository.repairMemberKindsFromDir(options.templatesDir);
    this.templateRepository.repairStageSemanticsFromDir(options.templatesDir);
    this.templateRepository.repairGraphsFromDir(options.templatesDir);
    this.archiveJobNotifier = options.archiveJobNotifier;
    this.archiveJobReceiptIngestor = options.archiveJobReceiptIngestor;
    this.imProvisioningPort = options.imProvisioningPort;
    this.taskContextBindingService = options.taskContextBindingService;
    this.liveSessions = options.liveSessions;
    this.agentRegistry = options.agentRegistry;
    this.presenceSource = options.presenceSource;
    this.tmuxRuntimeService = options.tmuxRuntimeService;
    this.agentsStatusCacheTtlMs = options.agentsStatusCacheTtlMs ?? 3_000;
    this.now = options.now ?? (() => new Date());
  }

  getAgentsStatus(): AgentsStatusDto {
    const nowMs = this.now().getTime();
    if (this.agentsStatusCache && this.agentsStatusCache.expiresAtMs > nowMs) {
      return this.agentsStatusCache.value;
    }
    const value = this.buildAgentsStatus({
      includeChannelDetails: false,
      includeHostAffectedAgents: false,
      includeTmuxTailPreview: false,
    });
    this.agentsStatusCache = {
      value,
      expiresAtMs: nowMs + this.agentsStatusCacheTtlMs,
    };
    return value;
  }

  getAgentChannelDetail(channel: string): AgentsStatusDto['channel_summaries'][number] {
    const allAgents = this.buildAgentReadModel({
      includeCraftsmen: false,
    }).allAgents;
    const providerHistory = typeof this.presenceSource?.listHistory === 'function'
      ? this.presenceSource.listHistory()
      : [];
    const providerSignals = typeof this.presenceSource?.listSignals === 'function'
      ? this.presenceSource.listSignals()
      : [];
    const detail = buildChannelSummaries(allAgents, providerHistory, providerSignals, {
      includeDetails: true,
    }).find((item) => item.channel === channel);
    if (!detail) {
      throw new NotFoundError(`Channel ${channel} not found`);
    }
    return detail;
  }

  private buildAgentsStatus(options: {
    includeChannelDetails: boolean;
    includeHostAffectedAgents: boolean;
    includeTmuxTailPreview: boolean;
  }): AgentsStatusDto {
    const { activeTaskCount, allAgents, craftsmen } = this.buildAgentReadModel({
      includeCraftsmen: true,
    });
    const providerHistory = typeof this.presenceSource?.listHistory === 'function'
      ? (options.includeChannelDetails ? this.presenceSource.listHistory() : [])
      : [];
    const providerSignals = typeof this.presenceSource?.listSignals === 'function'
      ? (options.includeChannelDetails ? this.presenceSource.listSignals() : [])
      : [];

    const tmuxRuntime = buildTmuxRuntime(this.tmuxRuntimeService, {
      includeTailPreview: options.includeTmuxTailPreview,
    });

    return {
      summary: {
        active_tasks: activeTaskCount,
        active_agents: allAgents.filter((item) => item.status === 'busy').length,
        total_agents: allAgents.length,
        online_agents: allAgents.filter((item) => item.presence === 'online').length,
        stale_agents: allAgents.filter((item) => item.presence === 'stale').length,
        disconnected_agents: allAgents.filter((item) => item.presence === 'disconnected').length,
        busy_craftsmen: craftsmen.filter((item) => item.status === 'busy').length,
      },
      agents: allAgents,
      craftsmen,
      channel_summaries: buildChannelSummaries(allAgents, providerHistory, providerSignals, {
        includeDetails: options.includeChannelDetails,
      }),
      host_summaries: buildHostSummaries(allAgents, {
        includeAffectedAgents: options.includeHostAffectedAgents,
      }),
      craftsman_runtime: buildCraftsmanRuntime(craftsmen, tmuxRuntime),
      tmux_runtime: tmuxRuntime,
    };
  }

  private buildAgentReadModel(options: {
    includeCraftsmen: boolean;
  }): {
    activeTaskCount: number;
    allAgents: AgentsStatusDto['agents'];
    craftsmen: AgentsStatusDto['craftsmen'];
  } {
    const activeTasks = this.tasks.listTasks('active');
    const activeTaskIds = activeTasks.map((task) => task.id);
    const agents = new Map<string, AgentsStatusDto['agents'][number]>();
    const craftsmen = new Map<string, AgentsStatusDto['craftsmen'][number]>();
    const activityMap = new Map<string, string | null>();
    const subtasksByTask = new Map<string, ReturnType<SubtaskRepository['listByTask']>>();
    const executionsByTaskSubtask = new Map<string, ReturnType<CraftsmanExecutionRepository['listBySubtask']>>();

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

    for (const subtask of this.subtasks.listByTaskIds(activeTaskIds)) {
      const current = subtasksByTask.get(subtask.task_id) ?? [];
      current.push(subtask);
      subtasksByTask.set(subtask.task_id, current);
    }

    if (options.includeCraftsmen) {
      for (const execution of this.executions.listByTaskIds(activeTaskIds)) {
        const key = `${execution.task_id}::${execution.subtask_id}`;
        const current = executionsByTaskSubtask.get(key) ?? [];
        current.push(execution);
        executionsByTaskSubtask.set(key, current);
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
          channel_providers: [] as string[],
          host_framework: null as string | null,
          inventory_sources: [] as string[],
          account_id: null,
        };
        if (!current.active_task_ids.includes(task.id)) {
          current.active_task_ids.push(task.id);
        }
        agents.set(member.agentId, current);
      }

      for (const subtask of subtasksByTask.get(task.id) ?? []) {
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
          channel_providers: [] as string[],
          host_framework: null as string | null,
          inventory_sources: [] as string[],
          account_id: null,
        };
        if (!current.active_task_ids.includes(task.id)) {
          current.active_task_ids.push(task.id);
        }
        if (!current.active_subtask_ids.includes(subtask.id)) {
          current.active_subtask_ids.push(subtask.id);
        }
        agents.set(subtask.assignee, current);

        if (options.includeCraftsmen && subtask.craftsman_type) {
          const recentExecutions = (executionsByTaskSubtask.get(`${task.id}::${subtask.id}`) ?? [])
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
        channel_providers: [] as string[],
        host_framework: 'openclaw' as string | null,
        inventory_sources: ['openclaw'] as string[],
        account_id: null,
      };
      current.status = session.status === 'idle' ? 'idle' : 'busy';
      current.presence = 'online';
      current.presence_reason = 'live_session';
      current.last_active_at = session.last_event_at;
      current.last_seen_at = session.last_event_at;
      current.load = Math.max(current.load, 1);
      current.host_framework = current.host_framework ?? 'openclaw';
      mergeUnique(current.inventory_sources, 'openclaw');
      const channelProvider = normalizeChannelProvider(session.channel);
      if (channelProvider && channelProvider !== session.agent_id) {
        mergeUnique(current.channel_providers, channelProvider);
      }
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
        channel_providers: [] as string[],
        host_framework: null as string | null,
        inventory_sources: [] as string[],
        account_id: null,
      };
      current.primary_model = item.primary_model;
      current.workspace_dir = item.workspace_dir;
      current.host_framework = current.host_framework ?? item.host_framework;
      mergeUniqueMany(current.channel_providers, item.channel_providers);
      mergeUniqueMany(current.inventory_sources, item.inventory_sources);
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
        channel_providers: [] as string[],
        host_framework: null as string | null,
        inventory_sources: item.provider ? [item.provider] : [] as string[],
        account_id: item.account_id,
      };
      current.presence = item.presence;
      current.presence_reason = item.reason;
      current.last_seen_at = item.last_seen_at;
      const channelProvider = normalizeChannelProvider(item.provider);
      if (channelProvider) {
        mergeUnique(current.channel_providers, channelProvider);
        mergeUnique(current.inventory_sources, channelProvider);
      }
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
        channel_providers: item.channel_providers.sort(),
        host_framework: item.host_framework ?? null,
        inventory_sources: item.inventory_sources.sort(),
        account_id: item.account_id ?? null,
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
    return {
      activeTaskCount: activeTasks.length,
      allAgents,
      craftsmen: Array.from(craftsmen.values()).sort((a, b) => a.id.localeCompare(b.id)),
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

  notifyArchiveJob(jobId: number): ArchiveJobDto {
    if (!this.archiveJobNotifier) {
      throw new Error('Archive job notifier is not configured');
    }
    const job = this.getArchiveJob(jobId);
    if (job.status !== 'pending') {
      throw new Error(`Archive job ${jobId} is in status '${job.status}', expected 'pending'`);
    }
    const receipt = this.archiveJobNotifier.notify(job);
    return this.archives.updateArchiveJob(jobId, {
      status: 'notified',
      payload_patch: {
        notification_receipt: receipt,
      },
    });
  }

  updateArchiveJob(jobId: number, updates: ArchiveJobStatusUpdateRequestDto): ArchiveJobDto {
    const updated = this.archives.updateArchiveJob(jobId, {
      status: updates.status,
      ...(updates.commit_hash ? { commit_hash: updates.commit_hash } : {}),
      ...(updates.error_message ? { error_message: updates.error_message } : {}),
    });
    if (updates.status === 'synced') {
      this.finalizeImContextForArchivedTask(updated.task_id);
    }
    return updated;
  }

  failStaleArchiveJobs(options: { timeoutMs: number; now?: Date }): ArchiveJobScanResponseDto {
    return {
      failed: this.archives.failStaleNotifiedJobs(options),
    };
  }

  ingestArchiveJobReceipts(): ArchiveJobReceiptScanResponseDto {
    if (!this.archiveJobReceiptIngestor) {
      throw new Error('Archive job receipt ingestor is not configured');
    }

    let processed = 0;
    let synced = 0;
    let failed = 0;
    for (const receipt of this.archiveJobReceiptIngestor.scan()) {
      const job = this.archives.getArchiveJob(receipt.job_id);
      if (!job || job.status !== 'notified') {
        continue;
      }
      this.archives.updateArchiveJob(job.id, {
        status: receipt.status,
        ...(receipt.commit_hash ? { commit_hash: receipt.commit_hash } : {}),
        ...(receipt.error_message ? { error_message: receipt.error_message } : {}),
        payload_patch: {
          writer_receipt: {
            status: receipt.status,
            processed_path: receipt.processed_path,
          },
        },
      });
      processed += 1;
      if (receipt.status === 'synced') {
        this.finalizeImContextForArchivedTask(job.task_id);
        synced += 1;
      } else {
        failed += 1;
      }
    }

    return { processed, synced, failed };
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
    return this.templateRepository.listTemplates().map(({ id, template }) => ({
      id,
      name: template.name,
      type: template.type,
      description: template.description ?? '',
      governance: template.governance ?? null,
      stage_count: template.stages?.length ?? 0,
    }));
  }

  getTemplate(templateId: string): TemplateDetailDto {
    const stored = this.templateRepository.getTemplate(templateId);
    if (!stored) {
      throw new NotFoundError(`Template ${templateId} not found`);
    }
    return stored.template;
  }

  private finalizeImContextForArchivedTask(taskId: string) {
    if (!this.imProvisioningPort || !this.taskContextBindingService) {
      return;
    }
    const binding = this.taskContextBindingService.getLatestBinding(taskId);
    if (!binding || binding.status === 'destroyed') {
      return;
    }
    void this.imProvisioningPort.archiveContext({
      binding_id: binding.id,
      conversation_ref: binding.conversation_ref,
      thread_ref: binding.thread_ref,
      mode: 'delete',
      reason: 'archive job synced',
    }).then(() => {
      this.taskContextBindingService?.updateStatus(binding.id, 'destroyed');
    }).catch((err: unknown) => {
      console.error(`[DashboardQueryService] IM context destroy failed for task ${taskId}:`, err);
      this.taskContextBindingService?.updateStatus(binding.id, 'failed');
    });
  }
}

function buildTmuxRuntime(
  tmuxRuntimeService: Pick<TmuxRuntimeService, 'status' | 'doctor' | 'tail'> | undefined,
  options: { includeTailPreview: boolean },
): AgentsStatusDto['tmux_runtime'] {
  if (!tmuxRuntimeService) {
    return null;
  }
  const status = tmuxRuntimeService.status();
  const doctor = tmuxRuntimeService.doctor();
  const statusByAgent = new Map(status.panes.map((item) => [normalizeTmuxRuntimeAgent(item.title), item]));
  const byAgent = new Map(doctor.panes.map((item) => [item.agent, item]));
  const agents = new Set<string>([
    ...status.panes.map((item) => normalizeTmuxRuntimeAgent(item.title)),
    ...doctor.panes.map((item) => item.agent),
  ]);

  return {
    session: status.session,
    panes: Array.from(agents)
      .sort((left, right) => left.localeCompare(right))
      .map((agent) => {
        const paneStatus = statusByAgent.get(agent);
        const paneDoctor = byAgent.get(agent) ?? null;
        return {
          agent,
          pane_id: paneStatus?.id ?? paneDoctor?.pane ?? null,
          current_command: paneStatus?.currentCommand ?? paneDoctor?.command ?? null,
          active: paneStatus?.active ?? paneDoctor?.active ?? false,
          ready: paneDoctor?.ready ?? paneStatus !== undefined,
          tail_preview: options.includeTailPreview ? safeTail(tmuxRuntimeService, agent) : null,
          continuity_backend: paneStatus?.continuityBackend ?? paneDoctor?.continuityBackend ?? 'unknown',
          resume_capability: paneStatus?.resumeCapability ?? paneDoctor?.resumeCapability ?? 'none',
          session_reference: paneStatus?.sessionReference ?? paneDoctor?.sessionReference ?? null,
          identity_source: paneStatus?.identitySource ?? paneDoctor?.identitySource ?? 'registry_default',
          identity_source_rank: paneStatus?.identitySourceRank ?? paneDoctor?.identitySourceRank ?? 0,
          identity_path: paneStatus?.identityPath ?? paneDoctor?.identityPath ?? null,
          session_observed_at: paneStatus?.sessionObservedAt ?? paneDoctor?.sessionObservedAt ?? null,
          identity_conflict_count: paneStatus?.identityConflictCount ?? paneDoctor?.identityConflictCount ?? 0,
          last_rejected_identity_source: paneStatus?.lastRejectedIdentitySource ?? paneDoctor?.lastRejectedIdentitySource ?? null,
          last_rejected_session_reference: paneStatus?.lastRejectedSessionReference ?? paneDoctor?.lastRejectedSessionReference ?? null,
          last_rejected_observed_at: paneStatus?.lastRejectedObservedAt ?? paneDoctor?.lastRejectedObservedAt ?? null,
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

function normalizeTmuxRuntimeAgent(value: string) {
  const cleaned = value
    .replace(/^[^A-Za-z0-9]+/u, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '_');
  return normalizeCraftsmanAdapter(cleaned);
}

function buildCraftsmanRuntime(
  craftsmen: AgentsStatusDto['craftsmen'],
  tmuxRuntime: AgentsStatusDto['tmux_runtime'],
): AgentsStatusDto['craftsman_runtime'] {
  const slots: AgentsStatusDto['craftsman_runtime']['slots'] = [];

  if (tmuxRuntime) {
    for (const pane of tmuxRuntime.panes) {
      slots.push({
        provider: 'tmux',
        agent: pane.agent,
        session_id: pane.transport_session_id,
        runtime_mode: 'tmux',
        transport: 'tmux-pane',
        status: pane.active ? 'running' : pane.ready ? 'idle' : 'unready',
        ready: pane.ready,
        active: pane.active,
        current_command: pane.current_command,
        tail_preview: pane.tail_preview,
        session_reference: pane.session_reference,
        execution_id: null,
        task_id: null,
        subtask_id: null,
        title: null,
      });
    }
  }

  for (const craftsman of craftsmen) {
    for (const execution of craftsman.recent_executions) {
      const provider = inferCraftsmanRuntimeProvider(execution);
      if (provider === 'tmux' && tmuxRuntime) {
        continue;
      }
      slots.push({
        provider,
        agent: normalizeCraftsmanAdapter(craftsman.id),
        session_id: execution.session_id,
        runtime_mode: execution.runtime_mode,
        transport: execution.transport,
        status: execution.status,
        ready: execution.status !== 'queued' && execution.status !== 'failed',
        active: execution.status === 'running' || execution.status === 'needs_input' || execution.status === 'awaiting_choice',
        current_command: null,
        tail_preview: null,
        session_reference: provider === 'acpx' ? parseAcpSessionId(execution.session_id) : execution.session_id,
        execution_id: execution.execution_id,
        task_id: craftsman.task_id,
        subtask_id: craftsman.subtask_id,
        title: craftsman.title,
      });
    }
  }

  if (slots.length === 0) {
    return null;
  }

  const providers = Array.from(slots.reduce((map, slot) => {
    const current = map.get(slot.provider) ?? {
      provider: slot.provider,
      session: slot.provider === 'tmux' ? tmuxRuntime?.session ?? null : null,
      slot_count: 0,
      ready_slots: 0,
      active_slots: 0,
    };
    current.slot_count += 1;
    current.ready_slots += slot.ready ? 1 : 0;
    current.active_slots += slot.active ? 1 : 0;
    map.set(slot.provider, current);
    return map;
  }, new Map<AgentsStatusDto['craftsman_runtime']['providers'][number]['provider'], AgentsStatusDto['craftsman_runtime']['providers'][number]>()).values());

  return {
    providers,
    slots: slots.sort((left, right) => left.agent.localeCompare(right.agent)),
  };
}

function inferCraftsmanRuntimeProvider(
  execution: AgentsStatusDto['craftsmen'][number]['recent_executions'][number],
): AgentsStatusDto['craftsman_runtime']['providers'][number]['provider'] {
  if (execution.session_id?.startsWith('acpx:') || execution.runtime_mode === 'acp' || execution.transport === 'acpx') {
    return 'acpx';
  }
  if (execution.session_id?.startsWith('tmux:') || execution.runtime_mode === 'tmux' || execution.transport === 'tmux-pane') {
    return 'tmux';
  }
  return 'unknown';
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

function normalizeChannelProvider(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function mergeUnique(target: string[], value: string | null) {
  if (!value || target.includes(value)) {
    return;
  }
  target.push(value);
}

function mergeUniqueMany(target: string[], values: string[]) {
  for (const value of values) {
    mergeUnique(target, value);
  }
}

function buildChannelSummaries(
  agents: AgentsStatusDto['agents'],
  history: AgentPresenceHistoryEvent[],
  signals: AgentProviderSignalEvent[],
  options: { includeDetails: boolean },
): AgentsStatusDto['channel_summaries'] {
  const byChannel = new Map<string, AgentsStatusDto['channel_summaries'][number]>();

  for (const agent of agents) {
    for (const channel of agent.channel_providers) {
      const current = byChannel.get(channel) ?? {
        channel,
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

      accumulateSummaryAgent(current, agent);
      byChannel.set(channel, current);
    }
  }

  return Array.from(byChannel.values())
    .map((summary) => {
      const affectedAgents = summary.affected_agents.sort(compareAffectedAgents);
      const overallPresence = deriveAxisPresence(summary);
      const channelHistory = options.includeDetails
        ? history
          .filter((item) => inferChannelFromHistory(item) === summary.channel)
          .sort(compareHistoryEvents)
          .slice(0, 8)
        : [];
      const rawChannelSignals = options.includeDetails
        ? signals
          .filter((item) => item.provider === summary.channel)
          .sort(compareSignalEvents)
        : [];
      const channelSignals = options.includeDetails ? compactChannelSignals(rawChannelSignals, overallPresence) : [];
      return {
        ...summary,
        overall_presence: overallPresence,
        presence_reason: overallPresence === 'offline' ? null : (affectedAgents[0]?.presence_reason ?? null),
        affected_agents: options.includeDetails ? affectedAgents : [],
        history: channelHistory,
        signal_status: options.includeDetails ? deriveSignalStatus(channelSignals, overallPresence) : 'unknown',
        last_signal_at: options.includeDetails ? (channelSignals[0]?.occurred_at ?? null) : null,
        signal_counts: options.includeDetails ? buildSignalCounts(channelSignals) : {
          ready_events: 0,
          restart_events: 0,
          transport_errors: 0,
        },
        signals: channelSignals.map((item) => ({
          ...item,
          channel: item.provider,
        })),
      };
    })
    .sort(compareChannelSummaries);
}

function buildHostSummaries(
  agents: AgentsStatusDto['agents'],
  options: { includeAffectedAgents: boolean },
): AgentsStatusDto['host_summaries'] {
  const byHost = new Map<string, AgentsStatusDto['host_summaries'][number]>();

  for (const agent of agents) {
    const host = agent.host_framework;
    if (!host) {
      continue;
    }
    const current = byHost.get(host) ?? {
      host,
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
    };

    accumulateSummaryAgent(current, agent);
    byHost.set(host, current);
  }

  return Array.from(byHost.values())
    .map((summary) => {
      const affectedAgents = summary.affected_agents.sort(compareAffectedAgents);
      const overallPresence = deriveAxisPresence(summary);
      return {
        ...summary,
        overall_presence: overallPresence,
        presence_reason: overallPresence === 'offline' ? null : (affectedAgents[0]?.presence_reason ?? null),
        affected_agents: options.includeAffectedAgents ? affectedAgents : [],
      };
    })
    .sort(compareHostSummaries);
}

function accumulateSummaryAgent(
  summary:
    | AgentsStatusDto['channel_summaries'][number]
    | AgentsStatusDto['host_summaries'][number],
  agent: AgentsStatusDto['agents'][number],
) {
  summary.total_agents += 1;
  if (agent.status === 'busy') {
    summary.busy_agents += 1;
  }

  switch (agent.presence) {
    case 'online':
      summary.online_agents += 1;
      break;
    case 'stale':
      summary.stale_agents += 1;
      break;
    case 'disconnected':
      summary.disconnected_agents += 1;
      break;
    default:
      summary.offline_agents += 1;
      break;
  }

  summary.last_seen_at = newestTimestamp(summary.last_seen_at, agent.last_seen_at);
  summary.affected_agents.push({
    id: agent.id,
    status: agent.status,
    presence: agent.presence,
    presence_reason: agent.presence_reason ?? null,
    last_seen_at: agent.last_seen_at,
    account_id: agent.account_id ?? null,
  });
}

function deriveAxisPresence(
  summary: AgentsStatusDto['channel_summaries'][number] | AgentsStatusDto['host_summaries'][number],
): AgentsStatusDto['channel_summaries'][number]['overall_presence'] {
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
  left:
    | AgentsStatusDto['channel_summaries'][number]['affected_agents'][number]
    | AgentsStatusDto['host_summaries'][number]['affected_agents'][number],
  right:
    | AgentsStatusDto['channel_summaries'][number]['affected_agents'][number]
    | AgentsStatusDto['host_summaries'][number]['affected_agents'][number],
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

function compareChannelSummaries(
  left: AgentsStatusDto['channel_summaries'][number],
  right: AgentsStatusDto['channel_summaries'][number],
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
  return left.channel.localeCompare(right.channel);
}

function compareHostSummaries(
  left: AgentsStatusDto['host_summaries'][number],
  right: AgentsStatusDto['host_summaries'][number],
) {
  const presenceDelta = presenceSeverity(left.overall_presence) - presenceSeverity(right.overall_presence);
  if (presenceDelta !== 0) {
    return presenceDelta;
  }
  const leftSeen = left.last_seen_at ? new Date(left.last_seen_at).getTime() : 0;
  const rightSeen = right.last_seen_at ? new Date(right.last_seen_at).getTime() : 0;
  if (leftSeen !== rightSeen) {
    return rightSeen - leftSeen;
  }
  return left.host.localeCompare(right.host);
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

function inferChannelFromHistory(event: AgentPresenceHistoryEvent) {
  return normalizeChannelProvider(event.provider);
}

function compareHistoryEvents(left: AgentPresenceHistoryEvent, right: AgentPresenceHistoryEvent) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function compareSignalEvents(left: AgentProviderSignalEvent, right: AgentProviderSignalEvent) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function deriveSignalStatus(
  signals: AgentProviderSignalEvent[],
  overallPresence?: AgentsStatusDto['channel_summaries'][number]['overall_presence'],
): AgentsStatusDto['channel_summaries'][number]['signal_status'] {
  const latest = signals[0];
  if (!latest) {
    return 'unknown';
  }
  if (latest.kind === 'transport_error' || latest.kind === 'health_restart' || latest.kind === 'auto_restart_attempt') {
    if (overallPresence === 'online' || overallPresence === 'stale') {
      return 'recovering';
    }
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

function compactChannelSignals(
  signals: AgentProviderSignalEvent[],
  overallPresence: AgentsStatusDto['channel_summaries'][number]['overall_presence'],
) {
  const collapsed = collapseDuplicateSignals(signals);
  const latest = collapsed[0];
  if (!latest) {
    return [];
  }

  if (isDegradedSignal(latest)) {
    if (overallPresence === 'online' || overallPresence === 'stale') {
      const recovery = collapsed.find((signal) => !isDegradedSignal(signal));
      return recovery ? [latest, recovery] : [latest];
    }

    const chain: AgentProviderSignalEvent[] = [];
    for (const signal of collapsed) {
      chain.push(signal);
      if (!isDegradedSignal(signal) && chain.length > 1) {
        break;
      }
      if (chain.length >= 6) {
        break;
      }
    }
    return chain;
  }

  const healthyChain: AgentProviderSignalEvent[] = [];
  for (const signal of collapsed) {
    if (isDegradedSignal(signal)) {
      break;
    }
    healthyChain.push(signal);
    if (healthyChain.length >= 4) {
      break;
    }
  }
  return healthyChain;
}

function collapseDuplicateSignals(signals: AgentProviderSignalEvent[]) {
  const collapsed: AgentProviderSignalEvent[] = [];
  for (const signal of signals) {
    const previous = collapsed[collapsed.length - 1];
    if (
      previous &&
      previous.kind === signal.kind &&
      previous.provider === signal.provider &&
      previous.severity === signal.severity &&
      previous.detail === signal.detail
    ) {
      continue;
    }
    collapsed.push(signal);
  }
  return collapsed;
}

function isDegradedSignal(signal: AgentProviderSignalEvent) {
  return signal.kind === 'transport_error' || signal.kind === 'health_restart' || signal.kind === 'auto_restart_attempt';
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

function signalSeverity(status: AgentsStatusDto['channel_summaries'][number]['signal_status']) {
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
