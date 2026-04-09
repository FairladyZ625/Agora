import { describe, expect, it, vi } from 'vitest';
import type { RetrievalResultDto } from '@agora-ts/contracts';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import { ReferenceBundleService } from './reference-bundle-service.js';

function makeDocument(overrides: Partial<ProjectBrainDocument> = {}): ProjectBrainDocument {
  return {
    project_id: 'proj-brain',
    kind: 'fact',
    slug: 'core-first',
    title: 'Core First',
    path: '/brain/knowledge/facts/core-first.md',
    content: 'Keep orchestration inside core.',
    created_at: '2026-04-09T10:00:00.000Z',
    updated_at: '2026-04-09T12:00:00.000Z',
    source_task_ids: [],
    ...overrides,
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

describe('reference bundle service', () => {
  it('builds a bootstrap bundle with project map and selected references', () => {
    const documents = [
      makeDocument({ kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' }),
      makeDocument({ kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' }),
      makeDocument({ kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' }),
    ];
    const service = new ReferenceBundleService({
      projectBrainService: {
        listDocuments: () => documents,
      },
      policy: new ProjectBrainAutomationPolicy(),
    });

    const bundle = service.buildReferenceBundle({
      project_id: 'proj-brain',
      mode: 'bootstrap',
      audience: 'controller',
    });

    expect(bundle.project_map).toEqual({
      index_reference_key: 'index:index',
      timeline_reference_key: 'timeline:timeline',
      inventory_count: 3,
    });
    expect(bundle.references.map((entry) => entry.reference_key)).toEqual([
      'index:index',
      'timeline:timeline',
      'decision:runtime-boundary',
    ]);
  });

  it('turns retrieval matches into attention anchors and preferred references', async () => {
    const retrievalService = {
      retrieve: vi.fn().mockResolvedValue([
        makeRetrievalResult(),
      ]),
    };
    const documents = [
      makeDocument({ kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' }),
      makeDocument({ kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' }),
      makeDocument({ kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' }),
      makeDocument({ kind: 'fact', slug: 'core-first', title: 'Core First', path: '/brain/knowledge/facts/core-first.md' }),
    ];
    const service = new ReferenceBundleService({
      projectBrainService: {
        listDocuments: () => documents,
      },
      policy: new ProjectBrainAutomationPolicy(),
      retrievalService,
    });

    const bundle = await service.buildReferenceBundleAsync({
      project_id: 'proj-brain',
      mode: 'bootstrap',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
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
    expect(bundle.attention_anchors).toEqual([
      expect.objectContaining({
        reference_key: 'decision:runtime-boundary',
        reason: 'Matched current task query in project brain.',
      }),
    ]);
    expect(bundle.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference_key: 'decision:runtime-boundary' }),
      ]),
    );
  });
});
