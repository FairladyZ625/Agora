import { ProjectBrainIndexJobRepository, type AgoraDatabase, type ProjectBrainIndexJobStatus, type StoredProjectBrainIndexJob } from '@agora-ts/db';
import type { ProjectBrainDocumentKind } from './project-brain-query-port.js';

export type ProjectBrainIndexQueueReason =
  | 'knowledge_upsert'
  | 'brain_append'
  | 'task_binding'
  | 'task_recap';

export interface EnqueueProjectBrainIndexJobInput {
  project_id: string;
  document_kind: Exclude<ProjectBrainDocumentKind, 'citizen_scaffold'>;
  document_slug: string;
  reason: ProjectBrainIndexQueueReason;
}

export class ProjectBrainIndexQueueService {
  private readonly jobs: ProjectBrainIndexJobRepository;

  constructor(db: AgoraDatabase) {
    this.jobs = new ProjectBrainIndexJobRepository(db);
  }

  enqueueDocumentSync(input: EnqueueProjectBrainIndexJobInput): StoredProjectBrainIndexJob {
    return this.jobs.enqueue(input);
  }

  listJobs(filters: { project_id?: string; status?: ProjectBrainIndexJobStatus } = {}) {
    return this.jobs.listJobs(filters);
  }

  claimNextPending() {
    return this.jobs.claimNextPending();
  }

  markSucceeded(jobId: number) {
    return this.jobs.markSucceeded(jobId);
  }

  markFailed(jobId: number, error: string) {
    return this.jobs.markFailed(jobId, error);
  }
}
