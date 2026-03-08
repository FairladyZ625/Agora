import type { TaskPriority, TaskState } from '@/types/task';
import { translate } from '@/lib/i18n';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface BadgeMeta {
  label: string;
  tone: Tone;
}

const stateTones: Record<string, Tone> = {
  draft: 'neutral',
  pending: 'neutral',
  in_progress: 'info',
  gate_waiting: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'danger',
  paused: 'neutral',
  blocked: 'danger',
};

const priorityTones: Record<string, Tone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
};

export function getStateMeta(state: TaskState | string): BadgeMeta {
  const keyMap: Record<string, string> = {
    draft: 'taskMeta.states.draft',
    pending: 'taskMeta.states.pending',
    in_progress: 'taskMeta.states.inProgress',
    gate_waiting: 'taskMeta.states.gateWaiting',
    completed: 'taskMeta.states.completed',
    failed: 'taskMeta.states.failed',
    cancelled: 'taskMeta.states.cancelled',
    paused: 'taskMeta.states.paused',
    blocked: 'taskMeta.states.blocked',
  };

  return {
    label: keyMap[state] ? translate(keyMap[state]) : state,
    tone: stateTones[state] ?? 'neutral',
  };
}

export function getPriorityMeta(priority: TaskPriority | string): BadgeMeta {
  const keyMap: Record<string, string> = {
    low: 'taskMeta.priorities.low',
    normal: 'taskMeta.priorities.normal',
    high: 'taskMeta.priorities.high',
  };

  return {
    label: keyMap[priority] ? translate(keyMap[priority]) : priority,
    tone: priorityTones[priority] ?? 'neutral',
  };
}
