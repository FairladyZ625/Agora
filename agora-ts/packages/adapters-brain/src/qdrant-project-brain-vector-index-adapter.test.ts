import { describe, expect, it, vi } from 'vitest';
import type { ProjectBrainChunk } from '@agora-ts/core';
import { QdrantProjectBrainVectorIndexAdapter } from './qdrant-project-brain-vector-index-adapter.js';

function makeClient() {
  return {
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    createCollection: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue({ count: 0 }),
  };
}

function makeChunk(overrides: Partial<ProjectBrainChunk> = {}): ProjectBrainChunk {
  return {
    chunk_id: 'proj-brain:decision:runtime-boundary:0',
    project_id: 'proj-brain',
    document_kind: 'decision',
    document_slug: 'runtime-boundary',
    source_path: '/brain/decision/runtime-boundary.md',
    title: 'Runtime Boundary',
    heading_path: ['Runtime Boundary', 'Decision'],
    ordinal: 0,
    text: 'Keep runtime-specific logic out of core.',
    search_text: 'Runtime Boundary Runtime Boundary /brain/decision/runtime-boundary.md decision runtime-boundary Decision Decision Keep runtime-specific logic out of core.',
    updated_at: '2026-03-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('qdrant project brain vector index adapter', () => {
  it('creates the collection on first use and upserts chunks', async () => {
    const client = makeClient();
    const adapter = new QdrantProjectBrainVectorIndexAdapter({
      client,
      collectionName: 'project_brain_chunks',
      vectorSize: 3,
    });

    await adapter.upsertChunks([
      makeChunk(),
    ], [
      [0.1, 0.2, 0.3],
    ]);

    expect(client.createCollection).toHaveBeenCalledWith('project_brain_chunks', {
      vectors: {
        size: 3,
        distance: 'Cosine',
      },
    });
    expect(client.upsert).toHaveBeenCalledWith('project_brain_chunks', {
      wait: true,
      points: [
        expect.objectContaining({
          id: 'b8c26b4d-8ec7-93fe-d099-81e5567af71e',
          vector: [0.1, 0.2, 0.3],
          payload: expect.objectContaining({
            chunk_id: 'proj-brain:decision:runtime-boundary:0',
            project_id: 'proj-brain',
            document_kind: 'decision',
            document_slug: 'runtime-boundary',
          }),
        }),
      ],
    });
  });

  it('deletes chunks by document scope', async () => {
    const client = makeClient();
    client.getCollections.mockResolvedValue({ collections: [{ name: 'project_brain_chunks' }] });
    const adapter = new QdrantProjectBrainVectorIndexAdapter({
      client,
      collectionName: 'project_brain_chunks',
      vectorSize: 3,
    });

    await adapter.deleteChunksByDocument('proj-brain', 'decision', 'runtime-boundary');

    expect(client.delete).toHaveBeenCalledWith('project_brain_chunks', {
      wait: true,
      filter: {
        must: [
          { key: 'project_id', match: { value: 'proj-brain' } },
          { key: 'document_kind', match: { value: 'decision' } },
          { key: 'document_slug', match: { value: 'runtime-boundary' } },
        ],
      },
    });
  });

  it('searches similar chunks and reports index status', async () => {
    const client = makeClient();
    client.getCollections.mockResolvedValue({ collections: [{ name: 'project_brain_chunks' }] });
    client.search.mockResolvedValue([
        {
          id: 'proj-brain:decision:runtime-boundary:0',
          score: 0.92,
          payload: makeChunk(),
        },
      ]);
    client.count.mockResolvedValue({ count: 7 });
    const adapter = new QdrantProjectBrainVectorIndexAdapter({
      client,
      collectionName: 'project_brain_chunks',
      vectorSize: 3,
    });

    const results = await adapter.querySimilarChunks({
      project_id: 'proj-brain',
      query_embedding: [0.9, 0.8, 0.7],
      limit: 5,
    });
    const status = await adapter.getStatus('proj-brain');

    expect(client.search).toHaveBeenCalledWith('project_brain_chunks', {
      vector: [0.9, 0.8, 0.7],
      limit: 5,
      with_payload: true,
      filter: {
        must: [
          { key: 'project_id', match: { value: 'proj-brain' } },
        ],
      },
    });
    expect(results).toEqual([
      {
        chunk: makeChunk(),
        score: 0.92,
      },
    ]);
    expect(status).toEqual({
      healthy: true,
      provider: 'qdrant',
      chunk_count: 7,
    });
  });
});
