import { create } from 'zustand';
import type {
  CraftsmanGovernanceSnapshot,
  CraftsmanExecutionTail,
  CreateTaskInput,
  RuntimeDiagnosisResult,
  RuntimeRecoveryAction,
  Task,
  TaskAction,
  TaskActionPayload,
  TaskStatus,
  UnifiedHealthSnapshot,
} from '@/types/task';
import * as api from '@/lib/api';
import { translate } from '@/lib/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import {
  mapCraftsmanExecutionDto,
  mapCraftsmanGovernanceSnapshotDto,
  isTaskVisibleInWorkbench,
  mapRuntimeDiagnosisResultDto,
  mapRuntimeRecoveryActionDto,
  mapTaskConversationEntryDto,
  mapTaskConversationSummaryDto,
  mapTaskDto,
  mapTaskStatusDto,
  mapUnifiedHealthSnapshotDto,
} from '@/lib/taskMappers';

interface TaskFilters {
  state: string | null;
  search: string;
}

interface TaskStore {
  tasks: Task[];
  selectedTaskId: string | null;
  selectedTaskStatus: TaskStatus | null;
  governanceSnapshot?: CraftsmanGovernanceSnapshot | null;
  healthSnapshot?: UnifiedHealthSnapshot | null;
  executionTailById: Record<string, CraftsmanExecutionTail>;
  executionTailLoadingById: Record<string, boolean>;
  filters: TaskFilters;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<'live' | 'error'>;
  selectTask: (id: string | null) => Promise<void>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  runTaskAction: (action: TaskAction, payload: TaskActionPayload) => Promise<'live'>;
  observeCraftsmen: (input?: { running_after_ms?: number; waiting_after_ms?: number }) => Promise<'live'>;
  refreshHealthSnapshot: () => Promise<'live' | 'error'>;
  probeCraftsmanExecution: (executionId: string) => Promise<'live'>;
  fetchCraftsmanExecutionTail: (executionId: string, lines?: number) => Promise<'live'>;
  diagnoseRuntime: (
    taskId: string,
    agentRef: string,
    callerId: string,
    reason?: string,
  ) => Promise<RuntimeDiagnosisResult>;
  restartRuntime: (
    taskId: string,
    agentRef: string,
    callerId: string,
    reason?: string,
  ) => Promise<RuntimeRecoveryAction>;
  stopCraftsmanExecution: (
    executionId: string,
    callerId: string,
    reason?: string,
  ) => Promise<RuntimeRecoveryAction>;
  sendCraftsmanInputText: (executionId: string, text: string, submit?: boolean) => Promise<'live'>;
  sendCraftsmanInputKeys: (executionId: string, keys: string[]) => Promise<'live'>;
  submitCraftsmanChoice: (executionId: string, keys?: string[]) => Promise<'live'>;
  closeSubtask: (taskId: string, subtaskId: string, callerId: string, note?: string) => Promise<'live'>;
  archiveSubtask: (taskId: string, subtaskId: string, callerId: string, note?: string) => Promise<'live'>;
  cancelSubtask: (taskId: string, subtaskId: string, callerId: string, note?: string) => Promise<'live'>;
  cleanupTasks: (taskId?: string) => Promise<number>;
  resolveReview: (id: string, decision: 'approve' | 'reject', note: string) => Promise<'live'>;
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearError: () => void;
}

interface LoadedTaskStatusResult {
  taskStatus: TaskStatus;
  syncError: string | null;
}

type ReviewGateType = 'approval' | 'archon_review';

async function refreshTaskContext(get: () => TaskStore, taskId: string) {
  await get().fetchTasks();
  await get().selectTask(taskId);
}

function resolveReviewGateType(get: () => TaskStore, taskId: string): ReviewGateType {
  const selected = get().selectedTaskStatus?.task;
  if (selected?.id === taskId && (selected.gateType === 'approval' || selected.gateType === 'archon_review')) {
    return selected.gateType;
  }

  const queued = get().tasks.find((task) => task.id === taskId);
  if (queued && (queued.gateType === 'approval' || queued.gateType === 'archon_review')) {
    return queued.gateType;
  }

  return 'archon_review';
}

function requireDashboardSessionUsername() {
  const username = useSessionStore.getState().username?.trim();
  if (!username) {
    throw new Error('missing dashboard session actor');
  }
  return username;
}

async function loadTaskStatus(taskId: string): Promise<LoadedTaskStatusResult> {
  const [task, status, conversationSummary, conversation, governanceSnapshot] = await Promise.all([
    api.getTask(taskId),
    api.getTaskStatus(taskId),
    api.getTaskConversationSummary(taskId),
    api.getTaskConversation(taskId),
    api.getCraftsmanGovernance(),
  ]);
  const subtaskExecutionsEntries = await Promise.all(
    status.subtasks.map(async (subtask) => [
      subtask.id,
      (await api.listSubtaskExecutions(taskId, subtask.id)).map(mapCraftsmanExecutionDto),
    ] as const),
  );
  let resolvedSummary = conversationSummary;
  let syncError: string | null = null;
  try {
    resolvedSummary = await api.markTaskConversationRead(taskId, {});
  } catch (error) {
    resolvedSummary = conversationSummary;
    syncError = error instanceof Error ? error.message : String(error);
  }
  return {
    taskStatus: {
      ...mapTaskStatusDto({ ...status, task }),
      subtaskExecutions: Object.fromEntries(subtaskExecutionsEntries),
      governanceSnapshot: mapCraftsmanGovernanceSnapshotDto(governanceSnapshot),
      conversationSummary: mapTaskConversationSummaryDto(resolvedSummary),
      conversation: conversation.entries.map(mapTaskConversationEntryDto),
    },
    syncError,
  };
}

export const useTaskStore = create<TaskStore>()((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  selectedTaskStatus: null,
  governanceSnapshot: null,
  healthSnapshot: null,
  executionTailById: {},
  executionTailLoadingById: {},
  filters: { state: null, search: '' },
  loading: false,
  detailLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const [tasksDto, governanceDto, healthDto] = await Promise.all([
        api.listTasks(filters.state ?? undefined),
        api.getCraftsmanGovernance(),
        api.getHealthSnapshot(),
      ]);
      const tasks = tasksDto
        .filter(isTaskVisibleInWorkbench)
        .map(mapTaskDto);
      const { selectedTaskId } = get();
      const selectedTaskStillVisible = selectedTaskId ? tasks.some((task) => task.id === selectedTaskId) : false;
      set({
        tasks,
        governanceSnapshot: mapCraftsmanGovernanceSnapshotDto(governanceDto),
        healthSnapshot: mapUnifiedHealthSnapshotDto(healthDto),
        loading: false,
        ...(selectedTaskId && !selectedTaskStillVisible
          ? { selectedTaskId: null, selectedTaskStatus: null }
          : {}),
      });

      // Refresh detail if a task is selected
      const { selectedTaskId: refreshedSelectedTaskId } = get();
      if (refreshedSelectedTaskId) {
        const { taskStatus, syncError } = await loadTaskStatus(refreshedSelectedTaskId);
        set({
          selectedTaskStatus: taskStatus,
          ...(syncError ? { error: syncError } : {}),
        });
      }
      return 'live';
    } catch (err) {
      set({
        tasks: [],
        selectedTaskStatus: null,
        governanceSnapshot: null,
        healthSnapshot: null,
        executionTailById: {},
        executionTailLoadingById: {},
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
      const { taskStatus, syncError } = await loadTaskStatus(id);
      set({
        selectedTaskStatus: taskStatus,
        detailLoading: false,
        ...(syncError ? { error: syncError } : {}),
      });
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

  observeCraftsmen: async (input) => {
    set({ error: null });
    await api.observeCraftsmanExecutions(input);
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    } else {
      await get().fetchTasks();
    }
    return 'live';
  },

  refreshHealthSnapshot: async () => {
    set({ error: null });
    try {
      const snapshot = await api.getHealthSnapshot();
      set({ healthSnapshot: mapUnifiedHealthSnapshotDto(snapshot) });
      return 'live';
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      return 'error';
    }
  },

  probeCraftsmanExecution: async (executionId) => {
    set({ error: null });
    await api.probeCraftsmanExecution(executionId);
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    }
    return 'live';
  },

  fetchCraftsmanExecutionTail: async (executionId, lines = 120) => {
    set((state) => ({
      error: null,
      executionTailLoadingById: {
        ...state.executionTailLoadingById,
        [executionId]: true,
      },
    }));
    try {
      const tail = await api.getCraftsmanExecutionTail(executionId, lines);
      set((state) => ({
        executionTailById: {
          ...state.executionTailById,
          [executionId]: {
            available: tail.available,
            output: tail.output,
            source: tail.source,
            fetchedAt: new Date().toISOString(),
          },
        },
        executionTailLoadingById: {
          ...state.executionTailLoadingById,
          [executionId]: false,
        },
      }));
      return 'live';
    } catch (err) {
      set((state) => ({
        executionTailLoadingById: {
          ...state.executionTailLoadingById,
          [executionId]: false,
        },
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  },

  diagnoseRuntime: async (taskId, agentRef, callerId, reason = '') => {
    set({ error: null });
    const result = await api.diagnoseRuntime({
      task_id: taskId,
      agent_ref: agentRef,
      caller_id: callerId,
      reason,
    });
    const mapped = mapRuntimeDiagnosisResultDto(result);
    await get().refreshHealthSnapshot();
    return mapped;
  },

  restartRuntime: async (taskId, agentRef, callerId, reason = '') => {
    set({ error: null });
    const result = await api.restartRuntime({
      task_id: taskId,
      agent_ref: agentRef,
      caller_id: callerId,
      reason,
    });
    const mapped = mapRuntimeRecoveryActionDto(result);
    await get().refreshHealthSnapshot();
    return mapped;
  },

  stopCraftsmanExecution: async (executionId, callerId, reason = '') => {
    set({ error: null });
    const result = await api.stopCraftsmanExecution(executionId, {
      caller_id: callerId,
      reason,
    });
    const mapped = mapRuntimeRecoveryActionDto(result);
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    }
    await get().refreshHealthSnapshot();
    return mapped;
  },

  sendCraftsmanInputText: async (executionId, text, submit = true) => {
    set({ error: null });
    await api.sendCraftsmanExecutionInputText(executionId, { text, submit });
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    }
    return 'live';
  },

  sendCraftsmanInputKeys: async (executionId, keys) => {
    set({ error: null });
    await api.sendCraftsmanExecutionInputKeys(executionId, { keys });
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    }
    return 'live';
  },

  submitCraftsmanChoice: async (executionId, keys = []) => {
    set({ error: null });
    await api.submitCraftsmanExecutionChoice(executionId, { keys });
    const { selectedTaskId } = get();
    if (selectedTaskId) {
      await get().selectTask(selectedTaskId);
    }
    return 'live';
  },

  closeSubtask: async (taskId, subtaskId, callerId, note = '') => {
    set({ error: null });
    await api.closeSubtask(taskId, subtaskId, callerId, note);
    await refreshTaskContext(get, taskId);
    return 'live';
  },

  archiveSubtask: async (taskId, subtaskId, callerId, note = '') => {
    set({ error: null });
    await api.archiveSubtask(taskId, subtaskId, callerId, note);
    await refreshTaskContext(get, taskId);
    return 'live';
  },

  cancelSubtask: async (taskId, subtaskId, callerId, note = '') => {
    set({ error: null });
    await api.cancelSubtask(taskId, subtaskId, callerId, note);
    await refreshTaskContext(get, taskId);
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
    const gateType = resolveReviewGateType(get, id);
    const sessionUsername = requireDashboardSessionUsername();
    if (gateType === 'approval') {
      if (decision === 'approve') {
        await api.approveTask(id, sessionUsername, note);
      } else {
        await api.rejectTask(id, sessionUsername, note || translate('common.rejectionFallbackNote'));
      }
    } else if (decision === 'approve') {
      await api.archonApprove(id, note, sessionUsername);
    } else {
      await api.archonReject(id, note || translate('common.rejectionFallbackNote'), sessionUsername);
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
