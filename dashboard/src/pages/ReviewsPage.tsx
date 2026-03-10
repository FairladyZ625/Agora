import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Filter, ShieldAlert, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { useReviewsPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useTaskStore } from '@/stores/taskStore';
import { WorkbenchFilterPopover } from '@/components/ui/WorkbenchFilterPopover';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { StaggeredItem } from '@/components/ui/StaggeredItem';
import { toggleValue } from '@/lib/utils';
import { getPriorityMeta } from '@/lib/taskMeta';

type QueueScope = 'all' | 'high';

export function ReviewsPage() {
  const { t } = useTranslation();
  const reviewsPageCopy = useReviewsPageCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const resolveReview = useTaskStore((state) => state.resolveReview);
  const selectTask = useTaskStore((state) => state.selectTask);
  const selectedTaskStatus = useTaskStore((state) => state.selectedTaskStatus);
  const error = useTaskStore((state) => state.error);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const { reviewId } = useParams<{ reviewId: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<QueueScope>('all');
  const [note, setNote] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [gateFilter, setGateFilter] = useState<string[]>([]);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const queueScopes: { value: QueueScope; label: string }[] = [
    { value: 'high', label: reviewsPageCopy.queueScopes.high },
  ];

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
        gate: task.current_stage ?? 'archon-review',
        waitTime: t('common.justNow'),
        summary: task.description ?? reviewsPageCopy.queueFallbackSummary,
        priority: task.priority,
        impact: [reviewsPageCopy.queueFallbackImpactPrefix, task.teamLabel, reviewsPageCopy.queueFallbackImpactSuffix]
          .filter(Boolean)
          .join(' '),
        state: task.state,
      }));

    return liveQueue;
  }, [reviewsPageCopy, t, tasks]);

  const availableGates = useMemo(() => [...new Set(queue.map((item) => item.gate))], [queue]);
  const availableCreators = useMemo(() => [...new Set(queue.map((item) => item.creator))], [queue]);

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      const matchesScope =
        scope === 'all' ||
        (scope === 'high' && item.priority === 'high');
      const matchesPriority = priorityFilter.length === 0 || priorityFilter.includes(item.priority);
      const matchesGate = gateFilter.length === 0 || gateFilter.includes(item.gate);
      const matchesCreator = creatorFilter.length === 0 || creatorFilter.includes(item.creator);
      return matchesScope && matchesPriority && matchesGate && matchesCreator;
    });
  }, [creatorFilter, gateFilter, priorityFilter, queue, scope]);

  const currentSelectedId = reviewId ?? selectedId ?? filteredQueue[0]?.id ?? null;

  useEffect(() => {
    if (!currentSelectedId) return;
    void selectTask(currentSelectedId);
  }, [currentSelectedId, selectTask]);

  const selected =
    filteredQueue.find((item) => item.id === currentSelectedId) ??
    ((currentSelectedId || reviewId) && selectedTaskStatus?.task.id === currentSelectedId
      ? {
          id: selectedTaskStatus.task.id,
          title: selectedTaskStatus.task.title,
          creator: selectedTaskStatus.task.creator,
          gate: selectedTaskStatus.task.current_stage ?? 'archon-review',
          waitTime: t('common.justNow'),
          summary: selectedTaskStatus.task.description ?? reviewsPageCopy.queueFallbackSummary,
          priority: selectedTaskStatus.task.priority,
          impact: [reviewsPageCopy.queueFallbackImpactPrefix, selectedTaskStatus.task.teamLabel, reviewsPageCopy.queueFallbackImpactSuffix]
            .filter(Boolean)
            .join(' '),
          state: selectedTaskStatus.task.state,
        }
      : null) ??
    filteredQueue[0] ??
    null;
  const selectedStatus =
    selected && selectedTaskStatus?.task.id === selected.id
      ? selectedTaskStatus
      : null;
  const activeFilterCount = priorityFilter.length + gateFilter.length + creatorFilter.length;

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!selected) return;
    try {
      await resolveReview(selected.id, decision, note);
      showMessage(
        decision === 'approve' ? t('feedback.reviewApproveTitle') : t('feedback.reviewRejectTitle'),
        decision === 'approve' ? t('feedback.reviewApproveDetail') : t('feedback.reviewRejectDetail'),
        decision === 'approve' ? 'success' : 'warning',
      );
      setNote('');
    } catch (reviewError) {
      showMessage(
        t('feedback.reviewFailureTitle'),
        reviewError instanceof Error ? reviewError.message : String(reviewError),
        'warning',
      );
    }
  };

  const reviewSections = useMemo(() => [
    {
      label: reviewsPageCopy.filterSectionLabels.priority,
      options: [
        { value: 'high', label: getPriorityMeta('high').label, count: queue.filter((item) => item.priority === 'high').length },
        { value: 'normal', label: getPriorityMeta('normal').label, count: queue.filter((item) => item.priority === 'normal').length },
        { value: 'low', label: getPriorityMeta('low').label, count: queue.filter((item) => item.priority === 'low').length },
      ],
      selected: priorityFilter,
      onToggle: (value: string) => setPriorityFilter((current) => toggleValue(current, value)),
    },
    {
      label: reviewsPageCopy.filterSectionLabels.gate,
      options: availableGates.map((item) => ({
        value: item,
        label: item,
        count: queue.filter((row) => row.gate === item).length,
      })),
      selected: gateFilter,
      onToggle: (value: string) => setGateFilter((current) => toggleValue(current, value)),
    },
    {
      label: reviewsPageCopy.filterSectionLabels.creator,
      options: availableCreators.map((item) => ({
        value: item,
        label: item,
        count: queue.filter((row) => row.creator === item).length,
      })),
      selected: creatorFilter,
      onToggle: (value: string) => setCreatorFilter((current) => toggleValue(current, value)),
    },
  ], [queue, priorityFilter, gateFilter, creatorFilter, availableGates, availableCreators, reviewsPageCopy]);

  const clearFilters = () => {
    setPriorityFilter([]);
    setGateFilter([]);
    setCreatorFilter([]);
    setScope('all');
  };

  return (
    <div className="workspace-page workspace-page--locked">
      <section className="surface-panel surface-panel--workspace review-canvas">
        <div className="review-canvas__masthead">
          <div className="space-y-3">
            <p className="page-kicker">{reviewsPageCopy.kicker}</p>
            <h2 className="page-title">{reviewsPageCopy.workbenchTitle}</h2>
            <p className="page-summary">{reviewsPageCopy.workbenchSummary}</p>
          </div>
          <div className="review-canvas__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{reviewsPageCopy.metricLabels.queue}</span>
              <span className="inline-stat__value">{filteredQueue.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{reviewsPageCopy.metricLabels.highestRisk}</span>
              <span className="inline-stat__value">{filteredQueue.some((item) => item.priority === 'high') ? reviewsPageCopy.metricValues.highestRisk : reviewsPageCopy.metricValues.normal}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{reviewsPageCopy.metricLabels.defaultAction}</span>
              <span className="inline-stat__value">{reviewsPageCopy.metricValues.defaultAction}</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="inline-alert inline-alert--danger">{error}</div>
        ) : null}

        <div className="review-canvas__body">
          <section className="review-pane review-pane--queue">
            <div className="review-pane__header">
              <div>
                <p className="page-kicker">{reviewsPageCopy.queueKicker}</p>
                <h3 className="section-title">{reviewsPageCopy.queueTitle}</h3>
              </div>
              <span className="status-pill status-pill--warning">
                {filteredQueue.length}
                {reviewsPageCopy.queueCountUnit}
              </span>
            </div>

            <div className="review-canvas__filters">
              <div className="workbench-toolbar__filter-anchor">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setFilterOpen((current) => !current)}
                >
                  <Filter size={14} />
                  {reviewsPageCopy.filterAction}
                  {activeFilterCount > 0 ? (
                    <span className="status-pill status-pill--info">{activeFilterCount}</span>
                  ) : null}
                </button>

                {filterOpen ? (
                  <WorkbenchFilterPopover
                    title={reviewsPageCopy.filterAction}
                    emptyLabel={reviewsPageCopy.emptySummary}
                    sections={reviewSections}
                    onClear={clearFilters}
                    onClose={() => setFilterOpen(false)}
                    footer={
                      <button type="button" className="button-primary" onClick={() => setFilterOpen(false)}>
                        {reviewsPageCopy.applyFiltersAction}
                      </button>
                    }
                  />
                ) : null}
              </div>

              {queueScopes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setScope((current) => (current === item.value ? 'all' : item.value))}
                  className={scope === item.value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                >
                  {item.label}
                </button>
              ))}

              {activeFilterCount > 0 ? (
                <span className="topbar-chip">
                  {reviewsPageCopy.activeFilterPrefix} {activeFilterCount}
                </span>
              ) : null}
            </div>

            <div className="workbench-scroll workbench-scroll--list review-pane__scroll">
              <div className="review-table review-table--dense">
                <div className="review-table__head" role="presentation">
                  <span>{reviewsPageCopy.tableHeaders.task}</span>
                  <span>{reviewsPageCopy.tableHeaders.gate}</span>
                  <span>{reviewsPageCopy.tableHeaders.priority}</span>
                  <span className="text-right">{reviewsPageCopy.tableHeaders.wait}</span>
                </div>

                {filteredQueue.length > 0 ? (
                  filteredQueue.map((item, index) => (
                    <StaggeredItem key={item.id} index={index}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={item.id === selected?.id ? 'review-table__row review-table__row--active' : 'review-table__row'}
                      >
                        <div className="review-table__task">
                          <span className="type-mono-xs">{item.id}</span>
                          <strong className="review-table__title">{item.title}</strong>
                          <p className="review-table__summary">{item.summary}</p>
                        </div>
                        <span className="review-table__cell">{item.gate}</span>
                        <div className="review-table__cell">
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <span className="review-table__cell review-table__cell--right">{item.waitTime}</span>
                      </button>
                    </StaggeredItem>
                  ))
                ) : (
                  <div className="empty-state">
                    <p className="type-heading-sm">{reviewsPageCopy.emptyTitle}</p>
                    <p className="type-body-sm mt-2">{reviewsPageCopy.emptySummary}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="review-pane review-pane--inspector">
            {selected ? (
              <div className="review-inspector__stack">
                <div className="review-pane__header review-pane__header--inspector">
                  <div>
                    <p className="page-kicker">{reviewsPageCopy.workspaceKicker}</p>
                    <h3 className="section-title">{reviewsPageCopy.workspaceTitle}</h3>
                  </div>
                  <PriorityBadge priority={selected.priority} />
                </div>

                <div className="inspector-hero">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-mono-sm">{selected.id}</span>
                    <StateBadge state={selected.state} />
                  </div>
                  <h4 className="type-heading-md mt-3">
                    {selected.title}
                  </h4>
                  <p className="type-body-sm mt-3">
                    {selected.summary}
                  </p>
                </div>

                <div className="review-inspector__section">
                  <div className="review-inspector__facts">
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
                </div>

                <div className="review-inspector__section">
                  <label htmlFor="decision-note" className="type-label-sm">
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

                <div className="review-inspector__section">
                  <div className="review-inspector__actions">
                    <button type="button" className="button-danger" onClick={() => void handleDecision('reject')}>
                      <XCircle size={16} />
                      {reviewsPageCopy.rejectAction}
                    </button>
                    <button type="button" className="button-primary" onClick={() => void handleDecision('approve')}>
                      <CheckCircle2 size={16} />
                      {reviewsPageCopy.approveAction}
                    </button>
                  </div>
                </div>

                <div className="review-inspector__section review-inspector__section--meta">
                  <button
                    type="button"
                    className="button-primary w-full justify-center"
                    onClick={() => navigate(`/reviews/${selected.id}`)}
                  >
                    <ArrowRight size={16} />
                    {reviewsPageCopy.detailAction}
                  </button>
                  <p className="type-text-xs">
                    {reviewsPageCopy.liveApiNotice}
                  </p>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p className="type-heading-sm">{reviewsPageCopy.emptyTitle}</p>
                <p className="type-body-sm mt-2">{reviewsPageCopy.emptySummary}</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      {reviewId && selected && selectedStatus ? (
        <WorkbenchDetailSheet
          label={reviewsPageCopy.detailDialogLabel}
          title={reviewsPageCopy.detailDialogTitle}
          onClose={() => navigate('/reviews')}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-mono-sm">{selected.id}</span>
              <PriorityBadge priority={selected.priority} />
            </div>
            <h4 className="type-heading-lg mt-3">
              {selected.title}
            </h4>
            <p className="type-body-sm mt-3">{selected.summary}</p>
          </div>

          <section className="sheet-section">
            <h4 className="section-title">{reviewsPageCopy.contextTitle}</h4>
            <div className="mt-4 space-y-3">
              {selectedStatus.flow_log.map((entry) => (
                <div key={entry.id} className="timeline-item">
                  <div className="timeline-item__rail" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-label-sm">{entry.event}</span>
                      <span className="type-text-xs">{entry.stage_id ?? t('common.unknownStage')}</span>
                    </div>
                    <p className="type-body-sm mt-2">
                      {entry.detail ?? reviewsPageCopy.queueFallbackSummary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="sheet-section">
            <h4 className="section-title">{reviewsPageCopy.progressTitle}</h4>
            <div className="mt-4 space-y-3">
              {selectedStatus.progress_log.map((entry) => (
                <div key={entry.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <p className="type-label-sm">{entry.actor}</p>
                    <p className="type-body-sm mt-2">{entry.content}</p>
                  </div>
                  <span className="type-text-xs">{entry.stage_id ?? t('common.genericStage')}</span>
                </div>
              ))}
            </div>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
