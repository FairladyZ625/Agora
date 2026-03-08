import { useEffect, useMemo } from 'react';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { filterAgentsByView } from '@/lib/agentProviderInsights';
import { useAgentStore } from '@/stores/agentStore';

export function AgentsPage() {
  const copy = useAgentsPageCopy();
  const summary = useAgentStore((state) => state.summary);
  const agents = useAgentStore((state) => state.agents);
  const craftsmen = useAgentStore((state) => state.craftsmen);
  const providerSummaries = useAgentStore((state) => state.providerSummaries);
  const tmuxRuntime = useAgentStore((state) => state.tmuxRuntime);
  const presenceFilter = useAgentStore((state) => state.presenceFilter);
  const craftsmenFilter = useAgentStore((state) => state.craftsmenFilter);
  const providerFilter = useAgentStore((state) => state.providerFilter);
  const error = useAgentStore((state) => state.error);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const setPresenceFilter = useAgentStore((state) => state.setPresenceFilter);
  const setCraftsmenFilter = useAgentStore((state) => state.setCraftsmenFilter);
  const setProviderFilter = useAgentStore((state) => state.setProviderFilter);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const visibleAgents = filterAgentsByView(agents, presenceFilter, providerFilter);
  const selectedProvider = useMemo(
    () => providerSummaries.find((item) => item.provider === providerFilter) ?? providerSummaries[0] ?? null,
    [providerFilter, providerSummaries],
  );
  const visibleCraftsmen = useMemo(() => {
    if (craftsmenFilter === 'all') {
      return craftsmen;
    }
    if (craftsmenFilter === 'running') {
      return craftsmen.filter((item) => item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running'));
    }
    return craftsmen.filter((item) => item.recentExecutions.some((execution) => execution.status === 'failed'));
  }, [craftsmen, craftsmenFilter]);

  return (
    <div className="space-y-6">
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
                      <span>{copy.presenceLabel}: {item.overallPresence}</span>
                      <span>{copy.presenceReasonLabel}: {item.presenceReason ?? 'n/a'}</span>
                      <span>{copy.lastSeenLabel}: {item.lastSeenAt ?? 'n/a'}</span>
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
            <h3 className="section-title">{copy.providerDetailTitle}</h3>
            <span className="status-pill status-pill--neutral">{selectedProvider?.provider ?? 'n/a'}</span>
          </div>
          <div className="mt-5 space-y-4">
            {selectedProvider ? (
              <>
                <div className="type-text-xs flex flex-wrap items-center gap-3">
                  <span>{copy.presenceLabel}: {selectedProvider.overallPresence}</span>
                  <span>{copy.presenceReasonLabel}: {selectedProvider.presenceReason ?? 'n/a'}</span>
                  <span>{copy.lastSeenLabel}: {selectedProvider.lastSeenAt ?? 'n/a'}</span>
                </div>
                <div className="type-text-xs flex flex-wrap items-center gap-3">
                  <span>{copy.metrics.totalAgents}: {selectedProvider.totalAgents}</span>
                  <span>{copy.metrics.activeAgents}: {selectedProvider.busyAgents}</span>
                  <span>{copy.metrics.staleAgents}: {selectedProvider.staleAgents}</span>
                  <span>{copy.metrics.disconnectedAgents}: {selectedProvider.disconnectedAgents}</span>
                  <span>signal: {selectedProvider.signalStatus}</span>
                  <span>ready: {selectedProvider.signalCounts.readyEvents}</span>
                  <span>restart: {selectedProvider.signalCounts.restartEvents}</span>
                  <span>transport: {selectedProvider.signalCounts.transportErrors}</span>
                </div>
                <div className="space-y-3">
                  {selectedProvider.affectedAgents.length === 0 ? (
                    <div className="empty-state">
                      <p className="type-body-sm">{copy.emptyProviderDetail}</p>
                    </div>
                  ) : (
                    selectedProvider.affectedAgents.map((item) => (
                      <div key={`${selectedProvider.provider}-${item.id}`} className="decision-card">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="type-heading-sm">{item.id}</p>
                            <p className="type-body-sm mt-2">{item.presenceReason ?? 'n/a'}</p>
                          </div>
                          <span className="status-pill status-pill--info">{item.presence}</span>
                        </div>
                        <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                          <span>{copy.statusLabel}: {item.status}</span>
                          <span>{copy.lastSeenLabel}: {item.lastSeenAt ?? 'n/a'}</span>
                          <span>{copy.accountLabel}: {item.accountId ?? 'n/a'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="section-title-row">
                    <h4 className="section-title">{copy.providerSignalsTitle}</h4>
                    <span className="status-pill status-pill--neutral">{selectedProvider.signals.length}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedProvider.signals.length === 0 ? (
                      <div className="empty-state">
                        <p className="type-body-sm">{copy.emptyProviderSignals}</p>
                      </div>
                    ) : (
                      selectedProvider.signals.map((signal) => (
                        <div key={`${selectedProvider.provider}-${signal.occurredAt}-${signal.kind}`} className="data-row">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="type-heading-sm">{signal.kind}</strong>
                              <span className="status-pill status-pill--info">{signal.severity}</span>
                            </div>
                            <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                              <span>{copy.lastSeenLabel}: {signal.occurredAt}</span>
                              <span>{copy.accountLabel}: {signal.accountId ?? 'n/a'}</span>
                              <span>{copy.presenceReasonLabel}: {signal.detail ?? 'n/a'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="section-title-row">
                    <h4 className="section-title">{copy.providerTimelineTitle}</h4>
                    <span className="status-pill status-pill--neutral">{selectedProvider.history.length}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedProvider.history.length === 0 ? (
                      <div className="empty-state">
                        <p className="type-body-sm">{copy.emptyProviderHistory}</p>
                      </div>
                    ) : (
                      selectedProvider.history.map((event) => (
                        <div key={`${selectedProvider.provider}-${event.occurredAt}-${event.agentId}`} className="data-row">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="type-heading-sm">{event.agentId}</strong>
                              <span className="status-pill status-pill--info">{event.presence}</span>
                            </div>
                            <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                              <span>{copy.presenceReasonLabel}: {event.reason ?? 'n/a'}</span>
                              <span>{copy.lastSeenLabel}: {event.occurredAt}</span>
                              <span>{copy.accountLabel}: {event.accountId ?? 'n/a'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyProviderDetail}</p>
              </div>
            )}
          </div>
        </div>

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
            <span className="status-pill status-pill--neutral">{visibleCraftsmen.length}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', 'failures', 'running'] as const).map((filter) => {
              const selected = craftsmenFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  className={selected ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                  onClick={() => setCraftsmenFilter(filter)}
                >
                  {filter}
                </button>
              );
            })}
          </div>
          <div className="mt-5 space-y-3">
            {visibleCraftsmen.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyCraftsmen}</p>
              </div>
            ) : (
              visibleCraftsmen.map((item) => (
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
                  {item.recentExecutions.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {item.recentExecutions.map((execution) => (
                        <div key={execution.executionId} className="type-text-xs">
                          {execution.executionId} · {execution.status} · {execution.runtimeMode ?? 'n/a'} · {execution.transport ?? 'n/a'}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.tmuxRuntimeTitle}</h3>
            <span className="status-pill status-pill--neutral">{tmuxRuntime?.session ?? 'n/a'}</span>
          </div>
          <div className="mt-5 space-y-3">
            {!tmuxRuntime || tmuxRuntime.panes.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyTmuxRuntime}</p>
              </div>
            ) : (
              tmuxRuntime.panes.map((pane) => (
                <div key={pane.agent} className="decision-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="type-heading-sm">{pane.agent}</p>
                      <p className="type-body-sm mt-2">{copy.paneLabel}: {pane.paneId ?? 'n/a'}</p>
                    </div>
                    <span className={pane.ready ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}>
                      {copy.readyLabel}: {pane.ready ? 'yes' : 'no'}
                    </span>
                  </div>
                  <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                    <span>{copy.commandLabel}: {pane.currentCommand ?? 'n/a'}</span>
                    <span>{copy.statusLabel}: {pane.active ? 'active' : 'idle'}</span>
                  </div>
                  <p className="type-text-xs mt-3">{copy.tailPreviewLabel}: {pane.tailPreview ?? 'n/a'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
