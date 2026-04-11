import { describe, expect, it } from 'vitest';
import {
  contextInventorySchema,
  referenceBundleSchema,
} from './context-reference.js';

describe('context reference contracts', () => {
  it('accepts a project reference inventory', () => {
    const parsed = contextInventorySchema.parse({
      scope: 'project_brain',
      project_id: 'proj-brain',
      generated_at: '2026-04-09T15:00:00.000Z',
      entries: [
        {
          scope: 'project_brain',
          reference_key: 'index:index',
          project_id: 'proj-brain',
          kind: 'index',
          slug: 'index',
          title: 'Project Index',
          path: '/brain/index.md',
          updated_at: '2026-04-09T15:00:00.000Z',
          recommended: true,
        },
      ],
    });

    expect(parsed.entries[0]?.reference_key).toBe('index:index');
  });

  it('accepts a reference bundle with project map and curated references', () => {
    const parsed = referenceBundleSchema.parse({
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
        generated_at: '2026-04-09T15:00:00.000Z',
        entries: [],
      },
      references: [
        {
          scope: 'project_brain',
          reference_key: 'decision:runtime-boundary',
          project_id: 'proj-brain',
          kind: 'decision',
          slug: 'runtime-boundary',
          title: 'Runtime Boundary',
          path: '/brain/decision/runtime-boundary.md',
        },
      ],
    });

    expect(parsed.references[0]?.reference_key).toBe('decision:runtime-boundary');
  });
});
