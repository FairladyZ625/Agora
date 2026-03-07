import { formatRelativeTimestamp } from '@/lib/mockDashboard';
import type { Task } from '@/types/task';

const ACTIVE_HOME_STATES = new Set(['in_progress', 'gate_waiting', 'paused', 'blocked']);

function getKnownParticipantIds(task: Task): string[] {
  const memberIds =
    task.teamMembers
      ?.map((member) => member.agentId)
      .filter((agentId): agentId is string => agentId.trim().length > 0) ?? [];

  if (memberIds.length > 0) {
    return memberIds;
  }

  return task.creator.trim().length > 0 ? [task.creator] : [];
}

export interface DashboardHomeDerivedMetrics {
  activeCount: number;
  waitingCount: number;
  participantCount: number;
  latestCompletedLabel: string;
  recentTasks: Task[];
  reviewItems: Task[];
}

export function deriveDashboardHomeMetrics(
  tasks: Task[],
  latestCompletedFallback: string,
): DashboardHomeDerivedMetrics {
  const recentTasks = [...tasks].sort((left, right) => {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });

  const reviewItems = recentTasks.filter((task) => task.state === 'gate_waiting');
  const activeTasks = recentTasks.filter((task) => ACTIVE_HOME_STATES.has(task.state));
  const participantIds = new Set(activeTasks.flatMap(getKnownParticipantIds));

  const latestCompletedTask = recentTasks.find((task) => task.state === 'completed' || task.sourceState === 'done');

  return {
    activeCount: recentTasks.filter((task) => task.state === 'in_progress').length,
    waitingCount: reviewItems.length,
    participantCount: participantIds.size,
    latestCompletedLabel: latestCompletedTask
      ? formatRelativeTimestamp(latestCompletedTask.updated_at)
      : latestCompletedFallback,
    recentTasks,
    reviewItems,
  };
}
