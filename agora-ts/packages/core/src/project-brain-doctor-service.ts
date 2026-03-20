import type { ProjectBrainEmbeddingPort } from './project-brain-embedding-port.js';
import type { ProjectBrainIndexQueueService } from './project-brain-index-queue-service.js';
import type { ProjectBrainIndexService } from './project-brain-index-service.js';
import type { ProjectBrainService } from './project-brain-service.js';

export interface ProjectBrainDoctorServiceOptions {
  dbPath: string;
  projectBrainService: Pick<ProjectBrainService, 'listDocuments'>;
  queueService: Pick<ProjectBrainIndexQueueService, 'listJobs'>;
  indexService?: Pick<ProjectBrainIndexService, 'getProjectIndexStatus'>;
  embeddingPort?: ProjectBrainEmbeddingPort;
}

export interface ProjectBrainDoctorReport {
  project_id: string;
  db_path: string;
  embedding: {
    configured: boolean;
    healthy: boolean;
    provider: string;
    model: string | null;
    error?: string;
  };
  vector_index: {
    configured: boolean;
    provider: string;
    healthy: boolean;
    chunk_count?: number;
    warning?: string;
  };
  jobs: {
    pending: number;
    running: number;
    failed: number;
    succeeded: number;
  };
  drift: {
    detected: boolean;
    documents_without_jobs: number;
  };
}

export class ProjectBrainDoctorService {
  constructor(private readonly options: ProjectBrainDoctorServiceOptions) {}

  async diagnoseProject(projectId: string): Promise<ProjectBrainDoctorReport> {
    const documents = this.options.projectBrainService
      .listDocuments(projectId)
      .filter((document) => document.kind !== 'citizen_scaffold');
    const jobs = this.options.queueService.listJobs({ project_id: projectId });
    const jobKeys = new Set(jobs.map((job) => `${job.document_kind}:${job.document_slug}`));
    const documentsWithoutJobs = documents.filter((document) => !jobKeys.has(`${document.kind}:${document.slug}`)).length;

    const embedding = await this.probeEmbedding();
    const vectorIndex = await this.probeVectorIndex(projectId);

    const pending = jobs.filter((job) => job.status === 'pending').length;
    const running = jobs.filter((job) => job.status === 'running').length;
    const failed = jobs.filter((job) => job.status === 'failed').length;
    const succeeded = jobs.filter((job) => job.status === 'succeeded').length;

    return {
      project_id: projectId,
      db_path: this.options.dbPath,
      embedding,
      vector_index: vectorIndex,
      jobs: {
        pending,
        running,
        failed,
        succeeded,
      },
      drift: {
        detected: documentsWithoutJobs > 0 || pending > 0 || failed > 0,
        documents_without_jobs: documentsWithoutJobs,
      },
    };
  }

  private async probeEmbedding() {
    if (!this.options.embeddingPort) {
      return {
        configured: false,
        healthy: false,
        provider: 'not_configured',
        model: null,
      };
    }

    try {
      await this.options.embeddingPort.embedText('agora project brain doctor probe');
      return {
        configured: true,
        healthy: true,
        provider: 'openai-compatible',
        model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
      };
    } catch (error) {
      return {
        configured: true,
        healthy: false,
        provider: 'openai-compatible',
        model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async probeVectorIndex(projectId: string) {
    if (!this.options.indexService) {
      return {
        configured: false,
        provider: 'not_configured',
        healthy: false,
      };
    }
    const status = await this.options.indexService.getProjectIndexStatus(projectId);
    return {
      configured: true,
      provider: status.provider,
      healthy: status.healthy,
      ...(status.chunk_count !== undefined ? { chunk_count: status.chunk_count } : {}),
      ...(status.warning ? { warning: status.warning } : {}),
    };
  }
}
