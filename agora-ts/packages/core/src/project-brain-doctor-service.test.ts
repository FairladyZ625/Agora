import { describe, expect, it, vi } from 'vitest';
import { ProjectBrainDoctorService } from './project-brain-doctor-service.js';

describe('ProjectBrainDoctorService', () => {
  it('reports healthy embedding/vector state and queue counts', async () => {
    const service = new ProjectBrainDoctorService({
      dbPath: '/Users/lizeyu/.agora/agora.db',
      projectBrainService: {
        listDocuments: () => [
          { kind: 'index', slug: 'index' },
          { kind: 'decision', slug: 'runtime-boundary' },
          { kind: 'citizen_scaffold', slug: 'citizen-alpha' },
        ] as never,
      },
      queueService: {
        listJobs: () => [
          { status: 'succeeded', document_kind: 'index', document_slug: 'index' },
          { status: 'pending', document_kind: 'decision', document_slug: 'runtime-boundary' },
        ] as never,
      },
      indexService: {
        getProjectIndexStatus: vi.fn().mockResolvedValue({
          provider: 'qdrant',
          healthy: true,
          chunk_count: 5,
        }),
      },
      embeddingPort: {
        embedText: vi.fn().mockResolvedValue([0.1, 0.2]),
        embedBatch: vi.fn(),
      },
    });

    await expect(service.diagnoseProject('proj-brain')).resolves.toMatchObject({
      project_id: 'proj-brain',
      db_path: '/Users/lizeyu/.agora/agora.db',
      embedding: {
        configured: true,
        healthy: true,
      },
      vector_index: {
        configured: true,
        provider: 'qdrant',
        healthy: true,
        chunk_count: 5,
      },
      jobs: {
        pending: 1,
        running: 0,
        failed: 0,
        succeeded: 1,
      },
      drift: {
        detected: true,
        documents_without_jobs: 0,
      },
    });
  });

  it('reports missing configuration and documents without jobs', async () => {
    const service = new ProjectBrainDoctorService({
      dbPath: '/Users/lizeyu/.agora/agora.db',
      projectBrainService: {
        listDocuments: () => [
          { kind: 'index', slug: 'index' },
          { kind: 'decision', slug: 'runtime-boundary' },
        ] as never,
      },
      queueService: {
        listJobs: () => [],
      },
    });

    await expect(service.diagnoseProject('proj-brain')).resolves.toMatchObject({
      embedding: {
        configured: false,
        healthy: false,
      },
      vector_index: {
        configured: false,
        healthy: false,
      },
      drift: {
        detected: true,
        documents_without_jobs: 2,
      },
    });
  });
});
