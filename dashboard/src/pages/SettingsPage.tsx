import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  KeyRound,
  Link2,
  LockKeyhole,
  Palette,
  RefreshCcw,
  Save,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Wifi,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as api from '@/lib/api';
import { HumanAccountsPanel } from '@/components/settings/HumanAccountsPanel';
import { useSettingsPageCopy } from '@/lib/dashboardCopy';
import { useLocale } from '@/lib/i18n';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTaskStore } from '@/stores/taskStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';

export function SettingsPage() {
  const { t } = useTranslation();
  const settingsPageCopy = useSettingsPageCopy();
  const { locale, setLocale } = useLocale();
  const sessionUsername = useSessionStore((state) => state.username);
  const sessionRole = useSessionStore((state) => state.role);
  const sessionMethod = useSessionStore((state) => state.method);
  const cleanupTasks = useTaskStore((state) => state.cleanupTasks);
  const {
    apiBase,
    apiToken,
    refreshInterval,
    pauseOnHidden,
    setApiConfig,
    setRefreshInterval,
    setPauseOnHidden,
  } = useSettingsStore();
  const { mode, setMode } = useThemeStore();

  const [localBase, setLocalBase] = useState(apiBase);
  const [localToken, setLocalToken] = useState(apiToken);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { showMessage } = useFeedbackStore();

  const themeOptions: { value: ThemeMode; label: string; description: string }[] = [
    { value: 'light', label: settingsPageCopy.appearanceLabels.light, description: settingsPageCopy.appearanceDescriptions.light },
    { value: 'dark', label: settingsPageCopy.appearanceLabels.dark, description: settingsPageCopy.appearanceDescriptions.dark },
    { value: 'system', label: settingsPageCopy.appearanceLabels.system, description: settingsPageCopy.appearanceDescriptions.system },
  ];
  const localeOptions = [
    { value: 'zh-CN' as const, label: t('common.localeName.zh'), description: t('common.languageOptionDescription.zh') },
    { value: 'en-US' as const, label: t('common.localeName.en'), description: t('common.languageOptionDescription.en') },
  ];
  const activeRoleLabel = sessionRole ? settingsPageCopy.roleLabels[sessionRole] : settingsPageCopy.roleLabels.member;
  const tokenConfigured = apiToken.trim().length > 0;
  const stagedConfig = localBase !== apiBase || localToken !== apiToken;
  const healthTone = status === 'success' ? 'success' : status === 'error' ? 'danger' : 'info';
  const healthLabel = status === 'success'
    ? settingsPageCopy.healthSuccess
    : status === 'error'
      ? message
      : status === 'loading'
        ? settingsPageCopy.healthLoading
        : settingsPageCopy.healthIdle;
  const activityItems = [
    {
      label: settingsPageCopy.activityLabels.apiBase,
      value: localBase || apiBase,
      tone: stagedConfig ? 'warning' : 'success',
    },
    {
      label: settingsPageCopy.activityLabels.refresh,
      value: `${refreshInterval}s`,
      tone: 'success',
    },
    {
      label: settingsPageCopy.activityLabels.pause,
      value: pauseOnHidden ? settingsPageCopy.enabledLabel : settingsPageCopy.disabledLabel,
      tone: pauseOnHidden ? 'success' : 'warning',
    },
    {
      label: settingsPageCopy.activityLabels.token,
      value: tokenConfigured ? settingsPageCopy.configuredLabel : settingsPageCopy.notConfiguredLabel,
      tone: tokenConfigured ? 'success' : 'info',
    },
  ] as const;
  const complianceItems = [
    {
      label: settingsPageCopy.complianceLabels.session,
      value: sessionUsername ?? settingsPageCopy.unboundLabel,
      ready: Boolean(sessionUsername),
    },
    {
      label: settingsPageCopy.complianceLabels.role,
      value: activeRoleLabel,
      ready: sessionRole === 'admin',
    },
    {
      label: settingsPageCopy.complianceLabels.health,
      value: healthLabel,
      ready: status === 'success',
    },
    {
      label: settingsPageCopy.complianceLabels.gateway,
      value: apiBase || settingsPageCopy.unboundLabel,
      ready: Boolean(apiBase),
    },
  ];

  const saveConfig = () => {
    setApiConfig(localBase, localToken);
    showMessage(
      t('feedback.configSavedTitle'),
      t('feedback.configSavedDetail'),
      'success',
    );
  };

  const testConnection = async () => {
    setStatus('loading');
    try {
      await api.healthCheck();
      setStatus('success');
      setMessage(settingsPageCopy.healthSuccess);
      showMessage(t('feedback.connectionSuccessTitle'), settingsPageCopy.healthSuccess, 'success');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : settingsPageCopy.healthFailureFallback);
      showMessage(
        t('feedback.gatewayFailureTitle'),
        error instanceof Error ? error.message : settingsPageCopy.healthFailureFallback,
        'warning',
      );
    }
  };

  const handleCleanup = async () => {
    setCleanupLoading(true);
    try {
      const cleaned = await cleanupTasks();
      showMessage(
        t('feedback.cleanupSuccessTitle'),
        settingsPageCopy.cleanupSuccess(cleaned),
        'success',
      );
    } catch (cleanupError) {
      showMessage(
        t('feedback.cleanupFailureTitle'),
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        'warning',
      );
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <div className="interior-page settings-mgo">
      <section className="settings-mgo__masthead" data-testid="settings-masthead">
        <div>
          <h1>{settingsPageCopy.sectionLabel}</h1>
          <h2 className="sr-only">{settingsPageCopy.title}</h2>
          <p>{settingsPageCopy.summary}</p>
        </div>
        <div className="settings-mgo__actions">
          <button type="button" className="button-secondary" onClick={testConnection}>
            <Wifi size={15} />
            <span>{settingsPageCopy.testAction}</span>
          </button>
          <button type="button" className="button-primary" onClick={saveConfig}>
            <Save size={15} />
            <span>{settingsPageCopy.saveAction}</span>
          </button>
        </div>
      </section>

      <nav className="settings-mgo__tabs" aria-label={settingsPageCopy.tabsLabel}>
        <a href="#profile">{settingsPageCopy.tabLabels.profile}</a>
        <a href="#workspace">{settingsPageCopy.tabLabels.workspace}</a>
        <a href="#security">{settingsPageCopy.tabLabels.security}</a>
        <a href="#api">{settingsPageCopy.tabLabels.api}</a>
        <a href="#display">{settingsPageCopy.tabLabels.display}</a>
        <a href="#governance">{settingsPageCopy.tabLabels.governance}</a>
        <a href="#system">{settingsPageCopy.tabLabels.system}</a>
      </nav>

      <div className="settings-mgo__layout">
        <main className="settings-mgo__main">
          <section id="profile" className="surface-panel surface-panel--workspace settings-mgo__profile">
            <div className="settings-mgo__section-head">
              <div>
                <p className="page-kicker">{settingsPageCopy.accessKicker}</p>
                <h2 className="section-title">{settingsPageCopy.profileTitle}</h2>
              </div>
            </div>
            <div className="settings-mgo__profile-grid">
              <div className="settings-mgo__avatar" aria-hidden="true">
                {(sessionUsername ?? settingsPageCopy.sectionLabel).slice(0, 2).toUpperCase()}
              </div>
              <div className="settings-mgo__field">
                <span>{settingsPageCopy.sessionLabels.actor}</span>
                <strong>{sessionUsername ?? settingsPageCopy.unboundLabel}</strong>
              </div>
              <div className="settings-mgo__field">
                <span>{settingsPageCopy.sessionLabels.role}</span>
                <strong>{activeRoleLabel}</strong>
              </div>
              <div className="settings-mgo__field">
                <span>{settingsPageCopy.sessionLabels.method}</span>
                <strong>{sessionMethod ?? settingsPageCopy.sessionFallbackLabel}</strong>
              </div>
              <div className="settings-mgo__verified">
                <CheckCircle2 size={14} />
                <span>{settingsPageCopy.verifiedLabel}</span>
              </div>
            </div>
          </section>

          <section id="workspace" className="surface-panel surface-panel--workspace" data-testid="settings-sync-panel">
            <div className="settings-mgo__section-head">
              <div>
                <p className="page-kicker">{settingsPageCopy.refreshKicker}</p>
                <h3 className="section-title">{settingsPageCopy.refreshTitle}</h3>
              </div>
              <Database size={16} className="icon-accent-info" />
            </div>
            <p className="settings-mgo__section-note">{settingsPageCopy.workspaceTitle}</p>
            <div className="settings-mgo__workspace-grid">
              <div className="settings-mgo__select-line">
                <span>{settingsPageCopy.defaultProjectViewLabel}</span>
                <strong>{settingsPageCopy.contextMapLabel}</strong>
              </div>
              <div className="settings-mgo__select-line">
                <span>{settingsPageCopy.defaultWorkViewLabel}</span>
                <strong>{settingsPageCopy.currentWorkLabel}</strong>
              </div>
              <div className="settings-mgo__select-line">
                <span>{settingsPageCopy.startPageLabel}</span>
                <strong>{settingsPageCopy.dashboardHomeLabel}</strong>
              </div>
              <div className="settings-mgo__switch-stack">
                <div>
                  <span className="field-label" id="settings-refresh-cadence-label">{settingsPageCopy.refreshLabel}</span>
                  <div className="settings-mgo__choices" role="group" aria-labelledby="settings-refresh-cadence-label">
                    {[3, 5, 10, 30].map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => setRefreshInterval(seconds)}
                        aria-pressed={refreshInterval === seconds}
                        className={refreshInterval === seconds ? 'choice-pill choice-pill--active' : 'choice-pill'}
                      >
                        {`${seconds}s`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-mgo__toggle-row">
                  <div>
                    <strong>{settingsPageCopy.pauseLabel}</strong>
                    <span>{settingsPageCopy.pauseSummary}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPauseOnHidden(!pauseOnHidden)}
                    className={pauseOnHidden ? 'toggle toggle--active' : 'toggle'}
                    aria-label={settingsPageCopy.pauseLabel}
                    role="switch"
                    aria-checked={pauseOnHidden}
                  >
                    <span className="toggle__knob" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="settings-mgo__split">
            <section id="security" className="surface-panel surface-panel--workspace">
              <div className="settings-mgo__section-head">
                <div>
                  <p className="page-kicker">{settingsPageCopy.securityKicker}</p>
                  <h3 className="section-title">{settingsPageCopy.securityTitle}</h3>
                </div>
                <LockKeyhole size={16} className="icon-accent-primary" />
              </div>
              <div className="settings-mgo__truth-list">
                <span>
                  <ShieldCheck size={14} />
                  <strong>{settingsPageCopy.sessionTimeoutLabel}</strong>
                  <em>{settingsPageCopy.backendManagedValue}</em>
                </span>
                <span>
                  <KeyRound size={14} />
                  <strong>{settingsPageCopy.ipRestrictionsLabel}</strong>
                  <em>{settingsPageCopy.ipRestrictionsValue}</em>
                </span>
                <span>
                  <ClipboardCheck size={14} />
                  <strong>{settingsPageCopy.mfaLabel}</strong>
                  <em>{settingsPageCopy.mfaValue}</em>
                </span>
                <span>
                  <UserCircle size={14} />
                  <strong>{settingsPageCopy.activeSessionsLabel}</strong>
                  <em>{settingsPageCopy.activeSessionsValue}</em>
                </span>
              </div>
              <div className="settings-mgo__toggle-row settings-mgo__standard-row">
                <div>
                  <strong>{settingsPageCopy.reauthLabel}</strong>
                  <span>{settingsPageCopy.reauthSummary}</span>
                </div>
                <span className="status-pill status-pill--info">{settingsPageCopy.standardLabel}</span>
              </div>
            </section>

            <section id="api" className="surface-panel surface-panel--workspace" data-testid="settings-gateway-panel">
              <div className="settings-mgo__section-head">
                <div>
                  <p className="page-kicker">{settingsPageCopy.gatewayKicker}</p>
                  <h3 className="section-title">{settingsPageCopy.gatewayTitle}</h3>
                </div>
                <Link2 size={16} className="icon-accent-primary" />
              </div>

              <div className="settings-form-grid mt-5">
                <label className="space-y-2">
                  <span className="field-label">{settingsPageCopy.endpointLabel}</span>
                  <input
                    type="text"
                    value={localBase}
                    onChange={(event) => setLocalBase(event.target.value)}
                    className="input-shell"
                  />
                </label>

                <label className="space-y-2">
                  <span className="field-label">{settingsPageCopy.tokenLabel}</span>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={localToken}
                      onChange={(event) => setLocalToken(event.target.value)}
                      className="input-shell pr-12"
                      placeholder={settingsPageCopy.tokenPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((current) => !current)}
                      className="icon-button absolute right-2 top-1/2 -translate-y-1/2"
                      aria-label={showToken ? settingsPageCopy.tokenHideLabel : settingsPageCopy.tokenShowLabel}
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              </div>

              <div className="settings-mgo__api-actions">
                {status !== 'idle' && (
                  <span className={`status-pill status-pill--${healthTone}`}>
                    {healthLabel}
                  </span>
                )}
              </div>
            </section>
          </div>

          <div className="settings-mgo__split">
            <section id="display" className="surface-panel surface-panel--workspace" data-testid="settings-appearance-panel">
              <div className="settings-mgo__section-head">
                <div>
                  <p className="page-kicker">{settingsPageCopy.appearanceKicker}</p>
                  <h3 className="section-title">{settingsPageCopy.appearanceTitle}</h3>
                </div>
                <Palette size={16} className="icon-accent-info" />
              </div>

              <div className="settings-mgo__option-grid" role="group" aria-label={settingsPageCopy.appearanceTitle}>
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => {
                      setMode(option.value);
                      showMessage(
                        t('feedback.themeChangedTitle'),
                        t('feedback.themeChangedDetail', { label: option.label }),
                        'info',
                      );
                    }}
                    className={mode === option.value ? 'selection-card selection-card--active text-left' : 'selection-card text-left'}
                  >
                    <p className="type-heading-xs">{option.label}</p>
                    <p className="type-body-sm mt-2">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="surface-panel surface-panel--workspace" data-testid="settings-language-panel">
              <div className="settings-mgo__section-head">
                <div>
                  <p className="page-kicker">{settingsPageCopy.languageKicker}</p>
                  <h3 className="section-title">{settingsPageCopy.languageTitle}</h3>
                </div>
                <Globe2 size={16} className="icon-accent-primary" />
              </div>

              <p className="type-body-sm mt-4">{t('common.languageSummary')}</p>
              <div className="settings-mgo__option-grid settings-mgo__option-grid--two" role="group" aria-label={settingsPageCopy.languageTitle}>
                {localeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={locale === option.value}
                    onClick={() => {
                      void setLocale(option.value);
                      showMessage(
                        t('feedback.localeChangedTitle'),
                        t('feedback.localeChangedDetail', { label: option.label }),
                        'info',
                      );
                    }}
                    className={locale === option.value ? 'selection-card selection-card--active text-left' : 'selection-card text-left'}
                  >
                    <p className="type-heading-xs">{option.label}</p>
                    <p className="type-body-sm mt-2">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section id="governance" className="surface-panel surface-panel--workspace settings-mgo__governance">
            <div className="settings-mgo__section-head">
              <div>
                <p className="page-kicker">{settingsPageCopy.governanceKicker}</p>
                <h3 className="section-title">{settingsPageCopy.governanceTitle}</h3>
              </div>
              <Shield size={16} className="icon-accent-warning" />
            </div>
            <div className="settings-mgo__governance-grid">
              <div className="settings-mgo__toggle-row">
                <div>
                  <strong>{settingsPageCopy.rationaleLabel}</strong>
                  <span>{settingsPageCopy.rationaleSummary}</span>
                </div>
                <span className="status-pill status-pill--info">{settingsPageCopy.standardLabel}</span>
              </div>
              <div className="settings-mgo__toggle-row">
                <div>
                  <strong>{settingsPageCopy.reviewDepthLabel}</strong>
                  <span>{settingsPageCopy.reviewDepthStandardLabel}</span>
                </div>
                <span className="status-pill status-pill--info">{settingsPageCopy.observedLabel}</span>
              </div>
              <div className="settings-mgo__toggle-row">
                <div>
                  <strong>{settingsPageCopy.policyChangesLabel}</strong>
                  <span>{settingsPageCopy.policyChangesSummary}</span>
                </div>
                <span className="status-pill status-pill--info">{settingsPageCopy.standardLabel}</span>
              </div>
              <div className="settings-mgo__toggle-row">
                <div>
                  <strong>{settingsPageCopy.digestFrequencyLabel}</strong>
                  <span>{settingsPageCopy.digestDailyLabel}</span>
                </div>
                <span className="status-pill status-pill--info">{settingsPageCopy.observedLabel}</span>
              </div>
              <div className="settings-mgo__toggle-row">
                <div>
                  <strong>{settingsPageCopy.cleanupAction}</strong>
                  <span>{settingsPageCopy.cleanupSummary}</span>
                </div>
                <button type="button" onClick={() => void handleCleanup()} className="button-secondary">
                  {cleanupLoading ? t('common.cleanupLoading') : settingsPageCopy.cleanupAction}
                </button>
              </div>
            </div>
          </section>

          <HumanAccountsPanel
            isAdmin={sessionRole === 'admin'}
            currentUsername={sessionUsername}
            currentRole={sessionRole}
            authMethod={sessionMethod}
          />
        </main>

        <aside className="settings-mgo__rail" id="system">
          <section className="surface-panel surface-panel--workspace settings-mgo__rail-card">
            <div className="settings-mgo__rail-title">
              <h3>{settingsPageCopy.accountEnvironmentTitle}</h3>
              <span className={`status-pill status-pill--${healthTone}`}>
                {status === 'success' ? settingsPageCopy.operationalLabel : settingsPageCopy.observedLabel}
              </span>
            </div>
            <div className="settings-mgo__operator">
              <span>{(sessionUsername ?? settingsPageCopy.sectionLabel).slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{sessionUsername ?? settingsPageCopy.unboundLabel}</strong>
                <small>{activeRoleLabel}</small>
              </div>
            </div>
            <div className="settings-mgo__rail-facts">
              <span><b>{settingsPageCopy.environmentLabel}</b><em>{settingsPageCopy.localEnvironmentLabel}</em></span>
              <span><b>{settingsPageCopy.instanceLabel}</b><em>{apiBase || settingsPageCopy.unboundLabel}</em></span>
              <span><b>{settingsPageCopy.localeLabel}</b><em>{locale}</em></span>
              <span><b>{settingsPageCopy.themeLabel}</b><em>{mode}</em></span>
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace settings-mgo__rail-card">
            <div className="settings-mgo__rail-title">
              <h3>{settingsPageCopy.configActivityTitle}</h3>
            </div>
            <div className="settings-mgo__activity">
              {activityItems.map((item) => (
                <span key={item.label}>
                  <i className={`settings-mgo__dot settings-mgo__dot--${item.tone}`} />
                  <strong>{item.label}</strong>
                  <em>{item.value}</em>
                </span>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace settings-mgo__rail-card">
            <div className="settings-mgo__rail-title">
              <h3>{settingsPageCopy.complianceTitle}</h3>
              <Gauge size={15} />
            </div>
            <div className="settings-mgo__compliance">
              {complianceItems.map((item) => (
                <span key={item.label}>
                  {item.ready ? <CheckCircle2 size={14} /> : <SlidersHorizontal size={14} />}
                  <strong>{item.label}</strong>
                  <em>{item.value}</em>
                </span>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace settings-mgo__rail-card">
            <div className="settings-mgo__rail-title">
              <h3>{settingsPageCopy.resourcesTitle}</h3>
            </div>
            <div className="settings-mgo__resource settings-mgo__resource--static">
              <Wifi size={14} />
              <span>{healthLabel}</span>
            </div>
            <div className="settings-mgo__resource settings-mgo__resource--static">
              <RefreshCcw size={14} />
              <span>{cleanupLoading ? t('common.cleanupLoading') : settingsPageCopy.cleanupAction}</span>
            </div>
            <div className="settings-mgo__resource settings-mgo__resource--static">
              <UserCircle size={14} />
              <span>{settingsPageCopy.accountTitle}</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
