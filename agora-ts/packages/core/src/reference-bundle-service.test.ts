import { describe, expect, it } from 'vitest';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import { ProjectBrainAutomationPolicy } from './project-brain-automation-policy.js';
import { ReferenceBundleService } from './reference-bundle-service.js';
import { ReferenceIndexService } from './reference-index-service.js';

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

  it('keeps async bundle generation equivalent to sync generation', async () => {
    const documents = [
      makeDocument({ kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' }),
      makeDocument({ kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' }),
      makeDocument({ kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' }),
      makeDocument({ kind: 'fact', slug: 'core-first', title: 'Core First', path: '/brain/knowledge/facts/core-first.md' }),
    ];
    const fixedDate = new Date('2026-04-09T15:00:00.000Z');
    const clock = () => fixedDate;
    const projectBrainService = { listDocuments: () => documents };
    const service = new ReferenceBundleService({
      projectBrainService,
      policy: new ProjectBrainAutomationPolicy(),
      referenceIndexService: new ReferenceIndexService({ projectBrainService, clock }),
    });

    const asyncBundle = await service.buildReferenceBundleAsync({
      project_id: 'proj-brain',
      mode: 'bootstrap',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });
    const syncBundle = service.buildReferenceBundle({
      project_id: 'proj-brain',
      mode: 'bootstrap',
      audience: 'craftsman',
      task_id: 'OC-200',
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });

    expect(asyncBundle).toEqual(syncBundle);
    expect(asyncBundle.inventory.generated_at).toBe('2026-04-09T15:00:00.000Z');
    expect(asyncBundle.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference_key: 'decision:runtime-boundary' }),
      ]),
    );
  });
});
