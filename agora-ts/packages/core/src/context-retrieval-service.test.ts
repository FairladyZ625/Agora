import { describe, expect, it, vi } from 'vitest';
import type { RetrievalPlanDto, RetrievalResultDto } from '@agora-ts/contracts';
import type { RetrievalPort } from './context-retrieval-port.js';
import { RetrievalRegistry } from './context-retrieval-registry.js';
import { RetrievalService } from './context-retrieval-service.js';

function makePlan(overrides: Partial<RetrievalPlanDto> = {}): RetrievalPlanDto {
  return {
    scope: 'project_brain',
    mode: 'task_context',
    query: { text: 'runtime boundary' },
    limit: 5,
    context: {
      task_id: 'OC-200',
      audience: 'controller',
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<RetrievalResultDto> = {}): RetrievalResultDto {
  return {
    scope: 'project_brain',
    provider: 'project_brain',
    reference_key: 'decision:runtime-boundary',
    project_id: 'proj-brain',
    title: 'Runtime Boundary',
    path: '/brain/decision/runtime-boundary.md',
    preview: 'Keep runtime-specific logic out of core.',
    score: 1,
    ...overrides,
  };
}

describe('retrieval service', () => {
  it('routes retrieval through registered ports without provider switch logic', async () => {
    const matchingPort: RetrievalPort = {
      provider: 'project_brain',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ reference_key: 'decision:runtime-boundary', score: 3 }),
      ]),
    };
    const ignoredPort: RetrievalPort = {
      provider: 'obsidian',
      supports: vi.fn().mockReturnValue(false),
      retrieve: vi.fn().mockResolvedValue([]),
    };

    const service = new RetrievalService({
      registry: new RetrievalRegistry([matchingPort, ignoredPort]),
    });

    const results = await service.retrieve(makePlan());

    expect(matchingPort.supports).toHaveBeenCalled();
    expect(matchingPort.retrieve).toHaveBeenCalledWith(makePlan());
    expect(ignoredPort.retrieve).not.toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({ provider: 'project_brain' }),
    ]);
  });

  it('aggregates and ranks provider results by score', async () => {
    const projectBrainPort: RetrievalPort = {
      provider: 'project_brain',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ provider: 'project_brain', reference_key: 'decision:a', score: 2.1 }),
      ]),
    };
    const docsRepoPort: RetrievalPort = {
      provider: 'docs_repo',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ provider: 'docs_repo', reference_key: 'reference:b', score: 4.2 }),
        makeResult({ provider: 'docs_repo', reference_key: 'reference:c', score: 1.4 }),
      ]),
    };
    const service = new RetrievalService({
      registry: new RetrievalRegistry([projectBrainPort, docsRepoPort]),
    });

    const results = await service.retrieve(makePlan({ limit: 2 }));

    expect(results.map((result) => result.reference_key)).toEqual([
      'reference:b',
      'decision:a',
    ]);
  });

  it('reports provider health through the registry', async () => {
    const port: RetrievalPort = {
      provider: 'project_brain',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([]),
      checkHealth: vi.fn().mockResolvedValue({
        scope: 'project_brain',
        provider: 'project_brain',
        status: 'ready',
        message: 'ok',
      }),
    };
    const service = new RetrievalService({
      registry: new RetrievalRegistry([port]),
    });

    const health = await service.checkHealth(makePlan());

    expect(health).toEqual([
      expect.objectContaining({
        provider: 'project_brain',
        status: 'ready',
      }),
    ]);
  });

  it('filters retrieval to explicitly requested providers', async () => {
    const projectBrainPort: RetrievalPort = {
      provider: 'project_brain',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ provider: 'project_brain', reference_key: 'decision:a', score: 3 }),
      ]),
    };
    const filesystemPort: RetrievalPort = {
      provider: 'filesystem_context_source',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ provider: 'filesystem_context_source', reference_key: 'context_source:b', score: 4 }),
      ]),
    };
    const service = new RetrievalService({
      registry: new RetrievalRegistry([projectBrainPort, filesystemPort]),
    });

    const results = await service.retrieve(makePlan({
      scope: 'project_context',
      mode: 'lookup',
      context: {
        project_id: 'proj-brain',
      },
      metadata: {
        providers: ['project_brain'],
      },
    }));

    expect(projectBrainPort.retrieve).toHaveBeenCalled();
    expect(filesystemPort.retrieve).not.toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({
        provider: 'project_brain',
      }),
    ]);
  });

  it('filters aggregated results to explicitly requested source ids', async () => {
    const projectBrainPort: RetrievalPort = {
      provider: 'project_brain',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({ provider: 'project_brain', reference_key: 'decision:a', score: 5 }),
      ]),
    };
    const filesystemPort: RetrievalPort = {
      provider: 'filesystem_context_source',
      supports: vi.fn().mockReturnValue(true),
      retrieve: vi.fn().mockResolvedValue([
        makeResult({
          provider: 'filesystem_context_source',
          reference_key: 'context_source:docs-main:guide',
          score: 2,
          metadata: {
            source_id: 'docs-main',
          },
        }),
      ]),
    };
    const service = new RetrievalService({
      registry: new RetrievalRegistry([projectBrainPort, filesystemPort]),
    });

    const results = await service.retrieve(makePlan({
      scope: 'project_context',
      mode: 'lookup',
      context: {
        project_id: 'proj-brain',
      },
      metadata: {
        source_ids: ['docs-main'],
      },
    }));

    expect(projectBrainPort.retrieve).toHaveBeenCalled();
    expect(filesystemPort.retrieve).toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({
        provider: 'filesystem_context_source',
        metadata: expect.objectContaining({
          source_id: 'docs-main',
        }),
      }),
    ]);
  });
});
