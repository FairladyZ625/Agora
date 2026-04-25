import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Bot, Cable, Cpu, Search, ShieldCheck, UsersRound, Waypoints, Workflow } from 'lucide-react';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { formatSelectabilityReason, resolveAgentSelectability } from '@/lib/agentSelectability';
import { useAgentsPageCopy } from '@/lib/dashboardCopy';
import { filterAgentsByView } from '@/lib/agentProviderInsights';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';

const MIN_CHANNEL_DETAIL_STALE_AFTER_MS = 15_000;

type DrawerAxis = 'agents' | 'channels' | 'execution' | null;
type ChannelDetailTab = 'summary' | 'signals' | 'history';
type AgentSelectabilityFilter = 'all' | 'selectable' | 'restricted';
type ParticipantFilter = 'all' | 'accounts' | 'agents' | 'runtimes' | 'bridges';
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

function getPresenceTone(presence: 'online' | 'offline' | 'disconnected' | 'stale') {
  if (presence === 'online') {
    return 'success' as const;
  }
  if (presence === 'stale') {
    return 'warning' as const;
  }
  return 'danger' as const;
}

function getSelectabilityTone(selectability: 'selectable' | 'restricted') {
  return selectability === 'selectable' ? 'info' as const : 'danger' as const;
}

function getStatusTone(status: string | null | undefined) {
  const normalized = (status ?? '').toLowerCase();
  if (['healthy', 'online', 'running', 'active', 'ready', 'selectable'].includes(normalized)) {
    return 'success' as const;
  }
  if (['stale', 'recovering', 'busy', 'idle', 'unknown'].includes(normalized)) {
    return 'warning' as const;
  }
  if (['failed', 'degraded', 'disconnected', 'offline', 'restricted'].includes(normalized)) {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(value)}%`;
}

function getRuntimeSlotIdentity(
  slot: {
    agent: string;
    provider: string;
    sessionId: string | null;
    sessionReference: string | null;
    executionId: string | null;
    taskId?: string | null;
    subtaskId?: string | null;
    currentCommand?: string | null;
    status?: string | null;
  },
) {
  const stableDetail = slot.sessionReference
    ?? slot.sessionId
    ?? slot.executionId
    ?? slot.taskId
    ?? slot.subtaskId
    ?? slot.currentCommand
    ?? slot.status
    ?? 'unbound';
  return `${slot.agent}:${slot.provider}:${stableDetail}`;
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
  const craftsmanRuntime = useAgentStore((state) => state.craftsmanRuntime);
  const runtimeTailByAgent = useAgentStore((state) => state.runtimeTailByAgent);
  const presenceFilter = useAgentStore((state) => state.presenceFilter);
  const craftsmenFilter = useAgentStore((state) => state.craftsmenFilter);
  const channelFilter = useAgentStore((state) => state.channelFilter);
  const hostFilter = useAgentStore((state) => state.hostFilter);
  const error = useAgentStore((state) => state.error);
  const fetchStatus = useAgentStore((state) => state.fetchStatus);
  const fetchChannelDetail = useAgentStore((state) => state.fetchChannelDetail);
  const fetchRuntimeTail = useAgentStore((state) => state.fetchRuntimeTail);
  const channelDetailLoading = useAgentStore((state) => state.channelDetailLoading);
  const channelDetailError = useAgentStore((state) => state.channelDetailError);
  const runtimeTailLoadingByAgent = useAgentStore((state) => state.runtimeTailLoadingByAgent);
  const setPresenceFilter = useAgentStore((state) => state.setPresenceFilter);
  const setCraftsmenFilter = useAgentStore((state) => state.setCraftsmenFilter);
  const setChannelFilter = useAgentStore((state) => state.setChannelFilter);
  const setHostFilter = useAgentStore((state) => state.setHostFilter);
  const refreshInterval = useSettingsStore((state) => state.refreshInterval);
  const pauseOnHidden = useSettingsStore((state) => state.pauseOnHidden);

  const [activeDrawer, setActiveDrawer] = useState<DrawerAxis>(null);
  const [channelTab, setChannelTab] = useState<ChannelDetailTab>('summary');
  const [selectabilityFilter, setSelectabilityFilter] = useState<AgentSelectabilityFilter>('all');
  const [manualSelectedChannelId, setManualSelectedChannelId] = useState<string | null>(null);
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilter>('all');
  const [participantQuery, setParticipantQuery] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
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

  const baseVisibleAgents = filterAgentsByView(agents, presenceFilter, channelFilter, hostFilter);
  const visibleAgents = useMemo(
    () => baseVisibleAgents.filter((agent) => (
      selectabilityFilter === 'all'
        ? true
        : resolveAgentSelectability(agent).value === selectabilityFilter
    )),
    [baseVisibleAgents, selectabilityFilter],
  );
  const selectabilitySummary = useMemo(() => ({
    selectable: baseVisibleAgents.filter((agent) => resolveAgentSelectability(agent).value === 'selectable').length,
    restricted: baseVisibleAgents.filter((agent) => resolveAgentSelectability(agent).value === 'restricted').length,
  }), [baseVisibleAgents]);
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
  const runtimeSlots = useMemo(() => craftsmanRuntime?.slots ?? [], [craftsmanRuntime]);

  const runtimeSummary = useMemo(() => {
    const providerSummary = craftsmanRuntime?.providers ?? [];
    const sessionLabel = providerSummary.length === 1
      ? providerSummary[0]?.session ?? providerSummary[0]?.provider ?? 'n/a'
      : providerSummary.length > 1
        ? String(providerSummary.length)
        : 'n/a';
    return {
      session: sessionLabel,
      totalPanes: runtimeSlots.length,
      readyPanes: runtimeSlots.filter((slot) => slot.ready).length,
      activePanes: runtimeSlots.filter((slot) => slot.active).length,
      runningCraftsmen: craftsmen.filter((item) => item.status === 'busy' || item.recentExecutions.some((execution) => execution.status === 'running')).length,
      failedCraftsmen: craftsmen.filter((item) => item.status === 'failed' || item.recentExecutions.some((execution) => execution.status === 'failed')).length,
      unhealthyPanes: runtimeSlots.filter((slot) => !slot.ready).length,
    };
  }, [craftsmanRuntime, craftsmen, runtimeSlots]);
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
  const unhealthyPanes = runtimeSlots.filter((slot) => !slot.ready);
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
        label: copy.workspace.issueGroups.runtimeUnhealthy,
        count: unhealthyPanes.length,
        severity: 'warning',
        summary: copy.workspace.issueGroups.runtimeUnhealthySummary(unhealthyPanes.length),
        detail: copy.workspace.issueGroups.runtimeUnhealthyDetail(unhealthyPanes[0].agent),
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
      label: copy.workspace.signalLabels.runtimeUnready,
      value: runtimeSummary.unhealthyPanes,
      note: copy.workspace.signalNotes.readyPanes(runtimeSummary.readyPanes, runtimeSummary.totalPanes),
      tone: runtimeSummary.unhealthyPanes > 0 ? 'warning' : 'success',
    },
  ] as const;

  const axisCards = [
    {
      key: 'agents' as const,
      title: copy.workspace.axis.agentTitle,
      action: copy.workspace.axis.agentAction,
      summary: copy.workspace.axis.agentSummary,
      count: agents.length,
      tone: staleAgents.length > 0 ? 'warning' as const : 'success' as const,
      onClick: () => setActiveDrawer('agents'),
    },
    {
      key: 'channels' as const,
      title: copy.workspace.axis.channelTitle,
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
      title: copy.workspace.axis.executionTitle,
      action: copy.workspace.axis.executionAction,
      summary: copy.workspace.axis.executionSummary,
      count: runtimeSummary.totalPanes + craftsmen.length,
      tone: runtimeSummary.failedCraftsmen > 0 ? 'danger' as const : 'info' as const,
      onClick: () => setActiveDrawer('execution'),
    },
  ];

  const accountLinks = useMemo(() => {
    const values = new Map<string, { id: string; label: string; status: string; meta: string }>();
    agents.forEach((agent) => {
      if (!agent.accountId) {
        return;
      }
      values.set(agent.accountId, {
        id: `human:${agent.accountId}`,
        label: agent.accountId,
        status: agent.presence,
        meta: agent.role ?? agent.hostFramework ?? copy.mgo.unknown,
      });
    });
    channelSummaries.forEach((channel) => {
      channel.affectedAgents.forEach((agent) => {
        if (!agent.accountId || values.has(agent.accountId)) {
          return;
        }
        values.set(agent.accountId, {
          id: `human:${agent.accountId}`,
          label: agent.accountId,
          status: agent.presence,
          meta: channel.channel,
        });
      });
    });
    return [...values.values()];
  }, [agents, channelSummaries, copy.mgo.unknown]);

  const participantSections = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase();
    const query = participantQuery.trim().toLowerCase();
    const matches = (values: Array<string | null | undefined>) => (
      query.length === 0 || values.some((value) => normalize(value ?? '').includes(query))
    );
    return {
      accounts: accountLinks.filter((item) => matches([item.label, item.meta, item.status])),
      agents: agents.filter((agent) => matches([
        agent.id,
        agent.role,
        agent.presence,
        agent.status,
        agent.hostFramework,
        agent.primaryModel,
        ...agent.channelProviders,
      ])),
      runtimes: runtimeSlots.filter((slot) => matches([
        slot.agent,
        slot.provider,
        slot.status,
        slot.runtimeMode,
        slot.transport,
        slot.currentCommand,
      ])),
      bridges: channelSummaries.filter((channel) => matches([
        channel.channel,
        channel.overallPresence,
        channel.signalStatus,
        channel.presenceReason,
      ])),
    };
  }, [accountLinks, agents, channelSummaries, participantQuery, runtimeSlots]);

  const defaultParticipantId = useMemo(() => (
    agents[0] ? `agent:${agents[0].id}` :
      accountLinks[0]?.id ??
      (runtimeSlots[0] ? `runtime:${getRuntimeSlotIdentity(runtimeSlots[0])}` : null) ??
      (channelSummaries[0] ? `bridge:${channelSummaries[0].channel}` : null)
  ), [accountLinks, agents, channelSummaries, runtimeSlots]);
  const participantIds = useMemo(() => new Set([
    ...accountLinks.map((account) => account.id),
    ...agents.map((agent) => `agent:${agent.id}`),
    ...runtimeSlots.map((slot) => `runtime:${getRuntimeSlotIdentity(slot)}`),
    ...channelSummaries.map((channel) => `bridge:${channel.channel}`),
  ]), [accountLinks, agents, channelSummaries, runtimeSlots]);
  const effectiveSelectedParticipantId =
    selectedParticipantId && participantIds.has(selectedParticipantId)
      ? selectedParticipantId
      : defaultParticipantId;

  const selectedAgent = effectiveSelectedParticipantId?.startsWith('agent:')
    ? agents.find((agent) => `agent:${agent.id}` === effectiveSelectedParticipantId) ?? null
    : null;
  const selectedHuman = effectiveSelectedParticipantId?.startsWith('human:')
    ? accountLinks.find((account) => account.id === effectiveSelectedParticipantId) ?? null
    : null;
  const selectedRuntime = effectiveSelectedParticipantId?.startsWith('runtime:')
    ? runtimeSlots.find((slot) => `runtime:${getRuntimeSlotIdentity(slot)}` === effectiveSelectedParticipantId) ?? null
    : null;
  const selectedBridge = effectiveSelectedParticipantId?.startsWith('bridge:')
    ? channelSummaries.find((channel) => `bridge:${channel.channel}` === effectiveSelectedParticipantId) ?? null
    : null;
  const selectedParticipantName =
    selectedAgent?.id ??
    selectedHuman?.label ??
    selectedRuntime?.agent ??
    selectedBridge?.channel ??
    copy.mgo.noSelection;
  const selectedChannelFocus = selectedAgent?.channelProviders.join(', ')
    || selectedBridge?.channel
    || selectedHuman?.meta
    || copy.mgo.unknown;
  const selectedParticipantFocus = selectedRuntime?.agent
    ?? selectedAgent?.id
    ?? selectedBridge?.affectedAgents[0]?.id
    ?? selectedHuman?.label
    ?? copy.mgo.unknown;
  const selectedRuntimeFocus = selectedRuntime?.sessionReference
    ?? selectedRuntime?.sessionId
    ?? selectedAgent?.runtimeTargetRef
    ?? selectedAgent?.activeTaskIds[0]
    ?? selectedBridge?.affectedAgents[0]?.id
    ?? copy.mgo.unknown;

  const runtimeAvailability = runtimeSummary.totalPanes > 0
    ? (runtimeSummary.readyPanes / runtimeSummary.totalPanes) * 100
    : 0;
  const sloCompliance = agents.length > 0
    ? ((agents.length - criticalAgents.length - staleAgents.length) / agents.length) * 100
    : 100;
  const systemPostureTone = openIssueCount > 0 ? 'warning' : 'success';
  const systemPostureLabel = openIssueCount > 0 ? copy.mgo.needsAttention : copy.mgo.healthy;

  const recentActivity = [
    ...channelSummaries.flatMap((channel) => channel.signals.map((signal) => ({
      id: `signal:${channel.channel}:${signal.occurredAt}:${signal.kind}`,
      label: signal.kind,
      detail: signal.detail ?? channel.channel,
      time: signal.occurredAt,
      tone: signal.severity === 'error' ? 'danger' as const : signal.severity === 'warning' ? 'warning' as const : 'info' as const,
    }))),
    ...channelSummaries.flatMap((channel) => channel.history.map((event) => ({
      id: `history:${channel.channel}:${event.occurredAt}:${event.agentId}`,
      label: event.agentId,
      detail: event.reason ?? event.presence,
      time: event.occurredAt,
      tone: getPresenceTone(event.presence),
    }))),
    ...craftsmen.flatMap((craftsman) => craftsman.recentExecutions.map((execution) => ({
      id: `execution:${craftsman.id}:${execution.executionId}`,
      label: execution.status,
      detail: `${craftsman.id} / ${execution.transport ?? copy.mgo.unknown}`,
      time: execution.startedAt ?? craftsman.runningSince ?? '',
      tone: execution.status === 'failed' ? 'danger' as const : execution.status === 'running' ? 'success' as const : 'neutral' as const,
    }))),
  ].sort((left, right) => Date.parse(right.time || '0') - Date.parse(left.time || '0')).slice(0, 5);

  return (
    <div className="participants-mgo interior-page">
      <section className="participants-mgo__masthead" data-testid="agents-global-status">
        <div className="participants-mgo__title">
          <p className="page-kicker">{copy.kicker}</p>
          <h2 className="page-title">{copy.title}</h2>
          <p className="page-summary">{copy.summary}</p>
        </div>
        <div className="participants-mgo__metrics">
          <div className="participants-mgo__metric">
            <UsersRound size={20} />
            <span>{copy.mgo.metrics.accounts}</span>
            <strong>{accountLinks.length}</strong>
            <small>{copy.mgo.accountLinks}</small>
          </div>
          <div className="participants-mgo__metric">
            <Bot size={20} />
            <span>{copy.mgo.metrics.agents}</span>
            <strong>{agents.length}</strong>
            <small>{copy.metrics.activeAgents} {summary?.activeAgents ?? 0}</small>
          </div>
          <div className="participants-mgo__metric">
            <Cpu size={20} />
            <span>{copy.mgo.metrics.runtimeSessions}</span>
            <strong>{runtimeSummary.totalPanes}</strong>
            <small>{copy.runtimeReadyPanesLabel} {runtimeSummary.readyPanes}</small>
          </div>
          <div className="participants-mgo__metric">
            <Cable size={20} />
            <span>{copy.mgo.metrics.bridges}</span>
            <strong>{channelSummaries.length}</strong>
            <small>{copy.mgo.healthy} {channelSummaries.filter((item) => item.signalStatus === 'healthy').length}</small>
          </div>
          <div className={`participants-mgo__posture participants-mgo__posture--${systemPostureTone}`}>
            <ShieldCheck size={26} />
            <div>
              <span>{copy.mgo.metrics.systemPosture}</span>
              <strong>{systemPostureLabel}</strong>
              <small>{openIssueCount > 0 ? copy.workspace.issueCountOpen(openIssueCount) : copy.workspace.issueCountStable}</small>
            </div>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
      </section>

      <section className="participants-mgo__workspace">
        <aside className="participants-mgo__inventory">
          <div className="participants-mgo__tabs">
            {(['all', 'accounts', 'agents', 'runtimes', 'bridges'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={participantFilter === filter ? 'participants-mgo__tab participants-mgo__tab--active' : 'participants-mgo__tab'}
                onClick={() => setParticipantFilter(filter)}
              >
                {copy.mgo.filters[filter]}
              </button>
            ))}
          </div>
          <label className="participants-mgo__search">
            <Search size={16} />
            <input
              type="search"
              aria-label={copy.mgo.searchLabel}
              placeholder={copy.mgo.searchPlaceholder}
              value={participantQuery}
              onChange={(event) => setParticipantQuery(event.target.value)}
            />
          </label>
          <div className="participants-mgo__inventory-scroll">
            {(participantFilter === 'all' || participantFilter === 'accounts') ? (
              <div className="participants-mgo__group">
                <div className="participants-mgo__group-title">
                  <span>{copy.mgo.groups.accounts}</span>
                  <strong>{participantSections.accounts.length}</strong>
                </div>
                {participantSections.accounts.length === 0 ? <p className="type-body-sm">{copy.mgo.empty.accounts}</p> : null}
                {participantSections.accounts.map((human) => (
                  <button key={human.id} type="button" className={effectiveSelectedParticipantId === human.id ? 'participants-mgo__row participants-mgo__row--active' : 'participants-mgo__row'} onClick={() => setSelectedParticipantId(human.id)}>
                    <span className="participants-mgo__avatar">{human.label.slice(0, 2).toUpperCase()}</span>
                    <span>
                      <strong>{human.label}</strong>
                      <small>{human.meta}</small>
                    </span>
                    <em className={`participants-mgo__state participants-mgo__state--${getStatusTone(human.status)}`}>{human.status}</em>
                  </button>
                ))}
              </div>
            ) : null}

            {(participantFilter === 'all' || participantFilter === 'agents') ? (
              <div className="participants-mgo__group">
                <div className="participants-mgo__group-title">
                  <span>{copy.mgo.groups.agents}</span>
                  <strong>{participantSections.agents.length}</strong>
                </div>
                {participantSections.agents.length === 0 ? <p className="type-body-sm">{copy.emptyAgents}</p> : null}
                {participantSections.agents.map((agent) => (
                  <button key={agent.id} type="button" className={effectiveSelectedParticipantId === `agent:${agent.id}` ? 'participants-mgo__row participants-mgo__row--active' : 'participants-mgo__row'} onClick={() => setSelectedParticipantId(`agent:${agent.id}`)}>
                    <span className="participants-mgo__avatar participants-mgo__avatar--agent"><Bot size={15} /></span>
                    <span>
                      <strong>{agent.id}</strong>
                      <small>{agent.role ?? agent.primaryModel ?? copy.mgo.unknown}</small>
                    </span>
                    <em className={`participants-mgo__state participants-mgo__state--${getStatusTone(agent.presence)}`}>{agent.presence}</em>
                  </button>
                ))}
              </div>
            ) : null}

            {(participantFilter === 'all' || participantFilter === 'runtimes') ? (
              <div className="participants-mgo__group">
                <div className="participants-mgo__group-title">
                  <span>{copy.mgo.groups.runtimes}</span>
                  <strong>{participantSections.runtimes.length}</strong>
                </div>
                {participantSections.runtimes.length === 0 ? <p className="type-body-sm">{copy.emptyRuntime}</p> : null}
                {participantSections.runtimes.map((slot) => {
                  const slotId = `runtime:${getRuntimeSlotIdentity(slot)}`;
                  return (
                  <button key={slotId} type="button" className={effectiveSelectedParticipantId === slotId ? 'participants-mgo__row participants-mgo__row--active' : 'participants-mgo__row'} onClick={() => setSelectedParticipantId(slotId)}>
                    <span className="participants-mgo__avatar participants-mgo__avatar--runtime"><Cpu size={15} /></span>
                    <span>
                      <strong>{slot.agent}</strong>
                      <small>{slot.provider} / {slot.runtimeMode ?? copy.mgo.unknown}</small>
                    </span>
                    <em className={`participants-mgo__state participants-mgo__state--${getStatusTone(slot.status)}`}>{slot.status}</em>
                  </button>
                  );
                })}
              </div>
            ) : null}

            {(participantFilter === 'all' || participantFilter === 'bridges') ? (
              <div className="participants-mgo__group">
                <div className="participants-mgo__group-title">
                  <span>{copy.mgo.groups.bridges}</span>
                  <strong>{participantSections.bridges.length}</strong>
                </div>
                {participantSections.bridges.length === 0 ? <p className="type-body-sm">{copy.emptyChannelDetail}</p> : null}
                {participantSections.bridges.map((channel) => (
                  <button key={channel.channel} type="button" className={effectiveSelectedParticipantId === `bridge:${channel.channel}` ? 'participants-mgo__row participants-mgo__row--active' : 'participants-mgo__row'} onClick={() => setSelectedParticipantId(`bridge:${channel.channel}`)}>
                    <span className="participants-mgo__avatar participants-mgo__avatar--bridge"><Cable size={15} /></span>
                    <span>
                      <strong>{channel.channel}</strong>
                      <small>{channel.totalAgents} {copy.mgo.groups.agents}</small>
                    </span>
                    <em className={`participants-mgo__state participants-mgo__state--${getStatusTone(channel.signalStatus)}`}>{channel.signalStatus}</em>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="participants-mgo__map" data-testid="agents-participation-map">
          <div className="participants-mgo__map-toolbar">
            <div>
              <p className="page-kicker">{copy.mgo.mapKicker}</p>
              <h3 className="section-title">{copy.mgo.mapTitle}</h3>
            </div>
            <div className="participants-mgo__toolbar-actions">
              {axisCards.map((axis) => (
                <button key={axis.key} type="button" className="participants-mgo__icon-button" onClick={axis.onClick} aria-label={axis.action}>
                  {axis.key === 'agents' ? <UsersRound size={16} /> : axis.key === 'channels' ? <Waypoints size={16} /> : <Workflow size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="participants-mgo__graph">
            <svg className="participants-mgo__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="50" y1="50" x2="36" y2="15" />
              <line x1="50" y1="50" x2="50" y2="12" />
              <line x1="50" y1="50" x2="64" y2="16" />
              <line x1="50" y1="50" x2="18" y2="40" />
              <line x1="50" y1="50" x2="18" y2="58" />
              <line x1="50" y1="50" x2="82" y2="42" />
              <line x1="50" y1="50" x2="36" y2="82" />
              <line x1="50" y1="50" x2="52" y2="82" />
              <line x1="50" y1="50" x2="68" y2="80" />
              <text x="35" y="39">{copy.mgo.relationshipLabels.participates}</text>
              <text x="59" y="39">{copy.mgo.relationshipLabels.routes}</text>
              <text x="43" y="70">{copy.mgo.relationshipLabels.runsOn}</text>
              <text x="19" y="52">{copy.mgo.relationshipLabels.executes}</text>
            </svg>
            <div className="participants-mgo__orbit participants-mgo__orbit--outer" />
            <div className="participants-mgo__orbit participants-mgo__orbit--inner" />
            <div className="participants-mgo__hub">
              <span><Workflow size={20} /></span>
              <strong>{selectedParticipantName}</strong>
              <small>{copy.mgo.activeTopology}</small>
            </div>
            {accountLinks.slice(0, 3).map((account, index) => (
              <button key={account.id} type="button" className={`participants-mgo__node participants-mgo__node--human participants-mgo__node--h${index + 1}`} onClick={() => setSelectedParticipantId(account.id)}>
                <span>{account.label.slice(0, 2).toUpperCase()}</span>
                <strong>{account.label}</strong>
                <small>{account.status}</small>
              </button>
            ))}
            {agents.slice(0, 3).map((agent, index) => (
              <button key={agent.id} type="button" className={`participants-mgo__node participants-mgo__node--agent participants-mgo__node--a${index + 1}`} onClick={() => setSelectedParticipantId(`agent:${agent.id}`)}>
                <Bot size={18} />
                <strong>{agent.id}</strong>
                <small>{agent.presence}</small>
              </button>
            ))}
            {runtimeSlots.slice(0, 3).map((slot, index) => {
              const slotId = `runtime:${getRuntimeSlotIdentity(slot)}`;
              return (
              <button key={slotId} type="button" className={`participants-mgo__node participants-mgo__node--runtime participants-mgo__node--r${index + 1}`} onClick={() => setSelectedParticipantId(slotId)}>
                <Cpu size={18} />
                <strong>{slot.agent}</strong>
                <small>{slot.status}</small>
              </button>
              );
            })}
            {channelSummaries.slice(0, 3).map((channel, index) => (
              <button key={channel.channel} type="button" className={`participants-mgo__node participants-mgo__node--bridge participants-mgo__node--b${index + 1}`} onClick={() => setSelectedParticipantId(`bridge:${channel.channel}`)}>
                <Cable size={18} />
                <strong>{channel.channel}</strong>
                <small>{channel.signalStatus}</small>
              </button>
            ))}
          </div>
        </main>

        <aside className="participants-mgo__truth">
          <section className="participants-mgo__truth-panel">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.runtimeTruthKicker}</p>
                <h3 className="section-title">{copy.mgo.runtimeTruthTitle}</h3>
              </div>
              <span className={getPillClass(systemPostureTone)}>{copy.mgo.live}</span>
            </div>
            <div className="participants-mgo__sparkline" aria-hidden="true">
              {globalSignals.map((signal) => <span key={signal.label} style={{ '--height': `${Math.max(14, 24 + signal.value * 4)}px` } as CSSProperties} />)}
            </div>
            <div className="participants-mgo__truth-metrics">
              <span><strong>{formatPercent(runtimeAvailability)}</strong>{copy.mgo.availability}</span>
              <span><strong>{runtimeSummary.runningCraftsmen}</strong>{copy.runtimeRunningCraftsmenLabel}</span>
              <span><strong>{openIssueCount}</strong>{copy.mgo.violations}</span>
              <span><strong>{formatPercent(sloCompliance)}</strong>{copy.mgo.sloCompliance}</span>
            </div>
          </section>

          <section className="participants-mgo__truth-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.mgo.activeRuntimeSessions}</h3>
              <button type="button" className="status-pill status-pill--neutral" onClick={() => setActiveDrawer('execution')}>{copy.mgo.viewAll}</button>
            </div>
            <div className="participants-mgo__session-list">
              {runtimeSlots.slice(0, 4).map((slot) => {
                const slotId = `runtime:${getRuntimeSlotIdentity(slot)}`;
                return (
                <button key={slotId} type="button" className="participants-mgo__session" onClick={() => setSelectedParticipantId(slotId)}>
                  <Cpu size={16} />
                  <span><strong>{slot.agent}</strong><small>{slot.provider} / {slot.transport ?? copy.mgo.unknown}</small></span>
                  <em className={`participants-mgo__state participants-mgo__state--${getStatusTone(slot.status)}`}>{slot.status}</em>
                </button>
                );
              })}
              {runtimeSlots.length === 0 ? <p className="type-body-sm">{copy.emptyRuntime}</p> : null}
            </div>
          </section>

          <section className="participants-mgo__truth-panel" data-testid="agents-axis-entry">
            <div className="section-title-row">
              <h3 className="section-title">{copy.mgo.systemCapability}</h3>
              <button type="button" className="status-pill status-pill--neutral" onClick={() => setActiveDrawer('agents')}>{copy.mgo.viewAll}</button>
            </div>
            <div className="participants-mgo__capability">
              <span>{copy.runtimePanesLabel}<strong>{runtimeSummary.totalPanes}</strong></span>
              <span>{copy.mgo.metrics.bridges}<strong>{channelSummaries.length}</strong></span>
              <span>{copy.mgo.policies}<strong>{globalSignals.length}</strong></span>
              <span>{copy.mgo.dispatchPrecedence}<strong>{selectabilitySummary.selectable}</strong></span>
              <span>{copy.mgo.overallSystemHealth}<strong>{systemPostureLabel}</strong></span>
            </div>
          </section>
        </aside>
      </section>

      <section className="participants-mgo__bottom">
        <div className="participants-mgo__selected">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.mgo.selectedParticipant}</p>
              <h3 className="section-title">
                {selectedParticipantName}
              </h3>
            </div>
            <span className={getPillClass(getStatusTone(selectedAgent?.presence ?? selectedHuman?.status ?? selectedRuntime?.status ?? selectedBridge?.signalStatus))}>
              {selectedAgent?.presence ?? selectedHuman?.status ?? selectedRuntime?.status ?? selectedBridge?.signalStatus ?? copy.mgo.unknown}
            </span>
          </div>
          <div className="participants-mgo__detail-grid">
            <span>{copy.roleLabel}<strong>{selectedAgent?.role ?? selectedHuman?.meta ?? selectedRuntime?.provider ?? selectedBridge?.overallPresence ?? copy.mgo.unknown}</strong></span>
            <span>{copy.hostLabel}<strong>{selectedAgent?.hostFramework ?? selectedRuntime?.transport ?? selectedBridge?.channel ?? copy.mgo.unknown}</strong></span>
            <span>{copy.modelLabel}<strong>{selectedAgent?.primaryModel ?? selectedRuntime?.runtimeMode ?? selectedBridge?.presenceReason ?? copy.mgo.unknown}</strong></span>
            <span>{copy.lastSeenLabel}<strong>{selectedAgent?.lastSeenAt ?? selectedBridge?.lastSeenAt ?? copy.mgo.now}</strong></span>
          </div>
        </div>

        <div className="participants-mgo__relationships">
          <div className="section-title-row">
            <h3 className="section-title">{copy.mgo.liveRelationships}</h3>
            <button type="button" className="status-pill status-pill--neutral" onClick={() => setActiveDrawer('channels')}>{copy.mgo.relationshipGraph}</button>
          </div>
          <div className="participants-mgo__relationship-list">
            <span><Waypoints size={16} />{copy.workspace.channelFocusLabel}<strong>{selectedChannelFocus}</strong></span>
            <span><Bot size={16} />{copy.workspace.agentFocusLabel}<strong>{selectedParticipantFocus}</strong></span>
            <span><Cpu size={16} />{copy.workspace.executionFocusLabel}<strong>{selectedRuntimeFocus}</strong></span>
            <span><Cable size={16} />{copy.workspace.signalLabels.channelIssues}<strong>{degradedChannels.length}</strong></span>
          </div>
        </div>

        <div className="participants-mgo__activity">
          <div className="section-title-row">
            <h3 className="section-title">{copy.mgo.recentActivity}</h3>
            <button type="button" className="status-pill status-pill--neutral" onClick={() => setActiveDrawer('channels')}>{copy.mgo.viewAll}</button>
          </div>
          <div className="participants-mgo__activity-list">
            {recentActivity.length === 0 ? <p className="type-body-sm">{copy.emptyChannelSignals}</p> : null}
            {recentActivity.map((item) => (
              <span key={item.id}>
                <em className={`participants-mgo__dot participants-mgo__dot--${item.tone}`} />
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
                <time>{item.time || copy.mgo.now}</time>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="participants-mgo__issues" data-testid="agents-issue-queue">
        <div className="section-title-row">
          <div>
            {copy.workspace.issueQueueKicker ? <p className="page-kicker">{copy.workspace.issueQueueKicker}</p> : null}
            <h3 className="section-title">{copy.workspace.issueQueueTitle}</h3>
          </div>
          <span className="status-pill status-pill--neutral">{openIssueCount}</span>
        </div>
        <div className="participants-mgo__issue-scroll" data-testid="agents-issue-queue-scroll">
          {issueGroups.length === 0 ? (
            <div className="empty-state">
              <p className="type-body-sm">{copy.workspace.issueQueueEmpty}</p>
            </div>
          ) : issueGroups.map((issue) => (
            <button key={issue.id} type="button" className="participants-mgo__issue" onClick={issue.action}>
              <span>
                <strong>{issue.label}</strong>
                <small>{issue.summary}</small>
              </span>
              <em className={getPillClass(issue.severity)}>{issue.count}</em>
            </button>
          ))}
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
                  {copy.filterLabels.all}
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
                  {copy.filterLabels.all}
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-text-xs">{copy.selectabilityFilterLabel}</span>
                {(['all', 'selectable', 'restricted'] as const).map((filter) => {
                  const selected = selectabilityFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      className={selected ? 'status-pill status-pill--info' : 'status-pill status-pill--neutral'}
                      onClick={() => setSelectabilityFilter(filter)}
                    >
                      {copy.selectabilityFilterLabels[filter]}
                    </button>
                  );
                })}
              </div>
              <div className="type-text-xs flex flex-wrap items-center gap-3">
                <span>{copy.selectabilityLabel}: {copy.selectabilityFilterLabels.selectable} {selectabilitySummary.selectable}</span>
                <span>{copy.selectabilityLabel}: {copy.selectabilityFilterLabels.restricted} {selectabilitySummary.restricted}</span>
              </div>
              {visibleAgents.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyAgents}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleAgents.map((agent) => (
                    <div key={agent.id} className="data-row">
                      {(() => {
                        const selectability = resolveAgentSelectability(agent);
                        return (
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="type-heading-sm">{agent.id}</strong>
                              <span className="status-pill status-pill--neutral">{agent.status}</span>
                              <span className={getPillClass(getPresenceTone(agent.presence))}>
                                {agent.presence}
                              </span>
                              <span className={getPillClass(getSelectabilityTone(selectability.value))}>
                                {selectability.value}
                              </span>
                            </div>
                            <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                              <span>{copy.roleLabel}: {agent.role ?? 'unassigned'}</span>
                              <span>{copy.channelLabel}: {formatList(agent.channelProviders, 'n/a')}</span>
                              <span>{copy.hostLabel}: {agent.hostFramework ?? 'n/a'}</span>
                              <span>{copy.inventorySourcesLabel}: {formatList(agent.inventorySources, 'unknown')}</span>
                              <span>{copy.modelLabel}: {agent.primaryModel ?? 'n/a'}</span>
                              <span>{copy.presenceReasonLabel}: {agent.presenceReason ?? 'n/a'}</span>
                              <span>{copy.selectabilityReasonLabel}: {formatSelectabilityReason(selectability.reason, copy.selectabilityReasonLabels)}</span>
                              <span>{copy.lastSeenLabel}: {agent.lastSeenAt ?? 'n/a'}</span>
                              <span>{copy.loadLabel}: {agent.load}</span>
                              <span>{copy.taskCountLabel}: {agent.taskCount}</span>
                              <span>{copy.subtaskCountLabel}: {agent.subtaskCount}</span>
                            </div>
                          </div>
                        );
                      })()}
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
                <h3 className="section-title">{copy.runtimeTitle}</h3>
                <span className="status-pill status-pill--neutral">{runtimeSummary.session}</span>
              </div>
              {runtimeSlots.length === 0 ? (
                <div className="empty-state">
                  <p className="type-body-sm">{copy.emptyRuntime}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {runtimeSlots.map((pane) => (
                    <div key={getRuntimeSlotIdentity(pane)} className="decision-card">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="type-heading-sm">{pane.agent}</p>
                          <p className="type-body-sm mt-2">{copy.paneLabel}: {pane.sessionId ?? pane.sessionReference ?? 'n/a'}</p>
                        </div>
                        <span className={getPillClass(pane.ready ? 'success' : 'warning')}>
                          {copy.readyLabel}: {pane.ready ? 'yes' : 'no'}
                        </span>
                      </div>
                      <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                        <span>{copy.commandLabel}: {pane.currentCommand ?? 'n/a'}</span>
                        <span>{copy.statusLabel}: {pane.status}</span>
                        <span>{copy.mgo.providerLabel}: {pane.provider}</span>
                        <span>{copy.mgo.runtimeLabel}: {pane.runtimeMode ?? 'n/a'}</span>
                        <span>{copy.mgo.transportLabel}: {pane.transport ?? 'n/a'}</span>
                        <span>{copy.sessionReferenceLabel}: {pane.sessionReference ?? 'n/a'}</span>
                        <span>{copy.mgo.executionLabel}: {pane.executionId ?? 'n/a'}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <p className="type-text-xs">{copy.tailPreviewLabel}: {runtimeTailByAgent[pane.agent] ?? pane.tailPreview ?? 'n/a'}</p>
                        {pane.provider === 'tmux' ? (
                          <button
                            type="button"
                            className="status-pill status-pill--neutral"
                            onClick={() => void fetchRuntimeTail(pane.agent)}
                          >
                            {runtimeTailLoadingByAgent[pane.agent] ? copy.loadingTailAction : copy.loadTailAction}
                          </button>
                        ) : null}
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
