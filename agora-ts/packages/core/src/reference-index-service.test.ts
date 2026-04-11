import { describe, expect, it } from 'vitest';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
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

describe('reference index service', () => {
  it('builds a stable project inventory from project brain docs', () => {
    const service = new ReferenceIndexService({
      projectBrainService: {
        listDocuments: () => [
          makeDocument({ kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' }),
          makeDocument({ kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' }),
          makeDocument({ kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' }),
        ],
      },
      clock: () => new Date('2026-04-09T15:00:00.000Z'),
    });

    const inventory = service.buildProjectInventory('proj-brain');

    expect(inventory).toEqual(expect.objectContaining({
      scope: 'project_brain',
      project_id: 'proj-brain',
      generated_at: '2026-04-09T15:00:00.000Z',
    }));
    expect(inventory.entries.map((entry) => entry.reference_key)).toEqual([
      'index:index',
      'timeline:timeline',
      'decision:runtime-boundary',
    ]);
  });
});
