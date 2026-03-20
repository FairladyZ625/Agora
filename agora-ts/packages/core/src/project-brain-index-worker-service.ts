import type { ProjectBrainIndexQueueService } from './project-brain-index-queue-service.js';
import type { ProjectBrainIndexService } from './project-brain-index-service.js';

export interface DrainProjectBrainIndexJobsResult {
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
}

export interface ProjectBrainIndexWorkerServiceOptions {
  queueService: Pick<ProjectBrainIndexQueueService, 'claimNextPending' | 'markSucceeded' | 'markFailed' | 'listJobs'>;
  indexService: Pick<ProjectBrainIndexService, 'syncProjectIndex'>;
}

export class ProjectBrainIndexWorkerService {
  constructor(private readonly options: ProjectBrainIndexWorkerServiceOptions) {}

  async drainPendingJobs(input: { limit?: number } = {}): Promise<DrainProjectBrainIndexJobsResult> {
    const limit = input.limit ?? 25;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    while (processed < limit) {
      const job = this.options.queueService.claimNextPending();
      if (!job) {
        break;
      }
      processed += 1;
      try {
        await this.options.indexService.syncProjectIndex({
          project_id: job.project_id,
          kind: job.document_kind as never,
          slug: job.document_slug,
        });
        this.options.queueService.markSucceeded(job.id);
        succeeded += 1;
      } catch (error) {
        this.options.queueService.markFailed(job.id, error instanceof Error ? error.message : String(error));
        failed += 1;
      }
    }

    return {
      processed,
      succeeded,
      failed,
      pending: this.options.queueService.listJobs({ status: 'pending' }).length,
    };
  }
}
