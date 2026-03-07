import { useEffect } from 'react';
import {
  ArrowRight,
  Clock3,
  Orbit,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useTaskStore } from '@/stores/taskStore';
import { StateBadge } from '@/components/ui/StateBadge';
import { formatRelativeTimestamp, MOCK_TASKS } from '@/lib/mockDashboard';
import type { Task } from '@/types/task';

function getDisplayTasks(tasks: Task[]) {
  return tasks.length > 0 ? tasks : MOCK_TASKS;
}

export function DashboardHome() {
  const { tasks, loading, error, fetchTasks } = useTaskStore();

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const displayTasks = getDisplayTasks(tasks);
  const reviewItems = displayTasks.filter((task) => task.state === 'gate_waiting');
  const metrics = [
    {
      label: '运行中的编排',
      value: displayTasks.filter((task) => task.state === 'in_progress').length,
      note: '当前仍在推进的多 agent 任务',
      icon: Orbit,
    },
    {
      label: '待裁决事项',
      value: reviewItems.length,
      note: '需要 human-in-the-loop 的关键门控',
      icon: Scale,
    },
    {
      label: '活跃 craftsman',
      value: 6,
      note: '当前接入并响应的执行工匠',
      icon: UsersRound,
    },
    {
      label: '最近执行节拍',
      value: '12m',
      note: '上一次完成节点到现在的间隔',
      icon: Clock3,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="page-enter surface-panel surface-panel--hero">
        <div className="hero-grid">
          <div className="hero-copy-block">
            <p className="page-kicker">Agora / Operational Commons</p>
            <h2 className="hero-display mt-3 text-[40px] font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] md:text-[56px]">
              Agora
            </h2>
            <p className="hero-copy mt-4 max-w-[56ch] text-[15px] leading-7 text-[var(--color-text-secondary)] md:text-[16px]">
              Agora 不是一个普通的控制台名字，它代表一个让 agents 辩论、让 humans 裁决、
              再让 machines 纪律执行的操作广场。首页首先要解释这个系统是什么，而不是只展示四个 KPI。
            </p>
            <p className="hero-axiom mt-4 text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)] md:text-[17px]">
              Agents debate. Humans decide. Machines execute.
            </p>

            <div className="hero-actions">
              <Link to="/tasks" className="button-primary">
                查看任务流
                <ArrowRight size={16} />
              </Link>
              <Link to="/reviews" className="button-secondary">
                进入决策队列
              </Link>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-[13px] text-[var(--color-danger-text)]">
                当前同步失败：{error}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="surface-panel surface-panel--hero-side">
              <div className="section-title-row">
                <div>
                  <p className="page-kicker">System pulse</p>
                  <h3 className="section-title">治理与执行同时在线</h3>
                </div>
                <span className="status-pill status-pill--success">
                  {loading ? '同步中' : 'Online'}
                </span>
              </div>
              <div className="hero-sigil" aria-hidden="true">
                <div className="hero-sigil__ring hero-sigil__ring--outer" />
                <div className="hero-sigil__ring hero-sigil__ring--middle" />
                <div className="hero-sigil__ring hero-sigil__ring--inner" />
                <div className="hero-sigil__core">Agora</div>
                <span className="hero-sigil__label hero-sigil__label--left">Debate</span>
                <span className="hero-sigil__label hero-sigil__label--right">Decide</span>
                <span className="hero-sigil__label hero-sigil__label--bottom">Dispatch</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="inline-stat">
                  <span className="inline-stat__label">辩论输入</span>
                  <span className="inline-stat__value">多 agent 汇流</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">裁决出口</span>
                  <span className="inline-stat__value">Archon Gate</span>
                </div>
                <div className="inline-stat">
                  <span className="inline-stat__label">执行方式</span>
                  <span className="inline-stat__value">Structured Dispatch</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-panel surface-panel--muted surface-panel--glasslet">
                <p className="page-kicker">Brand core</p>
                <h3 className="section-title">广场，而不是后台</h3>
                <p className="section-copy">
                  品牌表达靠舞台结构、清晰叙事和统一节奏，不靠堆模糊和发光。
                </p>
              </div>
              <div className="surface-panel surface-panel--muted surface-panel--glasslet">
                <p className="page-kicker">Operator promise</p>
                <h3 className="section-title">高密度，但不凌乱</h3>
                <p className="section-copy">
                  内页维持工作台效率，重要动作和状态始终在第一视野内闭环。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }, index) => (
          <div
            key={label}
            className={`page-enter metric-card ${index === 0 ? 'metric-card--primary' : index === 1 ? 'metric-card--warning' : index === 2 ? 'metric-card--success' : 'metric-card--neutral'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="metric-label">{label}</p>
                <p className="metric-value">{value}</p>
              </div>
              <div className="metric-icon">
                <Icon size={18} />
              </div>
            </div>
            <p className="metric-note">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.9fr)]">
        <section className="page-enter surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <div>
              <p className="page-kicker">Operational feed</p>
              <h3 className="section-title">最近任务流转</h3>
            </div>
            <Link to="/tasks" className="button-ghost">
              全部任务
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {displayTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="data-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{task.id}</span>
                    <h4 className="truncate text-[15px] font-medium text-[var(--color-text-primary)]">
                      {task.title}
                    </h4>
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                    {task.description ?? '等待新的执行上下文。'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
                    <span>{task.creator}</span>
                    <span className="text-[var(--color-border-strong)]">/</span>
                    <span>{task.team}</span>
                    <span className="text-[var(--color-border-strong)]">/</span>
                    <span>{formatRelativeTimestamp(task.updated_at)}</span>
                  </div>
                </div>
                <StateBadge state={task.state} />
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="page-enter surface-panel surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">Decision rail</p>
                <h3 className="section-title">待裁决任务</h3>
              </div>
              <span className="status-pill status-pill--warning">
                {reviewItems.length || MOCK_TASKS.filter((task) => task.state === 'gate_waiting').length} 条
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(reviewItems.length > 0 ? reviewItems : MOCK_TASKS.filter((task) => task.state === 'gate_waiting')).slice(0, 2).map((task) => (
                <Link key={task.id} to="/reviews" className="decision-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[12px] text-[var(--color-text-tertiary)]">{task.id}</p>
                      <h4 className="mt-1 text-[15px] font-medium text-[var(--color-text-primary)]">
                        {task.title}
                      </h4>
                    </div>
                    <ShieldCheck size={16} className="text-[var(--color-warning)]" />
                  </div>
                  <p className="mt-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
                    进入 Archon 审批门，当前阶段为 {task.current_stage ?? 'review'}。
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="page-enter surface-panel surface-panel--muted surface-panel--workspace">
            <div className="section-title-row">
              <div>
                <p className="page-kicker">Agora principle</p>
                <h3 className="section-title">品牌语义落点</h3>
              </div>
              <Sparkles size={16} className="text-[var(--color-primary)]" />
            </div>
            <ul className="mt-4 space-y-3 text-[13px] leading-6 text-[var(--color-text-secondary)]">
              <li>首页先解释广场、辩论、裁决、执行的关系，再呈现实时状态。</li>
              <li>内页优先保证扫描效率和动作闭环，不让品牌表达压过任务本身。</li>
              <li>所有 panel、badge、按钮和 section header 共用同一套视觉语言。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
