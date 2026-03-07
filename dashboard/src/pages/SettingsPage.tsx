import { useState } from 'react';
import { Eye, EyeOff, Link2, Palette, RefreshCcw, Shield } from 'lucide-react';
import * as api from '@/lib/api';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';

const themeOptions: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: '清晰浅色工作台' },
  { value: 'dark', label: 'Dark', description: '低照度高密度操作界面' },
  { value: 'system', label: 'System', description: '跟随系统偏好' },
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
      setMessage('Agora Core 可达，网关连通正常。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '连接失败');
    }
  };

  return (
    <div className="page-enter space-y-6">
      <section className="space-y-2">
        <p className="page-kicker">System Preferences</p>
        <h2 className="page-title">连接、节拍与外观</h2>
        <p className="page-summary">
          设置页应该像操作面板，而不是大而空的表单页。分组要清楚，字段要密，反馈要即时。
        </p>
      </section>

      <section className="surface-panel">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">Gateway identity</p>
            <h3 className="section-title">连接与身份</h3>
          </div>
          <Link2 size={16} className="text-[var(--color-primary)]" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="space-y-2">
            <span className="field-label">API Base Endpoint</span>
            <input
              type="text"
              value={localBase}
              onChange={(event) => setLocalBase(event.target.value)}
              className="input-shell"
            />
          </label>

          <label className="space-y-2">
            <span className="field-label">Access Token</span>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={(event) => setLocalToken(event.target.value)}
                className="input-shell pr-12"
                placeholder="留空表示匿名只读"
              />
              <button
                type="button"
                onClick={() => setShowToken((current) => !current)}
                className="icon-button absolute right-2 top-1/2 -translate-y-1/2"
                aria-label={showToken ? '隐藏 Token' : '显示 Token'}
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
            保存配置
          </button>
          <button type="button" onClick={testConnection} className="button-secondary">
            检测连通性
          </button>
          {status !== 'idle' && (
            <span className={status === 'success' ? 'status-pill status-pill--success' : status === 'error' ? 'status-pill status-pill--danger' : 'status-pill status-pill--info'}>
              {status === 'loading' ? '检测中' : message}
            </span>
          )}
        </div>
      </section>

      <section className="surface-panel">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">Refresh cadence</p>
            <h3 className="section-title">同步策略</h3>
          </div>
          <RefreshCcw size={16} className="text-[var(--color-warning)]" />
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <span className="field-label">轮询间隔</span>
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
            <span className="detail-card__label">页面隐藏时暂停轮询</span>
            <button
              type="button"
              onClick={() => setPauseOnHidden(!pauseOnHidden)}
              className={pauseOnHidden ? 'toggle toggle--active' : 'toggle'}
              aria-label="页面隐藏时暂停轮询"
            >
              <span className="toggle__knob" />
            </button>
          </div>
        </div>
      </section>

      <section className="surface-panel">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">Appearance</p>
            <h3 className="section-title">外观偏好</h3>
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
