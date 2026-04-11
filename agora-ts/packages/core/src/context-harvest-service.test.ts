import { describe, expect, it, vi } from 'vitest';
import type { StoredTask } from '@agora-ts/db';
import { ContextHarvestService } from './context-harvest-service.js';

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
    state: 'done',
    archive_status: null,
    current_stage: 'ship',
    team: { members: [] },
    workflow: { stages: [] },
    control: { mode: 'normal' },
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-04-09T10:00:00.000Z',
    updated_at: '2026-04-09T12:00:00.000Z',
    ...overrides,
  };
}

describe('context harvest service', () => {
  it('summarizes the writer closeout proposal into harvest candidates', () => {
    const service = new ContextHarvestService({
      projectContextWriter: {
        buildTaskCloseoutProposal: vi.fn().mockReturnValue({
          kind: 'task_closeout',
          project_id: 'proj-brain',
          task_id: 'OC-200',
          canonical_root: '/Users/example/.agora/projects/proj-brain',
          lock_holder_task_id: 'OC-200',
          close_recap: {
            binding: { workspace_path: '/Users/example/.agora/projects/proj-brain/tasks/OC-200' },
            input: {},
          },
          harvest_draft: {
            binding: { workspace_path: '/Users/example/.agora/projects/proj-brain/tasks/OC-200' },
            input: {},
          },
          project_recap: {
            project_id: 'proj-brain',
            task_id: 'OC-200',
            title: 'Implement hybrid retrieval',
            state: 'done',
            current_stage: 'ship',
            controller_ref: null,
            workspace_path: '/Users/example/.agora/projects/proj-brain/tasks/OC-200',
            completed_by: 'archon',
            completed_at: '2026-04-09T16:00:00.000Z',
            summary_lines: [],
          },
        }),
      },
    });

    const proposal = service.buildHarvestProposal({
      task: makeTask() as never,
      binding: { workspace_path: '/Users/example/.agora/projects/proj-brain/tasks/OC-200' } as never,
      actor: 'archon',
    });

    expect(proposal).toEqual(expect.objectContaining({
      project_id: 'proj-brain',
      task_id: 'OC-200',
      candidates: expect.arrayContaining([
        expect.objectContaining({ kind: 'task_close_recap' }),
        expect.objectContaining({ kind: 'task_harvest_draft' }),
        expect.objectContaining({ kind: 'project_recap' }),
      ]),
    }));
  });

  it('maps doctor output into a reconcile report', async () => {
    const service = new ContextHarvestService({
      projectContextWriter: {
        buildTaskCloseoutProposal: vi.fn(),
      },
      projectBrainDoctorService: {
        diagnoseProject: vi.fn().mockResolvedValue({
          project_id: 'proj-brain',
          db_path: '/tmp/agora.db',
          embedding: { configured: true, healthy: true, provider: 'openai-compatible', model: 'text-embedding-3-large' },
          vector_index: { configured: true, provider: 'qdrant', healthy: true, chunk_count: 8 },
          jobs: { pending: 1, running: 0, failed: 0, succeeded: 7 },
          drift: { detected: true, documents_without_jobs: 2 },
        }),
      },
    });

    const report = await service.buildReconcileReport('proj-brain');

    expect(report).toEqual(expect.objectContaining({
      project_id: 'proj-brain',
      status: 'drift_detected',
      pending_jobs: 1,
      documents_without_jobs: 2,
    }));
  });
});
