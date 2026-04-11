import type { ContextHarvestProposalDto, ContextReconcileReportDto } from '@agora-ts/contracts';
import type { TaskRecord } from '@agora-ts/contracts';
import type { ProjectBrainDoctorService } from './project-brain-doctor-service.js';
import type { ProjectContextWriter } from './project-context-writer.js';
import type { TaskBrainWorkspaceBindingRef } from './task-brain-port.js';

export interface ContextHarvestServiceOptions {
  projectContextWriter: Pick<ProjectContextWriter, 'buildTaskCloseoutProposal'>;
  projectBrainDoctorService?: Pick<ProjectBrainDoctorService, 'diagnoseProject'>;
}

export class ContextHarvestService {
  constructor(private readonly options: ContextHarvestServiceOptions) {}

  buildHarvestProposal(input: {
    task: TaskRecord;
    binding: TaskBrainWorkspaceBindingRef;
    actor: string;
    reason?: string;
  }): ContextHarvestProposalDto {
    const proposal = this.options.projectContextWriter.buildTaskCloseoutProposal(input);
    return {
      project_id: proposal.project_id,
      task_id: proposal.task_id,
      lock_holder_task_id: proposal.lock_holder_task_id,
      canonical_root: proposal.canonical_root,
      candidates: [
        {
          kind: 'task_close_recap',
          label: 'Task Close Recap',
          path: proposal.close_recap.binding.workspace_path ? `${proposal.close_recap.binding.workspace_path}/07-outputs/task-close-recap.md` : null,
          summary: 'Close recap will be written back into the task workspace.',
        },
        {
          kind: 'task_harvest_draft',
          label: 'Task Harvest Draft',
          path: proposal.harvest_draft.binding.workspace_path ? `${proposal.harvest_draft.binding.workspace_path}/07-outputs/project-harvest-draft.md` : null,
          summary: 'Harvest draft will be prepared before project writeback.',
        },
        {
          kind: 'project_recap',
          label: 'Project Recap Writeback',
          path: proposal.project_recap.workspace_path,
          summary: 'Project recap will be recorded into canonical project context.',
          metadata: {
            completed_by: proposal.project_recap.completed_by,
            completed_at: proposal.project_recap.completed_at,
          },
        },
      ],
    };
  }

  async buildReconcileReport(projectId: string): Promise<ContextReconcileReportDto> {
    if (!this.options.projectBrainDoctorService) {
      return {
        project_id: projectId,
        status: 'not_configured',
        summary: 'Project doctor/reconcile service is not configured.',
        pending_jobs: 0,
        failed_jobs: 0,
        documents_without_jobs: 0,
      };
    }
    const report = await this.options.projectBrainDoctorService.diagnoseProject(projectId);
    if (report.drift.detected) {
      return {
        project_id: projectId,
        status: 'drift_detected',
        summary: 'Project doctor detected pending reconcile work.',
        pending_jobs: report.jobs.pending,
        failed_jobs: report.jobs.failed,
        documents_without_jobs: report.drift.documents_without_jobs,
        metadata: {
          vector_index_healthy: report.vector_index.healthy,
          embedding_healthy: report.embedding.healthy,
        },
      };
    }
    return {
      project_id: projectId,
      status: 'healthy',
      summary: 'Project reconcile surfaces are healthy.',
      pending_jobs: report.jobs.pending,
      failed_jobs: report.jobs.failed,
      documents_without_jobs: report.drift.documents_without_jobs,
      metadata: {
        vector_index_healthy: report.vector_index.healthy,
        embedding_healthy: report.embedding.healthy,
      },
    };
  }
}
