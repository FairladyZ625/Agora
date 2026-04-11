import { taskStateSchema, type ITaskRepository, type TaskRecord, type TaskState, type WorkspaceBootstrapStatusDto } from '@agora-ts/contracts';
import type { TaskService } from './task-service.js';

export interface WorkspaceBootstrapServiceOptions {
  taskRepository: ITaskRepository;
  taskService: Pick<TaskService, 'createTask'>;
  runtimeReady: boolean;
  runtimeReadinessReason?: string | null;
  creator?: string | null;
}

export class WorkspaceBootstrapService {
  private readonly tasks: ITaskRepository;
  private readonly taskService: Pick<TaskService, 'createTask'>;
  private readonly runtimeReady: boolean;
  private readonly runtimeReadinessReason: string | null;
  private readonly creator: string;

  constructor(options: WorkspaceBootstrapServiceOptions) {
    this.tasks = options.taskRepository;
    this.taskService = options.taskService;
    this.runtimeReady = options.runtimeReady;
    this.runtimeReadinessReason = options.runtimeReadinessReason ?? null;
    this.creator = options.creator?.trim() || 'archon';
  }

  initialize(): TaskRecord | null {
    if (!this.runtimeReady) {
      return null;
    }

    const existing = this.findBootstrapTask();
    if (existing) {
      return existing;
    }

    return this.taskService.createTask({
      title: 'Workspace Bootstrap Interview',
      type: 'document',
      creator: this.creator,
      description: [
        'Interview the workspace owner before the orchestrator starts managing projects.',
        '',
        'Bootstrap goals:',
        '- confirm runtime and IM setup',
        '- capture org-wide working norms and decision boundaries',
        '- identify shared docs, vaults, and external references worth treating as workspace-level context sources',
        '- identify the current project portfolio and review expectations',
      ].join('\n'),
      priority: 'high',
      control: {
        mode: 'normal',
        workspace_bootstrap: {
          kind: 'orchestrator_onboarding',
        },
      },
    });
  }

  getStatus(): WorkspaceBootstrapStatusDto {
    const bootstrapTask = this.findBootstrapTask();
    return {
      runtime_ready: this.runtimeReady,
      runtime_readiness_reason: this.runtimeReadinessReason,
      bootstrap_task_id: bootstrapTask?.id ?? null,
      bootstrap_task_title: bootstrapTask?.title ?? null,
      bootstrap_task_state: normalizeTaskState(bootstrapTask?.state),
      bootstrap_completed: bootstrapTask?.state === 'done',
    };
  }

  private findBootstrapTask(): TaskRecord | null {
    const tasks = this.tasks.listTasks();
    return tasks.find((task) => task.control?.workspace_bootstrap?.kind === 'orchestrator_onboarding') ?? null;
  }
}

function normalizeTaskState(value: string | null | undefined): TaskState | null {
  if (!value) {
    return null;
  }
  return taskStateSchema.safeParse(value).success ? (value as TaskState) : null;
}
