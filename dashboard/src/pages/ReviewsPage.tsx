import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudCog,
  FileJson,
  Filter,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { useReviewsPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useTaskStore } from '@/stores/taskStore';
import { WorkbenchFilterPopover } from '@/components/ui/WorkbenchFilterPopover';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { StaggeredItem } from '@/components/ui/StaggeredItem';
import { toggleValue } from '@/lib/utils';
import { getPriorityMeta } from '@/lib/taskMeta';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { ProgressLogEntry, Task, TaskStatus } from '@/types/task';

type QueueScope = 'all' | 'high' | 'assigned';
type ReviewTone = 'high' | 'medium' | 'low';

interface ReviewQueueItem {
  id: string;
  title: string;
  creator: string;
  gate: string;
  waitTime: string;
  waitMinutes: number;
  summary: string;
  priority: Task['priority'];
  impact: string;
  state: Task['state'];
  gateType: string | null;
  approverAccountId: number | null;
  actionable: boolean;
  projectId: string | null;
  updatedAt: string;
  teamLabel: string;
  memberCount: number;
}

function isReviewActionable(
  gateType: string | null | undefined,
  approverAccountId: number | null | undefined,
  sessionAccountId: number | null,
) {
  if (gateType !== 'approval') {
    return true;
  }

  return approverAccountId == null || approverAccountId === sessionAccountId;
}

function getWaitMinutes(updatedAt: string) {
  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - updatedTime) / 60_000));
}

function formatWaitTime(minutes: number, copy: ReturnType<typeof useReviewsPageCopy>) {
  if (minutes < 1) {
    return copy.waitJustNow;
  }
  if (minutes < 60) {
    return copy.waitMinutes(minutes);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return copy.waitHours(hours);
  }
  return copy.waitDays(Math.floor(hours / 24));
}

function getTone(item: Pick<ReviewQueueItem, 'priority' | 'waitMinutes'>): ReviewTone {
  if (item.priority === 'high' || item.waitMinutes >= 120) {
    return 'high';
  }
  if (item.waitMinutes >= 45) {
    return 'medium';
  }
  return 'low';
}

function getRequestLabel(item: ReviewQueueItem, copy: ReturnType<typeof useReviewsPageCopy>) {
  if (item.gateType === 'approval') {
    return copy.requestKinds.approval;
  }
  if (item.gateType === 'archon_review') {
    return copy.requestKinds.policy;
  }
  if (item.priority === 'high') {
    return copy.requestKinds.audit;
  }
  return copy.requestKinds.evidence;
}

function parseArtifactRefs(progressLog: ProgressLogEntry[] | undefined) {
  return (progressLog ?? [])
    .flatMap((entry) => {
      if (!entry.artifacts) {
        return [];
      }
      try {
        const parsed = JSON.parse(entry.artifacts) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((value) => String(value));
        }
        if (typeof parsed === 'string') {
          return [parsed];
        }
        if (parsed && typeof parsed === 'object') {
          return Object.values(parsed).flatMap((value) => Array.isArray(value) ? value.map(String) : [String(value)]);
        }
      } catch {
        return [entry.artifacts];
      }
      return [];
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildSelectedFromStatus(
  status: TaskStatus,
  sessionAccountId: number | null,
  copy: ReturnType<typeof useReviewsPageCopy>,
): ReviewQueueItem {
  const task = status.task;
  const waitMinutes = getWaitMinutes(task.updated_at);
  return {
    id: task.id,
    title: task.title,
    creator: task.creator,
    gate: task.current_stage ?? copy.fallbackGate,
    waitTime: formatWaitTime(waitMinutes, copy),
    waitMinutes,
    summary: task.description ?? copy.queueFallbackSummary,
    priority: task.priority,
    impact: [copy.queueFallbackImpactPrefix, task.teamLabel, copy.queueFallbackImpactSuffix].filter(Boolean).join(' '),
    state: task.state,
    gateType: task.gateType ?? null,
    approverAccountId: task.authority?.approverAccountId ?? null,
    actionable: isReviewActionable(task.gateType, task.authority?.approverAccountId, sessionAccountId),
    projectId: task.projectId ?? null,
    updatedAt: task.updated_at,
    teamLabel: task.teamLabel,
    memberCount: task.memberCount,
  };
}

export function ReviewsPage() {
  const { t } = useTranslation();
  const reviewsPageCopy = useReviewsPageCopy();
  const sessionAccountId = useSessionStore((state) => state.accountId);
  const tasks = useTaskStore((state) => state.tasks);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const resolveReview = useTaskStore((state) => state.resolveReview);
  const selectTask = useTaskStore((state) => state.selectTask);
  const selectedTaskStatus = useTaskStore((state) => state.selectedTaskStatus);
  const governanceSnapshot = useTaskStore((state) => state.governanceSnapshot ?? null);
  const healthSnapshot = useTaskStore((state) => state.healthSnapshot ?? null);
  const error = useTaskStore((state) => state.error);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const { reviewId } = useParams<{ reviewId: string }>();
  const [searchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('selected'));
  const [scope, setScope] = useState<QueueScope>(() => {
    const requestedScope = searchParams.get('scope');
    return requestedScope === 'assigned' || requestedScope === 'high' ? requestedScope : 'all';
  });
  const [note, setNote] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [gateFilter, setGateFilter] = useState<string[]>([]);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const queueScopes: { value: QueueScope; label: string }[] = [
    { value: 'assigned', label: reviewsPageCopy.queueScopes.assigned },
    { value: 'high', label: reviewsPageCopy.queueScopes.high },
  ];

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const queue = useMemo(() => {
    const liveQueue = tasks
      .filter((task) => task.state === 'gate_waiting')
      .map((task): ReviewQueueItem => {
        const waitMinutes = getWaitMinutes(task.updated_at);
        return {
          id: task.id,
          title: task.title,
          creator: task.creator,
          gate: task.current_stage ?? reviewsPageCopy.fallbackGate,
          waitTime: formatWaitTime(waitMinutes, reviewsPageCopy),
          waitMinutes,
          summary: task.description ?? reviewsPageCopy.queueFallbackSummary,
          priority: task.priority,
          impact: [reviewsPageCopy.queueFallbackImpactPrefix, task.teamLabel, reviewsPageCopy.queueFallbackImpactSuffix]
            .filter(Boolean)
            .join(' '),
          state: task.state,
          gateType: task.gateType ?? null,
          approverAccountId: task.authority?.approverAccountId ?? null,
          actionable: isReviewActionable(task.gateType, task.authority?.approverAccountId, sessionAccountId),
          projectId: task.projectId ?? null,
          updatedAt: task.updated_at,
          teamLabel: task.teamLabel,
          memberCount: task.memberCount,
        };
      });

    return liveQueue;
  }, [reviewsPageCopy, sessionAccountId, tasks]);

  const availableGates = useMemo(() => [...new Set(queue.map((item) => item.gate))], [queue]);
  const availableCreators = useMemo(() => [...new Set(queue.map((item) => item.creator))], [queue]);

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      const matchesScope =
        scope === 'all' ||
        (scope === 'high' && item.priority === 'high') ||
        (scope === 'assigned' && item.actionable);
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
    ((currentSelectedId || reviewId) && selectedTaskStatus?.task.id === currentSelectedId
      ? buildSelectedFromStatus(selectedTaskStatus, sessionAccountId, reviewsPageCopy)
      : null) ??
    filteredQueue.find((item) => item.id === currentSelectedId) ??
    filteredQueue[0] ??
    null;
  const selectedStatus =
    selected && selectedTaskStatus?.task.id === selected.id
      ? selectedTaskStatus
      : null;
  const activeFilterCount = priorityFilter.length + gateFilter.length + creatorFilter.length;
  const canResolveSelected = selected?.state === 'gate_waiting' && selected.actionable;
  const highImpactCount = queue.filter((item) => item.priority === 'high').length;
  const awaitingYouCount = queue.filter((item) => item.actionable).length;
  const slaAtRiskCount = queue.filter((item) => item.waitMinutes >= 60).length;
  const lastHourCount = queue.filter((item) => item.waitMinutes < 60).length;
  const selectedTone = selected ? getTone(selected) : 'low';
  const selectedKind = selected ? getRequestLabel(selected, reviewsPageCopy) : reviewsPageCopy.requestKinds.evidence;
  const activeGovernanceSnapshot = selectedStatus?.governanceSnapshot ?? governanceSnapshot;
  const healthStatuses = [
    healthSnapshot?.tasks.status,
    healthSnapshot?.runtime.status,
    healthSnapshot?.craftsman.status,
    healthSnapshot?.host.status,
  ].filter(Boolean);
  const hasUnhealthySignal = activeGovernanceSnapshot?.warnings.length
    || healthStatuses.some((status) => status !== 'healthy');
  const postureValue = activeGovernanceSnapshot?.hostPressureStatus
    ?? (hasUnhealthySignal ? 'degraded' : 'healthy');
  const postureSummary = healthSnapshot
    ? reviewsPageCopy.postureSummaryWithStatus(healthSnapshot.runtime.status, healthSnapshot.craftsman.status)
    : reviewsPageCopy.postureSummaryWithWarnings(activeGovernanceSnapshot?.warnings.length ?? 0);
  const selectedTrace = selectedStatus?.flow_log.slice(-4) ?? [];
  const selectedRuntimeTargets = selectedStatus?.task.teamMembers
    ?.map((member) => ({
      id: member.runtime_target_ref ?? member.agentId,
      role: member.role,
      source: member.runtime_selection_source ?? member.runtime_flavor ?? member.model_preference,
    }))
    .slice(0, 4) ?? [];
  const selectedPolicyRows = [
    {
      label: reviewsPageCopy.policyLabels.passed,
      value: selectedStatus?.subtasks.filter((subtask) => subtask.status === 'done' || subtask.status === 'completed').length ?? 0,
      tone: 'success',
    },
    {
      label: reviewsPageCopy.policyLabels.warn,
      value: activeGovernanceSnapshot?.warnings.length ?? 0,
      tone: 'warning',
    },
    {
      label: reviewsPageCopy.policyLabels.info,
      value: selectedStatus?.progress_log.length ?? 0,
      tone: 'info',
    },
    {
      label: reviewsPageCopy.policyLabels.failed,
      value: selectedStatus?.subtasks.filter((subtask) => subtask.status === 'failed').length ?? 0,
      tone: 'danger',
    },
  ];
  const artifactRefs = parseArtifactRefs(selectedStatus?.progress_log);
  const selectedReferenceRows = artifactRefs.length > 0
    ? artifactRefs
    : selectedStatus?.taskBlueprint?.artifactContracts.map((contract) => `${contract.nodeId}:${contract.artifactType}`).slice(0, 4) ?? [];
  const changeSummaryRows = [
    { label: reviewsPageCopy.changeSummary.targets, value: selectedStatus?.subtasks.length ?? selected?.memberCount ?? 0 },
    { label: reviewsPageCopy.changeSummary.policyRules, value: selectedStatus?.flow_log.length ?? 0 },
    { label: reviewsPageCopy.changeSummary.participants, value: selectedStatus?.task.teamMembers?.length ?? selected?.memberCount ?? 0 },
    { label: reviewsPageCopy.changeSummary.risk, value: selected ? reviewsPageCopy.riskLabels[selectedTone] : reviewsPageCopy.metricValues.normal },
  ];

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

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="workspace-page workspace-page--locked interior-page reviews-mgo">
      <section className="reviews-mgo__masthead surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div>
          <p className="page-kicker">{reviewsPageCopy.kicker}</p>
          <h1 className="page-title">{reviewsPageCopy.title}</h1>
          <p className="page-summary">{reviewsPageCopy.summary}</p>
        </div>
        <div className="reviews-mgo__metrics">
          <div className="reviews-mgo__metric">
            <span>{reviewsPageCopy.metricLabels.queue}</span>
            <strong>{queue.length}</strong>
            <small>{reviewsPageCopy.metricDelta(lastHourCount)}</small>
          </div>
          <div className="reviews-mgo__metric">
            <span>{reviewsPageCopy.metricLabels.highestRisk}</span>
            <strong>{highImpactCount}</strong>
            <small>{highImpactCount > 0 ? reviewsPageCopy.metricValues.highestRisk : reviewsPageCopy.metricValues.normal}</small>
          </div>
          <div className="reviews-mgo__metric">
            <span>{reviewsPageCopy.metricLabels.awaitingYou}</span>
            <strong>{awaitingYouCount}</strong>
            <small>{reviewsPageCopy.metricValues.defaultAction}</small>
          </div>
          <div className="reviews-mgo__metric reviews-mgo__metric--risk">
            <span>{reviewsPageCopy.metricLabels.slaRisk}</span>
            <strong>{slaAtRiskCount}</strong>
            <small>{slaAtRiskCount > 0 ? reviewsPageCopy.slaRiskDelta(slaAtRiskCount) : reviewsPageCopy.metricValues.normal}</small>
          </div>
          <div className="reviews-mgo__posture">
            <div className="reviews-mgo__ring" aria-hidden="true">
              <span />
            </div>
            <div>
              <span>{reviewsPageCopy.governancePosture}</span>
              <strong>{postureValue}</strong>
              <small>{postureSummary}</small>
            </div>
          </div>
        </div>

        {error ? (
          <div className="inline-alert inline-alert--danger">{error}</div>
        ) : null}
      </section>

      <div className="reviews-mgo__layout">
        <section className="reviews-mgo__queue">
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
            <div className="review-toolbar__group">
              <div className="workbench-toolbar__filter-anchor">
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  className={filterOpen ? 'button-secondary review-toolbar__button review-toolbar__button--active' : 'button-secondary review-toolbar__button'}
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
                  className={scope === item.value ? 'button-secondary review-toolbar__button review-toolbar__button--active' : 'button-secondary review-toolbar__button'}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {activeFilterCount > 0 ? (
              <span className="review-toolbar__status">
                {reviewsPageCopy.activeFilterPrefix} {activeFilterCount}
              </span>
            ) : null}
          </div>

          <div className="workbench-scroll workbench-scroll--list review-pane__scroll">
            <div className="review-table review-table--dense">
              {filteredQueue.length > 0 ? (
                filteredQueue.map((item, index) => (
                  <StaggeredItem key={item.id} index={index}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isMobile) {
                          navigate(`/reviews/${item.id}`);
                          return;
                        }
                        setSelectedId(item.id);
                      }}
                      className={item.id === selected?.id ? `reviews-mgo__queue-row is-active reviews-mgo__queue-row--${getTone(item)}` : `reviews-mgo__queue-row reviews-mgo__queue-row--${getTone(item)}`}
                    >
                      <div>
                        <div className="reviews-mgo__row-head">
                          <span>{getRequestLabel(item, reviewsPageCopy)}</span>
                          <span className="type-mono-xs">{item.id}</span>
                          <small>{item.waitTime}</small>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{item.summary}</p>
                        <div className="reviews-mgo__row-meta">
                          <span>{reviewsPageCopy.projectLabel} {item.projectId ?? reviewsPageCopy.unassignedProject}</span>
                          <span>{reviewsPageCopy.tableHeaders.gate} {item.gate}</span>
                          <PriorityBadge priority={item.priority} />
                        </div>
                      </div>
                      <StateBadge state={item.state} />
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

        <section className="reviews-mgo__decision">
          {selected ? (
            <div className="review-inspector__stack">
              <div className="reviews-mgo__decision-head">
                <div className="reviews-mgo__decision-title">
                  <div className="reviews-mgo__request-line">
                    <span className={`reviews-mgo__impact reviews-mgo__impact--${selectedTone}`}>{selectedKind}</span>
                    <small>{selected.projectId ?? reviewsPageCopy.unassignedProject}</small>
                    <small>{reviewsPageCopy.taskLabel}</small>
                    <small>{selected.id}</small>
                    <small>{reviewsPageCopy.requestedBy} {selected.creator}</small>
                    <small>{selected.waitTime}</small>
                  </div>
                  <h2>{selected.title}</h2>
                </div>
                <div className="reviews-mgo__decision-actions">
                  <button type="button" className="button-secondary" onClick={() => navigate(`/reviews/${selected.id}`)}>
                    <ArrowRight size={16} />
                    {reviewsPageCopy.detailAction}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => selected.projectId ? navigate(`/projects/${selected.projectId}/work/${selected.id}`) : navigate(`/tasks/${selected.id}`)}>
                    <GitBranch size={16} />
                    {reviewsPageCopy.openWorkAction}
                  </button>
                </div>
              </div>

              {selected.state === 'gate_waiting' && !selected.actionable ? (
                <div className="inline-alert inline-alert--warning">{reviewsPageCopy.readOnlyNotice}</div>
              ) : null}

              {canResolveSelected ? (
                <div className="reviews-mgo__action-bar reviews-mgo__action-bar--top">
                  <button type="button" className="button-primary" onClick={() => void handleDecision('approve')}>
                    <CheckCircle2 size={16} />
                    {reviewsPageCopy.approveAction}
                  </button>
                  <button type="button" className="button-danger" onClick={() => void handleDecision('reject')}>
                    <XCircle size={16} />
                    {reviewsPageCopy.rejectAction}
                  </button>
                </div>
              ) : null}

              <nav className="reviews-mgo__tabs" aria-label={reviewsPageCopy.reviewSectionsLabel}>
                {reviewsPageCopy.sectionTabs.map((tab) => (
                  <button key={tab.id} type="button" onClick={() => scrollToSection(tab.id)}>
                    {tab.icon === 'request' ? <FileJson size={15} /> : null}
                    {tab.icon === 'context' ? <Sparkles size={15} /> : null}
                    {tab.icon === 'runtime' ? <CloudCog size={15} /> : null}
                    {tab.icon === 'policy' ? <ShieldCheck size={15} /> : null}
                    {tab.icon === 'audit' ? <Clock3 size={15} /> : null}
                    {tab.icon === 'evidence' ? <MessageSquareText size={15} /> : null}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>

              <section id="reviews-section-request" className="reviews-mgo__section">
                <div>
                  <p className="page-kicker">{reviewsPageCopy.requestTitle}</p>
                  <p>{selected.summary}</p>
                </div>
                <div className="reviews-mgo__change-summary">
                  {changeSummaryRows.map((row) => (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section id="reviews-section-context" className="reviews-mgo__section reviews-mgo__section--split">
                <div>
                  <p className="page-kicker">{reviewsPageCopy.contextTitle}</p>
                  <p>{selected.impact}</p>
                <PriorityBadge priority={selected.priority} />
              </div>
                <div className="reviews-mgo__people">
                  <div>
                    <span>{reviewsPageCopy.requestedBy}</span>
                    <strong>{selected.creator}</strong>
                  </div>
                  <div>
                    <span>{reviewsPageCopy.onBehalfOf}</span>
                    <strong>{selected.teamLabel}</strong>
                  </div>
                </div>
              </section>

              <section id="reviews-section-runtime" className="reviews-mgo__section">
                <p className="page-kicker">{reviewsPageCopy.runtimeTitle}</p>
                <div className="reviews-mgo__runtime-list">
                  {selectedRuntimeTargets.length > 0 ? (
                    selectedRuntimeTargets.map((target) => (
                      <div key={`${target.role}-${target.id}`} className="reviews-mgo__runtime-row">
                        <strong>{target.id}</strong>
                        <span>{target.role}</span>
                        <small>{target.source}</small>
                      </div>
                    ))
                  ) : (
                    <p className="type-body-sm">{reviewsPageCopy.runtimeEmpty}</p>
                  )}
                </div>
              </section>

              <section id="reviews-section-policy" className="reviews-mgo__section">
                <p className="page-kicker">{reviewsPageCopy.policyTitle}</p>
                <div className="reviews-mgo__policy-meter">
                  <strong>{selectedStatus?.progress_log.length ?? 0}</strong>
                  <span>{reviewsPageCopy.policyTotalLabel}</span>
                </div>
                <div className="reviews-mgo__policy-list">
                  {selectedPolicyRows.map((row) => (
                    <div key={row.label} className={`reviews-mgo__policy-row reviews-mgo__policy-row--${row.tone}`}>
                      <span>{row.value}</span>
                      <small>{row.label}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section id="reviews-section-evidence" className="reviews-mgo__section">
                <p className="page-kicker">{reviewsPageCopy.evidenceTitle}</p>
                {selectedReferenceRows.length > 0 ? (
                  <div className="reviews-mgo__reference-list">
                    {selectedReferenceRows.map((reference) => (
                      <div key={reference}>
                        <FileJson size={15} />
                        <span>{reference}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="type-body-sm">{reviewsPageCopy.evidenceEmpty}</p>
                )}
              </section>

              <section id="reviews-section-note" className="reviews-mgo__section">
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
              </section>

              <p className="type-text-xs">{reviewsPageCopy.liveApiNotice}</p>
            </div>
          ) : (
            <div className="empty-state">
              <p className="type-heading-sm">{reviewsPageCopy.emptyTitle}</p>
              <p className="type-body-sm mt-2">{reviewsPageCopy.emptySummary}</p>
            </div>
          )}
        </section>

        <aside className="reviews-mgo__truth">
          <section className="reviews-mgo__truth-panel">
            <div className="reviews-mgo__truth-head">
              <p className="page-kicker">{reviewsPageCopy.traceTitle}</p>
              {selected ? (
                <button type="button" className="text-action" onClick={() => navigate(`/reviews/${selected.id}`)}>
                  {reviewsPageCopy.viewTraceAction}
                  <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
            <div className="reviews-mgo__trace-list">
              {selectedTrace.length > 0 ? (
                selectedTrace.map((entry) => (
                  <div key={entry.id} className="reviews-mgo__trace-row">
                    <span />
                    <div>
                      <strong>{entry.event}</strong>
                      <small>{entry.actor ?? reviewsPageCopy.systemActor} · {entry.stage_id ?? reviewsPageCopy.fallbackGate}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="type-body-sm">{reviewsPageCopy.traceEmpty}</p>
              )}
            </div>
          </section>

          <section className="reviews-mgo__truth-panel">
            <p className="page-kicker">{reviewsPageCopy.runtimeTitle}</p>
            <div className="reviews-mgo__runtime-list reviews-mgo__runtime-list--rail">
              {selectedRuntimeTargets.length > 0 ? (
                selectedRuntimeTargets.map((target) => (
                  <div key={`rail-${target.role}-${target.id}`} className="reviews-mgo__runtime-row">
                    <strong>{target.id}</strong>
                    <span>{target.role}</span>
                    <small>{target.source}</small>
                  </div>
                ))
              ) : (
                <p className="type-body-sm">{reviewsPageCopy.runtimeEmpty}</p>
              )}
            </div>
          </section>

          <section className="reviews-mgo__truth-panel">
            <p className="page-kicker">{reviewsPageCopy.policyTitle}</p>
            <div className="reviews-mgo__policy-list">
              {selectedPolicyRows.map((row) => (
                <div key={`rail-${row.label}`} className={`reviews-mgo__policy-row reviews-mgo__policy-row--${row.tone}`}>
                  <span>{row.value}</span>
                  <small>{row.label}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="reviews-mgo__truth-panel">
            <p className="page-kicker">{reviewsPageCopy.referencesTitle}</p>
            {selectedReferenceRows.length > 0 ? (
              <div className="reviews-mgo__rail-refs">
                {selectedReferenceRows.map((reference) => (
                  <span key={`rail-ref-${reference}`}>{reference}</span>
                ))}
              </div>
            ) : (
              <p className="type-body-sm">{reviewsPageCopy.evidenceEmpty}</p>
            )}
          </section>
        </aside>
      </div>

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
