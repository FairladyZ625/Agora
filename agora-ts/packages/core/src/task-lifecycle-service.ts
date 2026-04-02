import type {
  DatabasePort,
  IFlowLogRepository,
  IProgressLogRepository,
  ISubtaskRepository,
  ITaskRepository,
  ITodoRepository,
  TaskLocaleDto,
  PromoteTodoRequestDto,
  TaskBlueprintDto,
  TaskRecord,
  TaskStatusDto,
} from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';

type CreateTaskLike = (input: {
  title: string;
  type: string;
  creator: string;
  description: string;
  priority: PromoteTodoRequestDto['priority'];
  locale: TaskLocaleDto;
  project_id?: string | null | undefined;
}) => TaskRecord;

export interface TaskLifecycleServiceOptions {
  databasePort: DatabasePort;
  taskRepository: ITaskRepository;
  flowLogRepository: IFlowLogRepository;
  progressLogRepository: IProgressLogRepository;
  subtaskRepository: ISubtaskRepository;
  todoRepository: ITodoRepository;
  createTask: CreateTaskLike;
  withControllerRef: (task: TaskRecord) => TaskRecord;
  buildTaskBlueprint: (task: TaskRecord) => TaskBlueprintDto;
  buildCurrentStageRoster: (task: TaskRecord) => TaskStatusDto['current_stage_roster'];
}

export class TaskLifecycleService {
  private readonly db: DatabasePort;
  private readonly taskRepository: ITaskRepository;
  private readonly flowLogRepository: IFlowLogRepository;
  private readonly progressLogRepository: IProgressLogRepository;
  private readonly subtaskRepository: ISubtaskRepository;
  private readonly todoRepository: ITodoRepository;
  private readonly createTask: CreateTaskLike;
  private readonly withControllerRef: (task: TaskRecord) => TaskRecord;
  private readonly buildTaskBlueprint: (task: TaskRecord) => TaskBlueprintDto;
  private readonly buildCurrentStageRoster: (task: TaskRecord) => TaskStatusDto['current_stage_roster'];

  constructor(options: TaskLifecycleServiceOptions) {
    this.db = options.databasePort;
    this.taskRepository = options.taskRepository;
    this.flowLogRepository = options.flowLogRepository;
    this.progressLogRepository = options.progressLogRepository;
    this.subtaskRepository = options.subtaskRepository;
    this.todoRepository = options.todoRepository;
    this.createTask = options.createTask;
    this.withControllerRef = options.withControllerRef;
    this.buildTaskBlueprint = options.buildTaskBlueprint;
    this.buildCurrentStageRoster = options.buildCurrentStageRoster;
  }

  getTask(taskId: string): TaskRecord | null {
    const task = this.taskRepository.getTask(taskId);
    return task ? this.withControllerRef(task) : null;
  }

  listTasks(state?: string, projectId?: string): TaskRecord[] {
    return this.taskRepository.listTasks(state, projectId).map((task) => this.withControllerRef(task));
  }

  getTaskStatus(taskId: string): TaskStatusDto {
    const task = this.requireTask(taskId);
    return {
      task: this.withControllerRef(task) as TaskStatusDto['task'],
      task_blueprint: this.buildTaskBlueprint(task),
      current_stage_roster: this.buildCurrentStageRoster(task),
      flow_log: this.flowLogRepository.listByTask(taskId),
      progress_log: this.progressLogRepository.listByTask(taskId),
      subtasks: this.subtaskRepository.listByTask(taskId),
    };
  }

  promoteTodo(todoId: number, options: PromoteTodoRequestDto) {
    const todo = this.todoRepository.getTodo(todoId);
    if (!todo) {
      throw new NotFoundError(`Todo ${todoId} not found`);
    }
    if (todo.promoted_to) {
      throw new Error(`Todo ${todoId} already promoted to ${todo.promoted_to}`);
    }
    const task = this.createTask({
      title: todo.text,
      type: options.type,
      creator: options.creator,
      description: '',
      priority: options.priority,
      locale: 'zh-CN',
      ...(todo.project_id ? { project_id: todo.project_id } : {}),
    });
    const updatedTodo = this.todoRepository.updateTodo(todoId, {
      promoted_to: task.id,
    });
    return { todo: updatedTodo, task };
  }

  cleanupOrphaned(taskId?: string): number {
    const rows = taskId
      ? (this.db.prepare("SELECT id FROM tasks WHERE id = ? AND state = 'orphaned'").all(taskId) as Array<{ id: string }>)
      : (this.db.prepare("SELECT id FROM tasks WHERE state = 'orphaned'").all() as Array<{ id: string }>);

    let count = 0;
    for (const row of rows) {
      const orphanedTaskId = row.id;
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM craftsman_executions WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM flow_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM progress_log WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM stage_history WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM archon_reviews WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM approvals WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM quorum_votes WHERE task_id = ?').run(orphanedTaskId);
        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(orphanedTaskId);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      count += 1;
    }
    return count;
  }

  private requireTask(taskId: string) {
    const task = this.taskRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }
}
