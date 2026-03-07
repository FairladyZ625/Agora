import { Search, Filter } from 'lucide-react';

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

const stateConfig: Record<string, { bg: string; text: string; label: string }> = {
  in_progress: { bg: 'var(--color-info-bg)', text: 'var(--color-info-text)', label: '进行中' },
  gate_waiting: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)', label: '待审批' },
  completed: { bg: 'var(--color-success-bg)', text: 'var(--color-success-text)', label: '已完成' },
  failed: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-text)', label: '失败' },
  pending: { bg: 'var(--stat-zinc)', text: 'var(--stat-zinc-text)', label: '等待中' },
};

const priorityConfig: Record<string, { color: string }> = {
  critical: { color: 'var(--color-danger)' },
  high: { color: 'var(--color-warning)' },
  normal: { color: 'var(--color-text-tertiary)' },
  low: { color: 'var(--color-text-tertiary)' },
};

export function TasksPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            任务列表
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
            管理和筛选所有任务
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 flex-1 h-9 px-3 rounded-lg"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            placeholder="搜索任务 ID 或标题..."
            className="flex-1 text-[13px] bg-transparent"
            style={{
              color: 'var(--color-text-primary)',
              outline: 'none',
              border: 'none',
            }}
          />
        </div>
        <button
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Filter size={13} /> 筛选
        </button>
      </div>

      {/* Table */}
      <div className="card-flat overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['ID', '标题', '状态', '优先级', '创建者', '更新'].map((h) => (
                <th
                  key={h}
                  className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5"
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
                <tr
                  key={task.id}
                  className="transition-colors duration-100"
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td className="px-4 py-2.5">
                    <span className="text-[12px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                      {task.id}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                      {task.title}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="badge" style={{ background: sc.bg, color: sc.text }}>
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[12px] font-medium" style={{ color: pc.color }}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {task.creator}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {task.updated}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            共 {MOCK_TASKS.length} 个任务
          </span>
          <div className="flex items-center gap-1">
            {[1].map((p) => (
              <button
                key={p}
                className="flex items-center justify-center w-7 h-7 rounded text-[12px] font-medium"
                style={{
                  background: 'var(--color-primary-bg)',
                  color: 'var(--color-primary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
