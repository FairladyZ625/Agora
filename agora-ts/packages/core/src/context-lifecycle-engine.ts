import type {
  AttentionRoutingPlanDto,
  ContextLifecyclePhaseSnapshotDto,
  ContextLifecycleSnapshotDto,
  ProjectWriteLockRecord,
  TaskRecord,
  WorkspaceBootstrapStatusDto,
} from '@agora-ts/contracts';
import type { ProjectBrainAutomationAudience } from './project-brain-automation-policy.js';
import type { ProjectBrainDoctorReport, ProjectBrainDoctorService } from './project-brain-doctor-service.js';
import type { ProjectBootstrapService } from './project-bootstrap-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { ReferenceBundleDto } from '@agora-ts/contracts';
import type { AttentionRoutingService } from './attention-routing-service.js';
import type { ReferenceBundleService } from './reference-bundle-service.js';
import type { TaskWorktreeService } from './task-worktree-service.js';
import type { WorkspaceBootstrapService } from './workspace-bootstrap-service.js';

export interface BuildContextLifecycleSnapshotInput {
  project_id: string;
  audience: ProjectBrainAutomationAudience;
  task?: Pick<TaskRecord, 'id' | 'project_id' | 'type'>;
  task_title?: string;
  task_description?: string;
  citizen_id?: string | null;
  allowed_citizen_ids?: string[];
}

export interface ContextLifecycleEngineOptions {
  clock?: () => Date;
  workspaceBootstrapService?: Pick<WorkspaceBootstrapService, 'getStatus'>;
  projectBootstrapService?: Pick<ProjectBootstrapService, 'createHarnessBootstrapTask'>;
  referenceBundleService?: Pick<ReferenceBundleService, 'buildReferenceBundleAsync'>;
  attentionRoutingService?: Pick<AttentionRoutingService, 'buildPlanAsync'>;
  taskWorktreeService?: Pick<TaskWorktreeService, 'resolveBaseWorkdir'>;
  projectBrainAutomationService?: Pick<import('./project-brain-automation-service.js').ProjectBrainAutomationService, 'recordTaskCloseRecap'>;
  projectContextWriter?: Pick<ProjectContextWriter, 'getLock'>;
  projectBrainDoctorService?: Pick<ProjectBrainDoctorService, 'diagnoseProject'>;
}

export class ContextLifecycleEngine {
  private readonly now: NonNullable<ContextLifecycleEngineOptions['clock']>;

  constructor(private readonly options: ContextLifecycleEngineOptions) {
    this.now = options.clock ?? (() => new Date());
  }

  async buildSnapshot(input: BuildContextLifecycleSnapshotInput): Promise<ContextLifecycleSnapshotDto> {
    const workspaceBootstrap = this.options.workspaceBootstrapService?.getStatus();
    const referenceBundle = this.options.referenceBundleService
      ? await this.options.referenceBundleService.buildReferenceBundleAsync({
        project_id: input.project_id,
        mode: 'disclose',
        audience: input.audience,
        ...(input.task?.id ? { task_id: input.task.id } : {}),
        ...(input.task_title ? { task_title: input.task_title } : {}),
        ...(input.task_description ? { task_description: input.task_description } : {}),
        ...(input.citizen_id ? { citizen_id: input.citizen_id } : {}),
        ...(input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0 ? { allowed_citizen_ids: input.allowed_citizen_ids } : {}),
      })
      : null;
    const doctorReport = this.options.projectBrainDoctorService
      ? await this.options.projectBrainDoctorService.diagnoseProject(input.project_id)
      : null;
    const attentionRoutingPlan = referenceBundle && this.options.attentionRoutingService
      ? await this.options.attentionRoutingService.buildPlanAsync({
        project_id: input.project_id,
        mode: 'disclose',
        audience: input.audience,
        reference_bundle: referenceBundle,
        ...(input.task?.id ? { task_id: input.task.id } : {}),
        ...(input.task_title ? { task_title: input.task_title } : {}),
        ...(input.task_description ? { task_description: input.task_description } : {}),
      })
      : null;

    return {
      project_id: input.project_id,
      task_id: input.task?.id ?? null,
      generated_at: this.now().toISOString(),
      phases: [
        buildBootstrapPhase({
          ...(workspaceBootstrap ? { workspaceBootstrap } : {}),
          projectBootstrapAvailable: Boolean(this.options.projectBootstrapService),
          referenceBundle,
        }),
        buildDisclosePhase(referenceBundle, attentionRoutingPlan),
        buildExecutePhase(input.task, this.options.taskWorktreeService),
        buildCapturePhase(input.task, Boolean(this.options.projectBrainAutomationService)),
        buildHarvestPhase(input.project_id, input.task, this.options.projectContextWriter?.getLock(input.project_id) ?? null, Boolean(this.options.projectContextWriter)),
        buildEvolvePhase(doctorReport),
      ],
    };
  }
}

function buildBootstrapPhase(input: {
  workspaceBootstrap?: WorkspaceBootstrapStatusDto;
  projectBootstrapAvailable: boolean;
  referenceBundle: ReferenceBundleDto | null;
}): ContextLifecyclePhaseSnapshotDto {
  const bootstrapRefs = input.referenceBundle?.inventory.entries
    .filter((entry) => entry.slug.startsWith('bootstrap-'))
    .map((entry) => entry.reference_key) ?? [];
  if (!input.projectBootstrapAvailable) {
    return {
      phase: 'bootstrap',
      status: 'not_configured',
      summary: 'Project bootstrap service is not configured.',
      reference_keys: bootstrapRefs,
    };
  }
  if (input.workspaceBootstrap && !input.workspaceBootstrap.runtime_ready) {
    return {
      phase: 'bootstrap',
      status: 'blocked',
      summary: input.workspaceBootstrap.runtime_readiness_reason
        ? `Workspace bootstrap is blocked: ${input.workspaceBootstrap.runtime_readiness_reason}`
        : 'Workspace bootstrap is blocked by runtime readiness.',
      reference_keys: bootstrapRefs,
      metadata: {
        workspace_bootstrap_task_id: input.workspaceBootstrap.bootstrap_task_id,
      },
    };
  }
  return {
    phase: 'bootstrap',
    status: 'ready',
    summary: 'Bootstrap surfaces are configured for workspace/project initialization.',
    reference_keys: bootstrapRefs,
    metadata: input.workspaceBootstrap ? {
      workspace_bootstrap_task_id: input.workspaceBootstrap.bootstrap_task_id,
      workspace_bootstrap_completed: input.workspaceBootstrap.bootstrap_completed,
    } : undefined,
  };
}

function buildDisclosePhase(
  referenceBundle: ReferenceBundleDto | null,
  attentionRoutingPlan: AttentionRoutingPlanDto | null,
): ContextLifecyclePhaseSnapshotDto {
  if (!referenceBundle) {
    return {
      phase: 'disclose',
      status: 'not_configured',
      summary: 'Reference bundle service is not configured.',
      reference_keys: [],
    };
  }
  const routedReferenceKeys = attentionRoutingPlan?.routes.map((route) => route.reference_key)
    ?? referenceBundle.references.map((reference) => reference.reference_key);
  return {
    phase: 'disclose',
    status: 'ready',
    summary: 'Reference-first delivery bundle is available.',
    reference_keys: routedReferenceKeys,
    metadata: {
      ...(attentionRoutingPlan ? {
        attention_route_keys: attentionRoutingPlan.routes.map((route) => route.reference_key),
        attention_summary: attentionRoutingPlan.summary,
      } : {}),
      inventory_count: referenceBundle.inventory.entries.length,
    },
  };
}

function buildExecutePhase(
  task: BuildContextLifecycleSnapshotInput['task'],
  taskWorktreeService: Pick<TaskWorktreeService, 'resolveBaseWorkdir'> | undefined,
): ContextLifecyclePhaseSnapshotDto {
  if (!task) {
    return {
      phase: 'execute',
      status: 'blocked',
      summary: 'Task context is required before execution can be mapped.',
      reference_keys: [],
    };
  }
  if (!taskWorktreeService) {
    return {
      phase: 'execute',
      status: 'not_configured',
      summary: 'Task worktree service is not configured.',
      reference_keys: [],
    };
  }
  const baseWorkdir = taskWorktreeService.resolveBaseWorkdir(task);
  if (!baseWorkdir) {
    return {
      phase: 'execute',
      status: 'blocked',
      summary: 'No project execution surface is available for this task.',
      reference_keys: [],
    };
  }
  return {
    phase: 'execute',
    status: 'ready',
    summary: 'Task execution surface is available.',
    reference_keys: [],
    metadata: {
      base_workdir: baseWorkdir,
    },
  };
}

function buildCapturePhase(
  task: BuildContextLifecycleSnapshotInput['task'],
  captureConfigured: boolean,
): ContextLifecyclePhaseSnapshotDto {
  if (!captureConfigured) {
    return {
      phase: 'capture',
      status: 'not_configured',
      summary: 'Capture service is not configured.',
      reference_keys: [],
    };
  }
  if (!task) {
    return {
      phase: 'capture',
      status: 'blocked',
      summary: 'Task context is required before capture can run.',
      reference_keys: [],
    };
  }
  return {
    phase: 'capture',
    status: 'ready',
    summary: 'Task close recap and capture hooks are configured.',
    reference_keys: [],
  };
}

function buildHarvestPhase(
  projectId: string,
  task: BuildContextLifecycleSnapshotInput['task'],
  lock: ProjectWriteLockRecord | null,
  harvestConfigured: boolean,
): ContextLifecyclePhaseSnapshotDto {
  if (!harvestConfigured) {
    return {
      phase: 'harvest',
      status: 'not_configured',
      summary: 'Project context writer is not configured.',
      reference_keys: [],
    };
  }
  if (!task) {
    return {
      phase: 'harvest',
      status: 'blocked',
      summary: 'Task context is required before harvest can run.',
      reference_keys: [],
    };
  }
  if (lock && lock.project_id === projectId && lock.holder_task_id !== task.id) {
    return {
      phase: 'harvest',
      status: 'blocked',
      summary: `Project context writer is locked by task ${lock.holder_task_id}.`,
      reference_keys: [],
      metadata: {
        lock_holder_task_id: lock.holder_task_id,
      },
    };
  }
  return {
    phase: 'harvest',
    status: 'ready',
    summary: 'Project harvest writer is available.',
    reference_keys: [],
  };
}

function buildEvolvePhase(report: ProjectBrainDoctorReport | null): ContextLifecyclePhaseSnapshotDto {
  if (!report) {
    return {
      phase: 'evolve',
      status: 'not_configured',
      summary: 'Project doctor/reconcile service is not configured.',
      reference_keys: [],
    };
  }
  if (report.drift.detected) {
    return {
      phase: 'evolve',
      status: 'blocked',
      summary: 'Project doctor detected drift that should be reconciled.',
      reference_keys: ['index:index', 'timeline:timeline'],
      metadata: {
        documents_without_jobs: report.drift.documents_without_jobs,
        pending_jobs: report.jobs.pending,
        failed_jobs: report.jobs.failed,
      },
    };
  }
  return {
    phase: 'evolve',
    status: 'ready',
    summary: 'Project reconcile/doctor surfaces are healthy.',
    reference_keys: ['index:index', 'timeline:timeline'],
    metadata: {
      chunk_count: report.vector_index.chunk_count,
    },
  };
}
