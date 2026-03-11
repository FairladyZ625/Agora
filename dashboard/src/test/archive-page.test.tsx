import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArchivePage } from '@/pages/ArchivePage';

const confirmJob = vi.fn(async () => undefined);
const retryJob = vi.fn(async () => undefined);
const fetchJobs = vi.fn(async () => 'live');
const selectJob = vi.fn(async () => undefined);
const setFilters = vi.fn();

const archiveStoreState = {
  jobs: [{
    id: 9,
    taskId: 'OC-302',
    taskTitle: '待归档任务',
    taskType: 'document',
    status: 'pending',
    targetPath: 'ZeYu-AI-Brain/docs/',
    writerAgent: 'writer-agent',
    commitHash: null,
    requestedAt: '2026-03-07T08:00:00.000Z',
    completedAt: null,
    payload: { state: 'cancelled' },
    payloadSummary: '{"state":"cancelled"}',
    canConfirm: true,
    canRetry: false,
  }],
  selectedJobId: 9,
  selectedJob: {
    id: 9,
    taskId: 'OC-302',
    taskTitle: '待归档任务',
    taskType: 'document',
    status: 'pending',
    targetPath: 'ZeYu-AI-Brain/docs/',
    writerAgent: 'writer-agent',
    commitHash: null,
    requestedAt: '2026-03-07T08:00:00.000Z',
    completedAt: null,
    payload: { state: 'cancelled' },
    payloadSummary: '{"state":"cancelled"}',
    canConfirm: true,
    canRetry: false,
  },
  loading: false,
  detailLoading: false,
  error: null,
  filters: { status: null, taskId: '' },
  fetchJobs,
  selectJob,
  confirmJob,
  retryJob,
  setFilters,
  clearError: vi.fn(),
};

vi.mock('@/stores/archiveStore', () => ({
  useArchiveStore: (selector?: (state: typeof archiveStoreState) => unknown) =>
    selector ? selector(archiveStoreState) : archiveStoreState,
}));

describe('archive page', () => {
  it('renders a confirm archive action for pending jobs', () => {
    render(<ArchivePage />);

    fireEvent.click(screen.getByRole('button', { name: '确认归档' }));

    expect(screen.getByRole('heading', { name: 'Archive Jobs' })).toBeInTheDocument();
    expect(confirmJob).toHaveBeenCalledWith(9);
    expect(retryJob).not.toHaveBeenCalled();
  });
});
