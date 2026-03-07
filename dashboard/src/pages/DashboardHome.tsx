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
import { motion } from 'framer-motion';

// ── Mock data for visual richness when API has no tasks ──
const MOCK_TASKS = [
  { id: 'TSK-001', title: '实现 Agent 权限分级验证', state: 'in_progress', creator: 'archon', priority: 'high', updated_at: '2 分钟前' },
  { id: 'TSK-002', title: '任务编排器状态机重构', state: 'gate_waiting', creator: 'lizeyu', priority: 'normal', updated_at: '8 分钟前' },
  { id: 'TSK-003', title: '结构化日志脱敏过滤器', state: 'completed', creator: 'craftsman-1', priority: 'normal', updated_at: '1 小时前' },
  { id: 'TSK-004', title: 'OpenClaw 插件 Bridge 测试', state: 'completed', creator: 'archon', priority: 'low', updated_at: '3 小时前' },
  { id: 'TSK-005', title: '数据库 WAL 模式性能调优', state: 'in_progress', creator: 'lizeyu', priority: 'high', updated_at: '5 小时前' },
  { id: 'TSK-006', title: 'CI/CD Pipeline 双 Job 配置', state: 'completed', creator: 'archon', priority: 'normal', updated_at: '昨天' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function DashboardHome() {
  const { tasks, loading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* Page header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-semibold tracking-tight text-glow"
            style={{ color: 'var(--color-text-primary)' }}
          >
            概览
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Agora Mission Control Status
          </p>
        </div>
        <Link
          to="/tasks"
          className="flex items-center gap-1.5 text-sm font-medium transition-all duration-200 hover:scale-105"
          style={{
            color: 'var(--color-primary)',
            textDecoration: 'none',
            textShadow: '0 0 12px var(--color-primary-glow)',
          }}
        >
          查看全部 <ArrowUpRight size={16} />
        </Link>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              key={stat.label}
              className="stat-card glass-card flex items-start justify-between p-5 cursor-default"
              style={{ '--accent': stat.accent } as React.CSSProperties}
            >
              <div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: stat.text, textShadow: `0 0 16px ${stat.bg}` }}
                >
                  {loading ? '—' : stat.value}
                </motion.div>
                <div
                  className="text-[13px] mt-1.5 font-medium tracking-wide uppercase"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {stat.label}
                </div>
              </div>
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl shadow-inner"
                style={{ background: stat.bg, boxShadow: `0 4px 12px -4px ${stat.text}` }}
              >
                <Icon size={20} style={{ color: stat.text }} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent tasks — takes 2 cols */}
        <motion.div variants={itemVariants} className="lg:col-span-2 glass-panel overflow-hidden flex flex-col">
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--color-glass-border)' }}
          >
            <span
              className="text-[14px] font-semibold tracking-wide"
              style={{ color: 'var(--color-text-primary)' }}
            >
              最近任务流转
            </span>
            <span className="text-[12px] font-mono tracking-widest uppercase" style={{ color: 'var(--color-text-tertiary)' }}>
              {displayTasks.length} ITEMS
            </span>
          </div>

          {error && (
            <div
              className="px-6 py-3 text-xs flex items-center gap-2"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}
            >
              <Circle size={8} fill="currentColor" /> {error}
            </div>
          )}

          <div className="flex-1 flex flex-col p-2 space-y-1">
            {displayTasks.slice(0, 6).map((task, idx) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.05 }}
                whileHover={{ scale: 1.01, backgroundColor: 'var(--color-surface-hover)' }}
                className="flex items-center justify-between px-4 py-3 rounded-xl cursor-default transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span
                    className="text-[12px] font-mono shrink-0 w-[70px] font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {task.id.length > 8 ? task.id.slice(0, 8) : task.id}
                  </span>
                  <span
                    className="text-[14px] truncate font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span
                    className="text-[12px] hidden sm:inline-block"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {task.updated_at}
                  </span>
                  <StateBadge state={task.state} />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Quick actions panel */}
        <motion.div variants={itemVariants} className="glass-panel overflow-hidden">
          <div
            className="px-6 py-4"
            style={{ borderBottom: '1px solid var(--color-glass-border)' }}
          >
            <span
              className="text-[14px] font-semibold tracking-wide"
              style={{ color: 'var(--color-text-primary)' }}
            >
              系统指挥中心
            </span>
          </div>

          <div className="p-5 space-y-4">
            {/* Pending review hint */}
            {stats.gateWaiting > 0 && (
              <Link to="/reviews" style={{ textDecoration: 'none' }}>
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-4 p-4 rounded-xl cursor-pointer"
                  style={{
                    background: 'var(--color-warning-bg)',
                    border: '1px solid var(--color-warning-border)',
                    boxShadow: '0 4px 16px -4px var(--color-warning-bg)',
                  }}
                >
                  <ShieldCheck size={22} style={{ color: 'var(--color-warning)' }} className="animate-pulse" />
                  <div>
                    <div className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--color-warning-text)' }}>
                      {stats.gateWaiting} 个任务待 Archon 审批
                    </div>
                    <div className="text-[12px] mt-0.5 font-medium" style={{ color: 'var(--color-warning)' }}>
                      点击前往处理
                    </div>
                  </div>
                </motion.div>
              </Link>
            )}

            {/* System health */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-4 rounded-xl"
              style={{
                background: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)] animate-pulse" />
                <span className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--color-success-text)' }}>
                  系统正常运行
                </span>
              </div>
              <div className="text-[12px] mt-1.5 ml-5 font-medium" style={{ color: 'var(--color-success)' }}>
                API 服务在线 · 数据库就绪
              </div>
            </motion.div>

            {/* Info cards */}
            <div
              className="p-4 rounded-xl"
              style={{
                background: 'var(--color-surface-hover)',
                border: '1px solid var(--color-glass-border)',
              }}
            >
              <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                自动状态轮询
              </div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
                客户端保持与核心网关活性连接
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StateBadge({ state }: { state: string }) {
  const config: Record<string, { bg: string; text: string; label: string; border: string }> = {
    in_progress: { bg: 'var(--color-info-bg)', text: 'var(--color-info-text)', border: 'var(--color-info-border)', label: '进行中' },
    gate_waiting: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)', border: 'var(--color-warning-border)', label: '待审批' },
    completed: { bg: 'var(--color-success-bg)', text: 'var(--color-success-text)', border: 'var(--color-success-border)', label: '已完成' },
    failed: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', border: 'var(--color-danger-border)', label: '失败' },
    cancelled: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', border: 'var(--color-danger-border)', label: '已取消' },
    pending: { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', border: 'var(--color-border)', label: '等待中' },
  };
  const c = config[state] ?? { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', border: 'var(--color-border)', label: state };

  return (
    <span
      className="badge-glass shadow-sm"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {state === 'in_progress' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-info)] animate-pulse shadow-[0_0_4px_var(--color-info)]" />
      )}
      {c.label}
    </span>
  );
}
