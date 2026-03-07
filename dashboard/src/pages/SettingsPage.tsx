import { useState } from 'react';
import { Eye, EyeOff, Link2, Zap, Palette } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import * as api from '@/lib/api';

export function SettingsPage() {
  const { apiBase, apiToken, refreshInterval, pauseOnHidden, setApiConfig, setRefreshInterval, setPauseOnHidden } =
    useSettingsStore();
  const { mode, setMode } = useThemeStore();

  const [localBase, setLocalBase] = useState(apiBase);
  const [localToken, setLocalToken] = useState(apiToken);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const handleSaveApi = () => {
    setApiConfig(localBase, localToken);
    setTestResult('idle');
  };

  const handleTestConnection = async () => {
    setTestResult('loading');
    try {
      await api.healthCheck();
      setTestResult('success');
      setTestMessage('连接成功');
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : '连接失败');
    }
  };

  const themes: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light', label: '浅色', desc: '始终使用浅色主题' },
    { value: 'dark', label: '深色', desc: '始终使用深色主题' },
    { value: 'system', label: '跟随系统', desc: '根据操作系统偏好自动切换' },
  ];

  const intervals = [
    { value: 3, label: '3 秒' },
    { value: 5, label: '5 秒' },
    { value: 10, label: '10 秒' },
    { value: 30, label: '30 秒' },
    { value: 60, label: '1 分钟' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          设置
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          配置 API 连接、刷新频率和外观
        </p>
      </div>

      {/* ── API Connection ── */}
      <section className="card-flat overflow-hidden">
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <Link2 size={16} style={{ color: 'var(--color-primary)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            API 连接
          </span>
        </div>
        <div className="p-5 space-y-4">
          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Base URL
            </label>
            <input
              type="text"
              value={localBase}
              onChange={(e) => setLocalBase(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-[13px] transition-colors duration-100"
              style={{
                background: 'var(--color-bg-muted)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                fontFamily: 'var(--font-mono, monospace)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ring)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Token */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              API Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                placeholder="可选 — 留空表示不鉴权"
                className="w-full h-9 px-3 pr-10 rounded-lg text-[13px] transition-colors duration-100"
                style={{
                  background: 'var(--color-bg-muted)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ring)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={showToken ? '隐藏 Token' : '显示 Token'}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSaveApi}
              className="h-8 px-4 rounded-lg text-[12px] font-medium transition-all duration-100"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; }}
            >
              保存
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testResult === 'loading'}
              className="h-8 px-4 rounded-lg text-[12px] font-medium transition-all duration-100"
              style={{
                background: 'var(--color-bg-muted)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                cursor: testResult === 'loading' ? 'wait' : 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-emphasis)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-muted)'; }}
            >
              {testResult === 'loading' ? '测试中...' : '测试连接'}
            </button>
            {testResult === 'success' && (
              <span className="text-[12px]" style={{ color: 'var(--color-success)' }}>{testMessage}</span>
            )}
            {testResult === 'error' && (
              <span className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{testMessage}</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Refresh ── */}
      <section className="card-flat overflow-hidden">
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <Zap size={16} style={{ color: 'var(--color-warning)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            刷新
          </span>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              自动刷新间隔
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {intervals.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setRefreshInterval(value)}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium transition-all duration-100"
                  style={{
                    background: refreshInterval === value ? 'var(--color-primary-bg)' : 'var(--color-bg-muted)',
                    color: refreshInterval === value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    border: refreshInterval === value
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPauseOnHidden(!pauseOnHidden)}
              className="w-9 h-5 rounded-full transition-colors duration-200 relative shrink-0"
              style={{
                background: pauseOnHidden ? 'var(--color-primary)' : 'var(--color-bg-emphasis)',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="页面隐藏时暂停刷新"
            >
              <span
                className="block w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform duration-200"
                style={{
                  transform: pauseOnHidden ? 'translateX(18px)' : 'translateX(3px)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                }}
              />
            </button>
            <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
              页面隐藏时暂停自动刷新
            </span>
          </div>
        </div>
      </section>

      {/* ── Theme ── */}
      <section className="card-flat overflow-hidden">
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <Palette size={16} style={{ color: 'var(--color-info)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            外观
          </span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-2">
            {themes.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className="flex flex-col items-start p-3 rounded-lg text-left transition-all duration-100"
                style={{
                  background: mode === value ? 'var(--color-primary-bg)' : 'var(--color-bg-muted)',
                  border: mode === value
                    ? '1.5px solid var(--color-primary)'
                    : '1.5px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                <span
                  className="text-[13px] font-medium"
                  style={{
                    color: mode === value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  }}
                >
                  {label}
                </span>
                <span className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
