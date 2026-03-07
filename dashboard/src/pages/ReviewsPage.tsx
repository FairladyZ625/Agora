import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Command, ShieldAlert, SlidersHorizontal, XCircle } from 'lucide-react';
import { PriorityBadge, StateBadge } from '@/components/ui/StateBadge';
import { reviewsPageCopy } from '@/lib/dashboardCopy';
import { MOCK_REVIEW_QUEUE } from '@/lib/mockDashboard';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useTaskStore } from '@/stores/taskStore';

type QueueScope = 'all' | 'critical' | 'high';

const queueScopes: { value: QueueScope; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'critical', label: '关键' },
  { value: 'high', label: '高优先级' },
];

export function ReviewsPage() {
  const { tasks, fetchTasks, resolveReview, dataSource } = useTaskStore();
  const { showMessage } = useFeedbackStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<QueueScope>('all');
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
        summary: task.description ?? reviewsPageCopy.queueFallbackSummary,
        priority: task.priority,
        impact: `${reviewsPageCopy.queueFallbackImpactPrefix} ${task.team} ${reviewsPageCopy.queueFallbackImpactSuffix}`,
        state: task.state,
      }));

    return liveQueue.length > 0 ? liveQueue : MOCK_REVIEW_QUEUE;
  }, [tasks]);

  const filteredQueue = useMemo(() => {
    if (scope === 'critical') {
      return queue.filter((item) => item.priority === 'critical');
    }
    if (scope === 'high') {
      return queue.filter((item) => item.priority === 'critical' || item.priority === 'high');
    }
    return queue;
  }, [queue, scope]);

  const selected = filteredQueue.find((item) => item.id === selectedId) ?? filteredQueue[0] ?? null;

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!selected) return;
    const source = await resolveReview(selected.id, decision, note);
    showMessage(
      decision === 'approve' ? '裁决已下达' : '任务已退回',
      source === 'live'
        ? decision === 'approve'
          ? '真实接口已收到批准指令。'
          : '真实接口已收到驳回指令。'
        : decision === 'approve'
          ? 'Mock 工作流已把任务重新送回执行主线。'
          : 'Mock 工作流已把任务退回待修订状态。',
      decision === 'approve' ? 'success' : 'warning',
    );
    setNote('');
  };

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--intro space-y-2">
        <p className="page-kicker">{reviewsPageCopy.kicker}</p>
        <h2 className="page-title">{reviewsPageCopy.title}</h2>
        <p className="page-summary">{reviewsPageCopy.summary}</p>
      </section>

      <section className="surface-panel surface-panel--toolbar">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="page-kicker">Decision Workbench</p>
            <h3 className="section-title">队列先看全局，裁决再进检视器</h3>
            <p className="section-copy">
              这版预览把审批页改成操作台节奏：左侧快速扫描队列，右侧持续聚焦当前裁决对象，减少卡片跳读成本。
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-[12px] text-[var(--color-text-secondary)] lg:items-end">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <Command size={12} />
              预留 Command K 批量动作入口
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <SlidersHorizontal size={12} />
              按优先级快速收束队列
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {queueScopes.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setScope(item.value)}
              className={scope === item.value ? 'choice-pill choice-pill--active' : 'choice-pill'}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card metric-card--warning">
          <p className="metric-label">{reviewsPageCopy.metricLabels.queue}</p>
          <p className="metric-value">{filteredQueue.length}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.queue}</p>
        </div>
        <div className="metric-card metric-card--danger">
          <p className="metric-label">{reviewsPageCopy.metricLabels.highestRisk}</p>
          <p className="metric-value">{reviewsPageCopy.metricValues.highestRisk}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.highestRisk}</p>
        </div>
        <div className="metric-card metric-card--primary">
          <p className="metric-label">{reviewsPageCopy.metricLabels.defaultAction}</p>
          <p className="metric-value">{reviewsPageCopy.metricValues.defaultAction}</p>
          <p className="metric-note">{reviewsPageCopy.metricNotes.defaultAction}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">{reviewsPageCopy.queueKicker}</p>
              <h3 className="section-title">{reviewsPageCopy.queueTitle}</h3>
            </div>
            <span className="status-pill status-pill--warning">
              {filteredQueue.length}
              {reviewsPageCopy.queueCountUnit}
            </span>
          </div>

          <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_130px_120px_64px_auto] items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)] md:grid">
            <span>任务</span>
            <span>Gate</span>
            <span>优先级</span>
            <span>等待</span>
            <span className="text-right">动作</span>
          </div>

          <div className="mt-3 space-y-2">
            {filteredQueue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={
                  item.id === selected?.id
                    ? 'w-full rounded-2xl border px-3 py-3 text-left transition-all task-row--active'
                    : 'w-full rounded-2xl border px-3 py-3 text-left transition-all'
                }
                style={{ borderColor: 'var(--color-border)', background: 'var(--row-bg)' }}
              >
                <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_130px_120px_64px_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">{item.id}</span>
                      <h4 className="truncate text-[14px] font-medium text-[var(--color-text-primary)]">
                        {item.title}
                      </h4>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
                      {item.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.gate}</span>
                      <PriorityBadge priority={item.priority} />
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">{item.waitTime}</span>
                    </div>
                  </div>
                  <span className="hidden text-[12px] text-[var(--color-text-secondary)] md:block">{item.gate}</span>
                  <div className="hidden md:block">
                    <PriorityBadge priority={item.priority} />
                  </div>
                  <span className="hidden text-[12px] text-[var(--color-text-tertiary)] md:block">{item.waitTime}</span>
                  <span className="hidden text-right text-[12px] font-medium text-[var(--color-primary)] md:block">
                    审阅
                  </span>
                </div>
              </button>
            ))}
            {filteredQueue.length === 0 && (
              <div className="empty-state">
                <p className="text-[15px] font-medium text-[var(--color-text-primary)]">当前筛选下没有待裁决项</p>
                <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">切回“全部”或“高优先级”查看完整队列。</p>
              </div>
            )}
          </div>
        </section>

        <section className="surface-panel surface-panel--workspace xl:sticky xl:top-28 xl:self-start">
          {selected ? (
            <div className="space-y-6">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">{reviewsPageCopy.workspaceKicker}</p>
                  <h3 className="section-title">{reviewsPageCopy.workspaceTitle}</h3>
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
                  <span className="detail-card__label">{reviewsPageCopy.gateLabel}</span>
                  <strong className="detail-card__value">{selected.gate}</strong>
                </div>
                <div className="detail-card">
                  <CheckCircle2 size={16} className="detail-card__icon" />
                  <span className="detail-card__label">{reviewsPageCopy.impactLabel}</span>
                  <strong className="detail-card__value">{selected.impact}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="decision-note" className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  {reviewsPageCopy.noteLabel}
                </label>
                <textarea
                  id="decision-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="textarea-shell"
                  placeholder={reviewsPageCopy.notePlaceholder}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="button-danger" onClick={() => void handleDecision('reject')}>
                  <XCircle size={16} />
                  {reviewsPageCopy.rejectAction}
                </button>
                <button type="button" className="button-primary" onClick={() => void handleDecision('approve')}>
                  <CheckCircle2 size={16} />
                  {reviewsPageCopy.approveAction}
                </button>
              </div>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                {dataSource === 'live'
                  ? '当前正在操作真实裁决接口。'
                  : '当前为 mock 可交互模式，所有裁决都会立即反馈到演示态势。'}
              </p>
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{reviewsPageCopy.emptyTitle}</p>
              <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{reviewsPageCopy.emptySummary}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
