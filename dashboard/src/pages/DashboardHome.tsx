import { startTransition, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, Network, PanelRightOpen, ScrollText } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDashboardHomeCopy } from '@/lib/dashboardCopy';
import { deriveDashboardHomeMetrics } from '@/lib/dashboardHomeMetrics';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMotionStore } from '@/stores/motionStore';
import { Skeleton } from '@/components/ui/Skeleton';
import { HomeSignalField } from '@/components/ui/HomeSignalField';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { CraftsmanGovernanceSnapshot, Task, TaskStatus } from '@/types/task';

function getProposalTone(state: string) {
  if (state === 'gate_waiting') {
    return 'constraint';
  }
  if (state === 'in_progress') {
    return 'optimize';
  }
  return 'observe';
}

function getProposalToneLabel(
  tone: 'constraint' | 'optimize' | 'observe',
  toneLabels: {
    constraint: string;
    optimize: string;
    observe: string;
  },
) {
  return toneLabels[tone];
}

function formatAuthorityStage(task: Task | null, fallbackStage: string) {
  if (!task) {
    return fallbackStage;
  }

  return task.stageName?.trim() || task.current_stage?.trim() || fallbackStage;
}

function formatAuthorityGate(task: Task | null, fallbackGate: string) {
  if (!task) {
    return fallbackGate;
  }

  return task.gateType?.trim() || fallbackGate;
}

function formatAuthoritySummary(task: Task | null, fallbackSummary: string) {
  if (!task) {
    return fallbackSummary;
  }

  if (task.description?.trim()) {
    return task.description;
  }

  const summaryParts = [
    task.teamLabel?.trim(),
    task.workflowLabel?.trim(),
    formatRelativeTimestamp(task.updated_at),
  ].filter(Boolean);

  return summaryParts.length > 0 ? summaryParts.join(' / ') : fallbackSummary;
}

function buildExecutionLanes(status: TaskStatus | null, task: Task | null, fallbackStage: string) {
  const subtasks = status?.subtasks ?? [];
  if (subtasks.length === 0) {
    if (!task) {
      return [];
    }

    return [
      {
        stageId: task.current_stage ?? fallbackStage,
        items: [
          {
            id: task.id,
            title: task.title,
            assignee: task.teamLabel,
            status: task.state,
          },
        ],
      },
    ];
  }

  const lanes = new Map<
    string,
    {
      stageId: string;
      items: Array<{ id: string; title: string; assignee: string; status: string }>;
    }
  >();

  subtasks.forEach((subtask) => {
    const stageId = subtask.stage_id?.trim() || fallbackStage;
    if (!lanes.has(stageId)) {
      lanes.set(stageId, { stageId, items: [] });
    }

    lanes.get(stageId)?.items.push({
      id: subtask.id,
      title: subtask.title,
      assignee: subtask.assignee,
      status: subtask.status,
    });
  });

  return [...lanes.values()];
}

function buildOperationalLines(status: TaskStatus | null, task: Task | null, fallbackStage: string) {
  const flowEntries =
    status?.flow_log.map((entry) => ({
      id: `flow-${entry.id}`,
      prefix: 'FLOW',
      title: entry.event,
      meta: entry.stage_id ?? fallbackStage,
      body: entry.detail ?? entry.event,
      createdAt: entry.created_at,
    })) ?? [];

  const progressEntries =
    status?.progress_log.map((entry) => ({
      id: `progress-${entry.id}`,
      prefix: 'LOG',
      title: entry.actor,
      meta: entry.stage_id ?? fallbackStage,
      body: entry.content,
      createdAt: entry.created_at,
    })) ?? [];

  const merged = [...flowEntries, ...progressEntries].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  if (merged.length > 0) {
    return merged.slice(0, 8);
  }

  if (!task) {
    return [];
  }

  return [
    {
      id: `task-${task.id}`,
      prefix: 'TASK',
      title: task.id,
      meta: task.current_stage ?? fallbackStage,
      body: task.description ?? task.workflowLabel,
      createdAt: task.updated_at,
    },
  ];
}

function formatGovernanceMemoryValue(governanceSnapshot: CraftsmanGovernanceSnapshot | null) {
  const host = governanceSnapshot?.host;
  if (!host) {
    return '—';
  }
  if (host.platform === 'darwin' && host.memoryPressure != null) {
    return `${Math.round(host.memoryPressure * 100)}% pressure`;
  }
  if (host.memoryUtilization != null) {
    return `${Math.round(host.memoryUtilization * 100)}%`;
  }
  return '—';
}

export function DashboardHome() {
  const { t } = useTranslation();
  const homeCopy = useDashboardHomeCopy();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const motionMode = useMotionStore((state) => state.mode);
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const resolveReview = useTaskStore((state) => state.resolveReview);
  const selectTask = useTaskStore((state) => state.selectTask);
  const selectedTaskStatus = useTaskStore((state) => state.selectedTaskStatus);
  const governanceSnapshot = useTaskStore((state) => state.governanceSnapshot ?? null);
  const healthSnapshot = useTaskStore((state) => state.healthSnapshot ?? null);
  const refreshInterval = useSettingsStore((state) => state.refreshInterval);
  const pauseOnHidden = useSettingsStore((state) => state.pauseOnHidden);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const [reviewIndex, setReviewIndex] = useState(0);
  const [railTaskId, setRailTaskId] = useState<string | null>(null);
  const [summaryReady, setSummaryReady] = useState(false);
  const [railReady, setRailReady] = useState(false);

  useEffect(() => {
    if (tasks.length === 0 && !loading && !error) {
      void fetchTasks();
    }
  }, [error, fetchTasks, loading, tasks.length]);

  useEffect(() => {
    if (refreshInterval <= 0) {
      return undefined;
    }

    const refreshHomeTasks = () => {
      if (pauseOnHidden && document.hidden) {
        return;
      }
      if (loading) {
        return;
      }
      void fetchTasks();
    };

    const intervalId = window.setInterval(refreshHomeTasks, refreshInterval * 1000);
    document.addEventListener('visibilitychange', refreshHomeTasks);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshHomeTasks);
    };
  }, [fetchTasks, loading, pauseOnHidden, refreshInterval]);

  useEffect(() => {
    const summaryTimerId = window.setTimeout(() => {
      startTransition(() => setSummaryReady(true));
    }, 120);
    const railTimerId = window.setTimeout(() => {
      startTransition(() => setRailReady(true));
    }, 420);

    return () => {
      window.clearTimeout(summaryTimerId);
      window.clearTimeout(railTimerId);
    };
  }, []);

  const homeMetrics = useMemo(
    () => deriveDashboardHomeMetrics(tasks, homeCopy.latestCompletedFallback, governanceSnapshot),
    [governanceSnapshot, homeCopy.latestCompletedFallback, tasks],
  );

  const reviewItems = homeMetrics.reviewItems;
  const currentReviewIndex =
    reviewItems.length === 0 ? 0 : Math.min(reviewIndex, reviewItems.length - 1);
  const focusReview = reviewItems[currentReviewIndex] ?? null;
  const railTasks = useMemo(() => {
    const activeTasks = homeMetrics.recentTasks.filter((task) =>
      ['in_progress', 'gate_waiting', 'paused', 'blocked'].includes(task.state),
    );
    return (activeTasks.length > 0 ? activeTasks : homeMetrics.recentTasks).slice(0, 5);
  }, [homeMetrics.recentTasks]);
  const visibleRailTasks = summaryReady ? railTasks : railTasks.slice(0, 3);
  const loadPercent = homeMetrics.recentTasks.length === 0
    ? 0
    : Math.min(
        92,
        Math.round(((homeMetrics.activeCount * 2 + homeMetrics.waitingCount) / Math.max(homeMetrics.recentTasks.length, 1)) * 34),
      );
  const canResolveReview = Boolean(focusReview);
  const authorityStage = focusReview
    ? formatAuthorityStage(focusReview, homeCopy.resolutionFallbacks.stage)
    : homeCopy.resolutionEmptyValue;
  const authorityGate = focusReview
    ? formatAuthorityGate(focusReview, homeCopy.resolutionFallbacks.gate)
    : homeCopy.resolutionEmptyValue;
  const authorityTitle = focusReview?.title ?? homeCopy.resolutionEmptyTitle;
  const authoritySummary = focusReview
    ? formatAuthoritySummary(focusReview, homeCopy.resolutionFallbacks.summary)
    : homeCopy.resolutionEmptySummary;
  const selectedRailTask = railTaskId
    ? railTasks.find((task) => task.id === railTaskId) ?? null
    : null;
  const railStatus = selectedRailTask && selectedTaskStatus?.task.id === selectedRailTask.id ? selectedTaskStatus : null;
  const executionLanes = useMemo(
    () => (railReady
      ? buildExecutionLanes(railStatus, selectedRailTask, homeCopy.taskRailLabels.stageFallback)
      : []),
    [homeCopy.taskRailLabels.stageFallback, railReady, railStatus, selectedRailTask],
  );
  const runtimeLines = useMemo(
    () => (railReady
      ? buildOperationalLines(railStatus, selectedRailTask, homeCopy.taskRailLabels.stageFallback)
      : []),
    [homeCopy.taskRailLabels.stageFallback, railReady, railStatus, selectedRailTask],
  );
  const selectedRailSummaryParts = selectedRailTask
    ? [
        selectedRailTask.teamLabel?.trim(),
        selectedRailTask.workflowLabel?.trim(),
        formatRelativeTimestamp(selectedRailTask.updated_at),
      ].filter(Boolean)
    : [];
  const heroStrips = [
    {
      key: 'pending',
      label: homeCopy.heroStackLabels.pending,
      body: focusReview
        ? homeCopy.heroBriefs.pending(homeMetrics.waitingCount, focusReview.title)
        : homeCopy.heroBriefs.idle(),
      value: `${homeMetrics.waitingCount}${homeCopy.reviewCountUnit}`,
      toneClass: homeMetrics.waitingCount > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'active',
      label: homeCopy.heroStackLabels.active,
      body: homeCopy.heroBriefs.active(homeMetrics.activeCount, homeMetrics.activeExecutions),
      value: `${homeMetrics.activeExecutions}`,
      toneClass: homeMetrics.activeExecutions > 0 || homeMetrics.activeCount > 0 ? 'info' : 'neutral',
    },
    {
      key: 'governance',
      label: homeCopy.heroStackLabels.governance,
      body: homeCopy.heroBriefs.governance(healthSnapshot?.runtime.status ?? '—', homeMetrics.hostLoadLabel),
      value: healthSnapshot?.runtime.status ?? '—',
      toneClass: healthSnapshot?.runtime.status === 'healthy' ? 'success' : 'warning',
    },
  ];

  const handleSelectRailTask = async (taskId: string) => {
    setRailTaskId(taskId);
    await selectTask(taskId);
  };

  const handleReviewDecision = async (decision: 'approve' | 'reject') => {
    if (!focusReview) {
      return;
    }

    try {
      await resolveReview(focusReview.id, decision, '');
      showMessage(
        decision === 'approve' ? t('feedback.reviewApproveTitle') : t('feedback.reviewRejectTitle'),
        decision === 'approve' ? t('feedback.reviewApproveDetail') : t('feedback.reviewRejectDetail'),
        'success',
      );
    } catch (reviewError) {
      showMessage(
        t('feedback.reviewFailureTitle'),
        reviewError instanceof Error ? reviewError.message : String(reviewError),
        'warning',
      );
    }
  };

  const handleSynthesis = async () => {
    if (!focusReview) {
      navigate('/reviews');
      return;
    }
    await selectTask(focusReview.id);
    navigate(`/reviews/${focusReview.id}`);
  };

  const shiftReview = (direction: 'previous' | 'next') => {
    if (reviewItems.length === 0) {
      return;
    }

    setReviewIndex(() => {
      if (direction === 'previous') {
        return currentReviewIndex === 0 ? reviewItems.length - 1 : currentReviewIndex - 1;
      }
      return currentReviewIndex === reviewItems.length - 1 ? 0 : currentReviewIndex + 1;
    });
  };

  return (
    <div className="home-os">
      <section className="home-os__grid">
        <article className="home-os__main-column surface-panel surface-panel--workspace">
          <div className="home-os__hero">
            <div className="home-os__hero-block">
              <p className="page-kicker">{homeCopy.kicker}</p>
              <h2 className="home-os__display">{homeCopy.title}</h2>
              <p className="home-os__signature">{homeCopy.architectureLabel}</p>
              <div className="home-os__visual-zone">
                <HomeSignalField testId="home-signal-field" />
              </div>
            </div>
            <div className="home-os__hero-block home-os__hero-block--copy">
              <div className="home-os__hero-summary">
                <p className="page-kicker">{homeCopy.heroStatusLabel}</p>
                <div className="home-os__orbital-stack">
                  {heroStrips.map((strip, index) => (
                    <motion.article
                      key={strip.key}
                      className={`home-os__orbital-readout home-os__orbital-readout--${strip.key}`}
                      initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: 'blur(0px)',
                      }}
                      transition={{
                        duration: motionMode === 'full' ? 0.56 : 0.32,
                        delay: index * 0.08,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <div className="home-os__orbital-copy">
                        <p className="home-os__orbital-label">{strip.label}</p>
                        <p className="home-os__orbital-body">{strip.body}</p>
                      </div>
                      <div className="home-os__orbital-core" aria-hidden="true">
                        <motion.span
                          className="home-os__orbital-ring home-os__orbital-ring--outer"
                          animate={
                            motionMode === 'full'
                              ? { scale: [0.96, 1.04, 0.96], opacity: [0.24, 0.52, 0.24], rotate: [0, 18, 0] }
                              : { scale: 1, opacity: 0.28, rotate: 0 }
                          }
                          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.span
                          className="home-os__orbital-ring home-os__orbital-ring--inner"
                          animate={
                            motionMode === 'full'
                              ? { scale: [1.02, 0.96, 1.02], opacity: [0.4, 0.72, 0.4], rotate: [0, -24, 0] }
                              : { scale: 1, opacity: 0.46, rotate: 0 }
                          }
                          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.span
                          className="home-os__orbital-core-dot"
                          animate={
                            motionMode === 'full'
                              ? { scale: [0.92, 1.08, 0.92], opacity: [0.72, 1, 0.72] }
                              : { scale: 1, opacity: 0.82 }
                          }
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <span className={`home-os__orbital-value home-os__orbital-value--${strip.toneClass}`}>{strip.value}</span>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </div>
              <div className="home-os__header-actions">
                <Link to="/tasks" className="button-primary">
                  {homeCopy.primaryAction}
                  <ArrowRight size={16} />
                </Link>
                <Link to="/reviews" className="button-secondary">
                  {homeCopy.secondaryAction}
                </Link>
                <Link to="/agents" className="button-secondary">
                  {homeCopy.tertiaryAction}
                </Link>
              </div>
            </div>
          </div>

          {error ? (
            <div role="alert" className="inline-alert inline-alert--danger home-os__error">{homeCopy.syncErrorMessage}</div>
          ) : null}

          <div className="home-os__main-section">
            <div className="home-os__module-head">
              <div>
                <p className="home-os__section-index">{homeCopy.sectionLabels.archon}</p>
                <p className="page-kicker">{homeCopy.commandAuthorityLabel}</p>
              </div>
              <div className="home-os__review-deck-controls">
                <span className="status-pill status-pill--info">
                  {homeMetrics.waitingCount}
                  {homeCopy.reviewCountUnit}
                </span>
                <button
                  type="button"
                  className="home-os__deck-button"
                  onClick={() => shiftReview('previous')}
                  disabled={reviewItems.length <= 1}
                  aria-label={homeCopy.reviewDeck.previous}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="home-os__deck-position">
                  {homeCopy.reviewDeck.position} {reviewItems.length === 0 ? '0 / 0' : `${currentReviewIndex + 1} / ${reviewItems.length}`}
                </span>
                <button
                  type="button"
                  className="home-os__deck-button"
                  onClick={() => shiftReview('next')}
                  disabled={reviewItems.length <= 1}
                  aria-label={homeCopy.reviewDeck.next}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="home-os__authority surface-panel surface-panel--muted">
              <p className="page-kicker home-os__authority-kicker">{homeCopy.pendingResolutionLabel}</p>
              <h3 className="home-os__authority-title">{authorityTitle}</h3>
              <div className="home-os__authority-grid">
                <div className="home-os__authority-stat">
                  <span className="page-kicker">{homeCopy.resolutionMeta.gate}</span>
                  <strong>{authorityGate}</strong>
                </div>
                <div className="home-os__authority-stat">
                  <span className="page-kicker">{homeCopy.resolutionMeta.stage}</span>
                  <strong>{authorityStage}</strong>
                </div>
              </div>
              <p className="type-body-sm">{authoritySummary}</p>
              <div className="home-os__authority-actions">
                <button type="button" className="button-primary" disabled={!canResolveReview} onClick={() => void handleReviewDecision('approve')}>
                  {homeCopy.resolutionActions.authorize}
                </button>
                <button type="button" className="button-danger" disabled={!canResolveReview} onClick={() => void handleReviewDecision('reject')}>
                  {homeCopy.resolutionActions.veto}
                </button>
                <button type="button" className="button-secondary home-os__authority-secondary" onClick={() => void handleSynthesis()}>
                  {homeCopy.resolutionActions.synthesize}
                </button>
              </div>
            </div>

            {summaryReady ? (
              <div className="home-os__load surface-panel surface-panel--muted page-transition">
                <div className="home-os__module-head">
                  <p className="page-kicker">{homeCopy.systemLoadLabel}</p>
                  <span className="home-os__load-value">{homeCopy.loadReadoutLabel}: {loadPercent}%</span>
                </div>
                <div className="home-os__load-bar">
                  <div className="home-os__load-fill" style={{ '--load-width': `${loadPercent}%` } as CSSProperties} />
                  <div className="home-os__load-marker" style={{ '--load-width': `${loadPercent}%` } as CSSProperties} />
                </div>

                <div className="home-os__metrics">
                  <div className="inline-stat">
                    <span className="inline-stat__label">{homeCopy.metricLabels.active}</span>
                    <span className="inline-stat__value">{homeMetrics.activeCount}</span>
                  </div>
                  <div className="inline-stat">
                    <span className="inline-stat__label">{homeCopy.metricLabels.waiting}</span>
                    <span className="inline-stat__value">{homeMetrics.waitingCount}</span>
                  </div>
                  <div className="inline-stat">
                    <span className="inline-stat__label">{homeCopy.metricLabels.latestCompleted}</span>
                    <span className="inline-stat__value">{homeMetrics.latestCompletedLabel}</span>
                  </div>
                  <div className="inline-stat">
                    <span className="inline-stat__label">{homeCopy.metricLabels.activeExecutions}</span>
                    <span className="inline-stat__value">{homeMetrics.activeExecutions}</span>
                  </div>
                  <div className="inline-stat">
                    <span className="inline-stat__label">{homeCopy.metricLabels.hostLoad}</span>
                    <span className="inline-stat__value">{homeMetrics.hostLoadLabel}</span>
                  </div>
                </div>
                <p className="home-os__load-note">{homeCopy.loadEstimateNote}</p>
              </div>
            ) : (
              <div className="home-os__summary-loading" aria-hidden="true">
                <Skeleton variant="row" />
                <Skeleton variant="card" />
              </div>
            )}
          </div>
        </article>

        <aside className="home-os__rail-column">
          <article className="home-os__rail-panel surface-panel surface-panel--workspace">
            <div className="home-os__module-head">
              <div>
                <p className="home-os__section-index">{homeCopy.sectionLabels.agora}</p>
                <p className="page-kicker">{homeCopy.topologyLabel}</p>
              </div>
              <span className="status-pill status-pill--neutral">{railTasks.length}</span>
            </div>

            <div className="home-os__task-selector">
              {loading
                ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} variant="card" />)
               : visibleRailTasks.length === 0
                  ? <p className="type-body-sm">{homeCopy.feedEmpty}</p>
                  : visibleRailTasks.map((task) => {
                    const tone = getProposalTone(task.state);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={task.id === selectedRailTask?.id ? 'home-os__task-chip home-os__task-chip--active' : 'home-os__task-chip'}
                        onClick={() => void handleSelectRailTask(task.id)}
                      >
                        <div className="home-os__task-chip-stack">
                          <div className="home-os__proposal-head">
                            <div>
                              <p className="home-os__proposal-title">{task.title}</p>
                              <p className="type-mono-sm">{task.id}</p>
                            </div>
                            <span className={`home-os__proposal-stance home-os__proposal-stance--${tone}`}>
                              {getProposalToneLabel(tone, homeCopy.proposalToneLabels)}
                            </span>
                          </div>
                          <p className="home-os__task-chip-context">{task.teamLabel} / {task.workflowLabel}</p>
                          <div className="home-os__proposal-meta">
                            <span>{task.stageName ?? task.current_stage ?? homeCopy.taskRailLabels.stageFallback}</span>
                            <span>{formatRelativeTimestamp(task.updated_at)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
            </div>

            <div className="home-os__section-divider" />

            {railReady && selectedRailTask ? (
              <>
                {isMobile ? (
                  <section className="home-os__rail-summary">
                    <div className="home-os__module-head home-os__module-head--compact">
                      <div>
                        <p className="home-os__section-index">{homeCopy.sectionLabels.pipeline}</p>
                        <p className="page-kicker">{homeCopy.taskRailLabels.selectedTask}</p>
                      </div>
                      <span className="status-pill status-pill--info">
                        {selectedRailTask.stageName ?? selectedRailTask.current_stage ?? homeCopy.taskRailLabels.stageFallback}
                      </span>
                    </div>
                    <div className="home-os__task-chip-stack">
                      <div className="home-os__proposal-head">
                        <div>
                          <p className="home-os__proposal-title">{selectedRailTask.title}</p>
                          <p className="type-mono-sm">{selectedRailTask.id}</p>
                        </div>
                        <span className={`home-os__proposal-stance home-os__proposal-stance--${getProposalTone(selectedRailTask.state)}`}>
                          {getProposalToneLabel(getProposalTone(selectedRailTask.state), homeCopy.proposalToneLabels)}
                        </span>
                      </div>
                      <p className="home-os__task-chip-context">{selectedRailSummaryParts.join(' / ')}</p>
                      <div className="home-os__proposal-meta">
                        <span>{selectedRailTask.gateType ?? homeCopy.resolutionFallbacks.gate}</span>
                        <span>{formatRelativeTimestamp(selectedRailTask.updated_at)}</span>
                      </div>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="home-os__rail-block">
                      <div className="home-os__module-head">
                        <div>
                          <p className="home-os__section-index">{homeCopy.sectionLabels.pipeline}</p>
                          <p className="page-kicker">{homeCopy.taskRailLabels.executionLoop}</p>
                        </div>
                        <Network size={16} className="home-os__rail-icon" />
                      </div>

                      <div className="home-os__dag-board">
                        {executionLanes.map((lane) => (
                          <div key={lane.stageId} className="home-os__dag-stage">
                            <p className="home-os__dag-stage-label">{lane.stageId}</p>
                            <div className="home-os__dag-stage-items">
                              {lane.items.map((item) => (
                                <div key={item.id} className="home-os__dag-node">
                                  <strong>{item.title}</strong>
                                  <span>{item.assignee}</span>
                                  <span className="home-os__dag-node-status">{item.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="home-os__rail-block home-os__rail-block--terminal">
                      <div className="home-os__module-head">
                        <div>
                          <p className="home-os__section-index">{homeCopy.sectionLabels.pipeline}</p>
                          <p className="page-kicker">{homeCopy.terminalLabel}</p>
                        </div>
                        <ScrollText size={16} className="home-os__rail-icon" />
                      </div>

                      <div className="home-os__module-head">
                        <h3 className="section-title">{homeCopy.taskRailLabels.runtimeLog}</h3>
                        <span className="status-pill status-pill--info">{homeCopy.terminalStatusPrefix}</span>
                      </div>

                      <div className="home-os__terminal">
                        {runtimeLines.length === 0 ? (
                          <p className="type-body-sm">{homeCopy.taskRailLabels.logEmpty}</p>
                        ) : (
                          runtimeLines.map((line, index) => (
                            <div key={line.id} className="home-os__terminal-line terminal-entry">
                              <span className="home-os__terminal-prefix">[{String(index + 1).padStart(2, '0')}]</span>
                              <div className="home-os__terminal-body">
                                <div className="home-os__terminal-head">
                                  <span className="home-os__terminal-token">{line.prefix}</span>
                                  <span>{line.title}</span>
                                  <span className="home-os__terminal-meta">{line.meta}</span>
                                </div>
                                <span>{line.body}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  </>
                )}
              </>
            ) : (
              <div className="home-os__rail-empty">
                {railReady ? (
                  <p className="type-body-sm">
                    {visibleRailTasks.length > 0
                      ? homeCopy.taskRailLabels.focusPrompt
                      : homeCopy.taskRailLabels.taskEmpty}
                  </p>
                ) : (
                  <div className="home-os__rail-loading">
                    <Skeleton variant="card" />
                    <Skeleton variant="card" />
                  </div>
                )}
              </div>
            )}

            {summaryReady ? (
              <div className="space-y-4 page-transition">
                <div className="home-os__telemetry-strip">
                  <div className="home-os__telemetry-readout">
                    <span className="home-os__telemetry-label">{homeCopy.metricLabels.participants}</span>
                    <strong className="home-os__telemetry-value">{homeMetrics.participantCount}</strong>
                  </div>
                </div>
                {governanceSnapshot ? (
                  <section className="surface-panel surface-panel--muted">
                    <div className="home-os__module-head">
                      <div>
                        <p className="home-os__section-index">{homeCopy.governance.kicker}</p>
                        <p className="page-kicker">{homeCopy.governance.title}</p>
                      </div>
                      <span className="status-pill status-pill--info">{homeMetrics.activeExecutions}</span>
                    </div>
                    <div className="task-authority__facts mt-4">
                      <div className="detail-card">
                        <PanelRightOpen size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.metricLabels.activeExecutions}</span>
                        <strong className="detail-card__value">{homeMetrics.activeExecutions}</strong>
                      </div>
                      <div className="detail-card">
                        <Clock3 size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.metricLabels.hostLoad}</span>
                        <strong className="detail-card__value">{homeMetrics.hostLoadLabel}</strong>
                      </div>
                      <div className="detail-card">
                        <Clock3 size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.governance.hostMemory}</span>
                        <strong className="detail-card__value">
                          {formatGovernanceMemoryValue(governanceSnapshot)}
                        </strong>
                      </div>
                      <div className="detail-card">
                        <Network size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.governance.pressureStatus}</span>
                        <strong className="detail-card__value">{governanceSnapshot.hostPressureStatus}</strong>
                      </div>
                      <div className="detail-card">
                        <Network size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.governance.runtimeStatus}</span>
                        <strong className="detail-card__value">{healthSnapshot?.runtime.status ?? '—'}</strong>
                      </div>
                      <div className="detail-card">
                        <Network size={16} className="detail-card__icon" />
                        <span className="detail-card__label">{homeCopy.governance.escalationStatus}</span>
                        <strong className="detail-card__value">{healthSnapshot?.escalation.status ?? '—'}</strong>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="field-label">{homeCopy.governance.assigneeTitle}</p>
                      {governanceSnapshot.activeByAssignee.length > 0 ? (
                        <ul className="space-y-2">
                          {governanceSnapshot.activeByAssignee.map((item) => (
                            <li key={item.assignee} className="data-row">
                              <span className="type-mono-xs">{item.assignee}</span>
                              <span className="status-pill status-pill--neutral">{item.count}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="type-body-sm">{homeCopy.governance.emptyAssignee}</p>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="field-label">{homeCopy.governance.warningsTitle}</p>
                      {(governanceSnapshot.warnings ?? []).length > 0 ? (
                        <ul className="space-y-2">
                          {(governanceSnapshot.warnings ?? []).map((warning) => (
                            <li key={warning} className="data-row">
                              <span className="type-body-sm">{warning}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="type-body-sm">{homeCopy.governance.emptyWarnings}</p>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="field-label">{homeCopy.governance.executionDetailsTitle}</p>
                      {(governanceSnapshot.activeExecutionDetails ?? []).length > 0 ? (
                        <ul className="space-y-2">
                          {(governanceSnapshot.activeExecutionDetails ?? []).slice(0, 4).map((detail) => (
                            <li key={detail.executionId} className="data-row">
                              <div className="min-w-0 flex-1">
                                <p className="type-mono-xs">{detail.executionId}</p>
                                <p className="type-text-xs mt-1">
                                  {detail.assignee}
                                  {' / '}
                                  {detail.adapter}
                                  {' / '}
                                  {detail.status}
                                </p>
                              </div>
                              <span className="status-pill status-pill--neutral">{detail.subtaskId}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="type-body-sm">{homeCopy.governance.emptyExecutionDetails}</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </article>
        </aside>
      </section>
    </div>
  );
}
