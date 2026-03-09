import { useEffect, useEffectEvent, useMemo } from 'react';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { filterAgentsByView } from '@/lib/agentProviderInsights';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';

const MIN_CHANNEL_DETAIL_STALE_AFTER_MS = 15_000;

function getCraftsmanPriority(item: { status: string; recentExecutions: Array<{ status: string; startedAt: string | null }> }) {
  if (item.recentExecutions.some((execution) => execution.status === 'failed')) {
    return 0;
  }
  if (item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running')) {
    return 1;
  }
  return 2;
}

function getCraftsmanSortTime(item: { runningSince: string | null; recentExecutions: Array<{ startedAt: string | null }> }) {
  const timestamps = [
    item.runningSince ? Date.parse(item.runningSince) : Number.NaN,
    ...item.recentExecutions.map((execution) => (execution.startedAt ? Date.parse(execution.startedAt) : Number.NaN)),
  ].filter((value) => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function getExecutionPriority(execution: { status: string }) {
  if (execution.status === 'failed') {
    return 0;
  }
  if (execution.status === 'running') {
    return 1;
  }
  return 2;
}

function sortExecutions<T extends { status: string; startedAt: string | null }>(executions: T[]) {
  return [...executions].sort((left, right) => {
    const priorityDiff = getExecutionPriority(left) - getExecutionPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return (right.startedAt ? Date.parse(right.startedAt) : 0) - (left.startedAt ? Date.parse(left.startedAt) : 0);
  });
}

function formatList(values: string[], fallback: string) {
  return values.length > 0 ? values.join(', ') : fallback;
}

export function AgentsPage() {
  const copy = useAgentsPageCopy();
  const summary = useAgentStore((state) => state.summary);
  const agents = useAgentStore((state) => state.agents);
  const craftsmen = useAgentStore((state) => state.craftsmen);
  const channelSummaries = useAgentStore((state) => state.channelSummaries);
  const channelDetails = useAgentStore((state) => state.channelDetails);
  const channelDetailFetchedAt = useAgentStore((state) => state.channelDetailFetchedAt);
  const hostSummaries = useAgentStore((state) => state.hostSummaries);
  const tmuxRuntime = useAgentStore((state) => state.tmuxRuntime);
  const tmuxTailByAgent = useAgentStore((state) => state.tmuxTailByAgent);
  const presenceFilter = useAgentStore((state) => state.presenceFilter);
  const craftsmenFilter = useAgentStore((state) => state.craftsmenFilter);
  const channelFilter = useAgentStore((state) => state.channelFilter);
  const hostFilter = useAgentStore((state) => state.hostFilter);
  const error = useAgentStore((state) => state.error);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const fetchChannelDetail = useAgentStore((state) => state.fetchChannelDetail);
  const fetchTmuxTail = useAgentStore((state) => state.fetchTmuxTail);
  const channelDetailLoading = useAgentStore((state) => state.channelDetailLoading);
  const channelDetailError = useAgentStore((state) => state.channelDetailError);
  const tmuxTailLoadingByAgent = useAgentStore((state) => state.tmuxTailLoadingByAgent);
  const setPresenceFilter = useAgentStore((state) => state.setPresenceFilter);
  const setCraftsmenFilter = useAgentStore((state) => state.setCraftsmenFilter);
  const setChannelFilter = useAgentStore((state) => state.setChannelFilter);
  const setHostFilter = useAgentStore((state) => state.setHostFilter);
  const refreshInterval = useSettingsStore((state) => state.refreshInterval);
  const pauseOnHidden = useSettingsStore((state) => state.pauseOnHidden);
  const selectedChannelId = channelFilter ?? channelSummaries[0]?.channel ?? null;
  const channelDetailStaleAfterMs = Math.max(refreshInterval * 3_000, MIN_CHANNEL_DETAIL_STALE_AFTER_MS);
  const isChannelDetailStale = useEffectEvent((channel: string | null) => {
    if (!channel) {
      return false;
    }
    const fetchedAt = channelDetailFetchedAt[channel];
    if (!channelDetails[channel] || fetchedAt === undefined) {
      return true;
    }
    return Date.now() - fetchedAt >= channelDetailStaleAfterMs;
  });

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (refreshInterval <= 0) {
      return undefined;
    }
    const onVisibilityChange = () => {
      if (pauseOnHidden && document.hidden) {
        return;
      }
      void fetchStatus();
      if (selectedChannelId && isChannelDetailStale(selectedChannelId)) {
        void fetchChannelDetail(selectedChannelId);
      }
    };
    const intervalId = window.setInterval(() => {
      if (pauseOnHidden && document.hidden) {
        return;
      }
      void fetchStatus();
    }, refreshInterval * 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchChannelDetail, fetchStatus, pauseOnHidden, refreshInterval, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !isChannelDetailStale(selectedChannelId)) {
      return;
    }
    void fetchChannelDetail(selectedChannelId);
  }, [fetchChannelDetail, selectedChannelId]);

  const visibleAgents = filterAgentsByView(agents, presenceFilter, channelFilter, hostFilter);
  const selectedChannel = useMemo(
    () => {
      if (!selectedChannelId) {
        return null;
      }
      return channelDetails[selectedChannelId]
        ?? channelSummaries.find((item) => item.channel === selectedChannelId)
        ?? null;
    },
    [channelDetails, channelSummaries, selectedChannelId],
  );
  const runtimeSummary = useMemo(() => {
    const panes = tmuxRuntime?.panes ?? [];
    return {
      session: tmuxRuntime?.session ?? 'n/a',
      totalPanes: panes.length,
      readyPanes: panes.filter((pane) => pane.ready).length,
      activePanes: panes.filter((pane) => pane.active).length,
      runningCraftsmen: craftsmen.filter((item) => item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running')).length,
      failedCraftsmen: craftsmen.filter((item) => item.status === 'failed' || item.recentExecutions.some((execution) => execution.status === 'failed')).length,
    };
  }, [craftsmen, tmuxRuntime]);
  const visibleCraftsmen = useMemo(() => {
    const filtered = craftsmenFilter === 'all'
      ? craftsmen
      : craftsmenFilter === 'running'
        ? craftsmen.filter((item) => item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running'))
        : craftsmen.filter((item) => item.recentExecutions.some((execution) => execution.status === 'failed'));
    return [...filtered].sort((left, right) => {
      const priorityDiff = getCraftsmanPriority(left) - getCraftsmanPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return getCraftsmanSortTime(right) - getCraftsmanSortTime(left);
    });
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

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.channelSummaryTitle}</h3>
            <span className="status-pill status-pill--neutral">{channelSummaries.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {channelSummaries.map((item) => {
              const isActive = channelFilter === item.channel;
              return (
                <button
                  key={item.channel}
                  type="button"
                  className="data-row w-full text-left"
                  onClick={() => setChannelFilter(isActive ? null : item.channel)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{item.channel}</strong>
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
            <h3 className="section-title">{copy.hostSummaryTitle}</h3>
            <span className="status-pill status-pill--neutral">{hostSummaries.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {hostSummaries.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.emptyHostSummary}</p>
              </div>
            ) : (
              hostSummaries.map((item) => {
                const isActive = hostFilter === item.host;
                return (
                  <button
                    key={item.host}
                    type="button"
                    className="data-row w-full text-left"
                    onClick={() => setHostFilter(isActive ? null : item.host)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="type-heading-sm">{item.host}</strong>
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
              })
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.runtimeSummaryTitle}</h3>
            <span className="status-pill status-pill--neutral">{runtimeSummary.session}</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimeSessionLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.session}</p>
              </div>
            </div>
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimePanesLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.totalPanes}</p>
              </div>
            </div>
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimeReadyPanesLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.readyPanes}</p>
              </div>
            </div>
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimeActivePanesLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.activePanes}</p>
              </div>
            </div>
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimeRunningCraftsmenLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.runningCraftsmen}</p>
              </div>
            </div>
            <div className="data-row">
              <div className="min-w-0 flex-1">
                <p className="type-text-xs">{copy.runtimeFailedCraftsmenLabel}</p>
                <p className="type-heading-sm mt-2">{runtimeSummary.failedCraftsmen}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.channelDetailTitle}</h3>
            <span className="status-pill status-pill--neutral">{selectedChannel?.channel ?? 'n/a'}</span>
          </div>
          <div className="mt-5 space-y-4">
            {selectedChannel ? (
              <>
                <div className="type-text-xs flex flex-wrap items-center gap-3">
                  <span>{copy.presenceLabel}: {selectedChannel.overallPresence}</span>
                  <span>{copy.presenceReasonLabel}: {selectedChannel.presenceReason ?? 'n/a'}</span>
                  <span>{copy.lastSeenLabel}: {selectedChannel.lastSeenAt ?? 'n/a'}</span>
                </div>
                <div className="type-text-xs flex flex-wrap items-center gap-3">
                  <span>{copy.metrics.totalAgents}: {selectedChannel.totalAgents}</span>
                  <span>{copy.metrics.activeAgents}: {selectedChannel.busyAgents}</span>
                  <span>{copy.metrics.staleAgents}: {selectedChannel.staleAgents}</span>
                  <span>{copy.metrics.disconnectedAgents}: {selectedChannel.disconnectedAgents}</span>
                  <span>signal: {selectedChannel.signalStatus}</span>
                  <span>ready: {selectedChannel.signalCounts.readyEvents}</span>
                  <span>restart: {selectedChannel.signalCounts.restartEvents}</span>
                  <span>transport: {selectedChannel.signalCounts.transportErrors}</span>
                </div>
                <div className="space-y-3">
                  {selectedChannel.affectedAgents.length === 0 ? (
                    <div className="empty-state">
                      <p className="type-body-sm">{copy.emptyChannelDetail}</p>
                    </div>
                  ) : (
                    selectedChannel.affectedAgents.map((item) => (
                      <div key={`${selectedChannel.channel}-${item.id}`} className="decision-card">
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
                    <h4 className="section-title">{copy.channelSignalsTitle}</h4>
                    <span className="status-pill status-pill--neutral">{selectedChannel.signals.length}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedChannel.signals.length === 0 ? (
                      <div className="empty-state">
                        <p className="type-body-sm">{copy.emptyChannelSignals}</p>
                      </div>
                    ) : (
                      selectedChannel.signals.map((signal) => (
                        <div key={`${selectedChannel.channel}-${signal.occurredAt}-${signal.kind}`} className="data-row">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="type-heading-sm">{signal.kind}</strong>
                              <span className="status-pill status-pill--info">{signal.severity}</span>
                            </div>
                            <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                              <span>{copy.channelLabel}: {signal.channel}</span>
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
                    <h4 className="section-title">{copy.channelTimelineTitle}</h4>
                    <span className="status-pill status-pill--neutral">{selectedChannel.history.length}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedChannel.history.length === 0 ? (
                      <div className="empty-state">
                        <p className="type-body-sm">{copy.emptyChannelHistory}</p>
                      </div>
                    ) : (
                      selectedChannel.history.map((event) => (
                        <div key={`${selectedChannel.channel}-${event.occurredAt}-${event.agentId}`} className="data-row">
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
                <p className="type-body-sm">{copy.emptyChannelDetail}</p>
              </div>
            )}
            {channelDetailLoading ? <p className="type-text-xs">{copy.loadingTailAction}</p> : null}
            {!channelDetailLoading && channelDetailError ? (
              <div className="inline-alert inline-alert--danger">{channelDetailError}</div>
            ) : null}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.agentListTitle}</h3>
            <span className="status-pill status-pill--neutral">{visibleAgents.length}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="type-text-xs">{copy.filtersTitle}</span>
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
                      <span>{copy.channelLabel}: {formatList(agent.channelProviders, 'n/a')}</span>
                      <span>{copy.hostLabel}: {agent.hostFramework ?? 'n/a'}</span>
                      <span>{copy.inventorySourcesLabel}: {formatList(agent.inventorySources, 'unknown')}</span>
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
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
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
                      {sortExecutions(item.recentExecutions).map((execution) => (
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
                    <span>{copy.continuityBackendLabel}: {pane.continuityBackend}</span>
                    <span>{copy.resumeCapabilityLabel}: {pane.resumeCapability}</span>
                    <span>{copy.identitySourceLabel}: {pane.identitySource}</span>
                    <span>{copy.identityPathLabel}: {pane.identityPath ?? 'n/a'}</span>
                    <span>{copy.observedAtLabel}: {pane.sessionObservedAt ?? 'n/a'}</span>
                    <span>{copy.sessionReferenceLabel}: {pane.sessionReference ?? 'n/a'}</span>
                    <span>{copy.recoveryModeLabel}: {pane.lastRecoveryMode ?? 'n/a'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="type-text-xs">{copy.tailPreviewLabel}: {tmuxTailByAgent[pane.agent] ?? pane.tailPreview ?? 'n/a'}</p>
                    <button
                      type="button"
                      className="status-pill status-pill--neutral"
                      onClick={() => void fetchTmuxTail(pane.agent)}
                    >
                      {tmuxTailLoadingByAgent[pane.agent] ? copy.loadingTailAction : copy.loadTailAction}
                    </button>
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
