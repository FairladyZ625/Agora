import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { reviewsPageCopy } from '@/lib/dashboardCopy';
import { MOCK_REVIEW_QUEUE } from '@/lib/mockDashboard';
import { useTaskStore } from '@/stores/taskStore';

export function ReviewsPage() {
  const { tasks, fetchTasks } = useTaskStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const queue = useMemo(() => {
    const liveQueue = tasks
      .filter((task) => task.state === 'gate_waiting')
      .map((task) => ({
        id: task.id,
        title: task.title,
        creator: task.creator,
        gate: task.current_stage ?? 'archon_review',
        waitTime: '刚刚',
        summary: task.description ?? reviewsPageCopy.queueFallbackSummary,
        priority: task.priority,
        impact: `${reviewsPageCopy.queueFallbackImpactPrefix} ${task.team} ${reviewsPageCopy.queueFallbackImpactSuffix}`,
        state: task.state,
      }));

    return liveQueue.length > 0 ? liveQueue : MOCK_REVIEW_QUEUE;
  }, [tasks]);

  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--intro space-y-2">
        <p className="page-kicker">{reviewsPageCopy.kicker}</p>
        <h2 className="page-title">{reviewsPageCopy.title}</h2>
        <p className="page-summary">{reviewsPageCopy.summary}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card metric-card--warning">
          <p className="metric-label">{reviewsPageCopy.metricLabels.queue}</p>
          <p className="metric-value">{queue.length}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.queue}</p>
        </div>
        <div className="metric-card metric-card--danger">
          <p className="metric-label">{reviewsPageCopy.metricLabels.highestRisk}</p>
          <p className="metric-value">{reviewsPageCopy.metricValues.highestRisk}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.highestRisk}</p>
        </div>
        <div className="metric-card metric-card--primary">
          <p className="metric-label">{reviewsPageCopy.metricLabels.defaultAction}</p>
          <p className="metric-value">{reviewsPageCopy.metricValues.defaultAction}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.defaultAction}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,0.92fr)]">
        <section className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{reviewsPageCopy.queueKicker}</p>
              <h3 className="section-title">{reviewsPageCopy.queueTitle}</h3>
            </div>
            <span className="status-pill status-pill--warning">
              {queue.length}
              {reviewsPageCopy.queueCountUnit}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {queue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={item.id === selected?.id ? 'task-row task-row--active' : 'task-row'}
              >
                <div className="flex items-start justify-between gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{item.id}</span>
                      <h4 className="truncate text-[15px] font-medium text-[var(--color-text-primary)]">
                        {item.title}
                      </h4>
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                      {item.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={item.priority} />
                      <StateBadge state={item.state} />
                    </div>
                  </div>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">{item.waitTime}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel surface-panel--workspace">
          {selected ? (
            <div className="space-y-6">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{reviewsPageCopy.workspaceKicker}</p>
                  <h3 className="section-title">{reviewsPageCopy.workspaceTitle}</h3>
                </div>
                <PriorityBadge priority={selected.priority} />
              </div>

              <div className="rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{selected.id}</span>
                  <StateBadge state={selected.state} />
                </div>
                <h4 className="mt-3 text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  {selected.title}
                </h4>
                <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                  {selected.summary}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="detail-card">
                  <ShieldAlert size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{reviewsPageCopy.gateLabel}</span>
                  <strong className="detail-card__value">{selected.gate}</strong>
                </div>
                <div className="detail-card">
                  <CheckCircle2 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{reviewsPageCopy.impactLabel}</span>
                  <strong className="detail-card__value">{selected.impact}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="decision-note" className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  {reviewsPageCopy.noteLabel}
                </label>
                <textarea
                  id="decision-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="textarea-shell"
                  placeholder={reviewsPageCopy.notePlaceholder}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="button-danger">
                  <XCircle size={16} />
                  {reviewsPageCopy.rejectAction}
                </button>
                <button type="button" className="button-primary">
                  <CheckCircle2 size={16} />
                  {reviewsPageCopy.approveAction}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{reviewsPageCopy.emptyTitle}</p>
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{reviewsPageCopy.emptySummary}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
