import { useEffect, useMemo, type CSSProperties } from 'react';
import { ArrowRight, Waves } from 'lucide-react';
import { Link } from 'react-router';
import { useDashboardHomeCopy } from '@/lib/dashboardCopy';
import { deriveDashboardHomeMetrics } from '@/lib/dashboardHomeMetrics';
import { useTaskStore } from '@/stores/taskStore';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatRelativeTimestamp } from '@/lib/mockDashboard';

function getProposalTone(state: string) {
  if (state === 'gate_waiting') {
    return 'constraint';
  }
  if (state === 'in_progress') {
    return 'optimize';
  }
  return 'observe';
}

function buildTerminalLines(taskIds: string[], waitingCount: number) {
  const focusId = taskIds[0] ?? 'AG-000';
  return [
    `[SYNC] Register live context ${focusId}`,
    `[SYNC] Debate lattice aligned.`,
    waitingCount > 0 ? `[WAIT] Archon arbitration requested.` : '[SYNC] Arbitration queue stable.',
    waitingCount > 0 ? '[WARN] Constraint divergence detected.' : '[SYNC] Constraint envelope stable.',
    '[SYNC] Telemetry rail updated.',
  ];
}

export function DashboardHome() {
  const homeCopy = useDashboardHomeCopy();
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const error = useTaskStore((state) => state.error);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const homeMetrics = useMemo(
    () => deriveDashboardHomeMetrics(tasks, homeCopy.latestCompletedFallback),
    [homeCopy.latestCompletedFallback, tasks],
  );

  const proposals = homeMetrics.recentTasks.slice(0, 2);
  const focusTask = homeMetrics.reviewItems[0] ?? homeMetrics.recentTasks[0] ?? null;
  const pipelineTasks = homeMetrics.recentTasks.slice(0, 8);
  const pipelineNodes = Array.from({ length: 8 }, (_, index) => {
    const task = pipelineTasks[index];
    return {
      id: `N${String(index + 1).padStart(2, '0')}`,
      active: task ? ['in_progress', 'gate_waiting'].includes(task.state) : false,
    };
  });
  const loadPercent = homeMetrics.recentTasks.length === 0
    ? 0
    : Math.min(
        92,
        Math.round(((homeMetrics.activeCount * 2 + homeMetrics.waitingCount) / Math.max(homeMetrics.recentTasks.length, 1)) * 34),
      );
  const terminalLines = buildTerminalLines(proposals.map((task) => task.id), homeMetrics.waitingCount);
  const summaryCards = [
    {
      label: homeCopy.metricLabels.active,
      value: String(homeMetrics.activeCount),
      note: homeCopy.metricNotes.active,
    },
    {
      label: homeCopy.metricLabels.waiting,
      value: String(homeMetrics.waitingCount),
      note: homeCopy.metricNotes.waiting,
    },
    {
      label: homeCopy.metricLabels.participants,
      value: String(homeMetrics.participantCount),
      note: homeCopy.metricNotes.participants,
    },
    {
      label: homeCopy.metricLabels.latestCompleted,
      value: homeMetrics.latestCompletedLabel,
      note: homeCopy.metricNotes.latestCompleted,
    },
  ];

  return (
    <div className="home-os">
      <section className="home-os__header surface-panel surface-panel--workspace signal-scan">
        <div>
          <p className="page-kicker">{homeCopy.kicker}</p>
          <h2 className="home-os__display">{homeCopy.title}</h2>
          <p className="home-os__signature">{homeCopy.architectureLabel}</p>
        </div>
        <div className="home-os__header-copy">
          <p className="page-summary">{homeCopy.summary}</p>
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
      </section>

      {error ? (
        <div className="inline-alert inline-alert--danger">{homeCopy.syncErrorMessage}</div>
      ) : null}

      <section className="home-os__arena">
        <article className="home-os__panel home-os__panel--agora surface-panel surface-panel--workspace">
          <div className="home-os__panel-head">
            <p className="home-os__section-index">{homeCopy.sectionLabels.agora}</p>
            <p className="page-kicker">{homeCopy.topologyLabel}</p>
          </div>

          <div className="home-os__topology">
            <div className="home-os__topology-grid">
              <span className="home-os__node">LGS</span>
              <span className="home-os__node home-os__node--active signal-pulse">ETH</span>
              <span className="home-os__node">PTH</span>
              <span className="home-os__beam home-os__beam--left" />
              <span className="home-os__beam home-os__beam--right flow-shift" />
            </div>
            <div className="home-os__hash">
              <span>{homeCopy.topologyHashLabel}</span>
              <span>H-8f92a.c4</span>
            </div>
          </div>

          <div className="home-os__section-divider" />

          <div className="home-os__module-head">
            <h3 className="section-title">{homeCopy.feedTitle}</h3>
            <span className="status-pill status-pill--neutral">{proposals.length}</span>
          </div>

          <div className="home-os__proposal-stack">
            {loading
              ? Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} variant="card" />)
              : proposals.map((task) => {
                  const tone = getProposalTone(task.state);
                  return (
                    <article key={task.id} className="home-os__proposal-card">
                      <div className="home-os__proposal-head">
                        <div>
                          <p className="home-os__proposal-title">{task.title}</p>
                          <p className="type-mono-sm">{task.id}</p>
                        </div>
                        <span className={`home-os__proposal-stance home-os__proposal-stance--${tone}`}>
                          {tone === 'constraint' ? 'CONSTRAIN' : tone === 'optimize' ? 'OPTIMIZE' : 'OBSERVE'}
                        </span>
                      </div>
                      <p className="type-body-sm">{task.description ?? homeCopy.emptyTaskDescription}</p>
                      <div className="home-os__proposal-meta">
                        <span>{task.teamLabel}</span>
                        <span>{formatRelativeTimestamp(task.updated_at)}</span>
                      </div>
                    </article>
                  );
                })}
          </div>
        </article>

        <article className="home-os__panel home-os__panel--archon surface-panel surface-panel--workspace">
          <div className="home-os__archon-head">
            <p className="page-kicker">{homeCopy.commandAuthorityLabel}</p>
            <h3 className="home-os__archon-title">{homeCopy.sectionLabels.archon}</h3>
          </div>

          <div className="home-os__authority surface-panel surface-panel--muted signal-scan">
            <p className="page-kicker home-os__authority-kicker">{homeCopy.pendingResolutionLabel}</p>
            <h4 className="home-os__authority-title">{focusTask?.title ?? homeCopy.resolutionTitle}</h4>
            <div className="home-os__authority-grid">
              <div className="home-os__authority-stat">
                <span className="page-kicker">{homeCopy.resolutionMetrics.pro}</span>
                <strong>{homeMetrics.activeCount > 0 ? `+${homeMetrics.activeCount * 7.1}% THRP` : '+14.2% THRP'}</strong>
              </div>
              <div className="home-os__authority-stat home-os__authority-stat--alert">
                <span className="page-kicker">{homeCopy.resolutionMetrics.con}</span>
                <strong>{homeMetrics.waitingCount > 0 ? '-ALPHA09' : '-LATENCY'}</strong>
              </div>
            </div>
            <p className="type-body-sm">{homeCopy.resolutionSummary}</p>
            <div className="home-os__authority-actions">
              <button type="button" className="button-primary">{homeCopy.resolutionActions.authorize}</button>
              <button type="button" className="button-danger">{homeCopy.resolutionActions.veto}</button>
              <button type="button" className="button-secondary home-os__authority-secondary">{homeCopy.resolutionActions.synthesize}</button>
            </div>
          </div>

          <div className="home-os__load surface-panel surface-panel--muted">
            <div className="home-os__module-head">
              <p className="page-kicker">{homeCopy.systemLoadLabel}</p>
              <span className="home-os__load-value">LOAD: {loadPercent}%</span>
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
            </div>
          </div>
        </article>

        <article className="home-os__panel home-os__panel--pipeline surface-panel surface-panel--workspace">
          <div className="home-os__panel-head">
            <p className="home-os__section-index">{homeCopy.sectionLabels.pipeline}</p>
            <p className="page-kicker">{homeCopy.executionLabel}</p>
          </div>

          <div className="home-os__node-grid">
            {pipelineNodes.map((node, index) => (
              <div key={node.id} className={node.active ? 'home-os__pipe-node home-os__pipe-node--active signal-pulse' : 'home-os__pipe-node'}>
                {index < 3 ? <Waves size={12} /> : null}
                <span>{node.id}</span>
              </div>
            ))}
          </div>

          <div className="home-os__module-head">
            <h3 className="section-title">{homeCopy.terminalLabel}</h3>
            <span className="status-pill status-pill--info">{homeCopy.terminalStatusPrefix}</span>
          </div>

          <div className="home-os__terminal">
            {terminalLines.length === 0 ? (
              <p className="type-body-sm">{homeCopy.terminalEmpty}</p>
            ) : (
              terminalLines.map((line, index) => (
                <div key={`${line}-${index}`} className="home-os__terminal-line terminal-entry">
                  <span className="home-os__terminal-prefix">[{String(index + 1).padStart(2, '0')}]</span>
                  <span>{line}</span>
                </div>
              ))
            )}
          </div>

          <div className="home-os__telemetry-strip">
            <div className="metric-card metric-card--neutral">
              <p className="metric-label">{homeCopy.metricLabels.participants}</p>
              <p className="metric-value">{homeMetrics.participantCount}</p>
              <p className="metric-note">{homeCopy.metricNotes.participants}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="home-os__summary-grid">
        {summaryCards.map((item) => (
          <article key={item.label} className="metric-card metric-card--neutral">
            <p className="metric-label">{item.label}</p>
            <p className="metric-value">{item.value}</p>
            <p className="metric-note">{item.note}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
