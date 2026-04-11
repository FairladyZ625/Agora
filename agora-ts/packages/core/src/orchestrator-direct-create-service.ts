import { orchestratorDirectCreateRequestSchema, type OrchestratorDirectCreateRequestDto, type TaskRecord } from '@agora-ts/contracts';
import type { TaskService } from './task-service.js';

export interface OrchestratorDirectCreateServiceOptions {
  taskService: Pick<TaskService, 'createTask'>;
}

export class OrchestratorDirectCreateService {
  constructor(private readonly options: OrchestratorDirectCreateServiceOptions) {}

  createFromConversationConfirmation(input: OrchestratorDirectCreateRequestDto): TaskRecord {
    const parsed = orchestratorDirectCreateRequestSchema.parse(input);
    const control = {
      mode: parsed.create.control?.mode ?? 'normal',
      ...(parsed.create.control?.nomos_authoring ? { nomos_authoring: parsed.create.control.nomos_authoring } : {}),
      ...(parsed.create.control?.workspace_bootstrap ? { workspace_bootstrap: parsed.create.control.workspace_bootstrap } : {}),
      orchestrator_intake: {
        kind: 'direct_create' as const,
        source: parsed.confirmation.source,
        confirmation_mode: parsed.confirmation.confirmation_mode,
        orchestrator_ref: parsed.orchestrator_ref,
        confirmed_by: parsed.confirmation.confirmed_by,
        confirmed_at: parsed.confirmation.confirmed_at,
        ...(parsed.confirmation.source_ref ? { source_ref: parsed.confirmation.source_ref } : {}),
      },
    };

    return this.options.taskService.createTask({
      title: parsed.create.title,
      type: parsed.create.type,
      creator: parsed.create.creator,
      description: parsed.create.description,
      priority: parsed.create.priority,
      ...(parsed.create.locale ? { locale: parsed.create.locale } : {}),
      ...(parsed.create.project_id !== undefined ? { project_id: parsed.create.project_id } : {}),
      ...(parsed.create.team_override ? { team_override: parsed.create.team_override } : {}),
      ...(parsed.create.workflow_override ? { workflow_override: parsed.create.workflow_override } : {}),
      ...(parsed.create.im_target ? { im_target: parsed.create.im_target } : {}),
      ...(parsed.create.authority ? { authority: parsed.create.authority } : {}),
      ...(parsed.create.skill_policy !== null && parsed.create.skill_policy !== undefined
        ? { skill_policy: parsed.create.skill_policy }
        : {}),
      control,
    });
  }
}
