import { useEffect, useMemo, useState } from 'react';
import { Cable, RefreshCcw, Send, Waypoints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExternalBridgesPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useCcConnectStore } from '@/stores/ccConnectStore';

function formatList(values: string[], fallback: string) {
  return values.length > 0 ? values.join(', ') : fallback;
}

function getSignalTone(value: boolean | null) {
  if (value === true) {
    return 'status-pill status-pill--success';
  }
  if (value === false) {
    return 'status-pill status-pill--danger';
  }
  return 'status-pill status-pill--neutral';
}

export function ExternalBridgesPage() {
  const { t } = useTranslation();
  const copy = useExternalBridgesPageCopy();
  const inspection = useCcConnectStore((state) => state.inspection);
  const statusProjects = useCcConnectStore((state) => state.statusProjects);
  const projects = useCcConnectStore((state) => state.projects);
  const bridges = useCcConnectStore((state) => state.bridges);
  const selectedProjectName = useCcConnectStore((state) => state.selectedProjectName);
  const selectedProject = useCcConnectStore((state) => state.selectedProject);
  const sessionsByProject = useCcConnectStore((state) => state.sessionsByProject);
  const selectedSessionIdByProject = useCcConnectStore((state) => state.selectedSessionIdByProject);
  const sessionDetailsByProject = useCcConnectStore((state) => state.sessionDetailsByProject);
  const providersByProject = useCcConnectStore((state) => state.providersByProject);
  const modelsByProject = useCcConnectStore((state) => state.modelsByProject);
  const heartbeatByProject = useCcConnectStore((state) => state.heartbeatByProject);
  const cronJobsByProject = useCcConnectStore((state) => state.cronJobsByProject);
  const loading = useCcConnectStore((state) => state.loading);
  const detailLoading = useCcConnectStore((state) => state.detailLoading);
  const sendLoading = useCcConnectStore((state) => state.sendLoading);
  const sessionActionLoading = useCcConnectStore((state) => state.sessionActionLoading);
  const controlActionLoading = useCcConnectStore((state) => state.controlActionLoading);
  const error = useCcConnectStore((state) => state.error);
  const sendReceipt = useCcConnectStore((state) => state.sendReceipt);
  const fetchSnapshot = useCcConnectStore((state) => state.fetchSnapshot);
  const selectProject = useCcConnectStore((state) => state.selectProject);
  const selectSession = useCcConnectStore((state) => state.selectSession);
  const sendMessage = useCcConnectStore((state) => state.sendMessage);
  const createNamedSession = useCcConnectStore((state) => state.createNamedSession);
  const switchActiveSession = useCcConnectStore((state) => state.switchActiveSession);
  const deleteSelectedSession = useCcConnectStore((state) => state.deleteSelectedSession);
  const addProvider = useCcConnectStore((state) => state.addProvider);
  const removeProvider = useCcConnectStore((state) => state.removeProvider);
  const activateProvider = useCcConnectStore((state) => state.activateProvider);
  const setModel = useCcConnectStore((state) => state.setModel);
  const pauseHeartbeat = useCcConnectStore((state) => state.pauseHeartbeat);
  const resumeHeartbeat = useCcConnectStore((state) => state.resumeHeartbeat);
  const runHeartbeat = useCcConnectStore((state) => state.runHeartbeat);
  const updateHeartbeatInterval = useCcConnectStore((state) => state.updateHeartbeatInterval);
  const createCronPrompt = useCcConnectStore((state) => state.createCronPrompt);
  const deleteCronJob = useCcConnectStore((state) => state.deleteCronJob);
  const clearError = useCcConnectStore((state) => state.clearError);
  const { showMessage } = useFeedbackStore();
  const [messageDraft, setMessageDraft] = useState('');
  const [sessionNameDraft, setSessionNameDraft] = useState('');
  const [providerNameDraft, setProviderNameDraft] = useState('');
  const [providerApiKeyDraft, setProviderApiKeyDraft] = useState('');
  const [providerBaseUrlDraft, setProviderBaseUrlDraft] = useState('');
  const [providerThinkingDraft, setProviderThinkingDraft] = useState('');
  const [providerEnvDraft, setProviderEnvDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [heartbeatIntervalDraft, setHeartbeatIntervalDraft] = useState('15');
  const [cronExprDraft, setCronExprDraft] = useState('0 * * * *');
  const [cronPromptDraft, setCronPromptDraft] = useState('');
  const [cronDescriptionDraft, setCronDescriptionDraft] = useState('');

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!error) {
      return;
    }
    showMessage(t('feedback.gatewayFailureTitle'), error, 'warning');
  }, [error, showMessage, t]);

  const selectedSessions = selectedProjectName ? sessionsByProject[selectedProjectName] ?? [] : [];
  const selectedSessionId = selectedProjectName ? selectedSessionIdByProject[selectedProjectName] ?? null : null;
  const selectedSessionDetail = selectedProjectName && selectedSessionId
    ? sessionDetailsByProject[selectedProjectName]?.[selectedSessionId] ?? null
    : null;
  const providerState = selectedProjectName ? providersByProject[selectedProjectName] ?? null : null;
  const modelState = selectedProjectName ? modelsByProject[selectedProjectName] ?? null : null;
  const heartbeatState = selectedProjectName ? heartbeatByProject[selectedProjectName] ?? null : null;
  const cronJobs = selectedProjectName ? cronJobsByProject[selectedProjectName] ?? [] : [];

  const bridgeCount = bridges.length;
  const liveSessionCount = useMemo(
    () => projects.reduce((sum, item) => sum + item.sessionsCount, 0),
    [projects],
  );

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await sendMessage(messageDraft);
    if (result === 'live') {
      setMessageDraft('');
      showMessage(copy.feedback.sendSuccessTitle, copy.feedback.sendSuccessDetail, 'success');
    }
  };

  const submitCreateSession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await createNamedSession(sessionNameDraft);
    if (result === 'live') {
      setSessionNameDraft('');
      showMessage(copy.feedback.sessionCreateSuccessTitle, copy.feedback.sessionCreateSuccessDetail, 'success');
    }
  };

  const submitModel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modelDraft.trim()) {
      return;
    }
    const result = await setModel(modelDraft.trim());
    if (result === 'live') {
      showMessage(copy.feedback.modelUpdateSuccessTitle, copy.feedback.modelUpdateSuccessDetail, 'success');
    }
  };

  const submitProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let env: Record<string, string> | undefined;
    if (providerEnvDraft.trim()) {
      try {
        const parsed = JSON.parse(providerEnvDraft);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Provider env must be a JSON object.');
        }
        env = Object.fromEntries(
          Object.entries(parsed).flatMap(([key, value]) => (
            typeof value === 'string' ? [[key, value]] : []
          )),
        );
      } catch (error) {
        showMessage(
          'Provider env JSON is invalid',
          error instanceof Error ? error.message : String(error),
          'warning',
        );
        return;
      }
    }
    const result = await addProvider({
      name: providerNameDraft,
      apiKey: providerApiKeyDraft,
      baseUrl: providerBaseUrlDraft,
      model: modelDraft,
      thinking: providerThinkingDraft,
      ...(env ? { env } : {}),
    });
    if (result === 'live') {
      setProviderNameDraft('');
      setProviderApiKeyDraft('');
      setProviderBaseUrlDraft('');
      setProviderThinkingDraft('');
      setProviderEnvDraft('');
      showMessage('Provider added', 'The cc-connect runtime accepted the new provider.', 'success');
    }
  };

  const submitHeartbeatInterval = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Number(heartbeatIntervalDraft);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    const result = await updateHeartbeatInterval(minutes);
    if (result === 'live') {
      showMessage(copy.feedback.heartbeatUpdateSuccessTitle, copy.feedback.heartbeatUpdateSuccessDetail, 'success');
    }
  };

  const submitCronPrompt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await createCronPrompt({
      cronExpr: cronExprDraft,
      prompt: cronPromptDraft,
      description: cronDescriptionDraft,
      silent: true,
    });
    if (result === 'live') {
      setCronPromptDraft('');
      setCronDescriptionDraft('');
      showMessage('Cron job created', 'The cc-connect runtime accepted the scheduled prompt.', 'success');
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace" data-testid="external-bridges-masthead">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.binary}</span>
              <span className="inline-stat__value">{inspection?.binary.found ? copy.labels.available : copy.labels.unavailable}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.management}</span>
              <span className="inline-stat__value">{inspection?.management.reachable ? copy.labels.online : copy.labels.offline}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.projects}</span>
              <span className="inline-stat__value">{projects.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.sessions}</span>
              <span className="inline-stat__value">{liveSessionCount}</span>
            </div>
          </div>
        </div>
        {loading ? <div className="inline-alert inline-alert--info mt-5">{copy.loading}</div> : null}
        {sendReceipt ? <div className="inline-alert inline-alert--success mt-5">{sendReceipt}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="external-bridges-inspection-panel">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{copy.panels.inspectionKicker}</p>
            <h3 className="section-title">{copy.panels.inspectionTitle}</h3>
          </div>
          <button type="button" className="button-secondary" onClick={() => void fetchSnapshot()}>
            <RefreshCcw size={16} />
            <span>{copy.refreshAction}</span>
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="detail-card">
            <Cable size={16} className="detail-card__icon" />
            <p className="detail-card__kicker">{copy.cards.binary.kicker}</p>
            <h4 className="detail-card__title">{inspection?.binary.command ?? copy.emptyValue}</h4>
            <p className="type-text-sm">{inspection?.binary.resolvedPath ?? copy.emptyValue}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={getSignalTone(inspection?.binary.found ?? null)}>{copy.cards.binary.foundLabel}</span>
              {inspection?.binary.version ? <span className="status-pill status-pill--info">{inspection.binary.version}</span> : null}
            </div>
          </div>

          <div className="detail-card">
            <Waypoints size={16} className="detail-card__icon" />
            <p className="detail-card__kicker">{copy.cards.management.kicker}</p>
            <h4 className="detail-card__title">{inspection?.management.url ?? copy.emptyValue}</h4>
            <p className="type-text-sm">{formatList(inspection?.management.connectedPlatforms ?? [], copy.emptyValue)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={getSignalTone(inspection?.management.reachable ?? null)}>{copy.cards.management.reachableLabel}</span>
              <span className="status-pill status-pill--neutral">{copy.cards.management.versionLabel}: {inspection?.management.version ?? copy.emptyValue}</span>
            </div>
          </div>

          <div className="detail-card">
            <RefreshCcw size={16} className="detail-card__icon" />
            <p className="detail-card__kicker">{copy.cards.config.kicker}</p>
            <h4 className="detail-card__title">{inspection?.config.path ?? copy.emptyValue}</h4>
            <p className="type-text-sm">{copy.cards.config.portLabel}: {inspection?.config.managementPort ?? copy.emptyValue}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={getSignalTone(inspection?.config.exists ?? null)}>{copy.cards.config.existsLabel}</span>
              <span className={getSignalTone(inspection?.config.tokenPresent ?? null)}>{copy.cards.config.tokenLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="external-bridges__grid">
        <div className="surface-panel surface-panel--workspace" data-testid="external-bridges-projects-panel">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.panels.projectsKicker}</p>
              <h3 className="section-title">{copy.panels.projectsTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">{projects.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {projects.length === 0 ? (
              <div className="empty-state">{copy.emptyProjects}</div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.name}
                  type="button"
                  className={selectedProjectName === project.name ? 'data-row data-row--active w-full text-left' : 'data-row w-full text-left'}
                  onClick={() => void selectProject(project.name)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{project.name}</strong>
                      <span className="status-pill status-pill--neutral">{project.agentType}</span>
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                      <span>{copy.labels.platforms}: {formatList(project.platforms, copy.emptyValue)}</span>
                      <span>{copy.labels.sessions}: {project.sessionsCount}</span>
                      <span>{project.heartbeatEnabled ? copy.labels.heartbeatOn : copy.labels.heartbeatOff}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <p className="field-label">{copy.labels.managementStatus}</p>
            <div className="mt-3 space-y-2">
              {statusProjects.map((project) => (
                <div key={`status-${project.name}`} className="detail-card">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="type-heading-sm">{project.name}</strong>
                    <span className="status-pill status-pill--neutral">{project.sessionsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="external-bridges-sessions-panel">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.panels.sessionsKicker}</p>
              <h3 className="section-title">{copy.panels.sessionsTitle}</h3>
            </div>
            <span className="status-pill status-pill--neutral">{selectedSessions.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {selectedProjectName && selectedSessions.length === 0 ? (
              <div className="empty-state">{copy.emptySessions}</div>
            ) : (
              selectedSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={selectedSessionId === session.id ? 'data-row data-row--active w-full text-left' : 'data-row w-full text-left'}
                  onClick={() => void selectSession(selectedProjectName!, session.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{session.name ?? session.chatName ?? session.id}</strong>
                      {session.live ? <span className="status-pill status-pill--success">{copy.labels.live}</span> : null}
                      {session.active ? <span className="status-pill status-pill--info">{copy.labels.active}</span> : null}
                    </div>
                    <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                      <span>{session.platform}</span>
                      <span>{session.agentType}</span>
                      <span>{session.sessionKey}</span>
                    </div>
                    {session.lastMessage?.content ? (
                      <p className="type-text-xs mt-3 line-clamp-2">{session.lastMessage.content}</p>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="external-bridges-session-detail-panel">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{copy.panels.detailKicker}</p>
              <h3 className="section-title">{copy.panels.detailTitle}</h3>
            </div>
            {detailLoading ? <span className="status-pill status-pill--info">{copy.loading}</span> : null}
          </div>

          {selectedProject ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="detail-card">
                  <p className="detail-card__kicker">{copy.labels.projectConfig}</p>
                  <h4 className="detail-card__title">{selectedProject.name}</h4>
                  <p className="type-text-sm">{selectedProject.workDir ?? copy.emptyValue}</p>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{copy.labels.agentMode}: {selectedProject.agentMode ?? copy.emptyValue}</span>
                    <span>{copy.labels.mode}: {selectedProject.mode ?? copy.emptyValue}</span>
                  </div>
                </div>
                <div className="detail-card">
                  <p className="detail-card__kicker">{copy.labels.bridgeAdapters}</p>
                  <h4 className="detail-card__title">{bridgeCount}</h4>
                  <p className="type-text-sm">{formatList(bridges.map((item) => item.platform), copy.emptyValue)}</p>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{copy.labels.sessions}: {selectedProject.sessionsCount}</span>
                    <span>{copy.labels.heartbeat}: {selectedProject.heartbeat?.intervalMins ?? copy.emptyValue}</span>
                  </div>
                </div>
              </div>

              {selectedSessionDetail ? (
                <>
                  <div className="detail-card">
                    <p className="detail-card__kicker">{copy.labels.sessionDetail}</p>
                    <h4 className="detail-card__title">{selectedSessionDetail.name ?? selectedSessionDetail.id}</h4>
                    <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                      <span>{copy.labels.sessionKey}: {selectedSessionDetail.sessionKey}</span>
                      <span>{copy.labels.agentSessionId}: {selectedSessionDetail.agentSessionId ?? copy.emptyValue}</span>
                      <span>{copy.labels.history}: {selectedSessionDetail.historyCount}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <form className="space-y-3" onSubmit={(event) => void submitCreateSession(event)}>
                      <label className="space-y-2">
                        <span className="field-label">{copy.labels.newSession}</span>
                        <input
                          type="text"
                          value={sessionNameDraft}
                          onChange={(event) => {
                            if (error) {
                              clearError();
                            }
                            setSessionNameDraft(event.target.value);
                          }}
                          className="input-shell"
                          placeholder={copy.newSessionPlaceholder}
                        />
                      </label>
                      <button type="submit" className="button-secondary" disabled={sessionActionLoading}>
                        <span>{sessionActionLoading ? copy.creatingSession : copy.createSessionAction}</span>
                      </button>
                    </form>

                    <div className="space-y-3">
                      <div className="field-label">{copy.labels.sessionActions}</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={sessionActionLoading}
                          onClick={() => void switchActiveSession(selectedSessionDetail.id)}
                        >
                          <span>{sessionActionLoading ? copy.switchingSession : copy.switchSessionAction}</span>
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={sessionActionLoading}
                          onClick={() => void deleteSelectedSession()}
                        >
                          <span>{sessionActionLoading ? copy.deletingSession : copy.deleteSessionAction}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="detail-card">
                      <p className="detail-card__kicker">{copy.labels.providers}</p>
                      <h4 className="detail-card__title">{providerState?.activeProvider ?? copy.emptyValue}</h4>
                      <form className="mt-3 space-y-3" onSubmit={(event) => void submitProvider(event)}>
                        <label className="space-y-2">
                          <span className="field-label">Provider name</span>
                          <input
                            type="text"
                            className="input-shell"
                            aria-label="Provider name"
                            value={providerNameDraft}
                            onChange={(event) => setProviderNameDraft(event.target.value)}
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="field-label">Provider API key</span>
                          <input
                            type="password"
                            className="input-shell"
                            aria-label="Provider API key"
                            value={providerApiKeyDraft}
                            onChange={(event) => setProviderApiKeyDraft(event.target.value)}
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="field-label">Provider base URL</span>
                          <input
                            type="text"
                            className="input-shell"
                            aria-label="Provider base URL"
                            value={providerBaseUrlDraft}
                            onChange={(event) => setProviderBaseUrlDraft(event.target.value)}
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="field-label">Provider thinking</span>
                          <select
                            className="input-shell"
                            aria-label="Provider thinking"
                            value={providerThinkingDraft}
                            onChange={(event) => setProviderThinkingDraft(event.target.value)}
                          >
                            <option value="">{copy.emptyValue}</option>
                            <option value="disabled">disabled</option>
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="field-label">Provider env JSON</span>
                          <textarea
                            className="input-shell min-h-24"
                            aria-label="Provider env JSON"
                            value={providerEnvDraft}
                            onChange={(event) => setProviderEnvDraft(event.target.value)}
                          />
                        </label>
                        <button type="submit" className="button-secondary" disabled={controlActionLoading}>
                          <span>{controlActionLoading ? 'Adding provider…' : 'Add provider'}</span>
                        </button>
                      </form>
                      <div className="mt-3 space-y-2">
                        {(providerState?.providers ?? []).map((provider) => (
                          <div key={provider.name} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="type-heading-sm">{provider.name}</strong>
                              <p className="type-text-xs">{provider.model ?? copy.emptyValue}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={controlActionLoading || provider.active}
                                onClick={() => void activateProvider(provider.name)}
                              >
                                <span>{provider.active ? copy.labels.active : copy.activateProviderAction}</span>
                              </button>
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={controlActionLoading || provider.active}
                                onClick={() => void removeProvider(provider.name)}
                              >
                                <span>{controlActionLoading ? 'Removing provider…' : 'Remove provider'}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-card">
                      <p className="detail-card__kicker">{copy.labels.models}</p>
                      <h4 className="detail-card__title">{modelState?.current ?? copy.emptyValue}</h4>
                      <form className="mt-3 space-y-3" onSubmit={(event) => void submitModel(event)}>
                        <label className="space-y-2">
                          <span className="field-label">{copy.labels.setModel}</span>
                          <select
                            className="input-shell"
                            aria-label={copy.labels.setModel}
                            value={modelDraft}
                            onChange={(event) => setModelDraft(event.target.value)}
                          >
                            <option value="">{copy.emptyValue}</option>
                            {(modelState?.models ?? []).map((model) => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="button-secondary" disabled={controlActionLoading}>
                          <span>{controlActionLoading ? copy.updatingModel : copy.updateModelAction}</span>
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="detail-card">
                    <p className="detail-card__kicker">{copy.labels.heartbeatStatus}</p>
                    <h4 className="detail-card__title">{heartbeatState?.paused ? copy.labels.heartbeatPaused : copy.labels.heartbeatRunning}</h4>
                    <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                      <span>{copy.labels.heartbeat}: {heartbeatState?.intervalMins ?? copy.emptyValue}</span>
                      <span>{copy.labels.sessionKey}: {heartbeatState?.sessionKey ?? copy.emptyValue}</span>
                      <span>{copy.labels.lastRun}: {heartbeatState?.lastRun ?? copy.emptyValue}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="button-secondary" disabled={controlActionLoading} onClick={() => void runHeartbeat()}>
                        <span>{controlActionLoading ? copy.runningHeartbeat : copy.runHeartbeatAction}</span>
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={controlActionLoading || Boolean(heartbeatState?.paused)}
                        onClick={() => void pauseHeartbeat()}
                      >
                        <span>{controlActionLoading ? copy.pausingHeartbeat : copy.pauseHeartbeatAction}</span>
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={controlActionLoading || !heartbeatState?.paused}
                        onClick={() => void resumeHeartbeat()}
                      >
                        <span>{controlActionLoading ? copy.resumingHeartbeat : copy.resumeHeartbeatAction}</span>
                      </button>
                    </div>
                    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => void submitHeartbeatInterval(event)}>
                      <label className="space-y-2">
                        <span className="field-label">{copy.labels.heartbeatInterval}</span>
                        <input
                          type="number"
                          min={1}
                          className="input-shell"
                          aria-label={copy.labels.heartbeatInterval}
                          value={heartbeatIntervalDraft}
                          onChange={(event) => setHeartbeatIntervalDraft(event.target.value)}
                        />
                      </label>
                      <button type="submit" className="button-secondary" disabled={controlActionLoading}>
                        <span>{controlActionLoading ? copy.updatingHeartbeat : copy.updateHeartbeatAction}</span>
                      </button>
                    </form>
                  </div>

                  <div className="detail-card">
                    <p className="detail-card__kicker">Cron jobs</p>
                    <h4 className="detail-card__title">{cronJobs.length}</h4>
                    <form className="mt-4 space-y-3" onSubmit={(event) => void submitCronPrompt(event)}>
                      <label className="space-y-2">
                        <span className="field-label">Cron expression</span>
                        <input
                          type="text"
                          className="input-shell"
                          aria-label="Cron expression"
                          value={cronExprDraft}
                          onChange={(event) => setCronExprDraft(event.target.value)}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="field-label">Cron prompt</span>
                        <textarea
                          className="input-shell min-h-24"
                          aria-label="Cron prompt"
                          value={cronPromptDraft}
                          onChange={(event) => setCronPromptDraft(event.target.value)}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="field-label">Cron description</span>
                        <input
                          type="text"
                          className="input-shell"
                          aria-label="Cron description"
                          value={cronDescriptionDraft}
                          onChange={(event) => setCronDescriptionDraft(event.target.value)}
                        />
                      </label>
                      <button type="submit" className="button-secondary" disabled={controlActionLoading}>
                        <span>{controlActionLoading ? 'Creating cron job…' : 'Create cron job'}</span>
                      </button>
                    </form>
                    <div className="mt-4 space-y-2">
                      {cronJobs.length === 0 ? (
                        <div className="empty-state">No cron jobs are currently configured.</div>
                      ) : (
                        cronJobs.map((job) => (
                          <div key={job.id} className="detail-card">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <strong className="type-heading-sm">{job.description ?? job.id}</strong>
                                <p className="type-text-xs mt-2">{job.cronExpr}</p>
                                <p className="type-text-xs mt-2">{job.prompt ?? job.exec ?? copy.emptyValue}</p>
                              </div>
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={controlActionLoading}
                                onClick={() => void deleteCronJob(job.id)}
                              >
                                <span>{controlActionLoading ? 'Deleting cron job…' : 'Delete cron job'}</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <form className="space-y-3" onSubmit={(event) => void submitMessage(event)}>
                    <label className="space-y-2">
                      <span className="field-label">{copy.labels.sendMessage}</span>
                      <textarea
                        value={messageDraft}
                        onChange={(event) => {
                          if (error) {
                            clearError();
                          }
                          setMessageDraft(event.target.value);
                        }}
                        className="input-shell min-h-28"
                        placeholder={copy.sendPlaceholder}
                      />
                    </label>
                    <button type="submit" className="button-primary" disabled={sendLoading}>
                      <Send size={16} />
                      <span>{sendLoading ? copy.sending : copy.sendAction}</span>
                    </button>
                  </form>

                  <div className="space-y-3">
                    {selectedSessionDetail.history.length === 0 ? (
                      <div className="empty-state">{copy.emptyHistory}</div>
                    ) : (
                      selectedSessionDetail.history.map((entry, index) => (
                        <div key={`${entry.timestamp ?? 'unknown'}-${index}`} className="detail-card">
                          <div className="flex items-center justify-between gap-3">
                            <strong className="type-heading-sm">{entry.role}</strong>
                            <span className="type-text-xs">{entry.timestamp ?? copy.emptyValue}</span>
                          </div>
                          <p className="type-text-sm mt-3 whitespace-pre-wrap">{entry.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-state">{copy.emptyDetail}</div>
              )}
            </div>
          ) : (
            <div className="empty-state mt-5">{copy.emptyProjectSelection}</div>
          )}
        </div>
      </section>
    </div>
  );
}
