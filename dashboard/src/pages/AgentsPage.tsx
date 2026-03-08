import { useEffect, useState } from 'react';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { buildProviderSummaries, filterAgentsByView, type AgentPresenceFilter } from '@/lib/agentProviderInsights';
import { useAgentStore } from '@/stores/agentStore';

export function AgentsPage() {
  const copy = useAgentsPageCopy();
  const summary = useAgentStore((state) => state.summary);
  const agents = useAgentStore((state) => state.agents);
  const craftsmen = useAgentStore((state) => state.craftsmen);
  const error = useAgentStore((state) => state.error);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const [presenceFilter, setPresenceFilter] = useState<AgentPresenceFilter>('all');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const providerSummaries = buildProviderSummaries(agents);
  const visibleAgents = filterAgentsByView(agents, presenceFilter, providerFilter);

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

      <section className="grid gap-4 md:grid-cols-6">
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
          <p className="metric-label">{copy.metrics.onlineAgents}</p>
          <p className="metric-value">{summary?.onlineAgents ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.staleAgents}</p>
          <p className="metric-value">{summary?.staleAgents ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.disconnectedAgents}</p>
          <p className="metric-value">{summary?.disconnectedAgents ?? 0}</p>
        </div>
        <div className="surface-panel surface-panel--workspace">
          <p className="metric-label">{copy.metrics.busyCraftsmen}</p>
          <p className="metric-value">{summary?.busyCraftsmen ?? 0}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.providerSummaryTitle}</h3>
            <span className="status-pill status-pill--neutral">{providerSummaries.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {providerSummaries.map((item) => {
              const isActive = providerFilter === item.provider;
              return (
                <button
                  key={item.provider}
                  type="button"
                  className="data-row w-full text-left"
                  onClick={() => setProviderFilter(isActive ? null : item.provider)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{item.provider}</strong>
                      <span className="status-pill status-pill--neutral">{item.totalAgents}</span>
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                      <span>{copy.metrics.activeAgents}: {item.busyAgents}</span>
                      <span>{copy.metrics.onlineAgents}: {item.onlineAgents}</span>
                      <span>{copy.metrics.staleAgents}: {item.staleAgents}</span>
                      <span>{copy.metrics.disconnectedAgents}: {item.disconnectedAgents}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.filtersTitle}</h3>
            <span className="status-pill status-pill--neutral">{visibleAgents.length}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {(['all', 'busy', 'online', 'stale', 'disconnected', 'offline'] as const).map((filter) => {
              const selected = presenceFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  className={selected ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                  onClick={() => setPresenceFilter(filter)}
                >
                  {copy.filterLabels[filter]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.agentListTitle}</h3>
            <span className="status-pill status-pill--neutral">{visibleAgents.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {visibleAgents.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyAgents}</p>
              </div>
            ) : (
              visibleAgents.map((agent) => (
                <div key={agent.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{agent.id}</strong>
                      <span className="status-pill status-pill--neutral">{agent.status}</span>
                      <span className="status-pill status-pill--info">{agent.presence}</span>
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                      <span>{copy.roleLabel}: {agent.role ?? 'unassigned'}</span>
                      <span>{copy.presenceLabel}: {agent.presence}</span>
                      <span>{copy.presenceReasonLabel}: {agent.presenceReason ?? 'n/a'}</span>
                      <span>{copy.providerLabel}: {agent.provider ?? 'n/a'}</span>
                      <span>{copy.sourceLabel}: {agent.source ?? 'unknown'}</span>
                      <span>{copy.modelLabel}: {agent.primaryModel ?? 'n/a'}</span>
                      <span>{copy.lastSeenLabel}: {agent.lastSeenAt ?? 'n/a'}</span>
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
