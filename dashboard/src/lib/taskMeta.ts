import type { TaskPriority, TaskState } from '@/types/task';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface BadgeMeta {
  label: string;
  tone: Tone;
}

const stateMeta: Record<string, BadgeMeta> = {
  draft: { label: '草稿', tone: 'neutral' },
  pending: { label: '等待中', tone: 'neutral' },
  in_progress: { label: '进行中', tone: 'info' },
  gate_waiting: { label: '待审批', tone: 'warning' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'danger' },
  paused: { label: '已暂停', tone: 'neutral' },
  blocked: { label: '已阻塞', tone: 'danger' },
};

const priorityMeta: Record<string, BadgeMeta> = {
  low: { label: '低', tone: 'neutral' },
  normal: { label: '标准', tone: 'info' },
  high: { label: '高', tone: 'warning' },
  critical: { label: '关键', tone: 'danger' },
};

export function getStateMeta(state: TaskState | string): BadgeMeta {
  return stateMeta[state] ?? { label: state, tone: 'neutral' };
}

export function getPriorityMeta(priority: TaskPriority | string): BadgeMeta {
  return priorityMeta[priority] ?? { label: priority, tone: 'neutral' };
}
