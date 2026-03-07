import { useState } from 'react';
import { Eye, EyeOff, Link2, Palette, RefreshCcw, Shield } from 'lucide-react';
import * as api from '@/lib/api';
import { settingsPageCopy } from '@/lib/dashboardCopy';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';

const themeOptions: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: settingsPageCopy.appearanceLabels.light, description: settingsPageCopy.appearanceDescriptions.light },
  { value: 'dark', label: settingsPageCopy.appearanceLabels.dark, description: settingsPageCopy.appearanceDescriptions.dark },
  { value: 'system', label: settingsPageCopy.appearanceLabels.system, description: settingsPageCopy.appearanceDescriptions.system },
];

export function SettingsPage() {
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
  const [message, setMessage] = useState('');

  const testConnection = async () => {
    setStatus('loading');
    try {
      await api.healthCheck();
      setStatus('success');
      setMessage(settingsPageCopy.healthSuccess);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : settingsPageCopy.healthFailureFallback);
    }
  };

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--intro space-y-2">
        <p className="page-kicker">{settingsPageCopy.kicker}</p>
        <h2 className="page-title">{settingsPageCopy.title}</h2>
        <p className="page-summary">{settingsPageCopy.summary}</p>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{settingsPageCopy.gatewayKicker}</p>
            <h3 className="section-title">{settingsPageCopy.gatewayTitle}</h3>
          </div>
          <Link2 size={16} className="text-[var(--color-primary)]" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setApiConfig(localBase, localToken)}
            className="button-primary"
          >
            {settingsPageCopy.saveAction}
          </button>
          <button type="button" onClick={testConnection} className="button-secondary">
            {settingsPageCopy.testAction}
          </button>
          {status !== 'idle' && (
            <span className={status === 'success' ? 'status-pill status-pill--success' : status === 'error' ? 'status-pill status-pill--danger' : 'status-pill status-pill--info'}>
              {status === 'loading' ? settingsPageCopy.healthLoading : message}
            </span>
          )}
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{settingsPageCopy.refreshKicker}</p>
            <h3 className="section-title">{settingsPageCopy.refreshTitle}</h3>
          </div>
          <RefreshCcw size={16} className="text-[var(--color-warning)]" />
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <span className="field-label">{settingsPageCopy.refreshLabel}</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {[3, 5, 10, 30].map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => setRefreshInterval(seconds)}
                  className={refreshInterval === seconds ? 'choice-pill choice-pill--active' : 'choice-pill'}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>

          <div className="detail-card">
            <Shield size={16} className="detail-card__icon" />
            <span className="detail-card__label">{settingsPageCopy.pauseLabel}</span>
            <button
              type="button"
              onClick={() => setPauseOnHidden(!pauseOnHidden)}
              className={pauseOnHidden ? 'toggle toggle--active' : 'toggle'}
              aria-label={settingsPageCopy.pauseLabel}
            >
              <span className="toggle__knob" />
            </button>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{settingsPageCopy.appearanceKicker}</p>
            <h3 className="section-title">{settingsPageCopy.appearanceTitle}</h3>
          </div>
          <Palette size={16} className="text-[var(--color-info)]" />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className="surface-panel surface-panel--muted text-left"
              style={mode === option.value ? { borderColor: 'var(--color-primary)' } : undefined}
            >
              <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{option.label}</p>
              <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">{option.description}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
