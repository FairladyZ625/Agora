import { useEffect } from 'react';
import { useArchivePageCopy } from '@/lib/dashboardCopy';
import { useArchiveStore } from '@/stores/archiveStore';

export function ArchivePage() {
  const copy = useArchivePageCopy();
  const jobs = useArchiveStore((state) => state.jobs);
  const selectedJob = useArchiveStore((state) => state.selectedJob);
  const selectedJobId = useArchiveStore((state) => state.selectedJobId);
  const filters = useArchiveStore((state) => state.filters);
  const error = useArchiveStore((state) => state.error);
  const fetchJobs = useArchiveStore((state) => state.fetchJobs);
  const selectJob = useArchiveStore((state) => state.selectJob);
  const retryJob = useArchiveStore((state) => state.retryJob);
  const setFilters = useArchiveStore((state) => state.setFilters);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs, filters.status, filters.taskId]);

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      void selectJob(jobs[0].id);
    }
  }, [jobs, selectedJobId, selectJob]);

  const filterKeys = ['all', 'pending', 'failed', 'completed'] as const;

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {filterKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilters({ status: key === 'all' ? null : key })}
                className={filters.status === (key === 'all' ? null : key) ? 'choice-pill choice-pill--active' : 'choice-pill'}
              >
                {copy.filters[key]}
              </button>
            ))}
          </div>
          <label className="space-y-2">
            <span className="field-label">{copy.taskIdLabel}</span>
            <input
              type="text"
              value={filters.taskId}
              onChange={(event) => setFilters({ taskId: event.target.value })}
              className="input-shell"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyTitle}</p>
              </div>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => void selectJob(job.id)}
                  className={job.id === selectedJobId ? 'dense-row dense-row--active' : 'dense-row'}
                >
                  <div className="dense-row__main">
                    <div className="dense-row__titleblock">
                      <span className="type-mono-xs">#{job.id}</span>
                      <strong className="dense-row__title">{job.taskTitle}</strong>
                    </div>
                    <div className="dense-row__meta">
                      <span className="status-pill status-pill--neutral">{job.status}</span>
                      <span>{job.taskId}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.detailTitle}</h3>
            {selectedJob?.canRetry ? (
              <button type="button" className="button-primary" onClick={() => void retryJob(selectedJob.id, 'manual retry')}>
                {copy.retryAction}
              </button>
            ) : null}
          </div>

          {selectedJob ? (
            <div className="mt-5 space-y-4">
              <div className="detail-card">
                <span className="detail-card__label">{copy.requestedAtLabel}</span>
                <span className="type-body-sm">{selectedJob.requestedAt}</span>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.completedAtLabel}</span>
                <span className="type-body-sm">{selectedJob.completedAt ?? '—'}</span>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.targetPathLabel}</span>
                <span className="type-body-sm">{selectedJob.targetPath ?? '—'}</span>
              </div>
              <div className="surface-panel surface-panel--muted">
                <p className="page-kicker">{copy.payloadTitle}</p>
                <p className="type-body-sm mt-3">{selectedJob.payloadSummary}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state mt-5">
              <p className="type-body-sm">{copy.emptyTitle}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
