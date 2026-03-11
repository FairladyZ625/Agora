import { create } from 'zustand';
import type { CreateTaskInput, Task, TaskAction, TaskActionPayload, TaskStatus } from '@/types/task';
import * as api from '@/lib/api';
import { translate } from '@/lib/i18n';
import {
  isTaskVisibleInWorkbench,
  mapTaskConversationEntryDto,
  mapTaskConversationSummaryDto,
  mapTaskDto,
  mapTaskStatusDto,
} from '@/lib/taskMappers';

interface TaskFilters {
  state: string | null;
  search: string;
}

interface TaskStore {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  filters: TaskFilters;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<'live' | 'error'>;
  selectTask: (id: string | null) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  runTaskAction: (action: TaskAction, payload: TaskActionPayload) => Promise<'live'>;
  cleanupTasks: (taskId?: string) => Promise<number>;
  resolveReview: (id: string, decision: 'approve' | 'reject', note: string) => Promise<'live'>;
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearError: () => void;
}

async function refreshTaskContext(get: () => TaskStore, taskId: string) {
  await get().fetchTasks();
  await get().selectTask(taskId);
}

async function loadTaskStatus(taskId: string): Promise<TaskStatus> {
  const [task, status, conversationSummary, conversation] = await Promise.all([
    api.getTask(taskId),
    api.getTaskStatus(taskId),
    api.getTaskConversationSummary(taskId),
    api.getTaskConversation(taskId),
  ]);
  let resolvedSummary = conversationSummary;
  try {
    resolvedSummary = await api.markTaskConversationRead(taskId, {});
  } catch {
    resolvedSummary = conversationSummary;
  }
  return {
    ...mapTaskStatusDto({ ...status, task }),
    conversationSummary: mapTaskConversationSummaryDto(resolvedSummary),
    conversation: conversation.entries.map(mapTaskConversationEntryDto),
  };
}

export const useTaskStore = create<TaskStore>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const tasks = (await api.listTasks(filters.state ?? undefined))
        .filter(isTaskVisibleInWorkbench)
        .map(mapTaskDto);
      const { selectedTaskId } = get();
      const selectedTaskStillVisible = selectedTaskId ? tasks.some((task) => task.id === selectedTaskId) : false;
      set({
        tasks,
        loading: false,
        ...(selectedTaskId && !selectedTaskStillVisible
          ? { selectedTaskId: null, selectedTaskStatus: null }
          : {}),
      });

      // Refresh detail if a task is selected
      const { selectedTaskId: refreshedSelectedTaskId } = get();
      if (refreshedSelectedTaskId) {
        const taskStatus = await loadTaskStatus(refreshedSelectedTaskId);
        set({ selectedTaskStatus: taskStatus });
      }
      return 'live';
    } catch (err) {
      set({
        tasks: [],
        selectedTaskStatus: null,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return 'error';
    }
  },

  selectTask: async (id: string | null) => {
    if (!id) {
      set({ selectedTaskId: null, selectedTaskStatus: null });
      return;
    }
    set({ selectedTaskId: id, detailLoading: true, error: null });
    try {
      const taskStatus = await loadTaskStatus(id);
      set({ selectedTaskStatus: taskStatus, detailLoading: false });
    } catch (err) {
      set({
        selectedTaskStatus: null,
        detailLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  createTask: async (input) => {
    set({ error: null });
    const created = mapTaskDto(await api.createTask(input));
    await get().fetchTasks();
    await get().selectTask(created.id);
    return created;
  },

  runTaskAction: async (action, payload) => {
    set({ error: null });
    const actorId = payload.actorId ?? 'archon';
    const note = payload.note ?? '';

    switch (action) {
      case 'advance':
        await api.advanceTask(payload.taskId, actorId);
        break;
      case 'approve':
        await api.approveTask(payload.taskId, actorId, note);
        break;
      case 'reject':
        await api.rejectTask(payload.taskId, actorId, note || translate('common.rejectionFallbackNote'));
        break;
      case 'confirm':
        await api.confirmTask(payload.taskId, actorId, payload.vote ?? 'approve', note);
        break;
      case 'subtask_done':
        if (!payload.subtaskId) {
          throw new Error('subtaskId is required for subtask completion');
        }
        await api.subtaskDone(payload.taskId, payload.subtaskId, actorId, note);
        break;
      case 'force_advance':
        await api.forceAdvanceTask(payload.taskId, note);
        break;
      case 'pause':
        await api.pauseTask(payload.taskId, note);
        break;
      case 'resume':
        await api.resumeTask(payload.taskId);
        break;
      case 'cancel':
        await api.cancelTask(payload.taskId, note);
        break;
      case 'unblock':
        await api.unblockTask(payload.taskId, note);
        break;
      default:
        throw new Error(`Unsupported task action: ${String(action)}`);
    }

    await refreshTaskContext(get, payload.taskId);
    return 'live';
  },

  cleanupTasks: async (taskId) => {
    set({ error: null });
    const result = await api.cleanupTasks(taskId);
    await get().fetchTasks();
    return result.cleaned;
  },

  resolveReview: async (id, decision, note) => {
    set({ error: null });
    if (decision === 'approve') {
      await api.archonApprove(id, note);
    } else {
      await api.archonReject(id, note || translate('common.rejectionFallbackNote'));
    }
    await refreshTaskContext(get, id);
    return 'live';
  },

  setFilters: (partial) => {
    const { filters } = get();
    set({ filters: { ...filters, ...partial } });
  },

  clearError: () => set({ error: null }),
}));
