import type {
  ProjectContextBriefingArtifactDto,
  ProjectContextDeliveryRequestDto,
  ProjectContextDeliveryResponseDto,
  TaskRecord,
} from '@agora-ts/contracts';
import type { ContextMaterializationService } from './context-materialization-service.js';
import {
  resolveTaskBrainProjectContextArtifactPath,
  resolveTaskBrainRuntimeDeliveryManifestPath,
} from './task-brain-port.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';

export interface ProjectContextDeliveryServiceOptions {
  contextMaterializationService: Pick<ContextMaterializationService, 'materialize'>;
  taskBrainBindingService?: Pick<TaskBrainBindingService, 'getActiveBinding'>;
  taskLookup?: {
    getTask(taskId: string): TaskRecord | null;
  };
}

export class ProjectContextDeliveryService {
  constructor(private readonly options: ProjectContextDeliveryServiceOptions) {}

  async getDelivery(input: {
    project_id: string;
    audience: ProjectContextDeliveryRequestDto['audience'];
    task_id?: string;
    citizen_id?: string | null;
    allowed_citizen_ids?: string[];
  }): Promise<ProjectContextDeliveryResponseDto> {
    const task = input.task_id && this.options.taskLookup
      ? this.options.taskLookup.getTask(input.task_id)
      : null;
    if (task?.project_id && task.project_id !== input.project_id) {
      throw new Error(`Task ${task.id} does not belong to project ${input.project_id}`);
    }

    const materialization = await this.options.contextMaterializationService.materialize({
      target: 'project_context_briefing',
      project_id: input.project_id,
      audience: input.audience,
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(task?.title ? { task_title: task.title } : {}),
      ...(task?.description ? { task_description: task.description } : {}),
      ...(input.citizen_id !== undefined ? { citizen_id: input.citizen_id } : {}),
      ...(resolveAllowedCitizenIds(task, input.allowed_citizen_ids)
        ? { allowed_citizen_ids: resolveAllowedCitizenIds(task, input.allowed_citizen_ids)! }
        : {}),
    });

    if (materialization.target !== 'project_context_briefing') {
      throw new Error(`Unexpected materialization target: ${materialization.target}`);
    }

    const briefing = materialization.artifact as ProjectContextBriefingArtifactDto;
    return {
      scope: 'project_context',
      delivery: {
        briefing,
        reference_bundle: briefing.reference_bundle ?? null,
        attention_routing_plan: briefing.attention_routing_plan ?? null,
        runtime_delivery: input.task_id ? buildRuntimeDelivery(this.options.taskBrainBindingService, input.task_id, task) : null,
      },
    };
  }
}

function resolveAllowedCitizenIds(task: TaskRecord | null, explicit?: string[]) {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (!task) {
    return undefined;
  }
  const citizenIds = task.team.members
    .filter((member) => member.member_kind === 'citizen')
    .map((member) => member.agentId);
  return citizenIds.length > 0 ? citizenIds : undefined;
}

function buildRuntimeDelivery(
  taskBrainBindingService: Pick<TaskBrainBindingService, 'getActiveBinding'> | undefined,
  taskId: string,
  task: TaskRecord | null,
) {
  const binding = taskBrainBindingService?.getActiveBinding(taskId);
  if (!binding || !task) {
    return null;
  }
  return {
    task_id: task.id,
    task_title: task.title,
    workspace_path: binding.workspace_path,
    manifest_path: resolveTaskBrainRuntimeDeliveryManifestPath(binding.workspace_path),
    artifact_paths: {
      controller: resolveTaskBrainProjectContextArtifactPath(binding.workspace_path, 'controller'),
      citizen: resolveTaskBrainProjectContextArtifactPath(binding.workspace_path, 'citizen'),
      craftsman: resolveTaskBrainProjectContextArtifactPath(binding.workspace_path, 'craftsman'),
    },
  };
}
