import { cn } from '@/lib/cn';
import { getPriorityMeta, getStateMeta } from '@/lib/taskMeta';
import type { TaskPriority, TaskState } from '@/types/task';

export function StateBadge({ state, className }: { state: TaskState | string; className?: string }) {
  const meta = getStateMeta(state);

  return (
    <span className={cn('status-pill', `status-pill--${meta.tone}`, className)}>
      {meta.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority | string;
  className?: string;
}) {
  const meta = getPriorityMeta(priority);

  return (
    <span className={cn('status-pill', `status-pill--${meta.tone}`, className)}>
      {meta.label}
    </span>
  );
}
