import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  Gauge,
  Network,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDashboardHomeCopy } from '@/lib/dashboardCopy';
import { deriveDashboardHomeMetrics } from '@/lib/dashboardHomeMetrics';
import { buildProjectTaskHref, buildProjectWorkHref } from '@/lib/projectTaskRoutes';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Skeleton } from '@/components/ui/Skeleton';
import { HomeSignalField } from '@/components/ui/HomeSignalField';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { CraftsmanGovernanceSnapshot, Task, TaskStatus } from '@/types/task';

const ACTIVE_HOME_STATES = new Set(['in_progress', 'gate_waiting', 'paused', 'blocked']);
const PROJECT_STATE_RANK = {
  gate_waiting: 0,
  blocked: 1,
  in_progress: 2,
  paused: 3,
  completed: 4,
  failed: 5,
  cancelled: 6,
  pending: 7,
} satisfies Record<Task['state'], number>;

function isReviewActionable(task: Task | null, sessionAccountId: number | null) {
  if (!task) {
    return false;
  }

  if (task.gateType !== 'approval') {
    return false;
  }

  const approverAccountId = task.authority?.approverAccountId ?? null;
  return sessionAccountId != null && approverAccountId === sessionAccountId;
}

function getPriorityTone(task: Task) {
  if (task.priority === 'high' || task.state === 'gate_waiting') {
    return 'critical';
  }
  if (task.priority === 'normal' || task.state === 'in_progress') {
    return 'warning';
  }
  return 'info';
}

function getProjectTone(task: Task) {
  if (task.state === 'gate_waiting') {
    return 'critical';
  }
  if (task.state === 'in_progress') {
    return 'active';
  }
  if (task.state === 'blocked' || task.state === 'failed') {
    return 'warning';
  }
  return 'planned';
}

function getProgressValue(task: Task) {
  switch (task.state) {
    case 'completed':
      return 100;
    case 'gate_waiting':
      return 68;
    case 'in_progress':
      return 55;
    case 'paused':
      return 42;
    case 'blocked':
      return 26;
    default:
      return 18;
  }
}

function fillStyle(value: number | string): CSSProperties {
  const fill = typeof value === 'number' ? `${value}%` : value;
  return { '--fill': fill } as CSSProperties;
}

function toTracePercent(value: number, scale: number) {
  return `${Math.max(8, Math.min(100, Math.round(value * scale)))}%`;
}

function buildAuditTrail(
  selectedStatus: TaskStatus | null,
  focusTask: Task | null,
  fallbackSummary: string,
) {
  const flowEntries =
    selectedStatus?.flow_log.map((entry) => ({
      id: `flow-${entry.id}`,
      title: entry.event,
      actor: entry.actor ?? 'system',
      time: formatRelativeTimestamp(entry.created_at),
      createdAt: entry.created_at,
      tone:
        entry.kind === 'transition'
          ? 'success'
          : entry.kind === 'warning'
            ? 'warning'
            : 'info',
    })) ?? [];

  const progressEntries =
    selectedStatus?.progress_log.map((entry) => ({
      id: `progress-${entry.id}`,
      title: entry.content,
      actor: entry.actor,
      time: formatRelativeTimestamp(entry.created_at),
      createdAt: entry.created_at,
      tone: 'neutral',
    })) ?? [];

  const merged = [...flowEntries, ...progressEntries]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);

  if (merged.length > 0) {
    return merged;
  }

  if (!focusTask) {
    return [];
  }

  return [
    {
      id: focusTask.id,
      title: fallbackSummary,
      actor: focusTask.creator,
      time: formatRelativeTimestamp(focusTask.updated_at),
      tone: 'info',
    },
  ];
}

function buildReferenceIntegrity(
  governanceSnapshot: CraftsmanGovernanceSnapshot | null,
  healthSnapshot: {
    runtime?: { status: string } | null;
    im?: { activeBindings: number } | null;
    tasks?: { totalTasks: number } | null;
    host?: { status: string } | null;
  } | null,
) {
  const runtimeWarnings = governanceSnapshot?.warnings.length ?? 0;
  return {
    taskRecords: healthSnapshot?.tasks?.totalTasks ?? 0,
    runtimeWarnings,
    hostPressure: governanceSnapshot?.hostPressureStatus ?? healthSnapshot?.host?.status ?? 'unknown',
    bridgeBindings: healthSnapshot?.im?.activeBindings ?? 0,
    runtimeStatus: healthSnapshot?.runtime?.status ?? 'unknown',
  };
}

function buildActiveProjectCards(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    const key = task.projectId ?? `task:${task.id}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  return [...groups.entries()]
    .map(([key, projectTasks]) => {
      const sortedTasks = [...projectTasks].sort((left, right) => {
        const stateDelta = PROJECT_STATE_RANK[left.state] - PROJECT_STATE_RANK[right.state];
        if (stateDelta !== 0) {
          return stateDelta;
        }
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      });
      const focusTask = sortedTasks[0];
      return {
        key,
        projectId: focusTask.projectId,
        title: focusTask.projectId ?? focusTask.workflowLabel,
        summary: focusTask.description,
        taskCount: projectTasks.length,
        focusTask,
        updatedAt: sortedTasks.reduce(
          (latest, task) => (new Date(task.updated_at).getTime() > new Date(latest).getTime() ? task.updated_at : latest),
          focusTask.updated_at,
        ),
      };
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 4);
}

function buildCapabilityItems(
  homeMetrics: ReturnType<typeof deriveDashboardHomeMetrics>,
  governanceSnapshot: CraftsmanGovernanceSnapshot | null,
  healthSnapshot: {
    runtime?: { status: string; activeSessions: number } | null;
    im?: { status: string; activeBindings: number } | null;
    tasks?: { totalTasks: number } | null;
  } | null,
  homeCopy: ReturnType<typeof useDashboardHomeCopy>,
) {
  return [
    {
      key: 'governance',
      label: homeCopy.capabilityStrip.governance,
      value: `${homeMetrics.waitingCount} ${homeCopy.capabilityStrip.items}`,
      tone: homeMetrics.waitingCount > 0 ? 'warning' : 'success',
    },
    {
      key: 'targets',
      label: homeCopy.capabilityStrip.runtimeTargets,
      value: `${healthSnapshot?.runtime?.activeSessions ?? 0} ${homeCopy.capabilityStrip.healthy}`,
      tone: healthSnapshot?.runtime?.status === 'healthy' ? 'success' : 'warning',
    },
    {
      key: 'bridges',
      label: homeCopy.capabilityStrip.bridges,
      value: `${healthSnapshot?.im?.activeBindings ?? 0} ${homeCopy.capabilityStrip.healthy}`,
      tone: healthSnapshot?.im?.status === 'healthy' ? 'success' : 'warning',
    },
    {
      key: 'policies',
      label: homeCopy.capabilityStrip.policies,
      value: `${healthSnapshot?.tasks?.totalTasks ?? 0} ${homeCopy.capabilityStrip.active}`,
      tone: homeMetrics.waitingCount > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'participants',
      label: homeCopy.capabilityStrip.participants,
      value: `${homeMetrics.participantCount} ${homeCopy.capabilityStrip.online}`,
      tone: (governanceSnapshot?.activeByAssignee.length ?? 0) > 0 ? 'success' : 'neutral',
    },
  ];
}

export function DashboardHome() {
  const { t, i18n } = useTranslation();
  const homeCopy = useDashboardHomeCopy();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1180px)');
  const sessionAccountId = useSessionStore((state) => state.accountId);
  const sessionUsername = useSessionStore((state) => state.username);
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
  const [selectedFocusTaskId, setSelectedFocusTaskId] = useState<string | null>(null);
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
    const summaryTimerId = window.setTimeout(() => setSummaryReady(true), 120);
    const railTimerId = window.setTimeout(() => setRailReady(true), 300);

    return () => {
      window.clearTimeout(summaryTimerId);
      window.clearTimeout(railTimerId);
    };
  }, []);

  const homeMetrics = useMemo(
    () => deriveDashboardHomeMetrics(tasks, homeCopy.latestCompletedFallback, governanceSnapshot),
    [governanceSnapshot, homeCopy.latestCompletedFallback, tasks],
  );

  const activeTasks = useMemo(
    () => homeMetrics.recentTasks.filter((task) => ACTIVE_HOME_STATES.has(task.state)),
    [homeMetrics.recentTasks],
  );
  const reviewItems = homeMetrics.reviewItems;
  const actionableReviewItems = useMemo(
    () => reviewItems.filter((task) => isReviewActionable(task, sessionAccountId)),
    [reviewItems, sessionAccountId],
  );
  const prioritizedActions = [...actionableReviewItems, ...reviewItems.filter((task) => !actionableReviewItems.some((item) => item.id === task.id))]
    .slice(0, 4);
  const focusTask = useMemo(() => {
    if (selectedFocusTaskId) {
      return activeTasks.find((task) => task.id === selectedFocusTaskId) ?? null;
    }
    return activeTasks[0] ?? homeMetrics.recentTasks[0] ?? null;
  }, [activeTasks, homeMetrics.recentTasks, selectedFocusTaskId]);
  const focusTaskStatus = focusTask && selectedTaskStatus?.task.id === focusTask.id ? selectedTaskStatus : null;
  const reviewFocus = prioritizedActions[0] ?? null;
  const activeProjectCards = useMemo(
    () => buildActiveProjectCards(activeTasks.length > 0 ? activeTasks : homeMetrics.recentTasks),
    [activeTasks, homeMetrics.recentTasks],
  );
  const auditTrail = buildAuditTrail(focusTaskStatus, focusTask, homeCopy.auditTrailFallback);
  const referenceIntegrity = buildReferenceIntegrity(governanceSnapshot, healthSnapshot);
  const capabilityItems = buildCapabilityItems(homeMetrics, governanceSnapshot, healthSnapshot, homeCopy);
  const focusHref = focusTask ? buildProjectTaskHref(focusTask.id, focusTask.projectId) : '/projects';
  const focusWorkspaceHref = focusTask ? buildProjectWorkHref(focusTask.projectId) : '/projects';
  const focusSelectionTags = (focusTask?.teamMembers ?? []).slice(0, 5);
  const runtimeTruthSignals = [
    {
      key: 'sessions',
      label: homeCopy.runtimeTruth.liveSessions,
      value: healthSnapshot?.runtime.activeSessions ?? 0,
      width: toTracePercent(healthSnapshot?.runtime.activeSessions ?? 0, 4),
    },
    {
      key: 'agents',
      label: homeCopy.runtimeTruth.activeAgents,
      value: homeMetrics.participantCount,
      width: toTracePercent(homeMetrics.participantCount, 18),
    },
    {
      key: 'executions',
      label: homeCopy.runtimeTruth.sloCompliance,
      value: governanceSnapshot?.activeExecutions ?? 0,
      width: toTracePercent(governanceSnapshot?.activeExecutions ?? 0, 16),
    },
  ];
  const nowLabel = new Intl.DateTimeFormat(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date());

  useEffect(() => {
    if (!focusTask || selectedTaskStatus?.task.id === focusTask.id) {
      return;
    }

    void selectTask(focusTask.id);
  }, [focusTask, selectTask, selectedTaskStatus?.task.id]);

  const handleReviewDecision = async (task: Task | null, decision: 'approve' | 'reject') => {
    if (!task) {
      return;
    }

    if (!isReviewActionable(task, sessionAccountId)) {
      return;
    }

    try {
      await resolveReview(task.id, decision, '');
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

  const handleSelectFocusTask = async (taskId: string) => {
    setSelectedFocusTaskId(taskId);
    await selectTask(taskId);
  };

  return (
    <div className="home-mgo interior-page">
      <section className="home-mgo__hero surface-panel surface-panel--workspace">
        <div className="home-mgo__hero-copy">
          <p className="page-kicker">{homeCopy.hero.greetingKicker}</p>
          <h1 className="home-mgo__hero-title">
            {homeCopy.hero.greetingTitle(sessionUsername || homeCopy.hero.fallbackName)}
          </h1>
          <p className="type-body-lg home-mgo__hero-summary">{homeCopy.hero.summary}</p>
          <p className="type-text-sm home-mgo__hero-time">{nowLabel}</p>
        </div>

        <div className="home-mgo__hero-signal">
          <HomeSignalField testId="home-signal-field" className="home-mgo__signal-field" />
        </div>

        <div className="home-mgo__posture">
          <div className="home-mgo__posture-head">
            <p className="page-kicker">{homeCopy.posture.kicker}</p>
            <span className={`status-pill ${healthSnapshot?.runtime.status === 'healthy' ? 'status-pill--success' : 'status-pill--warning'}`}>
              {healthSnapshot?.runtime.status === 'healthy' ? homeCopy.posture.healthy : homeCopy.posture.degraded}
            </span>
          </div>
          <h2 className="home-mgo__posture-title">
            {homeCopy.posture.title}
            {' '}
            <span className={healthSnapshot?.runtime.status === 'healthy' ? 'text-success' : 'text-warning'}>
              {healthSnapshot?.runtime.status === 'healthy' ? homeCopy.posture.healthy : homeCopy.posture.degraded}
            </span>
          </h2>
          <div className="home-mgo__posture-strip">
            <div className="home-mgo__posture-item">
              <CheckCircle2 size={14} />
              <span>{homeCopy.posture.runtimeNominal}</span>
            </div>
            <div className="home-mgo__posture-item">
              <ShieldCheck size={14} />
              <span>{homeCopy.posture.auditLive}</span>
            </div>
            <div className="home-mgo__posture-item">
              <Sparkles size={14} />
              <span>{homeCopy.posture.referencesReady}</span>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div role="alert" className="inline-alert inline-alert--danger home-mgo__error">{homeCopy.syncErrorMessage}</div>
      ) : null}

      <section className="home-mgo__grid">
        <article className="home-mgo__queue surface-panel surface-panel--workspace">
          <div className="home-mgo__section-head">
            <div>
              <p className="page-kicker">{homeCopy.queue.kicker}</p>
              <h2 className="section-title">{homeCopy.queue.title}</h2>
            </div>
            <Link to="/reviews" className="text-action">
              {homeCopy.queue.viewAll}
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="home-mgo__queue-list">
            {prioritizedActions.length === 0 ? (
              <p className="type-body-sm">{homeCopy.queue.empty}</p>
            ) : (
              prioritizedActions.map((task) => {
                const actionable = isReviewActionable(task, sessionAccountId);
                return (
                  <article key={task.id} className={`home-mgo__queue-card home-mgo__queue-card--${getPriorityTone(task)}`}>
                    <div className="home-mgo__queue-meta">
                      <span className="type-text-xs">{task.current_stage ?? homeCopy.queue.stageFallback}</span>
                      <span className={`status-pill ${getPriorityTone(task) === 'critical' ? 'status-pill--danger' : 'status-pill--warning'}`}>
                        {task.priority === 'high' ? homeCopy.queue.highImpact : homeCopy.queue.mediumImpact}
                      </span>
                    </div>
                    <h3 className="home-mgo__queue-title">{task.title}</h3>
                    <p className="type-text-sm">
                      {homeCopy.queue.projectLabel}
                      {' '}
                      {task.workflowLabel}
                      {' • '}
                      {homeCopy.queue.taskLabel}
                      {' '}
                      {task.id}
                    </p>
                    <div className="home-mgo__queue-footer">
                      <span className="type-text-xs">{formatRelativeTimestamp(task.updated_at)}</span>
                      <div className="home-mgo__queue-actions">
                        <Link className="button-secondary home-mgo__queue-link" to={`/reviews?scope=assigned&selected=${task.id}`}>
                          {homeCopy.queue.openReview}
                        </Link>
                        {actionable ? (
                          <button type="button" className="button-secondary home-mgo__queue-link" onClick={() => void handleReviewDecision(task, 'approve')}>
                            {homeCopy.queue.quickApprove}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <p className="type-text-xs home-mgo__queue-note">
            {homeCopy.queue.showing(prioritizedActions.length, homeMetrics.waitingCount)}
          </p>
        </article>

        <article className="home-mgo__focus surface-panel surface-panel--workspace">
          <div className="home-mgo__section-head">
            <div>
              <p className="page-kicker">{homeCopy.focus.kicker}</p>
              <h2 className="section-title">{homeCopy.focus.title}</h2>
            </div>
            <Link to={focusWorkspaceHref} className="button-secondary home-mgo__focus-link">
              {homeCopy.focus.openWorkspace}
              <ArrowRight size={14} />
            </Link>
          </div>

          {focusTask ? (
            <>
              <section className="home-mgo__focus-card">
                <div className="home-mgo__focus-card-head">
                  <div>
                    <p className="page-kicker">{homeCopy.focus.portfolioLabel}</p>
                    <h3 className="home-mgo__focus-name">{focusTask.title}</h3>
                    <p className="type-text-sm home-mgo__focus-meta">
                      {focusTask.projectId ?? focusTask.workflowLabel}
                      {' • '}
                      {homeCopy.focus.ownerLabel}
                      {' '}
                      {focusTask.creator}
                    </p>
                  </div>
                  <span className="status-pill status-pill--info">
                    {focusTask.state === 'in_progress' ? homeCopy.focus.inProgress : homeCopy.focus.active}
                  </span>
                </div>

                <div className="home-mgo__focus-work">
                  <div className="home-mgo__focus-work-head">
                    <div>
                      <p className="page-kicker">{homeCopy.focus.activeWorkLabel}</p>
                      <h4 className="home-mgo__focus-work-title">{focusTask.title}</h4>
                    </div>
                    <span className="type-text-xs">{focusTask.stageName ?? focusTask.current_stage ?? homeCopy.focus.stageFallback}</span>
                  </div>
                  <p className="type-body-sm">{focusTask.description ?? homeCopy.focus.noDescription}</p>
                  <div className="home-mgo__progress-row">
                    <span>{homeCopy.focus.startedLabel} {formatRelativeTimestamp(focusTask.created_at)}</span>
                    <span>{getProgressValue(focusTask)}%</span>
                  </div>
                  <div className="home-mgo__progress-bar">
                    <span style={fillStyle(getProgressValue(focusTask))} />
                  </div>
                  <div className="home-mgo__focus-stats">
                    <div className="home-mgo__mini-stat">
                      <span>{homeCopy.focus.runtimeTargetLabel}</span>
                      <strong>{focusTask.teamMembers?.[0]?.runtime_target_ref ?? focusTask.teamLabel}</strong>
                    </div>
                    <div className="home-mgo__mini-stat">
                      <span>{homeCopy.focus.participantsLabel}</span>
                      <strong>{focusTask.memberCount}</strong>
                    </div>
                    <div className="home-mgo__mini-stat">
                      <span>{homeCopy.focus.agentsLabel}</span>
                      <strong>{focusTask.teamMembers?.length ?? 0}</strong>
                    </div>
                    <div className="home-mgo__mini-stat">
                      <span>{homeCopy.focus.healthLabel}</span>
                      <strong>{healthSnapshot?.runtime.status === 'healthy' ? homeCopy.posture.healthy : homeCopy.posture.degraded}</strong>
                    </div>
                  </div>
                </div>

                <section className="home-mgo__context-glance">
                  <p className="page-kicker">{homeCopy.focus.contextGlanceLabel}</p>
                  <div className="home-mgo__tag-strip">
                    {focusSelectionTags.length > 0 ? (
                      focusSelectionTags.map((member) => (
                        <span key={`${member.agentId}-${member.role}`} className="home-mgo__context-tag">
                          {member.runtime_flavor ?? member.role}
                        </span>
                      ))
                    ) : (
                      <span className="type-text-xs">{homeCopy.focus.contextFallback}</span>
                    )}
                  </div>
                </section>

                <div className="home-mgo__focus-next">
                  <span className="type-text-sm">
                    {reviewFocus ? homeCopy.focus.nextUp(reviewFocus.title) : homeCopy.focus.noPendingReview}
                  </span>
                  {reviewFocus ? (
                    <Link to={`/reviews?scope=assigned&selected=${reviewFocus.id}`} className="text-action">
                      {homeCopy.focus.reviewDue}
                      <ChevronRight size={14} />
                    </Link>
                  ) : null}
                </div>
              </section>

            </>
          ) : (
            <div className="home-mgo__focus-empty">
              <p className="type-body-sm">{homeCopy.focus.empty}</p>
              <Link to="/projects" className="button-primary">{homeCopy.primaryAction}</Link>
            </div>
          )}
        </article>

        <aside className="home-mgo__rail">
          <section className="home-mgo__rail-panel surface-panel surface-panel--workspace">
            <div className="home-mgo__section-head home-mgo__section-head--compact">
              <div>
                <p className="page-kicker">{homeCopy.runtimeTruth.kicker}</p>
                <h2 className="section-title">{homeCopy.runtimeTruth.title}</h2>
              </div>
              <span className={`status-pill ${healthSnapshot?.runtime.status === 'healthy' ? 'status-pill--success' : 'status-pill--warning'}`}>
                {healthSnapshot?.runtime.status === 'healthy' ? homeCopy.posture.healthy : homeCopy.posture.degraded}
              </span>
            </div>
            {summaryReady ? (
              <div className="home-mgo__truth-card">
                <div className="home-mgo__truth-graph" aria-label={homeCopy.runtimeTruth.title}>
                  {runtimeTruthSignals.map((signal) => (
                    <div key={signal.key} className="home-mgo__truth-trace">
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <i style={fillStyle(signal.width)} />
                    </div>
                  ))}
                </div>
                <div className="home-mgo__truth-metrics">
                  <div className="home-mgo__mini-stat">
                    <span>{homeCopy.runtimeTruth.liveSessions}</span>
                    <strong>{healthSnapshot?.runtime.activeSessions ?? 0}</strong>
                  </div>
                  <div className="home-mgo__mini-stat">
                    <span>{homeCopy.runtimeTruth.activeAgents}</span>
                    <strong>{homeMetrics.participantCount}</strong>
                  </div>
                  <div className="home-mgo__mini-stat">
                    <span>{homeCopy.runtimeTruth.sloCompliance}</span>
                    <strong>{governanceSnapshot?.activeExecutions ?? 0}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <Skeleton variant="card" />
            )}
          </section>

          <section className="home-mgo__rail-panel surface-panel surface-panel--workspace">
            <div className="home-mgo__section-head home-mgo__section-head--compact">
              <div>
                <p className="page-kicker">{homeCopy.audit.kicker}</p>
                <h2 className="section-title">{homeCopy.audit.title}</h2>
              </div>
              <span className="status-pill status-pill--neutral">{homeCopy.audit.live}</span>
            </div>
            {railReady ? (
              <div className="home-mgo__audit-list">
                {auditTrail.map((entry) => (
                  <div key={entry.id} className="home-mgo__audit-entry">
                    <span className={`home-mgo__audit-dot home-mgo__audit-dot--${entry.tone}`} />
                    <div className="home-mgo__audit-copy">
                      <strong>{entry.title}</strong>
                      <span>{entry.actor}</span>
                    </div>
                    <span className="type-text-xs">{entry.time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Skeleton variant="card" />
            )}
          </section>

          <section className="home-mgo__rail-panel surface-panel surface-panel--workspace">
            <div className="home-mgo__section-head home-mgo__section-head--compact">
              <div>
                <p className="page-kicker">{homeCopy.integrity.kicker}</p>
                <h2 className="section-title">{homeCopy.integrity.title}</h2>
              </div>
              <span className={`status-pill ${referenceIntegrity.runtimeWarnings > 0 ? 'status-pill--warning' : 'status-pill--success'}`}>
                {referenceIntegrity.runtimeWarnings > 0 ? homeCopy.integrity.good : homeCopy.integrity.healthy}
              </span>
            </div>
            {summaryReady ? (
              <div className="home-mgo__integrity-list">
                <div className="data-row">
                  <span>{homeCopy.integrity.taskRecords}</span>
                  <strong>{referenceIntegrity.taskRecords.toLocaleString()}</strong>
                </div>
                <div className="data-row">
                  <span>{homeCopy.integrity.runtimeWarnings}</span>
                  <strong>{referenceIntegrity.runtimeWarnings}</strong>
                </div>
                <div className="data-row">
                  <span>{homeCopy.integrity.hostPressure}</span>
                  <strong>{referenceIntegrity.hostPressure}</strong>
                </div>
                <div className="data-row">
                  <span>{homeCopy.integrity.bridgeBindings}</span>
                  <strong>{referenceIntegrity.bridgeBindings}</strong>
                </div>
              </div>
            ) : (
              <Skeleton variant="card" />
            )}
          </section>
        </aside>
      </section>

      <section className="home-mgo__project-cards surface-panel surface-panel--workspace">
        <div className="home-mgo__section-head home-mgo__section-head--compact">
          <div>
            <p className="page-kicker">{homeCopy.activeProjects.kicker}</p>
            <h3 className="section-title">{homeCopy.activeProjects.title}</h3>
          </div>
        </div>
        <div className="home-mgo__project-grid">
          {activeProjectCards.map((project) => (
            <article
              key={project.key}
              className={`home-mgo__project-card home-mgo__project-card--${getProjectTone(project.focusTask)}${project.focusTask.id === focusTask?.id ? ' is-selected' : ''}`}
            >
              <div className="home-mgo__project-card-head">
                <h4>{project.title}</h4>
                <span className="status-pill status-pill--neutral">
                  {project.taskCount} {homeCopy.capabilityStrip.items}
                </span>
              </div>
              <div className="home-mgo__progress-row">
                <span>{homeCopy.activeProjects.progressLabel}</span>
                <span>{getProgressValue(project.focusTask)}%</span>
              </div>
              <div className="home-mgo__progress-bar home-mgo__progress-bar--compact">
                <span style={fillStyle(getProgressValue(project.focusTask))} />
              </div>
              <p className="type-text-sm">{project.summary ?? homeCopy.focus.noDescription}</p>
              <div className="home-mgo__project-card-footer">
                <button type="button" className="text-action" onClick={() => void handleSelectFocusTask(project.focusTask.id)}>
                  {homeCopy.focus.openFocus}
                </button>
                <span className={`home-mgo__project-signal home-mgo__project-signal--${getProjectTone(project.focusTask)}`}>
                  {project.focusTask.state === 'gate_waiting' ? homeCopy.activeProjects.gatePending : homeCopy.activeProjects.noBlockers}
                </span>
                <Link className="text-action" to={buildProjectWorkHref(project.projectId)}>
                  {homeCopy.activeProjects.openWorkspace}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-mgo__capability-strip surface-panel surface-panel--workspace">
        <div className="home-mgo__section-head home-mgo__section-head--compact">
          <div>
            <p className="page-kicker">{homeCopy.capabilityStrip.kicker}</p>
            <h2 className="section-title">{homeCopy.capabilityStrip.title}</h2>
          </div>
          <Link to="/system" className="button-secondary home-mgo__capability-link">
            {homeCopy.capabilityStrip.action}
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className="home-mgo__capability-grid">
          {capabilityItems.map((item) => (
            <div key={item.key} className="home-mgo__capability-item">
              <div className={`home-mgo__capability-icon home-mgo__capability-icon--${item.tone}`}>
                {item.key === 'governance' ? <ShieldCheck size={16} /> : null}
                {item.key === 'targets' ? <Sparkles size={16} /> : null}
                {item.key === 'bridges' ? <Network size={16} /> : null}
                {item.key === 'policies' ? <TriangleAlert size={16} /> : null}
                {item.key === 'participants' ? <Gauge size={16} /> : null}
              </div>
              <div className="home-mgo__capability-copy">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!isMobile && isTablet ? (
        <section className="home-mgo__tablet-note surface-panel surface-panel--muted">
          <FolderOpen size={16} />
          <span>{homeCopy.tabletNote}</span>
          <Link to={focusHref} className="text-action">{homeCopy.focus.openFocus}</Link>
        </section>
      ) : null}
    </div>
  );
}
