import { describe, expect, it, vi } from 'vitest';
import type { RetrievalPlanDto } from '@agora-ts/contracts';
import type { StoredTask } from '@agora-ts/db';
import type { ProjectBrainChunk } from './project-brain-chunk.js';
import type { ProjectBrainSearchResult } from './project-brain-query-port.js';
import { ProjectBrainRetrievalService } from './project-brain-retrieval-service.js';

function makeTask(overrides: Partial<StoredTask> = {}): StoredTask {
  return {
    id: 'OC-200',
    version: 1,
    title: 'Implement hybrid retrieval',
    description: 'Need vector recall and lexical rerank.',
    type: 'coding',
    priority: 'high',
    creator: 'archon',
    locale: 'zh-CN',
    project_id: 'proj-brain',
    skill_policy: null,
    state: 'active',
    archive_status: null,
    current_stage: 'implement',
    team: {
      members: [],
    },
    workflow: { stages: [] },
    control: { mode: 'normal' },
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-19T00:00:00.000Z',
    updated_at: '2026-03-19T12:00:00.000Z',
    ...overrides,
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

function makeFallbackResult(overrides: Partial<ProjectBrainSearchResult> = {}): ProjectBrainSearchResult {
  return {
    project_id: 'proj-brain',
    kind: 'decision',
    slug: 'runtime-boundary',
    title: 'Runtime Boundary',
    path: '/brain/decision/runtime-boundary.md',
    snippet: 'Keep runtime-specific logic out of core.',
    ...overrides,
  };
}

describe('project brain retrieval service', () => {
  it('retrieves task-aware results from vector chunks', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask()),
    };
    const embeddingPort = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    const vectorIndexPort = {
      querySimilarChunks: vi.fn().mockResolvedValue([
        {
          chunk: makeChunk(),
          score: 0.91,
        },
      ]),
    };
    const projectBrainService = {
      queryDocuments: vi.fn(),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: projectBrainService as never,
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const results = await service.searchTaskContext({
      task_id: 'OC-200',
      audience: 'controller',
      query: 'runtime boundary',
      max_results: 5,
    });

    expect(embeddingPort.embedText).toHaveBeenCalledWith('runtime boundary');
    expect(results).toEqual([
      expect.objectContaining({
        kind: 'decision',
        slug: 'runtime-boundary',
        retrieval_mode: 'hybrid',
      }),
    ]);
  });

  it('blocks unbound citizen scaffold results for craftsman audience', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask()),
    };
    const embeddingPort = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    const vectorIndexPort = {
      querySimilarChunks: vi.fn().mockResolvedValue([
        {
          chunk: makeChunk({
            chunk_id: 'proj-brain:citizen_scaffold:citizen-alpha:0',
            document_kind: 'citizen_scaffold',
            document_slug: 'citizen-alpha',
            title: 'Alpha Architect',
            source_path: '/brain/citizens/citizen-alpha.md',
          }),
          score: 0.95,
        },
      ]),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: { queryDocuments: vi.fn() } as never,
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const results = await service.searchTaskContext({
      task_id: 'OC-200',
      audience: 'craftsman',
      query: 'alpha architect',
      max_results: 5,
    });

    expect(results).toEqual([]);
  });

  it('allows bound citizen scaffold results for craftsman audience', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask({
        team: {
          members: [
            { role: 'architect', agentId: 'citizen-alpha', member_kind: 'citizen', model_preference: '' },
          ],
        },
      })),
    };
    const embeddingPort = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    const vectorIndexPort = {
      querySimilarChunks: vi.fn().mockResolvedValue([
        {
          chunk: makeChunk({
            chunk_id: 'proj-brain:citizen_scaffold:citizen-alpha:0',
            document_kind: 'citizen_scaffold',
            document_slug: 'citizen-alpha',
            title: 'Alpha Architect',
            source_path: '/brain/citizens/citizen-alpha.md',
          }),
          score: 0.95,
        },
      ]),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: { queryDocuments: vi.fn() } as never,
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const results = await service.searchTaskContext({
      task_id: 'OC-200',
      audience: 'craftsman',
      query: 'alpha architect',
      max_results: 5,
    });

    expect(results).toEqual([
      expect.objectContaining({
        kind: 'citizen_scaffold',
        slug: 'citizen-alpha',
        retrieval_mode: 'hybrid',
      }),
    ]);
  });

  it('reranks vector candidates with lexical signals', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask()),
    };
    const embeddingPort = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    const vectorIndexPort = {
      querySimilarChunks: vi.fn().mockResolvedValue([
        {
          chunk: makeChunk({
            chunk_id: 'proj-brain:fact:core-first:0',
            document_kind: 'fact',
            document_slug: 'core-first',
            title: 'Core First',
            source_path: '/brain/fact/core-first.md',
            text: 'Keep orchestration inside core.',
            search_text: 'Core First Core First /brain/fact/core-first.md fact core-first Keep orchestration inside core.',
          }),
          score: 0.91,
        },
        {
          chunk: makeChunk(),
          score: 0.9,
        },
      ]),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: { queryDocuments: vi.fn() } as never,
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const results = await service.searchTaskContext({
      task_id: 'OC-200',
      audience: 'controller',
      query: 'runtime',
      max_results: 5,
    });

    expect(results[0]).toEqual(expect.objectContaining({
      slug: 'runtime-boundary',
    }));
  });

  it('falls back to raw query when vector retrieval is unavailable', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask()),
    };
    const projectBrainService = {
      queryDocuments: vi.fn().mockReturnValue([
        makeFallbackResult(),
      ]),
    };
    const embeddingPort = {
      embedText: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    };
    const vectorIndexPort = {
      querySimilarChunks: vi.fn(),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: projectBrainService as never,
      embeddingPort: embeddingPort as never,
      vectorIndexPort: vectorIndexPort as never,
    });

    const results = await service.searchTaskContext({
      task_id: 'OC-200',
      audience: 'controller',
      query: 'runtime',
      max_results: 5,
    });

    expect(projectBrainService.queryDocuments).toHaveBeenCalledWith('proj-brain', 'runtime');
    expect(results).toEqual([
      expect.objectContaining({
        slug: 'runtime-boundary',
        retrieval_mode: 'raw_fallback',
      }),
    ]);
  });

  it('implements the generic retrieval port contract for task context retrieval', async () => {
    const taskLookup = {
      getTask: vi.fn().mockReturnValue(makeTask()),
    };
    const service = new ProjectBrainRetrievalService({
      taskLookup: taskLookup as never,
      projectBrainService: {
        queryDocuments: vi.fn().mockReturnValue([
          makeFallbackResult(),
        ]),
      } as never,
      embeddingPort: {
        embedText: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      } as never,
      vectorIndexPort: {
        querySimilarChunks: vi.fn(),
      } as never,
    });
    const plan: RetrievalPlanDto = {
      scope: 'project_brain',
      mode: 'task_context',
      query: { text: 'runtime' },
      limit: 5,
      context: {
        task_id: 'OC-200',
        audience: 'controller',
      },
    };

    const results = await service.retrieve(plan);

    expect(service.supports(plan)).toBe(true);
    expect(results).toEqual([
      expect.objectContaining({
        provider: 'project_brain',
        scope: 'project_brain',
        reference_key: 'decision:runtime-boundary',
        preview: 'Keep runtime-specific logic out of core.',
      }),
    ]);
  });

  it('supports project_context lookup for project-scoped lexical retrieval', async () => {
    const service = new ProjectBrainRetrievalService({
      taskLookup: {
        getTask: () => null,
      } as never,
      projectBrainService: {
        queryDocuments: () => [
          makeFallbackResult(),
        ],
      } as never,
      embeddingPort: undefined as never,
      vectorIndexPort: undefined as never,
    });

    const results = await service.retrieve({
      scope: 'project_context',
      mode: 'lookup',
      query: {
        text: 'runtime boundary',
      },
      context: {
        project_id: 'proj-brain',
      },
      limit: 5,
    });

    expect(service.supports({
      scope: 'project_context',
      mode: 'lookup',
      query: {
        text: 'runtime boundary',
      },
      context: {
        project_id: 'proj-brain',
      },
    })).toBe(true);
    expect(results).toEqual([
      expect.objectContaining({
        scope: 'project_context',
        provider: 'project_brain',
        project_id: 'proj-brain',
        reference_key: 'decision:runtime-boundary',
      }),
    ]);
  });
});
