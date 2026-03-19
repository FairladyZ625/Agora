import { describe, expect, it, vi } from 'vitest';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import { ProjectBrainChunkingPolicy } from './project-brain-chunking-policy.js';
import { ProjectBrainIndexService } from './project-brain-index-service.js';

function makeDocument(overrides: Partial<ProjectBrainDocument> = {}): ProjectBrainDocument {
  return {
    project_id: 'proj-brain',
    kind: 'decision',
    slug: 'runtime-boundary',
    title: 'Runtime Boundary',
    path: '/brain/decision/runtime-boundary.md',
    content: '# Runtime Boundary\n\nKeep runtime-specific logic out of core.',
    created_at: '2026-03-19T00:00:00.000Z',
    updated_at: '2026-03-19T12:00:00.000Z',
    source_task_ids: ['OC-100'],
    ...overrides,
  };
}

describe('project brain index service', () => {
  it('rebuilds all chunks for a project', async () => {
    const projectBrainService = {
      listDocuments: vi.fn().mockReturnValue([
        makeDocument(),
        makeDocument({
          kind: 'fact',
          slug: 'core-first',
          title: 'Core First',
          path: '/brain/fact/core-first.md',
          content: '# Core First\n\nKeep orchestration inside core.',
        }),
      ]),
      getDocument: vi.fn(),
    };
    const embeddingPort = {
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    };
    const vectorIndexPort = {
      upsertChunks: vi.fn().mockResolvedValue(undefined),
      deleteChunksByDocument: vi.fn(),
      getStatus: vi.fn(),
    };
    const service = new ProjectBrainIndexService({
      projectBrainService: projectBrainService as never,
      chunkingPolicy: new ProjectBrainChunkingPolicy(),
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const result = await service.rebuildProjectIndex('proj-brain');

    expect(projectBrainService.listDocuments).toHaveBeenCalledWith('proj-brain');
    expect(embeddingPort.embedBatch).toHaveBeenCalledWith([
      expect.stringContaining('Runtime Boundary Runtime Boundary'),
      expect.stringContaining('Core First Core First'),
    ]);
    expect(vectorIndexPort.upsertChunks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ chunk_id: 'proj-brain:decision:runtime-boundary:0' }),
        expect.objectContaining({ chunk_id: 'proj-brain:fact:core-first:0' }),
      ]),
      [[0.1, 0.2], [0.3, 0.4]],
    );
    expect(result).toEqual({
      project_id: 'proj-brain',
      indexed_documents: 2,
      indexed_chunks: 2,
    });
  });

  it('syncs a single document and allows chunk inspection', async () => {
    const document = makeDocument();
    const projectBrainService = {
      listDocuments: vi.fn(),
      getDocument: vi.fn().mockReturnValue(document),
    };
    const embeddingPort = {
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    };
    const vectorIndexPort = {
      upsertChunks: vi.fn().mockResolvedValue(undefined),
      deleteChunksByDocument: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn(),
    };
    const service = new ProjectBrainIndexService({
      projectBrainService: projectBrainService as never,
      chunkingPolicy: new ProjectBrainChunkingPolicy(),
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const syncResult = await service.syncProjectIndex({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    const inspectResult = await service.inspectDocumentChunks({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });

    expect(vectorIndexPort.deleteChunksByDocument).toHaveBeenCalledWith('proj-brain', 'decision', 'runtime-boundary');
    expect(syncResult).toEqual({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
      indexed_documents: 1,
      indexed_chunks: 1,
    });
    expect(inspectResult.document).toEqual(document);
    expect(inspectResult.chunks).toEqual([
      expect.objectContaining({
        chunk_id: 'proj-brain:decision:runtime-boundary:0',
      }),
    ]);
  });

  it('returns vector index status for a project', async () => {
    const vectorIndexPort = {
      getStatus: vi.fn().mockResolvedValue({
        healthy: true,
        provider: 'qdrant',
        chunk_count: 7,
      }),
    };
    const service = new ProjectBrainIndexService({
      projectBrainService: {} as never,
      chunkingPolicy: new ProjectBrainChunkingPolicy(),
      embeddingPort: {} as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const status = await service.getProjectIndexStatus('proj-brain');

    expect(status).toEqual({
      healthy: true,
      provider: 'qdrant',
      chunk_count: 7,
    });
  });
});
