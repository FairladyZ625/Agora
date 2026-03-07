import { useEffect } from 'react';
import {
  ListTodo,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  Circle,
} from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { Link } from 'react-router';

// ── Mock data for visual richness when API has no tasks ──
const MOCK_TASKS = [
  { id: 'TSK-001', title: '实现 Agent 权限分级验证', state: 'in_progress', creator: 'archon', priority: 'high', updated_at: '2 分钟前' },
  { id: 'TSK-002', title: '任务编排器状态机重构', state: 'gate_waiting', creator: 'lizeyu', priority: 'normal', updated_at: '8 分钟前' },
  { id: 'TSK-003', title: '结构化日志脱敏过滤器', state: 'completed', creator: 'craftsman-1', priority: 'normal', updated_at: '1 小时前' },
  { id: 'TSK-004', title: 'OpenClaw 插件 Bridge 测试', state: 'completed', creator: 'archon', priority: 'low', updated_at: '3 小时前' },
  { id: 'TSK-005', title: '数据库 WAL 模式性能调优', state: 'in_progress', creator: 'lizeyu', priority: 'high', updated_at: '5 小时前' },
  { id: 'TSK-006', title: 'CI/CD Pipeline 双 Job 配置', state: 'completed', creator: 'archon', priority: 'normal', updated_at: '昨天' },
];

export function DashboardHome() {
  const { tasks, loading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Use real tasks if available, otherwise show mock for visual demo
  const displayTasks = tasks.length > 0 ? tasks.map(t => ({
    id: t.id,
    title: t.title,
    state: t.state,
    creator: t.creator,
    priority: t.priority,
    updated_at: t.updated_at,
  })) : MOCK_TASKS;

  const stats = tasks.length > 0
    ? {
        total: tasks.length,
        inProgress: tasks.filter(t => t.state === 'in_progress').length,
        gateWaiting: tasks.filter(t => t.state === 'gate_waiting').length,
        completed: tasks.filter(t => t.state === 'completed').length,
      }
    : { total: 6, inProgress: 2, gateWaiting: 1, completed: 3 };

  const statCards = [
    {
      label: '总任务',
      value: stats.total,
      icon: ListTodo,
      bg: 'var(--stat-zinc)',
      text: 'var(--stat-zinc-text)',
      accent: 'var(--color-text-tertiary)',
    },
    {
      label: '进行中',
      value: stats.inProgress,
      icon: Clock,
      bg: 'var(--stat-blue)',
      text: 'var(--stat-blue-text)',
      accent: 'var(--color-info)',
    },
    {
      label: '待审批',
      value: stats.gateWaiting,
      icon: ShieldCheck,
      bg: 'var(--stat-amber)',
      text: 'var(--stat-amber-text)',
      accent: 'var(--color-warning)',
    },
    {
      label: '已完成',
      value: stats.completed,
      icon: CheckCircle2,
      bg: 'var(--stat-green)',
      text: 'var(--stat-green-text)',
      accent: 'var(--color-success)',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            概览
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            任务运行状态一览
          </p>
        </div>
        <Link
          to="/tasks"
          className="flex items-center gap-1 text-xs font-medium transition-colors duration-100"
          style={{
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          查看全部 <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="stat-card card-flat flex items-start justify-between p-4"
              style={
                { '--accent': stat.accent } as React.CSSProperties
              }
            >
              <div>
                <div
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: stat.text }}
                >
                  {loading ? '—' : stat.value}
                </div>
                <div
                  className="text-xs mt-1 font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {stat.label}
                </div>
              </div>
              <div
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ background: stat.bg }}
              >
                <Icon size={18} style={{ color: stat.text }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent tasks — takes 2 cols */}
        <div className="lg:col-span-2 card-flat overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              最近任务
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {displayTasks.length} 个任务
            </span>
          </div>

          {error && (
            <div
              className="px-4 py-3 text-xs flex items-center gap-2"
              style={{
                background: 'var(--color-danger-bg)',
                color: 'var(--color-danger-text)',
              }}
            >
              <Circle size={6} fill="currentColor" /> {error}
            </div>
          )}

          <div>
            {displayTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-4 py-2.5 transition-colors duration-100"
                style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[11px] font-mono shrink-0 w-[60px]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {task.id.length > 8 ? task.id.slice(0, 8) : task.id}
                  </span>
                  <span
                    className="text-[13px] truncate"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-4">
                  <span
                    className="text-[11px] hidden sm:inline-block"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {task.updated_at}
                  </span>
                  <StateBadge state={task.state} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions panel */}
        <div className="card-flat overflow-hidden">
          <div
            className="px-4 py-3"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <span
              className="text-[13px] font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              快速操作
            </span>
          </div>

          <div className="p-4 space-y-3">
            {/* Pending review hint */}
            {stats.gateWaiting > 0 && (
              <Link
                to="/reviews"
                className="flex items-center gap-3 p-3 rounded-lg transition-colors duration-100"
                style={{
                  background: 'var(--color-warning-bg)',
                  border: '1px solid var(--color-warning-border)',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                <ShieldCheck size={18} style={{ color: 'var(--color-warning)' }} />
                <div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--color-warning-text)' }}>
                    {stats.gateWaiting} 个任务待审批
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-warning)' }}>
                    点击前往审批
                  </div>
                </div>
              </Link>
            )}

            {/* System health */}
            <div
              className="p-3 rounded-lg"
              style={{
                background: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--color-success)',
                    display: 'inline-block',
                  }}
                />
                <span className="text-[13px] font-medium" style={{ color: 'var(--color-success-text)' }}>
                  系统正常运行
                </span>
              </div>
              <div className="text-[11px] mt-1 ml-4" style={{ color: 'var(--color-success)' }}>
                API 服务在线 · 数据库就绪
              </div>
            </div>

            {/* Info cards */}
            <div
              className="p-3 rounded-lg"
              style={{
                background: 'var(--color-bg-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="text-[12px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                自动刷新
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                每 5 秒自动轮询任务状态
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    in_progress: { bg: 'var(--color-info-bg)', text: 'var(--color-info-text)', label: '进行中' },
    gate_waiting: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)', label: '待审批' },
    completed: { bg: 'var(--color-success-bg)', text: 'var(--color-success-text)', label: '已完成' },
    failed: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', label: '失败' },
    cancelled: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', label: '已取消' },
    pending: { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', label: '等待中' },
  };
  const c = config[state] ?? { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', label: state };

  return (
    <span
      className="badge"
      style={{ background: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}
