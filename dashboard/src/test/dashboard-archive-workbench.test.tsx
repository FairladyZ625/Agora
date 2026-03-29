import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchivePage } from '@/pages/ArchivePage';

const fetchJobs = vi.fn(async () => 'live');
const selectJob = vi.fn(async () => undefined);
const approveJob = vi.fn(async () => undefined);
const confirmJob = vi.fn(async () => undefined);
const retryJob = vi.fn(async () => undefined);
const setFilters = vi.fn();

const archiveStoreState = {
  jobs: [
    {
      id: 7,
      taskId: 'OC-301',
      taskTitle: '归档日报',
      taskType: 'document',
      status: 'failed',
      targetPath: 'ZeYu-AI-Brain/docs/',
      writerAgent: 'writer-agent',
      commitHash: null,
      requestedAt: '2026-03-07T08:00:00.000Z',
      completedAt: null,
      payload: { error_message: 'timeout' },
      payloadSummary: 'timeout',
      canApprove: false,
      canConfirm: false,
      canRetry: true,
    },
  ],
  selectedJobId: 7,
  selectedJob: {
    id: 7,
    taskId: 'OC-301',
    taskTitle: '归档日报',
    taskType: 'document',
    status: 'failed',
    targetPath: 'ZeYu-AI-Brain/docs/',
    writerAgent: 'writer-agent',
    commitHash: null,
    requestedAt: '2026-03-07T08:00:00.000Z',
    completedAt: null,
    payload: { error_message: 'timeout' },
    payloadSummary: 'timeout',
    canApprove: false,
    canConfirm: false,
    canRetry: true,
  },
  loading: false,
  detailLoading: false,
  filters: { status: null, taskId: '' },
  error: null,
  fetchJobs,
  selectJob,
  approveJob,
  confirmJob,
  retryJob,
  setFilters,
  clearError: vi.fn(),
};

vi.mock('@/stores/archiveStore', () => ({
  useArchiveStore: (selector?: (state: typeof archiveStoreState) => unknown) =>
    selector ? selector(archiveStoreState) : archiveStoreState,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ArchivePage />
    </MemoryRouter>,
  );
}

describe('archive workbench layout', () => {
  beforeEach(() => {
    fetchJobs.mockClear();
    selectJob.mockClear();
    approveJob.mockClear();
    confirmJob.mockClear();
    retryJob.mockClear();
    setFilters.mockClear();
  });

  it('keeps filter controls separate from archive list and detail modules', () => {
    renderPage();

    expect(screen.getByTestId('archive-list-panel')).toBeInTheDocument();
    expect(screen.getByTestId('archive-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('归档日报')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试归档' })).toBeInTheDocument();
  });
});
