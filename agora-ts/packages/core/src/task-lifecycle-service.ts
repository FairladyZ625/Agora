import type {
  CreateTaskAuthorityDto,
  CreateTaskRequestDto,
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
  WorkflowDto,
} from '@agora-ts/contracts';
import { TaskState } from './enums.js';
import { NotFoundError } from './errors.js';
import { validateRuntimeSupportedGraphSemantics, validateRuntimeWorkflowGraphAlignment, validateTemplateGraph } from './template-graph-service.js';

type TaskTemplate = {
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

type CreateTaskInputLike = Omit<CreateTaskRequestDto, 'locale'> & {
  locale?: TaskLocaleDto;
  authority?: CreateTaskAuthorityDto | undefined;
};

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type TaskBrainWorkspaceBindingLike = {
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata: Record<string, unknown> | null;
};

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
  tryLoadTemplate: (taskType: string) => TaskTemplate | null;
  buildWorkflow: (template: TaskTemplate) => WorkflowDto;
  buildTeam: (template: TaskTemplate) => TaskRecord['team'];
  enrichTeam: (team: TaskRecord['team']) => TaskRecord['team'];
  taskIdGenerator: () => string;
  validateProjectBinding: (input: {
    projectId: string;
    creator: string;
    authority?: CreateTaskAuthorityDto | undefined;
  }) => void;
  enterStage: (taskId: string, stageId: string) => void;
  seedTaskParticipants: (input: {
    taskId: string;
    team: TaskRecord['team'];
    firstStage: WorkflowStageLike | null;
  }) => void;
  createTaskBrainWorkspace: (task: TaskRecord, templateId: string) => TaskBrainWorkspaceBindingLike | null;
  destroyTaskBrainWorkspace: (binding: TaskBrainWorkspaceBindingLike) => void;
  recordProjectTaskBinding: (input: {
    projectId: string;
    taskId: string;
    title: string;
    state: TaskRecord['state'];
    workspacePath: string | null;
  }) => void;
  persistTaskAuthority: (taskId: string, authority?: CreateTaskAuthorityDto | undefined) => void;
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
  private readonly tryLoadTemplate: (taskType: string) => TaskTemplate | null;
  private readonly buildWorkflow: (template: TaskTemplate) => WorkflowDto;
  private readonly buildTeam: (template: TaskTemplate) => TaskRecord['team'];
  private readonly enrichTeam: (team: TaskRecord['team']) => TaskRecord['team'];
  private readonly taskIdGenerator: () => string;
  private readonly validateProjectBinding: TaskLifecycleServiceOptions['validateProjectBinding'];
  private readonly enterStage: TaskLifecycleServiceOptions['enterStage'];
  private readonly seedTaskParticipants: TaskLifecycleServiceOptions['seedTaskParticipants'];
  private readonly createTaskBrainWorkspace: TaskLifecycleServiceOptions['createTaskBrainWorkspace'];
  private readonly destroyTaskBrainWorkspace: TaskLifecycleServiceOptions['destroyTaskBrainWorkspace'];
  private readonly recordProjectTaskBinding: TaskLifecycleServiceOptions['recordProjectTaskBinding'];
  private readonly persistTaskAuthority: TaskLifecycleServiceOptions['persistTaskAuthority'];
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
    this.tryLoadTemplate = options.tryLoadTemplate;
    this.buildWorkflow = options.buildWorkflow;
    this.buildTeam = options.buildTeam;
    this.enrichTeam = options.enrichTeam;
    this.taskIdGenerator = options.taskIdGenerator;
    this.validateProjectBinding = options.validateProjectBinding;
    this.enterStage = options.enterStage;
    this.seedTaskParticipants = options.seedTaskParticipants;
    this.createTaskBrainWorkspace = options.createTaskBrainWorkspace;
    this.destroyTaskBrainWorkspace = options.destroyTaskBrainWorkspace;
    this.recordProjectTaskBinding = options.recordProjectTaskBinding;
    this.persistTaskAuthority = options.persistTaskAuthority;
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

  createTaskCore(input: CreateTaskInputLike): {
    task: TaskRecord;
    brainWorkspaceBinding: TaskBrainWorkspaceBindingLike | null;
  } {
    const template = this.tryLoadTemplate(input.type);
    const workflow = input.workflow_override ?? (template ? this.buildWorkflow(template) : null);
    const requestedTeam = input.team_override ?? (template ? this.buildTeam(template) : null);
    if (!workflow || !requestedTeam) {
      throw new NotFoundError(`Template not found: ${input.type}`);
    }
    if (workflow.graph) {
      const graphErrors = [
        ...validateTemplateGraph(workflow.graph),
        ...validateRuntimeWorkflowGraphAlignment(workflow.stages, workflow.graph),
        ...validateRuntimeSupportedGraphSemantics(workflow.graph),
      ];
      if (graphErrors.length > 0) {
        throw new Error(`workflow graph violates runtime-supported graph semantics: ${graphErrors.join('; ')}`);
      }
    }

    const team = this.enrichTeam(requestedTeam);
    const taskId = this.taskIdGenerator();
    const projectId = input.project_id ?? null;
    const nomosAuthoring = input.control?.nomos_authoring;
    const firstStageId = workflow.graph?.entry_nodes[0] ?? workflow.stages?.[0]?.id ?? null;
    const templateLabel = template?.name ?? input.type;
    let active: TaskRecord;
    let brainWorkspaceBinding: TaskBrainWorkspaceBindingLike | null = null;

    this.db.exec('BEGIN');
    try {
      if (nomosAuthoring?.kind === 'project_nomos') {
        if (!projectId) {
          throw new Error('project_nomos authoring tasks must be bound to a project');
        }
        if (nomosAuthoring.project_id !== projectId) {
          throw new Error(`project_nomos authoring project mismatch: task=${projectId} control=${nomosAuthoring.project_id}`);
        }
      }
      if (projectId) {
        this.validateProjectBinding({
          projectId,
          creator: input.creator,
          authority: input.authority,
        });
      }

      const draftInput: Parameters<ITaskRepository['insertTask']>[0] = {
        id: taskId,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        creator: input.creator,
        locale: resolveTaskLocale(input.locale),
        project_id: projectId,
        skill_policy: input.skill_policy ?? null,
        team,
        workflow,
        control: input.control ?? null,
      };
      const draft = this.taskRepository.insertTask(draftInput);

      const created = this.taskRepository.updateTask(taskId, draft.version, {
        state: TaskState.CREATED,
      });

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        from_state: TaskState.DRAFT,
        to_state: TaskState.CREATED,
        detail: { template: templateLabel, task_type: input.type },
        actor: 'system',
      });

      active = this.taskRepository.updateTask(taskId, created.version, {
        state: TaskState.ACTIVE,
        current_stage: firstStageId,
      });

      this.flowLogRepository.insertFlowLog({
        task_id: taskId,
        kind: 'flow',
        event: 'state_changed',
        stage_id: firstStageId,
        from_state: TaskState.CREATED,
        to_state: TaskState.ACTIVE,
        actor: 'system',
      });
      if (firstStageId) {
        this.enterStage(taskId, firstStageId);
      }
      if (firstStageId) {
        this.progressLogRepository.insertProgressLog({
          task_id: taskId,
          kind: 'progress',
          stage_id: firstStageId,
          content: `Entered stage ${firstStageId}`,
          artifacts: { stage_id: firstStageId },
          actor: 'system',
        });
      }

      const firstStage = workflow.stages?.[0] ?? null;
      this.seedTaskParticipants({
        taskId,
        team,
        firstStage,
      });
      brainWorkspaceBinding = this.createTaskBrainWorkspace(active, input.type);
      if (projectId) {
        this.recordProjectTaskBinding({
          projectId,
          taskId,
          title: input.title,
          state: TaskState.ACTIVE,
          workspacePath: brainWorkspaceBinding?.workspace_path ?? null,
        });
      }
      this.persistTaskAuthority(taskId, input.authority);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (brainWorkspaceBinding) {
        try {
          this.destroyTaskBrainWorkspace(brainWorkspaceBinding);
        } catch {
          // Ignore cleanup errors on rollback; DB remains canonical.
        }
      }
      throw error;
    }

    return {
      task: active!,
      brainWorkspaceBinding,
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

function resolveTaskLocale(locale: string | null | undefined): TaskLocaleDto {
  return locale === 'en-US' ? 'en-US' : 'zh-CN';
}
