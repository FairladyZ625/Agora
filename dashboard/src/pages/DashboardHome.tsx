import { useEffect } from 'react';
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
import { dashboardHomeCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp, MOCK_TASKS } from '@/lib/mockDashboard';
import type { Task } from '@/types/task';

function getDisplayTasks(tasks: Task[]) {
  return tasks.length > 0 ? tasks : MOCK_TASKS;
}

export function DashboardHome() {
  const { tasks, loading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const displayTasks = getDisplayTasks(tasks);
  const reviewItems = displayTasks.filter((task) => task.state === 'gate_waiting');
  const metrics = [
    {
      label: '运行中的编排',
      value: displayTasks.filter((task) => task.state === 'in_progress').length,
      note: dashboardHomeCopy.metricNotes.active,
      icon: Orbit,
    },
    {
      label: '待裁决事项',
      value: reviewItems.length,
      note: dashboardHomeCopy.metricNotes.waiting,
      icon: Scale,
    },
    {
      label: '活跃 craftsman',
      value: 6,
      note: dashboardHomeCopy.metricNotes.craftsmen,
      icon: UsersRound,
    },
    {
      label: '最近执行节拍',
      value: '12m',
      note: dashboardHomeCopy.metricNotes.cadence,
      icon: Clock3,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="page-enter surface-panel surface-panel--hero">
        <div className="hero-grid">
          <div className="hero-copy-block">
            <p className="page-kicker">{dashboardHomeCopy.kicker}</p>
            <h2 className="hero-display mt-3 text-[40px] font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] md:text-[56px]">
              {dashboardHomeCopy.title}
            </h2>
            <p className="hero-copy mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--color-text-secondary)] md:text-[16px]">
              {dashboardHomeCopy.summary}
            </p>
            <p className="hero-axiom mt-4 text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)] md:text-[17px]">
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
              <div className="mt-5 rounded-2xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-[13px] text-[var(--color-danger-text)]">
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
                {dashboardHomeCopy.pulseItems.map((item) => (
                  <div key={item.label} className="inline-stat">
                    <span className="inline-stat__label">{item.label}</span>
                    <span className="inline-stat__value">{item.value}</span>
                  </div>
                ))}
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.9fr)]">
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
                    <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{task.id}</span>
                    <h4 className="truncate text-[15px] font-medium text-[var(--color-text-primary)]">
                      {task.title}
                    </h4>
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                    {task.description ?? dashboardHomeCopy.emptyTaskDescription}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
                    <span>{task.creator}</span>
                    <span className="text-[var(--color-border-strong)]">/</span>
                    <span>{task.team}</span>
                    <span className="text-[var(--color-border-strong)]">/</span>
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
                {reviewItems.length || MOCK_TASKS.filter((task) => task.state === 'gate_waiting').length}
                {dashboardHomeCopy.reviewCountUnit}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(reviewItems.length > 0 ? reviewItems : MOCK_TASKS.filter((task) => task.state === 'gate_waiting')).slice(0, 2).map((task) => (
                <Link key={task.id} to="/reviews" className="decision-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{task.id}</p>
                      <h4 className="mt-1 text-[15px] font-medium text-[var(--color-text-primary)]">
                        {task.title}
                      </h4>
                    </div>
                    <ShieldCheck size={16} className="text-[var(--color-warning)]" />
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                    {dashboardHomeCopy.reviewDescriptionPrefix} {task.current_stage ?? dashboardHomeCopy.fallbackDecisionStage}。
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="page-enter surface-panel surface-panel--muted surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{dashboardHomeCopy.principleKicker}</p>
                <h3 className="section-title">{dashboardHomeCopy.principleTitle}</h3>
              </div>
              <Sparkles size={16} className="text-[var(--color-primary)]" />
            </div>
            <ul className="mt-4 space-y-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
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
