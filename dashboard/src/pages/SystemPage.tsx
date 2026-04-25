import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Cable,
  CheckCircle2,
  Gauge,
  GitBranch,
  Layers3,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import {
  listCcConnectBridges,
  listRuntimeTargets,
  listTemplates,
  type ApiCcConnectBridgeAdapterSummaryDto,
} from '@/lib/api';
import { useSystemPageCopy } from '@/lib/dashboardCopy';
import { useAgentStore } from '@/stores/agentStore';
import { useTaskStore } from '@/stores/taskStore';
import type { ApiTemplateSummaryDto } from '@/types/api';
import type { RuntimeTarget } from '@/types/runtime-target';

type HealthTone = 'success' | 'warning' | 'info';

interface HealthRow {
  label: string;
  value: string;
  tone: HealthTone;
}

interface SystemEvent {
  time: string;
  label: string;
  tone: HealthTone;
}

function getToneFromStatus(status?: string | null): HealthTone {
  if (!status) {
    return 'info';
  }
  if (status === 'healthy' || status === 'ok') {
    return 'success';
  }
  if (status === 'active' || status === 'ready') {
    return 'info';
  }
  return 'warning';
}

function getPillClass(tone: HealthTone) {
  if (tone === 'success') {
    return 'status-pill status-pill--success';
  }
  if (tone === 'warning') {
    return 'status-pill status-pill--warning';
  }
  return 'status-pill status-pill--info';
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return '100%';
  }
  return `${Math.round((value / total) * 100)}%`;
}

function getTargetLabel(target: RuntimeTarget) {
  return target.displayName ?? target.runtimeTargetRef;
}

export function SystemPage() {
  const copy = useSystemPageCopy();
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const healthSnapshot = useTaskStore((state) => state.healthSnapshot ?? null);
  const governanceSnapshot = useTaskStore((state) => state.governanceSnapshot ?? null);
  const fetchAgentStatus = useAgentStore((state) => state.fetchStatus);
  const channelSummaries = useAgentStore((state) => state.channelSummaries);
  const craftsmanRuntime = useAgentStore((state) => state.craftsmanRuntime);
  const agentError = useAgentStore((state) => state.error);

  const [runtimeTargets, setRuntimeTargets] = useState<RuntimeTarget[]>([]);
  const [bridges, setBridges] = useState<ApiCcConnectBridgeAdapterSummaryDto[]>([]);
  const [templates, setTemplates] = useState<ApiTemplateSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemError, setSystemError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSystem = async () => {
      setLoading(true);
      setSystemError(null);
      void fetchTasks();
      void fetchAgentStatus();
      const [targetsResult, bridgesResult, templatesResult] = await Promise.allSettled([
        listRuntimeTargets(),
        listCcConnectBridges(),
        listTemplates(),
      ]);
      if (!active) {
        return;
      }
      if (targetsResult.status === 'fulfilled') {
        setRuntimeTargets(targetsResult.value);
      }
      if (bridgesResult.status === 'fulfilled') {
        setBridges(bridgesResult.value);
      }
      if (templatesResult.status === 'fulfilled') {
        setTemplates(templatesResult.value);
      }
      const failures = [targetsResult, bridgesResult, templatesResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
      setSystemError(failures[0] ?? null);
      setLoading(false);
    };

    void loadSystem();

    return () => {
      active = false;
    };
  }, [fetchAgentStatus, fetchTasks]);

  const enabledTargets = runtimeTargets.filter((target) => target.enabled);
  const presentedTargets = runtimeTargets.filter((target) => target.presentationMode === 'im_presented');
  const headlessTargets = runtimeTargets.filter((target) => target.presentationMode === 'headless');
  const bridgeProjects = new Set(bridges.map((bridge) => bridge.project).filter(Boolean));
  const runtimeSlots = craftsmanRuntime?.slots ?? [];
  const liveRuntimeSlots = runtimeSlots.filter((slot) => slot.status === 'running' || slot.status === 'busy');
  const degradedChannels = channelSummaries.filter((channel) => (
    channel.signalStatus === 'degraded'
    || channel.signalStatus === 'recovering'
    || channel.overallPresence !== 'online'
  ));
  const indexedTemplates = templates;
  const runtimeOverrides = runtimeTargets.filter((target) => !target.enabled || target.allowedProjects.length > 0);
  const unhealthyHealthRows = [
    healthSnapshot?.tasks.status,
    healthSnapshot?.runtime.status,
    healthSnapshot?.craftsman.status,
    healthSnapshot?.im.status,
    healthSnapshot?.host.status,
  ].filter((status) => status && status !== 'healthy');
  const bridgeHealthTotal = Math.max(bridges.length, degradedChannels.length);
  const bridgeHealthyCount = Math.max(bridgeHealthTotal - degradedChannels.length, 0);
  const systemTone: HealthTone = unhealthyHealthRows.length > 0 || systemError || agentError
    ? 'warning'
    : healthSnapshot
      ? 'success'
      : 'info';
  const healthPercent = healthSnapshot ? formatPercent(5 - unhealthyHealthRows.length, 5) : copy.mgo.unknown;

  const healthRows: HealthRow[] = [
    {
      label: copy.mgo.healthRows.services,
      value: healthSnapshot ? `${5 - unhealthyHealthRows.length} / 5` : copy.mgo.unknown,
      tone: systemTone,
    },
    {
      label: copy.mgo.healthRows.bridges,
      value: healthSnapshot
        ? `${healthSnapshot.im.activeBindings} / ${Math.max(bridges.length, healthSnapshot.im.activeBindings, 1)}`
        : `${bridges.length} ${copy.mgo.eventObserved}`,
      tone: healthSnapshot ? getToneFromStatus(healthSnapshot.im.status) : 'info',
    },
    {
      label: copy.mgo.healthRows.runtimes,
      value: `${healthSnapshot?.runtime.activeSessions ?? liveRuntimeSlots.length} / ${Math.max(runtimeSlots.length, healthSnapshot?.runtime.activeSessions ?? 0, 1)}`,
      tone: getToneFromStatus(healthSnapshot?.runtime.status),
    },
    {
      label: copy.mgo.healthRows.policies,
      value: `${indexedTemplates.length}`,
      tone: 'info',
    },
    {
      label: copy.mgo.healthRows.integrations,
      value: `${Math.max(bridges.length, channelSummaries.length)} / ${Math.max(bridges.length, channelSummaries.length, 1)}`,
      tone: degradedChannels.length > 0 ? 'warning' : 'success',
    },
  ];

  const incidents = (() => {
    const rows = [
      systemError ? { label: systemError, tone: 'warning' as const } : null,
      agentError ? { label: agentError, tone: 'warning' as const } : null,
      healthSnapshot && healthSnapshot.runtime.status !== 'healthy'
        ? { label: copy.mgo.incidentRuntime(healthSnapshot?.runtime.status ?? copy.mgo.unknown), tone: 'warning' as const }
        : null,
      healthSnapshot && healthSnapshot.craftsman.status !== 'healthy'
        ? { label: copy.mgo.incidentCraftsman(healthSnapshot?.craftsman.status ?? copy.mgo.unknown), tone: 'warning' as const }
        : null,
      degradedChannels.length > 0
        ? { label: copy.mgo.incidentBridge(degradedChannels.length), tone: 'warning' as const }
        : null,
    ].filter(Boolean) as Array<{ label: string; tone: HealthTone }>;
    return rows.length > 0 ? rows : [{ label: copy.mgo.noIncidents, tone: 'success' as const }];
  })();

  const events: SystemEvent[] = useMemo(() => [
    ...runtimeTargets.slice(0, 2).map((target) => ({
      time: target.discovered ? copy.mgo.eventObserved : copy.mgo.eventConfigured,
      label: copy.mgo.eventRuntime(getTargetLabel(target)),
      tone: target.enabled ? 'success' as const : 'warning' as const,
    })),
    ...bridges.slice(0, 2).map((bridge) => ({
      time: bridge.connected_at ?? copy.mgo.eventObserved,
      label: copy.mgo.eventBridge(bridge.platform),
      tone: 'success' as const,
    })),
    ...templates.slice(0, 2).map((template) => ({
      time: copy.mgo.eventConfigured,
      label: copy.mgo.eventPolicy(template.name),
      tone: 'info' as const,
    })),
  ].slice(0, 5), [bridges, copy.mgo, runtimeTargets, templates]);

  const capabilityMetrics = [
    {
      label: copy.mgo.capability.runtimeAvailability,
      value: runtimeTargets.length > 0 ? formatPercent(enabledTargets.length, runtimeTargets.length) : copy.mgo.unknown,
      delta: copy.mgo.capabilityTargets(enabledTargets.length, runtimeTargets.length),
      tone: enabledTargets.length === runtimeTargets.length ? 'success' as const : 'warning' as const,
    },
    {
      label: copy.mgo.capability.bridgeHealth,
      value: bridgeHealthTotal > 0 ? formatPercent(bridgeHealthyCount, bridgeHealthTotal) : copy.mgo.unknown,
      delta: copy.mgo.capabilityBridges(bridges.length, bridgeProjects.size),
      tone: degradedChannels.length > 0 ? 'warning' as const : 'info' as const,
    },
    {
      label: copy.mgo.capability.policyCoverage,
      value: `${indexedTemplates.length}`,
      delta: copy.mgo.capabilityPolicies(templates.length),
      tone: 'info' as const,
    },
    {
      label: copy.mgo.capability.auditCoverage,
      value: healthSnapshot ? healthSnapshot.host.status : copy.mgo.unknown,
      delta: governanceSnapshot?.hostPressureStatus ?? copy.mgo.eventObserved,
      tone: getToneFromStatus(healthSnapshot?.host.status ?? governanceSnapshot?.hostPressureStatus),
    },
    {
      label: copy.mgo.capability.costEfficiency,
      value: `${headlessTargets.length}`,
      delta: copy.mgo.capabilityHeadless(headlessTargets.length),
      tone: 'info' as const,
    },
    {
      label: copy.mgo.capability.latency,
      value: `${healthSnapshot?.runtime.activeSessions ?? liveRuntimeSlots.length}`,
      delta: copy.mgo.capabilityLiveSessions(liveRuntimeSlots.length),
      tone: getToneFromStatus(healthSnapshot?.runtime.status),
    },
  ];

  return (
    <div className="system-mgo interior-page">
      <section className="system-mgo__masthead surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div>
          <p className="page-kicker">{copy.kicker}</p>
          <h2 className="page-title">{copy.title}</h2>
          <p className="page-summary">{copy.summary}</p>
        </div>
        <div className="system-mgo__orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="system-mgo__metric-grid">
          <div className="system-mgo__metric">
            <span>{copy.mgo.metrics.targets}</span>
            <strong>{runtimeTargets.length}</strong>
            <small>{copy.mgo.healthyCount(enabledTargets.length)}</small>
          </div>
          <div className="system-mgo__metric">
            <span>{copy.mgo.metrics.bridges}</span>
            <strong>{bridges.length}</strong>
            <small>{copy.mgo.projectCount(bridgeProjects.size)}</small>
          </div>
          <div className="system-mgo__metric">
            <span>{copy.mgo.metrics.policies}</span>
            <strong>{templates.length}</strong>
            <small>{copy.mgo.activeCount(indexedTemplates.length)}</small>
          </div>
          <div className="system-mgo__metric">
            <span>{copy.mgo.metrics.presentationModes}</span>
            <strong>{presentedTargets.length + headlessTargets.length}</strong>
            <small>{copy.mgo.optimized}</small>
          </div>
        </div>
      </section>

      <nav className="system-mgo__tabs" aria-label={copy.mgo.navLabel}>
        {copy.mgo.tabs.map((tab) => (
          <a key={tab.href} href={tab.href}>{tab.label}</a>
        ))}
      </nav>

      {loading ? <div className="inline-alert inline-alert--info">{copy.mgo.loading}</div> : null}

      <section className="system-mgo__layout">
        <main className="system-mgo__main">
          <section className="system-mgo__precedence surface-panel surface-panel--workspace" id="system-overview">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.precedenceKicker}</p>
                <h3 className="section-title">{copy.precedenceTitle}</h3>
                <p className="type-body-sm">{copy.precedenceSummary}</p>
              </div>
              <span className="status-pill status-pill--info">{copy.mgo.modelVersion}</span>
            </div>
            <div className="system-mgo__flow">
              {copy.precedenceSteps.map((step, index) => (
                <div className="system-mgo__step" key={`${step.title}-${index}`}>
                  <span>{step.kicker || String(index + 1).padStart(2, '0')}</span>
                  <strong>{step.title}</strong>
                  <p>{step.summary}</p>
                </div>
              ))}
            </div>
            <div className="system-mgo__guardrails">
              {copy.mgo.guardrails.map((guardrail) => (
                <span key={guardrail}>
                  <ShieldCheck size={15} />
                  {guardrail}
                </span>
              ))}
            </div>
          </section>

          <section className="system-mgo__cards" id="runtime-targets" aria-label={copy.gridLabel}>
            <div className="system-mgo__list-panel surface-panel surface-panel--workspace">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{copy.mgo.runtimeTargetsKicker}</p>
                  <h3 className="section-title">{copy.mgo.runtimeTargetsTitle}</h3>
                </div>
                <span className="status-pill status-pill--neutral">{runtimeTargets.length}</span>
              </div>
              <div className="system-mgo__target-list">
                {runtimeTargets.slice(0, 3).map((target) => (
                  <Link to="/runtime-targets" className="system-mgo__target-row" key={target.runtimeTargetRef}>
                    <Waypoints size={16} />
                    <span>
                      <strong>{getTargetLabel(target)}</strong>
                      <small>{target.runtimeFlavor ?? target.runtimeProvider ?? target.hostFramework ?? target.runtimeTargetRef}</small>
                    </span>
                    <b className={target.enabled ? 'text-success' : 'text-warning'}>
                      {target.enabled ? copy.mgo.enabled : copy.mgo.disabled}
                    </b>
                  </Link>
                ))}
                {runtimeTargets.length === 0 ? <div className="empty-state">{copy.mgo.noRuntimeTargets}</div> : null}
              </div>
              <Link to="/runtime-targets" className="button-secondary system-mgo__panel-link">
                <span>{copy.mgo.viewAllTargets}</span>
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="system-mgo__list-panel surface-panel surface-panel--workspace" id="bridges">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{copy.mgo.bridgesKicker}</p>
                  <h3 className="section-title">{copy.mgo.bridgesTitle}</h3>
                </div>
                <span className="status-pill status-pill--neutral">{bridges.length}</span>
              </div>
              <div className="system-mgo__target-list">
                {bridges.slice(0, 3).map((bridge) => (
                  <Link to="/bridges" className="system-mgo__target-row" key={`${bridge.platform}-${bridge.project ?? 'global'}`}>
                    <Cable size={16} />
                    <span>
                      <strong>{bridge.project ? `${bridge.project} / ${bridge.platform}` : bridge.platform}</strong>
                      <small>{bridge.capabilities.join(', ') || copy.mgo.noCapabilities}</small>
                    </span>
                    <b className="text-info">{copy.mgo.eventObserved}</b>
                  </Link>
                ))}
                {bridges.length === 0 ? <div className="empty-state">{copy.mgo.noBridges}</div> : null}
              </div>
              <Link to="/bridges" className="button-secondary system-mgo__panel-link">
                <span>{copy.mgo.viewAllBridges}</span>
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="system-mgo__list-panel surface-panel surface-panel--workspace" id="policies">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{copy.mgo.policyModelKicker}</p>
                  <h3 className="section-title">{copy.mgo.policyModelTitle}</h3>
                </div>
                <span className="status-pill status-pill--neutral">{templates.length}</span>
              </div>
              <div className="system-mgo__target-list">
                {templates.slice(0, 3).map((template) => (
                  <Link to={`/templates/${template.id}/graph`} className="system-mgo__target-row" key={template.id}>
                    <GitBranch size={16} />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.description ?? copy.mgo.noDescription}</small>
                    </span>
                    <b className="text-info">{template.type}</b>
                  </Link>
                ))}
                {templates.length === 0 ? <div className="empty-state">{copy.mgo.noPolicies}</div> : null}
              </div>
              <Link to="/templates" className="button-secondary system-mgo__panel-link">
                <span>{copy.mgo.viewAllPolicies}</span>
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="system-mgo__list-panel surface-panel surface-panel--workspace" id="presentation-modes">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{copy.presentationKicker}</p>
                  <h3 className="section-title">{copy.presentationTitle}</h3>
                </div>
                <span className="status-pill status-pill--neutral">{copy.presentationModes.length}</span>
              </div>
              <div className="system-mgo__mode-list">
                {copy.presentationModes.map((mode, index) => (
                  <span key={`${mode.title}-${index}`}>
                    <Sparkles size={16} />
                    <strong>{mode.title}</strong>
                    <small>{mode.summary}</small>
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="system-mgo__capability surface-panel surface-panel--workspace" id="capabilities">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.capabilityKicker}</p>
                <h3 className="section-title">{copy.mgo.capabilityTitle}</h3>
              </div>
              <Link to="/runtime-targets" className="text-action">
                {copy.mgo.viewFullCapabilities}
                <ArrowRight size={15} />
              </Link>
            </div>
            <div className="system-mgo__capability-grid">
              {capabilityMetrics.map((item) => (
                <div key={item.label} className="system-mgo__capability-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small className={item.tone === 'warning' ? 'text-warning' : item.tone === 'success' ? 'text-success' : 'text-info'}>{item.delta}</small>
                  <i style={{ '--width': item.value.endsWith('%') ? item.value : '72%' } as CSSProperties} />
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="system-mgo__rail">
          <section className="system-mgo__health surface-panel surface-panel--workspace" id="audit-trace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.healthKicker}</p>
                <h3 className="section-title">{copy.mgo.healthTitle}</h3>
              </div>
              <span className={getPillClass(systemTone)}>{systemTone === 'success' ? copy.mgo.healthy : copy.mgo.needsAttention}</span>
            </div>
            <div className="system-mgo__health-dial">
              <ShieldCheck size={34} />
              <strong>{healthPercent}</strong>
            </div>
            <div className="system-mgo__health-list">
              {healthRows.map((row) => (
                <span key={row.label}>
                  <small>{row.label}</small>
                  <b>{row.value}</b>
                  <em className={row.tone === 'warning' ? 'text-warning' : row.tone === 'success' ? 'text-success' : 'text-info'}>
                    {row.tone === 'warning' ? copy.mgo.needsAttention : row.tone === 'success' ? copy.mgo.healthy : copy.mgo.eventObserved}
                  </em>
                </span>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.incidentsKicker}</p>
                <h3 className="section-title">{copy.mgo.incidentsTitle}</h3>
              </div>
              <Activity size={16} />
            </div>
            <div className="system-mgo__incident-list">
              {incidents.map((incident, index) => (
                <span key={`${incident.label}-${index}`}>
                  {incident.tone === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  <strong>{incident.label}</strong>
                  <em className={incident.tone === 'warning' ? 'text-warning' : 'text-success'}>
                    {incident.tone === 'warning' ? copy.mgo.open : copy.mgo.resolved}
                  </em>
                </span>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.driftKicker}</p>
                <h3 className="section-title">{copy.mgo.driftTitle}</h3>
              </div>
              <span className={runtimeOverrides.length > 0 ? 'status-pill status-pill--info' : 'status-pill status-pill--success'}>
                {copy.mgo.driftCount(runtimeOverrides.length)}
              </span>
            </div>
            <div className="system-mgo__drift-card">
              <SlidersHorizontal size={18} />
              <strong>{runtimeOverrides[0] ? getTargetLabel(runtimeOverrides[0]) : copy.mgo.noDriftTitle}</strong>
              <p>{runtimeOverrides[0] ? copy.mgo.driftSummary(runtimeOverrides[0].runtimeTargetRef) : copy.mgo.noDriftSummary}</p>
              <Link to="/runtime-targets" className="button-secondary">{copy.mgo.reviewDrift}</Link>
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">{copy.mgo.eventsKicker}</p>
                <h3 className="section-title">{copy.mgo.eventsTitle}</h3>
              </div>
              <span className="status-pill status-pill--info">{copy.mgo.eventObserved}</span>
            </div>
            <div className="system-mgo__event-list">
              {(events.length > 0 ? events : [{ time: copy.mgo.eventObserved, label: copy.mgo.noEvents, tone: 'info' as const }]).map((event, index) => (
                <span key={`${event.label}-${index}`}>
                  <i className={event.tone === 'warning' ? 'text-warning' : event.tone === 'success' ? 'text-success' : 'text-info'} />
                  <small>{event.time}</small>
                  <strong>{event.label}</strong>
                </span>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <footer className="system-mgo__footer surface-panel surface-panel--workspace">
        <span>
          <Boxes size={15} />
          {copy.mgo.footerSystemId}: {copy.mgo.systemIdValue}
        </span>
        <span>
          <Route size={15} />
          {copy.mgo.footerRegion}: {copy.mgo.regionValue}
        </span>
        <span>
          <Gauge size={15} />
          {copy.mgo.footerGovernance}: {governanceSnapshot?.hostPressureStatus ?? copy.mgo.eventObserved}
        </span>
        <span>
          <Layers3 size={15} />
          {copy.mgo.footerAudit}: {healthSnapshot ? (systemTone === 'success' ? copy.mgo.live : copy.mgo.needsAttention) : copy.mgo.eventObserved}
        </span>
      </footer>
    </div>
  );
}
