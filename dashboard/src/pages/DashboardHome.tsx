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

function buildTerminalLines(taskIds: string[], waitingCount: number) {
  const focusId = taskIds[0] ?? 'AG-000';
  return [
    `[同步] 已接入上下文 ${focusId}`,
    '[同步] 议题拓扑已刷新。',
    waitingCount > 0 ? '[等待] 裁决中枢需要人工判断。' : '[同步] 当前裁决队列稳定。',
    waitingCount > 0 ? '[提示] 约束分歧仍未收敛。' : '[同步] 约束边界稳定。',
    '[同步] 执行回路已更新。',
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
  const throughputDelta = homeMetrics.activeCount > 0 ? `+${(homeMetrics.activeCount * 7.1).toFixed(1)}% THRP` : '+14.2% THRP';

  return (
    <div className="home-os">
      <section className="home-os__grid">
        <article className="home-os__main-column surface-panel surface-panel--workspace">
          <div className="home-os__hero signal-scan">
            <div className="home-os__hero-block">
              <p className="page-kicker">{homeCopy.kicker}</p>
              <h2 className="home-os__display">{homeCopy.title}</h2>
              <p className="home-os__signature">{homeCopy.architectureLabel}</p>
            </div>
            <div className="home-os__hero-block home-os__hero-block--copy">
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
          </div>

          {error ? (
            <div className="inline-alert inline-alert--danger home-os__error">{homeCopy.syncErrorMessage}</div>
          ) : null}

          <div className="home-os__main-section">
            <div className="home-os__module-head">
              <div>
                <p className="home-os__section-index">{homeCopy.sectionLabels.archon}</p>
                <p className="page-kicker">{homeCopy.commandAuthorityLabel}</p>
              </div>
              <span className="status-pill status-pill--info">
                {homeMetrics.waitingCount}
                {homeCopy.reviewCountUnit}
              </span>
            </div>

            <div className="home-os__authority surface-panel surface-panel--muted signal-scan">
              <p className="page-kicker home-os__authority-kicker">{homeCopy.pendingResolutionLabel}</p>
              <h4 className="home-os__authority-title">{focusTask?.title ?? homeCopy.resolutionTitle}</h4>
              <div className="home-os__authority-grid">
                <div className="home-os__authority-stat">
                  <span className="page-kicker">{homeCopy.resolutionMetrics.pro}</span>
                  <strong>{throughputDelta}</strong>
                </div>
                <div className="home-os__authority-stat home-os__authority-stat--alert">
                  <span className="page-kicker">{homeCopy.resolutionMetrics.con}</span>
                  <strong>{homeMetrics.waitingCount > 0 ? homeCopy.constraintSignals.waiting : homeCopy.constraintSignals.stable}</strong>
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
              </div>
            </div>
          </div>
        </article>

        <aside className="home-os__rail-column">
          <article className="home-os__rail-panel surface-panel surface-panel--workspace">
            <div className="home-os__module-head">
              <div>
                <p className="home-os__section-index">{homeCopy.sectionLabels.agora}</p>
                <p className="page-kicker">{homeCopy.topologyLabel}</p>
              </div>
              <span className="status-pill status-pill--neutral">{proposals.length}</span>
            </div>

            <div className="home-os__topology">
              <div className="home-os__topology-grid">
                <span className="home-os__node">{homeCopy.topologyNodes[0]}</span>
                <span className="home-os__node home-os__node--active signal-pulse">{homeCopy.topologyNodes[1]}</span>
                <span className="home-os__node">{homeCopy.topologyNodes[2]}</span>
                <span className="home-os__beam home-os__beam--left" />
                <span className="home-os__beam home-os__beam--right flow-shift" />
              </div>
              <div className="home-os__hash">
                <span>{homeCopy.topologyHashLabel}</span>
                <span>{homeCopy.topologyHashValue}</span>
              </div>
            </div>

            <div className="home-os__section-divider" />

            <div className="home-os__module-head">
              <h3 className="section-title">{homeCopy.feedTitle}</h3>
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
                            {getProposalToneLabel(tone, homeCopy.proposalToneLabels)}
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

          <article className="home-os__rail-panel surface-panel surface-panel--workspace">
            <div className="home-os__module-head">
              <div>
                <p className="home-os__section-index">{homeCopy.sectionLabels.pipeline}</p>
                <p className="page-kicker">{homeCopy.executionLabel}</p>
              </div>
              <span className="home-os__telemetry-value">{homeMetrics.participantCount}</span>
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
              <div className="home-os__telemetry-readout">
                <span className="home-os__telemetry-label">{homeCopy.metricLabels.participants}</span>
                <strong className="home-os__telemetry-value">{homeMetrics.participantCount}</strong>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
