import { describe, expect, it, vi } from 'vitest';
import { ProjectBrainIndexWorkerService } from './project-brain-index-worker-service.js';

describe('ProjectBrainIndexWorkerService', () => {
  it('drains pending jobs and marks them succeeded', async () => {
    const claimNextPending = vi.fn()
      .mockReturnValueOnce({
        id: 1,
        project_id: 'proj-brain',
        document_kind: 'decision',
        document_slug: 'runtime-boundary',
      })
      .mockReturnValueOnce(null);
    const markSucceeded = vi.fn();
    const markFailed = vi.fn();
    const listJobs = vi.fn().mockReturnValue([]);
    const syncProjectIndex = vi.fn().mockResolvedValue({
      project_id: 'proj-brain',
      indexed_documents: 1,
      indexed_chunks: 2,
    });

    const service = new ProjectBrainIndexWorkerService({
      queueService: { claimNextPending, markSucceeded, markFailed, listJobs },
      indexService: { syncProjectIndex },
    });

    await expect(service.drainPendingJobs({ limit: 10 })).resolves.toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
      pending: 0,
    });
    expect(syncProjectIndex).toHaveBeenCalledWith({
      project_id: 'proj-brain',
      kind: 'decision',
      slug: 'runtime-boundary',
    });
    expect(markSucceeded).toHaveBeenCalledWith(1);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('marks jobs failed when sync throws', async () => {
    const claimNextPending = vi.fn()
      .mockReturnValueOnce({
        id: 2,
        project_id: 'proj-brain',
        document_kind: 'fact',
        document_slug: 'core-first',
      })
      .mockReturnValueOnce(null);
    const markSucceeded = vi.fn();
    const markFailed = vi.fn();
    const listJobs = vi.fn().mockReturnValue([]);
    const syncProjectIndex = vi.fn().mockRejectedValue(new Error('qdrant unavailable'));

    const service = new ProjectBrainIndexWorkerService({
      queueService: { claimNextPending, markSucceeded, markFailed, listJobs },
      indexService: { syncProjectIndex },
    });

    await expect(service.drainPendingJobs()).resolves.toEqual({
      processed: 1,
      succeeded: 0,
      failed: 1,
      pending: 0,
    });
    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(2, 'qdrant unavailable');
  });
});
