import { useEffect } from 'react';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { useAgentStore } from '@/stores/agentStore';

export function AgentsPage() {
  const copy = useAgentsPageCopy();
  const summary = useAgentStore((state) => state.summary);
  const agents = useAgentStore((state) => state.agents);
  const craftsmen = useAgentStore((state) => state.craftsmen);
  const error = useAgentStore((state) => state.error);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <div className="page-enter space-y-6">
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

      <section className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.activeTasks}</p>
          <p className="metric-value">{summary?.activeTasks ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.activeAgents}</p>
          <p className="metric-value">{summary?.activeAgents ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.totalAgents}</p>
          <p className="metric-value">{summary?.totalAgents ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.busyCraftsmen}</p>
          <p className="metric-value">{summary?.busyCraftsmen ?? 0}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.agentListTitle}</h3>
            <span className="status-pill status-pill--neutral">{agents.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {agents.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyAgents}</p>
              </div>
            ) : (
              agents.map((agent) => (
                <div key={agent.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{agent.id}</strong>
                      <span className="status-pill status-pill--neutral">{agent.status}</span>
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                      <span>{copy.roleLabel}: {agent.role ?? 'unassigned'}</span>
                      <span>{copy.sourceLabel}: {agent.source ?? 'unknown'}</span>
                      <span>{copy.modelLabel}: {agent.primaryModel ?? 'n/a'}</span>
                      <span>{copy.loadLabel}: {agent.load}</span>
                      <span>{copy.taskCountLabel}: {agent.taskCount}</span>
                      <span>{copy.subtaskCountLabel}: {agent.subtaskCount}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.craftsmenTitle}</h3>
            <span className="status-pill status-pill--neutral">{craftsmen.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {craftsmen.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyCraftsmen}</p>
              </div>
            ) : (
              craftsmen.map((item) => (
                <div key={item.id} className="decision-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="type-heading-sm">{item.id}</p>
                      <p className="type-body-sm mt-2">{item.title}</p>
                    </div>
                    <span className="status-pill status-pill--info">{item.status}</span>
                  </div>
                  <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                    <span>{copy.currentTaskLabel}: {item.taskId}</span>
                    <span>{item.subtaskId}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
