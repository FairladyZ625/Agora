import { describe, expect, it, vi } from 'vitest';
import type { ReferenceBundleDto, RetrievalResultDto } from '@agora-ts/contracts';
import { AttentionRoutingService } from './attention-routing-service.js';

function makeReferenceBundle(): ReferenceBundleDto {
  return {
    scope: 'project_brain',
    mode: 'bootstrap',
    project_id: 'proj-brain',
    task_id: 'OC-200',
    project_map: {
      index_reference_key: 'index:index',
      timeline_reference_key: 'timeline:timeline',
      inventory_count: 4,
    },
    inventory: {
      scope: 'project_brain',
      project_id: 'proj-brain',
      generated_at: '2026-04-10T09:00:00.000Z',
      entries: [
        { scope: 'project_brain', reference_key: 'index:index', project_id: 'proj-brain', kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' },
        { scope: 'project_brain', reference_key: 'timeline:timeline', project_id: 'proj-brain', kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' },
        { scope: 'project_brain', reference_key: 'decision:runtime-boundary', project_id: 'proj-brain', kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' },
        { scope: 'project_brain', reference_key: 'fact:core-first', project_id: 'proj-brain', kind: 'fact', slug: 'core-first', title: 'Core First', path: '/brain/knowledge/facts/core-first.md' },
      ],
    },
    references: [
      { scope: 'project_brain', reference_key: 'index:index', project_id: 'proj-brain', kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' },
      { scope: 'project_brain', reference_key: 'decision:runtime-boundary', project_id: 'proj-brain', kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' },
      { scope: 'project_brain', reference_key: 'fact:core-first', project_id: 'proj-brain', kind: 'fact', slug: 'core-first', title: 'Core First', path: '/brain/knowledge/facts/core-first.md' },
    ],
  };
}

function makeRetrievalResult(overrides: Partial<RetrievalResultDto> = {}): RetrievalResultDto {
  return {
    scope: 'project_brain',
    provider: 'project_brain',
    reference_key: 'decision:runtime-boundary#chunk-1',
    project_id: 'proj-brain',
    title: 'Runtime Boundary',
    path: '/brain/decision/runtime-boundary.md',
    preview: 'Keep runtime-specific logic out of core.',
    score: 4.2,
    metadata: {
      kind: 'decision',
      slug: 'runtime-boundary',
      document_key: 'decision:runtime-boundary',
    },
    ...overrides,
  };
}

describe('attention routing service', () => {
  it('builds a routing plan that starts with the project map and then task-matched references', async () => {
    const retrievalService = {
      retrieve: vi.fn().mockResolvedValue([makeRetrievalResult()]),
    };
    const service = new AttentionRoutingService({ retrievalService });

    const plan = await service.buildPlanAsync({
      project_id: 'proj-brain',
      mode: 'bootstrap',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
      reference_bundle: makeReferenceBundle(),
    });

    expect(retrievalService.retrieve).toHaveBeenCalledWith({
      scope: 'project_brain',
      mode: 'task_context',
      query: {
        text: 'Implement hybrid retrieval\n\nNeed vector recall and lexical rerank.',
      },
      limit: 6,
      context: {
        task_id: 'OC-200',
        project_id: 'proj-brain',
        audience: 'craftsman',
      },
    });
    expect(plan.summary).toContain('project map');
    expect(plan.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference_key: 'index:index', kind: 'project_map', ordinal: 1 }),
        expect.objectContaining({ reference_key: 'timeline:timeline', kind: 'project_map', ordinal: 2 }),
        expect.objectContaining({ reference_key: 'decision:runtime-boundary', kind: 'focus', ordinal: 3 }),
        expect.objectContaining({ reference_key: 'fact:core-first', kind: 'supporting' }),
      ]),
    );
  });

  it('falls back to curated references when no task-aware retrieval query is available', () => {
    const retrievalService = {
      retrieve: vi.fn(),
    };
    const service = new AttentionRoutingService({ retrievalService });

    const plan = service.buildPlan({
      project_id: 'proj-brain',
      mode: 'disclose',
      audience: 'controller',
      reference_bundle: makeReferenceBundle(),
    });

    expect(retrievalService.retrieve).not.toHaveBeenCalled();
    expect(plan.routes.map((route) => route.reference_key)).toEqual([
      'index:index',
      'timeline:timeline',
      'decision:runtime-boundary',
      'fact:core-first',
    ]);
    expect(plan.routes[2]?.kind).toBe('supporting');
  });
});
