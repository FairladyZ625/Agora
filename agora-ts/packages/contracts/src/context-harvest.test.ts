import { describe, expect, it } from 'vitest';
import { contextHarvestProposalSchema, contextReconcileReportSchema } from './context-harvest.js';

describe('context harvest contracts', () => {
  it('accepts a harvest proposal summary', () => {
    const parsed = contextHarvestProposalSchema.parse({
      project_id: 'proj-brain',
      task_id: 'OC-200',
      lock_holder_task_id: 'OC-200',
      canonical_root: '/Users/example/.agora/projects/proj-brain',
      candidates: [
        {
          kind: 'task_close_recap',
          label: 'Task Close Recap',
          path: '/tasks/OC-200/07-outputs/task-close-recap.md',
          summary: 'Close recap will be written back into task workspace.',
        },
      ],
    });

    expect(parsed.candidates[0]?.kind).toBe('task_close_recap');
  });

  it('accepts a reconcile report', () => {
    const parsed = contextReconcileReportSchema.parse({
      project_id: 'proj-brain',
      status: 'drift_detected',
      summary: 'Project doctor detected pending reconcile work.',
      pending_jobs: 2,
      failed_jobs: 1,
      documents_without_jobs: 3,
    });

    expect(parsed.status).toBe('drift_detected');
  });
});
