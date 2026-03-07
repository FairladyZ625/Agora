import { useState } from 'react';
import { Eye, EyeOff, Link2, Zap, Palette } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import * as api from '@/lib/api';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

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
      setTestMessage('C2 核心网关连接成功');
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : '连接失败');
    }
  };

  const themes: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'light', label: '浅色', desc: '纯净的浅色 UI' },
    { value: 'dark', label: '深色', desc: '深空般的酷炫配色' },
    { value: 'system', label: '系统', desc: '跟随 OS 自动切换' },
  ];

  const intervals = [
    { value: 3, label: '3 秒' },
    { value: 5, label: '5 秒' },
    { value: 10, label: '10 秒' },
    { value: 30, label: '30 秒' },
  ];

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-3xl mx-auto"
    >
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-semibold tracking-tight text-glow" style={{ color: 'var(--color-text-primary)' }}>
          系统配置
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          System Preferences & Configuration
        </p>
      </motion.div>

      {/* ── API Connection ── */}
      <motion.section variants={itemVariants} className="glass-panel overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-glass-border)' }}
        >
          <Link2 size={18} style={{ color: 'var(--color-primary)' }} />
          <span className="text-[14px] font-semibold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
            核心网关通信
          </span>
        </div>
        <div className="p-6 space-y-5">
          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              API Base Endpoint
            </label>
            <input
              type="text"
              value={localBase}
              onChange={(e) => setLocalBase(e.target.value)}
              className="w-full h-10 px-4 rounded-xl text-[14px] transition-colors duration-150 shadow-inner"
              style={{
                background: 'var(--color-bg-muted)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ring), inset 0 2px 4px rgba(0,0,0,0.05)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05)';
              }}
            />
          </div>

          {/* Token */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Access Token (Bearer)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                placeholder="留空即为不验权"
                className="w-full h-10 px-4 pr-12 rounded-xl text-[14px] transition-colors duration-150 shadow-inner"
                style={{
                  background: 'var(--color-bg-muted)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-ring), inset 0 2px 4px rgba(0,0,0,0.05)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05)';
                }}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                style={{
                  color: 'var(--color-text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSaveApi}
              className="h-10 px-6 rounded-xl text-[13px] font-bold shadow-md transition-all"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              应用配置
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleTestConnection}
              disabled={testResult === 'loading'}
              className="h-10 px-6 rounded-xl text-[13px] font-bold shadow-sm transition-all"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                cursor: testResult === 'loading' ? 'wait' : 'pointer',
              }}
            >
              {testResult === 'loading' ? '探测中...' : '检测连通性'}
            </motion.button>
            {testResult === 'success' && (
              <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-[13px] font-medium badge-glass" style={{ color: 'var(--color-success)', borderColor: 'var(--color-success-border)' }}>
                {testMessage}
              </motion.span>
            )}
            {testResult === 'error' && (
              <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-[13px] font-medium badge-glass" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger-border)' }}>
                {testMessage}
              </motion.span>
            )}
          </div>
        </div>
      </motion.section>

      {/* ── Refresh ── */}
      <motion.section variants={itemVariants} className="glass-panel overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-glass-border)' }}
        >
          <Zap size={18} style={{ color: 'var(--color-warning)' }} />
          <span className="text-[14px] font-semibold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
            遥测与同步
          </span>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              心跳轮询间隔
            </label>
            <div className="flex gap-2 flex-wrap">
              {intervals.map(({ value, label }) => (
                <motion.button
                  key={value}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setRefreshInterval(value)}
                  className="h-9 px-4 rounded-xl text-[13px] font-bold shadow-sm"
                  style={{
                    background: refreshInterval === value ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: refreshInterval === value ? '#fff' : 'var(--color-text-secondary)',
                    border: refreshInterval === value ? 'none' : '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-muted)' }}>
            <div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--color-text-primary)' }}>后台挂起优化</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>当页面处于非激活状卡时，挂起一切轮询以节省性能</div>
            </div>
            <button
              onClick={() => setPauseOnHidden(!pauseOnHidden)}
              className="w-12 h-6 rounded-full transition-colors duration-200 relative shrink-0 shadow-inner"
              style={{
                background: pauseOnHidden ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="页面隐藏时暂停刷新"
            >
              <span
                className="block w-5 h-5 rounded-full bg-white absolute top-[2px] transition-transform duration-200 shadow-sm"
                style={{ transform: pauseOnHidden ? 'translateX(26px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </div>
      </motion.section>

      {/* ── Theme ── */}
      <motion.section variants={itemVariants} className="glass-panel overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-glass-border)' }}
        >
          <Palette size={18} style={{ color: 'var(--color-info)' }} />
          <span className="text-[14px] font-semibold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>
            外观与环境光
          </span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {themes.map(({ value, label, desc }) => (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={value}
                onClick={() => setMode(value)}
                className="flex flex-col items-start p-4 rounded-xl text-left shadow-sm relative overflow-hidden"
                style={{
                  background: mode === value ? 'var(--color-surface-hover)' : 'var(--color-surface)',
                  border: mode === value
                    ? '2px solid var(--color-primary)'
                    : '1px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                {mode === value && (
                   <div className="absolute inset-0 bg-[var(--color-primary-bg)] opacity-30 pointer-events-none" />
                )}
                <span
                  className="text-[14px] font-bold relative z-10"
                  style={{
                    color: mode === value ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  }}
                >
                  {label}
                </span>
                <span className="text-[12px] mt-1 relative z-10" style={{ color: 'var(--color-text-tertiary)' }}>
                  {desc}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
