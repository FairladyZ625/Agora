import { Search, Filter } from 'lucide-react';
import { motion } from 'framer-motion';

const MOCK_TASKS = [
  { id: 'TSK-001', title: '实现 Agent 权限分级验证', state: 'in_progress', creator: 'archon', priority: 'high', updated: '2 分钟前' },
  { id: 'TSK-002', title: '任务编排器状态机重构', state: 'gate_waiting', creator: 'lizeyu', priority: 'normal', updated: '8 分钟前' },
  { id: 'TSK-003', title: '结构化日志脱敏过滤器', state: 'completed', creator: 'craftsman-1', priority: 'normal', updated: '1 小时前' },
  { id: 'TSK-004', title: 'OpenClaw 插件 Bridge 测试', state: 'completed', creator: 'archon', priority: 'low', updated: '3 小时前' },
  { id: 'TSK-005', title: '数据库 WAL 模式性能调优', state: 'in_progress', creator: 'lizeyu', priority: 'high', updated: '5 小时前' },
  { id: 'TSK-006', title: 'CI/CD Pipeline 双 Job 配置', state: 'completed', creator: 'archon', priority: 'normal', updated: '昨天' },
  { id: 'TSK-007', title: 'Craftsmen Shell Adapter 封装', state: 'pending', creator: 'lizeyu', priority: 'normal', updated: '昨天' },
  { id: 'TSK-008', title: 'FastAPI 路由重构与中间件', state: 'in_progress', creator: 'archon', priority: 'high', updated: '2 天前' },
];

const stateConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  in_progress: { bg: 'var(--color-info-bg)', text: 'var(--color-info-text)', border: 'var(--color-info-border)', label: '进行中' },
  gate_waiting: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)', border: 'var(--color-warning-border)', label: '待审批' },
  completed: { bg: 'var(--color-success-bg)', text: 'var(--color-success-text)', border: 'var(--color-success-border)', label: '已完成' },
  failed: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', border: 'var(--color-danger-border)', label: '失败' },
  pending: { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', border: 'var(--color-border)', label: '等待中' },
};

const priorityConfig: Record<string, { color: string }> = {
  critical: { color: 'var(--color-danger)' },
  high: { color: 'var(--color-warning)' },
  normal: { color: 'var(--color-text-tertiary)' },
  low: { color: 'var(--color-text-tertiary)' },
};

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

export function TasksPage() {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-glow" style={{ color: 'var(--color-text-primary)' }}>
            任务列表
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Agora Global Action Log
          </p>
        </div>
      </motion.div>

      {/* Toolbar */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <div
          className="glass-panel flex items-center gap-2 flex-1 h-10 px-4 shadow-sm"
        >
          <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="搜索任务 ID 或标题..."
            className="flex-1 text-[14px] bg-transparent"
            style={{
              color: 'var(--color-text-primary)',
              outline: 'none',
              border: 'none',
            }}
          />
        </div>
        <motion.button
          whileHover={{ scale: 1.02, backgroundColor: 'var(--color-surface-hover)' }}
          whileTap={{ scale: 0.98 }}
          className="glass-panel flex items-center gap-2 h-10 px-4 text-[13px] font-medium transition-colors shadow-sm cursor-pointer"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <Filter size={15} /> 筛选
        </motion.button>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants} className="glass-panel overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-glass-border)' }}>
              {['ID', '标题', '状态', '优先级', '创建者', '更新'].map((h) => (
                <th
                  key={h}
                  className="text-left text-[12px] font-semibold uppercase tracking-wider px-5 py-3"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_TASKS.map((task) => {
              const sc = stateConfig[task.state] ?? stateConfig.pending;
              const pc = priorityConfig[task.priority] ?? priorityConfig.normal;
              return (
                <motion.tr
                  key={task.id}
                  whileHover={{ backgroundColor: 'var(--color-surface-hover)' }}
                  className="transition-colors duration-150 cursor-pointer"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                >
                  <td className="px-5 py-3">
                    <span className="text-[13px] font-mono font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                      {task.id}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[14px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {task.title}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="badge-glass shadow-sm" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[13px] font-medium tracking-wide" style={{ color: pc.color }}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {task.creator}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {task.updated}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: '1px solid var(--color-glass-border)' }}
        >
          <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            共 {MOCK_TASKS.length} 个任务
          </span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((p) => (
              <motion.button
                key={p}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[13px] font-medium cursor-pointer"
                style={{
                  background: p === 1 ? 'var(--color-primary-bg)' : 'transparent',
                  color: p === 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  border: 'none',
                }}
              >
                {p}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
