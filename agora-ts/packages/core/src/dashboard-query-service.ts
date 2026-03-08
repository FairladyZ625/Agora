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
import { ArchiveJobRepository, type AgoraDatabase, SubtaskRepository, TaskRepository, TodoRepository, type TodoRepository as TodoRepositoryType } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type { LiveSessionStore } from './live-session-store.js';
import type { AgentRegistry } from './openclaw-agent-registry.js';
import type { AgentPresenceSource } from './openclaw-provider-presence.js';

export interface DashboardQueryServiceOptions {
  templatesDir: string;
  liveSessions?: LiveSessionStore;
  agentRegistry?: AgentRegistry;
  presenceSource?: AgentPresenceSource;
}

export class DashboardQueryService {
  private readonly tasks: TaskRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly archives: ArchiveJobRepository;
  private readonly todos: TodoRepositoryType;
  private readonly templatesDir: string;
  private readonly liveSessions: LiveSessionStore | undefined;
  private readonly agentRegistry: AgentRegistry | undefined;
  private readonly presenceSource: AgentPresenceSource | undefined;

  constructor(
    private readonly db: AgoraDatabase,
    options: DashboardQueryServiceOptions,
  ) {
    this.tasks = new TaskRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.archives = new ArchiveJobRepository(db);
    this.todos = new TodoRepository(db);
    this.templatesDir = options.templatesDir;
    this.liveSessions = options.liveSessions;
    this.agentRegistry = options.agentRegistry;
    this.presenceSource = options.presenceSource;
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
          craftsmen.set(subtask.craftsman_type, {
            id: subtask.craftsman_type,
            status: subtask.done_at ? 'idle' : 'busy',
            task_id: task.id,
            subtask_id: subtask.id,
            title: subtask.title,
            running_since: subtask.dispatched_at,
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
    return null;
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
