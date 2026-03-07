import { ShieldCheck, Clock, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

const MOCK_REVIEWS = [
  {
    id: 'TSK-002',
    title: '任务编排器状态机重构',
    gate: 'archon_review',
    creator: 'lizeyu',
    waitTime: '8 分钟',
    description: '重构核心状态机逻辑，引入事件驱动模式替代轮询检查。',
  },
  {
    id: 'TSK-009',
    title: 'Agent 通信协议 v2 设计',
    gate: 'archon_review',
    creator: 'craftsman-2',
    waitTime: '25 分钟',
    description: '新增消息确认机制和优先级队列支持。',
  },
];

export function ReviewsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          审批中心
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          处理待审批的任务
        </p>
      </div>

      {/* Review count summary */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg"
        style={{
          background: 'var(--color-warning-bg)',
          border: '1px solid var(--color-warning-border)',
        }}
      >
        <ShieldCheck size={18} style={{ color: 'var(--color-warning)' }} />
        <span className="text-[13px] font-medium" style={{ color: 'var(--color-warning-text)' }}>
          {MOCK_REVIEWS.length} 个任务等待 Archon 审批
        </span>
      </div>

      {/* Review cards */}
      <div className="space-y-3">
        {MOCK_REVIEWS.map((review) => (
          <div key={review.id} className="card-flat overflow-hidden">
            {/* Header */}
            <div
              className="flex items-start justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {review.id}
                  </span>
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {review.title}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>创建者: {review.creator}</span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> 等待 {review.waitTime}
                  </span>
                  <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
                    {review.gate}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {review.description}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2 flex-1">
                <MessageSquare size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="添加备注（审批可选，驳回必填）"
                  className="flex-1 text-[12px] bg-transparent"
                  style={{
                    color: 'var(--color-text-primary)',
                    border: 'none',
                    outline: 'none',
                  }}
                />
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-medium transition-all duration-100"
                  style={{
                    background: 'var(--color-danger-bg)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-danger-border)',
                    cursor: 'pointer',
                  }}
                >
                  <XCircle size={14} /> 驳回
                </button>
                <button
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-medium transition-all duration-100"
                  style={{
                    background: 'var(--color-success)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <CheckCircle2 size={14} /> 批准
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
