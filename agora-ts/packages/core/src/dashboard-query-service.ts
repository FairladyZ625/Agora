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

export interface DashboardQueryServiceOptions {
  templatesDir: string;
}

export class DashboardQueryService {
  private readonly tasks: TaskRepository;
  private readonly subtasks: SubtaskRepository;
  private readonly archives: ArchiveJobRepository;
  private readonly todos: TodoRepositoryType;
  private readonly templatesDir: string;

  constructor(
    private readonly db: AgoraDatabase,
    options: DashboardQueryServiceOptions,
  ) {
    this.tasks = new TaskRepository(db);
    this.subtasks = new SubtaskRepository(db);
    this.archives = new ArchiveJobRepository(db);
    this.todos = new TodoRepository(db);
    this.templatesDir = options.templatesDir;
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
          active_task_ids: [],
          active_subtask_ids: [],
          load: 0,
          last_active_at: activityMap.get(member.agentId) ?? null,
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
          active_task_ids: [],
          active_subtask_ids: [],
          load: 0,
          last_active_at: activityMap.get(subtask.assignee) ?? null,
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

    return {
      summary: {
        active_tasks: activeTasks.length,
        active_agents: agents.size,
        busy_craftsmen: Array.from(craftsmen.values()).filter((item) => item.status === 'busy').length,
      },
      agents: Array.from(agents.values()).sort((a, b) => a.id.localeCompare(b.id)),
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
