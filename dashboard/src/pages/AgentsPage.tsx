import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { filterAgentsByView } from '@/lib/agentProviderInsights';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';

const MIN_CHANNEL_DETAIL_STALE_AFTER_MS = 15_000;

type DrawerAxis = 'agents' | 'channels' | 'execution' | null;
type ChannelDetailTab = 'summary' | 'signals' | 'history';
type IssueGroup = {
  id: string;
  label: string;
  count: number;
  severity: 'danger' | 'warning';
  summary: string;
  detail: string;
  action: () => void;
};

function getCraftsmanPriority(item: { status: string; recentExecutions: Array<{ status: string; startedAt: string | null }> }) {
  if (item.status === 'failed' || item.recentExecutions.some((execution) => execution.status === 'failed')) {
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

function getPillClass(tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral') {
  switch (tone) {
    case 'danger':
      return 'status-pill status-pill--danger';
    case 'warning':
      return 'status-pill status-pill--warning';
    case 'success':
      return 'status-pill status-pill--success';
    case 'info':
      return 'status-pill status-pill--info';
    default:
      return 'status-pill status-pill--neutral';
  }
}

export function AgentsPage() {
  const copy = useAgentsPageCopy();
  const isMobile = useMediaQuery('(max-width: 767px)');
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

  const [activeDrawer, setActiveDrawer] = useState<DrawerAxis>(null);
  const [channelTab, setChannelTab] = useState<ChannelDetailTab>('summary');
  const [manualSelectedChannelId, setManualSelectedChannelId] = useState<string | null>(null);
  const selectedChannelId = channelFilter ?? manualSelectedChannelId ?? channelSummaries[0]?.channel ?? null;

  const channelDetailStaleAfterMs = Math.max(refreshInterval * 3_000, MIN_CHANNEL_DETAIL_STALE_AFTER_MS);
  const isChannelDetailStale = useCallback((channel: string | null) => {
    if (!channel) {
      return false;
    }
    const fetchedAt = channelDetailFetchedAt[channel];
    if (!channelDetails[channel] || fetchedAt === undefined) {
      return true;
    }
    return Date.now() - fetchedAt >= channelDetailStaleAfterMs;
  }, [channelDetailFetchedAt, channelDetailStaleAfterMs, channelDetails]);

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
  }, [fetchChannelDetail, fetchStatus, isChannelDetailStale, pauseOnHidden, refreshInterval, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !isChannelDetailStale(selectedChannelId)) {
      return;
    }
    void fetchChannelDetail(selectedChannelId);
  }, [fetchChannelDetail, isChannelDetailStale, selectedChannelId]);

  const selectChannel = useCallback((channel: string) => {
    setManualSelectedChannelId(channel);
    setChannelFilter(channel);
  }, [setChannelFilter]);

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
      unhealthyPanes: panes.filter((pane) => !pane.ready).length,
    };
  }, [craftsmen, tmuxRuntime]);
  const visibleCraftsmen = useMemo(() => {
    const filtered = craftsmenFilter === 'all'
      ? craftsmen
      : craftsmenFilter === 'running'
        ? craftsmen.filter((item) => item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running'))
        : craftsmen.filter((item) => item.status === 'failed' || item.recentExecutions.some((execution) => execution.status === 'failed'));
    return [...filtered].sort((left, right) => {
      const priorityDiff = getCraftsmanPriority(left) - getCraftsmanPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return getCraftsmanSortTime(right) - getCraftsmanSortTime(left);
    });
  }, [craftsmen, craftsmenFilter]);

  const degradedChannels = channelSummaries.filter(
    (item) => item.signalStatus !== 'healthy' || item.overallPresence === 'stale' || item.overallPresence === 'disconnected',
  );
  const criticalAgents = agents.filter((agent) => ['disconnected', 'offline'].includes(agent.presence));
  const staleAgents = agents.filter((agent) => agent.presence === 'stale');
  const failedCraftsmen = craftsmen.filter((item) => item.status === 'failed' || item.recentExecutions.some((execution) => execution.status === 'failed'));
  const unhealthyPanes = (tmuxRuntime?.panes ?? []).filter((pane) => !pane.ready);
  const openIssueCount =
    degradedChannels.length +
    criticalAgents.length +
    staleAgents.length +
    failedCraftsmen.length +
    unhealthyPanes.length;
  const issueGroups = useMemo<IssueGroup[]>(() => {
    const groups: IssueGroup[] = [];
    if (degradedChannels.length > 0) {
      const transportErrors = degradedChannels.reduce((sum, item) => sum + item.signalCounts.transportErrors, 0);
      const primaryChannel = degradedChannels[0];
      groups.push({
        id: 'channel-health',
        label: copy.workspace.issueGroups.channelHealth,
        count: degradedChannels.length,
        severity: transportErrors > 0 || degradedChannels.some((item) => item.disconnectedAgents > 0) ? 'danger' : 'warning',
        summary: copy.workspace.issueGroups.channelSummary(degradedChannels.length),
        detail: copy.workspace.issueGroups.channelDetail(primaryChannel.channel, primaryChannel.overallPresence, transportErrors),
        action: () => {
          selectChannel(primaryChannel.channel);
          setChannelTab('summary');
          setActiveDrawer('channels');
        },
      });
    }
    if (criticalAgents.length > 0) {
      groups.push({
        id: 'agent-critical',
        label: copy.workspace.issueGroups.agentCritical,
        count: criticalAgents.length,
        severity: 'danger',
        summary: copy.workspace.issueGroups.agentCriticalSummary(criticalAgents.length),
        detail: copy.workspace.issueGroups.agentCriticalDetail(criticalAgents[0].id),
        action: () => {
          setPresenceFilter('disconnected');
          setActiveDrawer('agents');
        },
      });
    }
    if (staleAgents.length > 0) {
      groups.push({
        id: 'agent-stale',
        label: copy.workspace.issueGroups.agentStale,
        count: staleAgents.length,
        severity: 'warning',
        summary: copy.workspace.issueGroups.agentStaleSummary(staleAgents.length),
        detail: copy.workspace.issueGroups.agentStaleDetail(staleAgents[0].id),
        action: () => {
          setPresenceFilter('stale');
          setActiveDrawer('agents');
        },
      });
    }
    if (failedCraftsmen.length > 0) {
      groups.push({
        id: 'craftsman-failed',
        label: copy.workspace.issueGroups.craftsmanFailed,
        count: failedCraftsmen.length,
        severity: 'danger',
        summary: copy.workspace.issueGroups.craftsmanFailedSummary(failedCraftsmen.length),
        detail: copy.workspace.issueGroups.craftsmanFailedDetail(failedCraftsmen[0].id),
        action: () => {
          setCraftsmenFilter('failures');
          setActiveDrawer('execution');
        },
      });
    }
    if (unhealthyPanes.length > 0) {
      groups.push({
        id: 'tmux-unhealthy',
        label: copy.workspace.issueGroups.tmuxUnhealthy,
        count: unhealthyPanes.length,
        severity: 'warning',
        summary: copy.workspace.issueGroups.tmuxUnhealthySummary(unhealthyPanes.length),
        detail: copy.workspace.issueGroups.tmuxUnhealthyDetail(unhealthyPanes[0].agent),
        action: () => {
          setActiveDrawer('execution');
        },
      });
    }
    return groups;
  }, [copy.workspace.issueGroups, criticalAgents, degradedChannels, failedCraftsmen, selectChannel, setCraftsmenFilter, setPresenceFilter, staleAgents, unhealthyPanes]);

  const globalSignals = [
    {
      label: copy.workspace.signalLabels.channelIssues,
      value: degradedChannels.length,
      note: copy.workspace.signalNotes.channels(channelSummaries.length),
      tone: degradedChannels.length > 0 ? 'warning' : 'success',
    },
    {
      label: copy.workspace.signalLabels.craftsmanFailures,
      value: runtimeSummary.failedCraftsmen,
      note: copy.workspace.signalNotes.craftsmen(runtimeSummary.runningCraftsmen),
      tone: runtimeSummary.failedCraftsmen > 0 ? 'danger' : 'success',
    },
    {
      label: copy.workspace.signalLabels.agentIssues,
      value: criticalAgents.length + staleAgents.length,
      note: copy.workspace.signalNotes.onlineAgents(summary?.onlineAgents ?? 0),
      tone: criticalAgents.length + staleAgents.length > 0 ? 'warning' : 'success',
    },
    {
      label: copy.workspace.signalLabels.tmuxUnready,
      value: runtimeSummary.unhealthyPanes,
      note: copy.workspace.signalNotes.readyPanes(runtimeSummary.readyPanes, runtimeSummary.totalPanes),
      tone: runtimeSummary.unhealthyPanes > 0 ? 'warning' : 'success',
    },
  ] as const;

  const axisCards = [
    {
      key: 'agents' as const,
      title: 'Agent',
      action: copy.workspace.axis.agentAction,
      summary: copy.workspace.axis.agentSummary,
      count: agents.length,
      tone: staleAgents.length > 0 ? 'warning' as const : 'success' as const,
      onClick: () => setActiveDrawer('agents'),
    },
    {
      key: 'channels' as const,
      title: 'Channel',
      action: copy.workspace.axis.channelAction,
      summary: copy.workspace.axis.channelSummary,
      count: channelSummaries.length,
      tone: degradedChannels.length > 0 ? 'warning' as const : 'success' as const,
      onClick: () => {
        setChannelTab('summary');
        setActiveDrawer('channels');
      },
    },
    {
      key: 'execution' as const,
      title: 'Execution',
      action: copy.workspace.axis.executionAction,
      summary: copy.workspace.axis.executionSummary,
      count: runtimeSummary.totalPanes + craftsmen.length,
      tone: runtimeSummary.failedCraftsmen > 0 ? 'danger' as const : 'info' as const,
      onClick: () => setActiveDrawer('execution'),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.activeTasks}</span>
              <span className="inline-stat__value">{summary?.activeTasks ?? 0}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.activeAgents}</span>
              <span className="inline-stat__value">{summary?.activeAgents ?? 0}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.runtimeSessionLabel}</span>
              <span className="inline-stat__value">{runtimeSummary.session}</span>
            </div>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className={isMobile ? 'space-y-6' : 'grid gap-6 xl:grid-cols-[1.2fr_0.8fr]'} data-testid="agents-global-status">
        <div className="surface-panel surface-panel--workspace space-y-5">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.workspace.overviewKicker}</p>
              <h3 className="section-title">{copy.workspace.overviewTitle}</h3>
            </div>
            <span className={getPillClass(openIssueCount > 0 ? 'warning' : 'success')}>
              {openIssueCount > 0 ? copy.workspace.issueCountOpen(openIssueCount) : copy.workspace.issueCountStable}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {globalSignals.map((signal) => (
              <div key={signal.label} className="data-row">
                <div className="min-w-0 flex-1">
                  <p className="type-text-xs">{signal.label}</p>
                  <p className="type-heading-sm mt-3">{signal.value}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={getPillClass(signal.tone)}>{signal.value > 0 ? copy.workspace.attentionLabel : copy.workspace.stableLabel}</span>
                    <span className="type-text-xs">{signal.note}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!isMobile ? (
          <div className="surface-panel surface-panel--workspace space-y-4">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.workspace.focusKicker}</p>
                <h3 className="section-title">{copy.workspace.focusTitle}</h3>
              </div>
              <span className="status-pill status-pill--neutral">{runtimeSummary.session}</span>
            </div>
            <div className="space-y-3">
                <div className="data-row">
                  <div className="min-w-0 flex-1">
                    <p className="type-text-xs">{copy.workspace.channelFocusLabel}</p>
                    <p className="type-body-sm mt-2">{degradedChannels.length > 0 ? copy.workspace.channelFocusMessage(degradedChannels[0].channel) : copy.workspace.channelFocusEmpty}</p>
                  </div>
                </div>
                <div className="data-row">
                  <div className="min-w-0 flex-1">
                    <p className="type-text-xs">{copy.workspace.agentFocusLabel}</p>
                    <p className="type-body-sm mt-2">
                      {criticalAgents.length > 0
                        ? copy.workspace.agentCriticalMessage(criticalAgents[0].id)
                        : staleAgents.length > 0
                          ? copy.workspace.agentStaleMessage(staleAgents[0].id)
                          : copy.workspace.agentFocusEmpty}
                    </p>
                  </div>
                </div>
                <div className="data-row">
                  <div className="min-w-0 flex-1">
                    <p className="type-text-xs">{copy.workspace.executionFocusLabel}</p>
                    <p className="type-body-sm mt-2">
                      {runtimeSummary.failedCraftsmen > 0
                        ? copy.workspace.executionFailedMessage(runtimeSummary.failedCraftsmen)
                        : copy.workspace.executionReadyMessage(runtimeSummary.readyPanes, runtimeSummary.totalPanes)}
                    </p>
                  </div>
                </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="surface-panel surface-panel--workspace" data-testid="agents-issue-queue">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.workspace.issueQueueKicker}</p>
              <h3 className="section-title">{copy.workspace.issueQueueTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">{openIssueCount}</span>
          </div>
          <div className="workbench-scroll workbench-scroll--list agents-issue-queue__scroll" data-testid="agents-issue-queue-scroll">
            {issueGroups.length === 0 ? (
              <div className="empty-state">
                <p className="type-body-sm">{copy.workspace.issueQueueEmpty}</p>
              </div>
            ) : (
              <div className="dense-list mt-5">
                {issueGroups.map((issue) => (
                  <button key={issue.id} type="button" className="dense-row" onClick={issue.action}>
                    <div className="dense-row__main">
                      <div className="dense-row__titleblock">
                        <strong className="dense-row__title">{issue.label}</strong>
                        <span className={getPillClass(issue.severity)}>{issue.count}</span>
                      </div>
                      <div className="dense-row__meta">
                        <span>{issue.summary}</span>
                        <span>{issue.detail}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="agents-axis-entry">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.workspace.detailEntryKicker}</p>
              <h3 className="section-title">{copy.workspace.detailEntryTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">3</span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {axisCards.map((axis) => (
              <button key={axis.key} type="button" className="decision-card text-left" onClick={axis.onClick}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="type-text-xs">{axis.title}</p>
                    <p className="type-heading-sm mt-2">{axis.action}</p>
                  </div>
                  <span className={getPillClass(axis.tone)}>{axis.count}</span>
                </div>
                <p className="type-body-sm mt-4">{axis.summary}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeDrawer === 'agents' ? (
        <WorkbenchDetailSheet
          label={copy.workspace.drawers.agentLabel}
          title={copy.workspace.drawers.agentTitle}
          onClose={() => setActiveDrawer(null)}
        >
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.agentListTitle}</h3>
                <span className="status-pill status-pill--neutral">{visibleAgents.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-text-xs">{copy.channelLabel}</span>
                <button
                  type="button"
                  className={channelFilter === null ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                  onClick={() => setChannelFilter(null)}
                >
                  all
                </button>
                {channelSummaries.map((item) => (
                  <button
                    key={item.channel}
                    type="button"
                    className={channelFilter === item.channel ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                    onClick={() => setChannelFilter(item.channel)}
                  >
                    {item.channel}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-text-xs">{copy.hostLabel}</span>
                <button
                  type="button"
                  className={hostFilter === null ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                  onClick={() => setHostFilter(null)}
                >
                  all
                </button>
                {hostSummaries.map((item) => (
                  <button
                    key={item.host}
                    type="button"
                    className={hostFilter === item.host ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                    onClick={() => setHostFilter(item.host)}
                  >
                    {item.host}
                  </button>
                ))}
              </div>
              {visibleAgents.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyAgents}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleAgents.map((agent) => (
                    <div key={agent.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="type-heading-sm">{agent.id}</strong>
                          <span className="status-pill status-pill--neutral">{agent.status}</span>
                          <span className={getPillClass(agent.presence === 'online' ? 'success' : agent.presence === 'stale' ? 'warning' : 'danger')}>
                            {agent.presence}
                          </span>
                        </div>
                        <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                          <span>{copy.roleLabel}: {agent.role ?? 'unassigned'}</span>
                          <span>{copy.channelLabel}: {formatList(agent.channelProviders, 'n/a')}</span>
                          <span>{copy.hostLabel}: {agent.hostFramework ?? 'n/a'}</span>
                          <span>{copy.inventorySourcesLabel}: {formatList(agent.inventorySources, 'unknown')}</span>
                          <span>{copy.modelLabel}: {agent.primaryModel ?? 'n/a'}</span>
                          <span>{copy.presenceReasonLabel}: {agent.presenceReason ?? 'n/a'}</span>
                          <span>{copy.lastSeenLabel}: {agent.lastSeenAt ?? 'n/a'}</span>
                          <span>{copy.loadLabel}: {agent.load}</span>
                          <span>{copy.taskCountLabel}: {agent.taskCount}</span>
                          <span>{copy.subtaskCountLabel}: {agent.subtaskCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.hostSummaryTitle}</h3>
                <span className="status-pill status-pill--neutral">{hostSummaries.length}</span>
              </div>
              {hostSummaries.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyHostSummary}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hostSummaries.map((item) => (
                    <div key={item.host} className="decision-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="type-heading-sm">{item.host}</p>
                          <p className="type-body-sm mt-2">{copy.presenceLabel}: {item.overallPresence}</p>
                        </div>
                        <span className={getPillClass(item.overallPresence === 'online' ? 'success' : 'warning')}>{item.totalAgents}</span>
                      </div>
                      <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                        <span>{copy.metrics.activeAgents}: {item.busyAgents}</span>
                        <span>{copy.metrics.onlineAgents}: {item.onlineAgents}</span>
                        <span>{copy.metrics.staleAgents}: {item.staleAgents}</span>
                        <span>{copy.metrics.disconnectedAgents}: {item.disconnectedAgents}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </WorkbenchDetailSheet>
      ) : null}

      {activeDrawer === 'channels' ? (
        <WorkbenchDetailSheet
          label={copy.workspace.drawers.channelLabel}
          title={copy.workspace.drawers.channelTitle}
          onClose={() => setActiveDrawer(null)}
        >
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.channelSummaryTitle}</h3>
                <span className="status-pill status-pill--neutral">{channelSummaries.length}</span>
              </div>
              {channelSummaries.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyChannelDetail}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {channelSummaries.map((item) => (
                    <button
                      key={item.channel}
                      type="button"
                      className={selectedChannelId === item.channel ? 'dense-row dense-row--active' : 'dense-row'}
                      onClick={() => selectChannel(item.channel)}
                    >
                      <div className="dense-row__main">
                        <div className="dense-row__titleblock">
                          <strong className="dense-row__title">{item.channel}</strong>
                          <span className={getPillClass(item.signalStatus === 'healthy' ? 'success' : 'warning')}>{item.signalStatus}</span>
                        </div>
                        <div className="dense-row__meta">
                          <span>{copy.presenceLabel}: {item.overallPresence}</span>
                          <span>{copy.lastSeenLabel}: {item.lastSeenAt ?? 'n/a'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['summary', 'signals', 'history'] as const).map((tab) => {
                  const selected = channelTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      className={selected ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                      onClick={() => setChannelTab(tab)}
                    >
                      {copy.workspace.tabs[tab]}
                    </button>
                  );
                })}
              </div>

              {selectedChannel ? (
                <>
                  {channelTab === 'summary' ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="data-row">
                          <div className="min-w-0 flex-1">
                            <p className="type-text-xs">{copy.presenceLabel}</p>
                            <p className="type-heading-sm mt-2">{selectedChannel.overallPresence}</p>
                          </div>
                        </div>
                        <div className="data-row">
                          <div className="min-w-0 flex-1">
                            <p className="type-text-xs">{copy.presenceReasonLabel}</p>
                            <p className="type-heading-sm mt-2">{selectedChannel.presenceReason ?? 'n/a'}</p>
                          </div>
                        </div>
                        <div className="data-row">
                          <div className="min-w-0 flex-1">
                            <p className="type-text-xs">{copy.metrics.totalAgents}</p>
                            <p className="type-heading-sm mt-2">{selectedChannel.totalAgents}</p>
                          </div>
                        </div>
                        <div className="data-row">
                          <div className="min-w-0 flex-1">
                            <p className="type-text-xs">{copy.metrics.staleAgents}</p>
                            <p className="type-heading-sm mt-2">{selectedChannel.staleAgents}</p>
                          </div>
                        </div>
                      </div>
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
                              <span className={getPillClass(item.presence === 'online' ? 'success' : item.presence === 'stale' ? 'warning' : 'danger')}>
                                {item.presence}
                              </span>
                            </div>
                            <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                              <span>{copy.statusLabel}: {item.status}</span>
                              <span>{copy.accountLabel}: {item.accountId ?? 'n/a'}</span>
                              <span>{copy.lastSeenLabel}: {item.lastSeenAt ?? 'n/a'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {channelTab === 'signals' ? (
                    <div className="space-y-3">
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
                                <span className={getPillClass(signal.severity === 'error' ? 'danger' : 'warning')}>{signal.severity}</span>
                              </div>
                              <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                                <span>{copy.channelLabel}: {signal.channel}</span>
                                <span>{copy.accountLabel}: {signal.accountId ?? 'n/a'}</span>
                                <span>{copy.lastSeenLabel}: {signal.occurredAt}</span>
                                <span>{copy.presenceReasonLabel}: {signal.detail ?? 'n/a'}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}

                  {channelTab === 'history' ? (
                    <div className="space-y-3">
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
                                <span className={getPillClass(event.presence === 'online' ? 'success' : event.presence === 'stale' ? 'warning' : 'danger')}>
                                  {event.presence}
                                </span>
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
                  ) : null}
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
            </section>
          </div>
        </WorkbenchDetailSheet>
      ) : null}

      {activeDrawer === 'execution' ? (
        <WorkbenchDetailSheet
          label={copy.workspace.drawers.executionLabel}
          title={copy.workspace.drawers.executionTitle}
          onClose={() => setActiveDrawer(null)}
        >
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.runtimeSummaryTitle}</h3>
                <span className="status-pill status-pill--neutral">{runtimeSummary.session}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
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
            </section>

            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.craftsmenTitle}</h3>
                <span className="status-pill status-pill--neutral">{visibleCraftsmen.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
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
              {visibleCraftsmen.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyCraftsmen}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleCraftsmen.map((item) => (
                    <div key={item.id} className="decision-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="type-heading-sm">{item.id}</p>
                          <p className="type-body-sm mt-2">{item.title}</p>
                        </div>
                        <span className={getPillClass(item.status === 'failed' ? 'danger' : item.status === 'busy' ? 'warning' : 'success')}>
                          {item.status}
                        </span>
                      </div>
                      <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                        <span>{copy.currentTaskLabel}: {item.taskId}</span>
                        <span>{item.subtaskId}</span>
                        <span>{copy.lastSeenLabel}: {item.runningSince ?? 'n/a'}</span>
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
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="section-title-row">
                <h3 className="section-title">{copy.tmuxRuntimeTitle}</h3>
                <span className="status-pill status-pill--neutral">{tmuxRuntime?.session ?? 'n/a'}</span>
              </div>
              {!tmuxRuntime || tmuxRuntime.panes.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyTmuxRuntime}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tmuxRuntime.panes.map((pane) => (
                    <div key={pane.agent} className="decision-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="type-heading-sm">{pane.agent}</p>
                          <p className="type-body-sm mt-2">{copy.paneLabel}: {pane.paneId ?? 'n/a'}</p>
                        </div>
                        <span className={getPillClass(pane.ready ? 'success' : 'warning')}>
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
                  ))}
                </div>
              )}
            </section>
          </div>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
