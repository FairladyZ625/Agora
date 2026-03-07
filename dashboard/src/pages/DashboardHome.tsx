import { useEffect, useMemo } from 'react';
import {
  ArrowRight,
  Clock3,
  Orbit,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useDashboardHomeCopy } from '@/lib/dashboardCopy';
import { deriveDashboardHomeMetrics } from '@/lib/dashboardHomeMetrics';
import { useTaskStore } from '@/stores/taskStore';
import { StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';

export function DashboardHome() {
  const dashboardHomeCopy = useDashboardHomeCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const homeMetrics = useMemo(
    () => deriveDashboardHomeMetrics(tasks, dashboardHomeCopy.latestCompletedFallback),
    [dashboardHomeCopy.latestCompletedFallback, tasks],
  );
  const displayTasks = homeMetrics.recentTasks;
  const reviewItems = homeMetrics.reviewItems;
  const metrics = [
    {
      label: dashboardHomeCopy.metricLabels.active,
      value: homeMetrics.activeCount,
      note: dashboardHomeCopy.metricNotes.active,
      icon: Orbit,
    },
    {
      label: dashboardHomeCopy.metricLabels.waiting,
      value: homeMetrics.waitingCount,
      note: dashboardHomeCopy.metricNotes.waiting,
      icon: Scale,
    },
    {
      label: dashboardHomeCopy.metricLabels.participants,
      value: homeMetrics.participantCount,
      note: dashboardHomeCopy.metricNotes.participants,
      icon: UsersRound,
    },
    {
      label: dashboardHomeCopy.metricLabels.latestCompleted,
      value: homeMetrics.latestCompletedLabel,
      note: dashboardHomeCopy.metricNotes.latestCompleted,
      icon: Clock3,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="page-enter surface-panel surface-panel--hero">
        <div className="hero-grid">
          <div className="hero-copy-block">
            <p className="page-kicker">{dashboardHomeCopy.kicker}</p>
            <h2 className="hero-display mt-3">
              {dashboardHomeCopy.title}
            </h2>
            <p className="hero-copy mt-4">
              {dashboardHomeCopy.summary}
            </p>
            <p className="hero-axiom mt-4">
              {dashboardHomeCopy.slogan}
            </p>

            <div className="hero-actions">
              <Link to="/tasks" className="button-primary">
                {dashboardHomeCopy.primaryAction}
                <ArrowRight size={16} />
              </Link>
              <Link to="/reviews" className="button-secondary">
                {dashboardHomeCopy.secondaryAction}
              </Link>
            </div>

            {error && (
              <div className="inline-alert inline-alert--danger mt-5">
                {dashboardHomeCopy.syncErrorMessage}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="surface-panel surface-panel--hero-side">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{dashboardHomeCopy.pulseKicker}</p>
                  <h3 className="section-title">{dashboardHomeCopy.pulseTitle}</h3>
                </div>
                <span className="status-pill status-pill--success">
                  {loading
                    ? dashboardHomeCopy.pulseStatusLoading
                    : dashboardHomeCopy.pulseStatusReady}
                </span>
              </div>
              <div className="hero-sigil" aria-hidden="true">
                <div className="hero-sigil__ring hero-sigil__ring--outer" />
                <div className="hero-sigil__ring hero-sigil__ring--middle" />
                <div className="hero-sigil__ring hero-sigil__ring--inner" />
                <div className="hero-sigil__core">{dashboardHomeCopy.title}</div>
                <span className="hero-sigil__label hero-sigil__label--left">
                  {dashboardHomeCopy.pulseOrbitLabels.left}
                </span>
                <span className="hero-sigil__label hero-sigil__label--right">
                  {dashboardHomeCopy.pulseOrbitLabels.right}
                </span>
                <span className="hero-sigil__label hero-sigil__label--bottom">
                  {dashboardHomeCopy.pulseOrbitLabels.bottom}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="inline-stat">
                  <span className="inline-stat__label">{dashboardHomeCopy.pulseItemLabels.running}</span>
                  <span className="inline-stat__value">{homeMetrics.activeCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{dashboardHomeCopy.pulseItemLabels.waiting}</span>
                  <span className="inline-stat__value">{homeMetrics.waitingCount}</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">{dashboardHomeCopy.pulseItemLabels.latestCompleted}</span>
                  <span className="inline-stat__value">{homeMetrics.latestCompletedLabel}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {dashboardHomeCopy.sideNotes.map((item) => (
                <div key={item.title} className="surface-panel surface-panel--muted surface-panel--glasslet">
                  <p className="page-kicker">{item.kicker}</p>
                  <h3 className="section-title">{item.title}</h3>
                  <p className="section-copy">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }, index) => (
          <div
            key={label}
            className={`page-enter metric-card ${index === 0 ? 'metric-card--primary' : index === 1 ? 'metric-card--warning' : index === 2 ? 'metric-card--success' : 'metric-card--neutral'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="metric-label">{label}</p>
                <p className="metric-value">{value}</p>
              </div>
              <div className="metric-icon">
                <Icon size={18} />
              </div>
            </div>
            <p className="metric-note">{note}</p>
          </div>
        ))}
      </div>

      <div className="home-content-grid">
        <section className="page-enter surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{dashboardHomeCopy.feedKicker}</p>
              <h3 className="section-title">{dashboardHomeCopy.feedTitle}</h3>
            </div>
            <Link to="/tasks" className="button-ghost">
              {dashboardHomeCopy.feedAction}
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {displayTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="data-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-mono-sm">{task.id}</span>
                    <h4 className="type-heading-sm truncate">
                      {task.title}
                    </h4>
                  </div>
                  <p className="type-body-sm mt-2">
                    {task.description ?? dashboardHomeCopy.emptyTaskDescription}
                  </p>
                  <div className="type-text-xs mt-3 flex flex-wrap items-center gap-2">
                    <span>{task.creator}</span>
                    <span className="meta-separator">/</span>
                    <span>{task.teamLabel}</span>
                    <span className="meta-separator">/</span>
                    <span>{formatRelativeTimestamp(task.updated_at)}</span>
                  </div>
                </div>
                <StateBadge state={task.state} />
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="page-enter surface-panel surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{dashboardHomeCopy.reviewKicker}</p>
                <h3 className="section-title">{dashboardHomeCopy.reviewTitle}</h3>
              </div>
              <span className="status-pill status-pill--warning">
                {reviewItems.length}
                {dashboardHomeCopy.reviewCountUnit}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {reviewItems.slice(0, 2).map((task) => (
                <Link key={task.id} to="/reviews" className="decision-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="type-mono-sm">{task.id}</p>
                      <h4 className="type-heading-sm mt-1">
                        {task.title}
                      </h4>
                    </div>
                    <ShieldCheck size={16} className="icon-accent-warning" />
                  </div>
                  <p className="type-body-sm mt-3">
                    {dashboardHomeCopy.reviewDescriptionPrefix} {task.current_stage ?? dashboardHomeCopy.fallbackDecisionStage}。
                  </p>
                </Link>
              ))}
              {reviewItems.length === 0 ? (
                <div className="empty-state">
                  <p className="type-heading-sm">{dashboardHomeCopy.reviewTitle}</p>
                  <p className="type-body-sm mt-2">{dashboardHomeCopy.emptyTaskDescription}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="page-enter surface-panel surface-panel--muted surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{dashboardHomeCopy.principleKicker}</p>
                <h3 className="section-title">{dashboardHomeCopy.principleTitle}</h3>
              </div>
              <Sparkles size={16} className="icon-accent-primary" />
            </div>
            <ul className="home-principles mt-4 space-y-3">
              {dashboardHomeCopy.principleBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
