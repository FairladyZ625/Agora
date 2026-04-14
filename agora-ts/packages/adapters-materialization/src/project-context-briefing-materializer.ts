import type {
  ContextMaterializationRequestDto,
  ContextMaterializationResultDto,
  ContextMaterializationTargetDto,
  ProjectContextBriefingArtifactDto,
} from '@agora-ts/contracts';
import type { ContextMaterializationPort } from '@agora-ts/core';

type ProjectBrainAutomationServiceLike = {
  buildProjectContextBriefing(input: {
    project_id: string;
    audience: 'controller' | 'citizen' | 'craftsman';
    citizen_id?: string | null;
    allowed_citizen_ids?: string[];
  }): ProjectContextBriefingArtifactDto;
  buildProjectContextBriefingAsync(input: {
    project_id: string;
    audience: 'controller' | 'citizen' | 'craftsman';
    task_id: string;
    task_title?: string;
    task_description?: string;
    citizen_id?: string | null;
    allowed_citizen_ids?: string[];
  }): Promise<ProjectContextBriefingArtifactDto>;
};

export interface ProjectContextBriefingMaterializerOptions {
  projectBrainAutomationService: ProjectBrainAutomationServiceLike;
}

export class ProjectContextBriefingMaterializer implements ContextMaterializationPort {
  constructor(private readonly options: ProjectContextBriefingMaterializerOptions) {}

  supports(target: ContextMaterializationTargetDto) {
    return target === 'project_context_briefing';
  }

  materializeSync(request: ContextMaterializationRequestDto): ContextMaterializationResultDto {
    if (request.target !== 'project_context_briefing') {
      throw new Error(`Unsupported materialization target: ${request.target}`);
    }
    return {
      target: 'project_context_briefing',
      artifact: this.options.projectBrainAutomationService.buildProjectContextBriefing({
        project_id: request.project_id,
        audience: request.audience,
        ...(request.task_id ? { task_id: request.task_id } : {}),
        ...(request.task_title ? { task_title: request.task_title } : {}),
        ...(request.task_description ? { task_description: request.task_description } : {}),
        ...(request.citizen_id !== undefined ? { citizen_id: request.citizen_id } : {}),
        ...(request.allowed_citizen_ids && request.allowed_citizen_ids.length > 0
          ? { allowed_citizen_ids: request.allowed_citizen_ids }
          : {}),
      }),
    };
  }

  async materialize(request: ContextMaterializationRequestDto): Promise<ContextMaterializationResultDto> {
    if (request.target !== 'project_context_briefing') {
      throw new Error(`Unsupported materialization target: ${request.target}`);
    }
    const artifact = request.task_id
      ? await this.options.projectBrainAutomationService.buildProjectContextBriefingAsync({
        project_id: request.project_id,
        audience: request.audience,
        task_id: request.task_id,
        ...(request.task_title ? { task_title: request.task_title } : {}),
        ...(request.task_description ? { task_description: request.task_description } : {}),
        ...(request.citizen_id !== undefined ? { citizen_id: request.citizen_id } : {}),
        ...(request.allowed_citizen_ids && request.allowed_citizen_ids.length > 0
          ? { allowed_citizen_ids: request.allowed_citizen_ids }
          : {}),
      })
      : this.options.projectBrainAutomationService.buildProjectContextBriefing({
        project_id: request.project_id,
        audience: request.audience,
        ...(request.citizen_id !== undefined ? { citizen_id: request.citizen_id } : {}),
        ...(request.allowed_citizen_ids && request.allowed_citizen_ids.length > 0
          ? { allowed_citizen_ids: request.allowed_citizen_ids }
          : {}),
      });
    return {
      target: 'project_context_briefing',
      artifact,
    };
  }
}
