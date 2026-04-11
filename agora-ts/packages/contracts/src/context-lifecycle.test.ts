import { describe, expect, it } from 'vitest';
import { contextLifecycleSnapshotSchema } from './context-lifecycle.js';

describe('context lifecycle contracts', () => {
  it('accepts a six-phase lifecycle snapshot', () => {
    const snapshot = contextLifecycleSnapshotSchema.parse({
      project_id: 'proj-brain',
      task_id: 'OC-200',
      generated_at: '2026-04-09T16:00:00.000Z',
      phases: [
        { phase: 'bootstrap', status: 'ready', summary: 'Project bootstrap is configured.', reference_keys: [] },
        { phase: 'disclose', status: 'ready', summary: 'Reference bundle is available.', reference_keys: ['index:index'] },
        { phase: 'execute', status: 'ready', summary: 'Task execution surface is available.', reference_keys: [] },
        { phase: 'capture', status: 'ready', summary: 'Capture hooks are configured.', reference_keys: [] },
        { phase: 'harvest', status: 'ready', summary: 'Harvest writer is configured.', reference_keys: [] },
        { phase: 'evolve', status: 'blocked', summary: 'Doctor detected drift.', reference_keys: ['index:index'] },
      ],
    });

    expect(snapshot.phases).toHaveLength(6);
    expect(snapshot.phases[1]?.phase).toBe('disclose');
  });
});
