import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { MOCK_REVIEW_QUEUE } from '@/lib/mockDashboard';
import { useTaskStore } from '@/stores/taskStore';

export function ReviewsPage() {
  const { tasks, fetchTasks } = useTaskStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const queue = useMemo(() => {
    const liveQueue = tasks
      .filter((task) => task.state === 'gate_waiting')
      .map((task) => ({
        id: task.id,
        title: task.title,
        creator: task.creator,
        gate: task.current_stage ?? 'archon_review',
        waitTime: '刚刚',
        summary: task.description ?? '等待 Archon 最终判断是否进入下一执行阶段。',
        priority: task.priority,
        impact: `影响 ${task.team} 的下一轮派发`,
        state: task.state,
      }));

    return liveQueue.length > 0 ? liveQueue : MOCK_REVIEW_QUEUE;
  }, [tasks]);

  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--intro space-y-2">
        <p className="page-kicker">Decision Queue</p>
        <h2 className="page-title">审批与裁决</h2>
        <p className="page-summary">
          当任务进入 gate waiting，界面要让人类判断成本和下一动作一眼可见，而不是继续堆卡片。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card metric-card--warning">
          <p className="metric-label">待裁决条目</p>
          <p className="metric-value">{queue.length}</p>
          <p className="metric-note">当前进入人工裁决门的任务数</p>
        </div>
        <div className="metric-card metric-card--danger">
          <p className="metric-label">最高风险</p>
          <p className="metric-value">Critical</p>
          <p className="metric-note">优先清掉阻塞调度主线的变更</p>
        </div>
        <div className="metric-card metric-card--primary">
          <p className="metric-label">默认动作</p>
          <p className="metric-value">Human review</p>
          <p className="metric-note">关键任务必须保留 human-in-the-loop</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,0.92fr)]">
        <section className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">Pending human gate</p>
              <h3 className="section-title">待裁决任务</h3>
            </div>
            <span className="status-pill status-pill--warning">{queue.length} 条</span>
          </div>

          <div className="mt-5 space-y-3">
            {queue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={item.id === selected?.id ? 'task-row task-row--active' : 'task-row'}
              >
                <div className="flex items-start justify-between gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{item.id}</span>
                      <h4 className="truncate text-[15px] font-medium text-[var(--color-text-primary)]">
                        {item.title}
                      </h4>
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                      {item.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={item.priority} />
                      <StateBadge state={item.state} />
                    </div>
                  </div>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">{item.waitTime}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel surface-panel--workspace">
          {selected ? (
            <div className="space-y-6">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">Decision workspace</p>
                  <h3 className="section-title">当前裁决对象</h3>
                </div>
                <PriorityBadge priority={selected.priority} />
              </div>

              <div className="rounded-2xl border px-4 py-4" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{selected.id}</span>
                  <StateBadge state={selected.state} />
                </div>
                <h4 className="mt-3 text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  {selected.title}
                </h4>
                <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                  {selected.summary}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="detail-card">
                  <ShieldAlert size={16} className="detail-card__icon" />
                  <span className="detail-card__label">当前 Gate</span>
                  <strong className="detail-card__value">{selected.gate}</strong>
                </div>
                <div className="detail-card">
                  <CheckCircle2 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">业务影响</span>
                  <strong className="detail-card__value">{selected.impact}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="decision-note" className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  裁决说明
                </label>
                <textarea
                  id="decision-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="textarea-shell"
                  placeholder="记录你的裁决依据、风险判断或回滚要求。"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="button-danger">
                  <XCircle size={16} />
                  驳回
                </button>
                <button type="button" className="button-primary">
                  <CheckCircle2 size={16} />
                  批准执行
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">当前没有待裁决任务</p>
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">系统将在有新 gate waiting 任务时显示在这里。</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
