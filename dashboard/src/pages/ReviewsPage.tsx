import { ShieldCheck, Clock, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export function ReviewsPage() {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-3xl mx-auto"
    >
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-semibold tracking-tight text-glow" style={{ color: 'var(--color-text-primary)' }}>
          审批中心
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Archon Decision Gate
        </p>
      </motion.div>

      {/* Review count summary */}
      <motion.div
        variants={itemVariants}
        className="glass-panel flex items-center gap-4 px-6 py-4 shadow-md"
        style={{
          background: 'var(--color-warning-bg)',
          borderColor: 'var(--color-warning-border)',
        }}
      >
        <ShieldCheck size={22} style={{ color: 'var(--color-warning)' }} className="animate-pulse" />
        <span className="text-[14px] font-bold tracking-wide" style={{ color: 'var(--color-warning-text)' }}>
          {MOCK_REVIEWS.length} 个任务正在等待裁决
        </span>
      </motion.div>

      {/* Review cards */}
      <div className="space-y-5">
        {MOCK_REVIEWS.map((review) => (
          <motion.div 
            variants={itemVariants} 
            key={review.id} 
            className="glass-card overflow-hidden"
          >
            {/* Header */}
            <div
              className="flex items-start justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--color-glass-border)' }}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span
                    className="text-[12px] font-mono font-medium"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {review.id}
                  </span>
                  <span
                    className="text-[15px] font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {review.title}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[12px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>创建者: {review.creator}</span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} /> 已等待 {review.waitTime}
                  </span>
                  <span className="badge-glass shadow-sm" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', borderColor: 'var(--color-warning-border)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse shadow-[0_0_4px_var(--color-warning)]" />
                    {review.gate}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="px-6 py-4" style={{ background: 'var(--color-surface-hover)' }}>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {review.description}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--color-glass-border)' }}>
              <div className="flex items-center gap-3 flex-1 px-3 py-2 rounded-lg" style={{ background: 'var(--color-bg-muted)', border: '1px solid var(--color-border)' }}>
                <MessageSquare size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="添加裁决缘由（驳回时必填）..."
                  className="flex-1 text-[13px] bg-transparent font-medium"
                  style={{
                    color: 'var(--color-text-primary)',
                    border: 'none',
                    outline: 'none',
                  }}
                />
              </div>
              <div className="flex items-center gap-3 ml-6 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-[13px] font-bold shadow-sm"
                  style={{
                    background: 'var(--color-danger-bg)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-danger-border)',
                    cursor: 'pointer',
                  }}
                >
                  <XCircle size={16} /> 驳回
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-[13px] font-bold shadow-sm"
                  style={{
                    background: 'var(--color-success)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <CheckCircle2 size={16} /> 批准执行
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
