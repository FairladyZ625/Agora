import { create } from 'zustand';
import * as api from '@/lib/api';
import type {
  CcConnectBridgeAdapterSummary,
  CcConnectCronJob,
  CcConnectHeartbeatStatus,
  CcConnectInspection,
  CcConnectModelState,
  CcConnectProjectDetail,
  CcConnectProviderState,
  CcConnectProjectSummary,
  CcConnectSessionDetail,
  CcConnectSessionMessage,
  CcConnectSessionSummary,
} from '@/types/dashboard';

function mapSessionMessage(message: api.ApiCcConnectSessionMessageDto): CcConnectSessionMessage {
  return {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };
}

function mapInspection(dto: api.ApiCcConnectInspectionDto): CcConnectInspection {
  return {
    binary: {
      command: dto.binary.command,
      found: dto.binary.found,
      resolvedPath: dto.binary.resolvedPath,
      version: dto.binary.version,
      reason: dto.binary.reason,
      error: dto.binary.error ?? null,
    },
    config: {
      path: dto.config.path,
      exists: dto.config.exists,
      managementEnabled: dto.config.management.enabled,
      managementPort: dto.config.management.port,
      tokenPresent: dto.config.management.tokenPresent,
    },
    management: {
      url: dto.management.url,
      reachable: dto.management.reachable,
      version: dto.management.version,
      projectsCount: dto.management.projectsCount,
      bridgeAdapterCount: dto.management.bridgeAdapterCount,
      connectedPlatforms: dto.management.connectedPlatforms,
      reason: dto.management.reason,
      error: dto.management.error,
    },
  };
}

function mapProjectSummary(dto: api.ApiCcConnectProjectSummaryDto): CcConnectProjectSummary {
  return {
    name: dto.name,
    agentType: dto.agent_type,
    platforms: dto.platforms,
    sessionsCount: dto.sessions_count,
    heartbeatEnabled: dto.heartbeat_enabled,
  };
}

function mapSessionSummary(dto: api.ApiCcConnectSessionSummaryDto): CcConnectSessionSummary {
  return {
    id: dto.id,
    sessionKey: dto.session_key,
    name: dto.name,
    platform: dto.platform,
    agentType: dto.agent_type,
    active: dto.active,
    live: dto.live,
    historyCount: dto.history_count,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    userName: dto.user_name,
    chatName: dto.chat_name,
    lastMessage: dto.last_message ? mapSessionMessage(dto.last_message) : null,
  };
}

function mapProjectDetail(dto: api.ApiCcConnectProjectDetailDto): CcConnectProjectDetail {
  return {
    name: dto.name,
    agentType: dto.agent_type,
    platforms: dto.platforms.map((item) => ({
      type: item.type,
      connected: item.connected,
    })),
    platformConfigs: dto.platform_configs.map((item) => ({
      type: item.type,
      allowFrom: item.allow_from,
    })),
    sessionsCount: dto.sessions_count,
    activeSessionKeys: dto.active_session_keys,
    heartbeat: dto.heartbeat
      ? {
          enabled: dto.heartbeat.enabled,
          paused: dto.heartbeat.paused,
          intervalMins: dto.heartbeat.interval_mins,
          sessionKey: dto.heartbeat.session_key,
        }
      : null,
    settings: {
      language: dto.settings.language,
      adminFrom: dto.settings.admin_from,
      disabledCommands: dto.settings.disabled_commands,
      quiet: dto.settings.quiet,
    },
    workDir: dto.work_dir,
    agentMode: dto.agent_mode,
    mode: dto.mode,
    showContextIndicator: dto.show_context_indicator ?? null,
  };
}

function mapSessionDetail(dto: api.ApiCcConnectSessionDetailDto): CcConnectSessionDetail {
  return {
    id: dto.id,
    sessionKey: dto.session_key,
    name: dto.name,
    platform: dto.platform,
    agentType: dto.agent_type,
    agentSessionId: dto.agent_session_id,
    active: dto.active,
    live: dto.live,
    historyCount: dto.history_count,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    history: dto.history.map(mapSessionMessage),
  };
}

function mapBridge(dto: api.ApiCcConnectBridgeAdapterSummaryDto): CcConnectBridgeAdapterSummary {
  return {
    platform: dto.platform,
    project: dto.project,
    capabilities: dto.capabilities,
    connectedAt: dto.connected_at,
  };
}

function mapProviderState(dto: api.ApiCcConnectProviderListDto): CcConnectProviderState {
  return {
    providers: dto.providers.map((item) => ({
      name: item.name,
      active: item.active,
      model: item.model,
      baseUrl: item.base_url,
    })),
    activeProvider: dto.active_provider,
  };
}

function mapModelState(dto: api.ApiCcConnectModelListDto): CcConnectModelState {
  return {
    models: dto.models,
    current: dto.current,
  };
}

function mapHeartbeatStatus(dto: api.ApiCcConnectHeartbeatStatusDto): CcConnectHeartbeatStatus {
  return {
    enabled: dto.enabled,
    paused: dto.paused,
    intervalMins: dto.interval_mins,
    onlyWhenIdle: dto.only_when_idle ?? null,
    sessionKey: dto.session_key,
    silent: dto.silent ?? null,
    runCount: dto.run_count ?? null,
    errorCount: dto.error_count ?? null,
    skippedBusy: dto.skipped_busy ?? null,
    lastRun: dto.last_run ?? null,
    lastError: dto.last_error ?? null,
  };
}

function mapCronJob(dto: api.ApiCcConnectCronJobDto): CcConnectCronJob {
  return {
    id: dto.id,
    project: dto.project,
    sessionKey: dto.session_key,
    cronExpr: dto.cron_expr,
    prompt: dto.prompt,
    exec: dto.exec,
    workDir: dto.work_dir,
    description: dto.description,
    enabled: dto.enabled,
    silent: dto.silent ?? null,
    createdAt: dto.created_at,
    lastRun: dto.last_run ?? null,
    lastError: dto.last_error ?? null,
  };
}

function pickDefaultSession(sessions: CcConnectSessionSummary[]): CcConnectSessionSummary | null {
  return sessions.find((item) => item.live) ?? sessions.find((item) => item.active) ?? sessions[0] ?? null;
}

interface CcConnectStore {
  inspection: CcConnectInspection | null;
  statusProjects: CcConnectProjectSummary[];
  projects: CcConnectProjectSummary[];
  bridges: CcConnectBridgeAdapterSummary[];
  selectedProjectName: string | null;
  selectedProject: CcConnectProjectDetail | null;
  sessionsByProject: Record<string, CcConnectSessionSummary[]>;
  selectedSessionIdByProject: Record<string, string | null>;
  sessionDetailsByProject: Record<string, Record<string, CcConnectSessionDetail>>;
  providersByProject: Record<string, CcConnectProviderState>;
  modelsByProject: Record<string, CcConnectModelState>;
  heartbeatByProject: Record<string, CcConnectHeartbeatStatus>;
  cronJobsByProject: Record<string, CcConnectCronJob[]>;
  loading: boolean;
  detailLoading: boolean;
  sendLoading: boolean;
  sessionActionLoading: boolean;
  controlActionLoading: boolean;
  error: string | null;
  sendReceipt: string | null;
  fetchSnapshot: () => Promise<'live' | 'error'>;
  selectProject: (projectName: string | null) => Promise<void>;
  selectSession: (projectName: string, sessionId: string | null) => Promise<void>;
  sendMessage: (message: string) => Promise<'live' | 'error'>;
  createNamedSession: (name: string) => Promise<'live' | 'error'>;
  switchActiveSession: (sessionId: string) => Promise<'live' | 'error'>;
  deleteSelectedSession: () => Promise<'live' | 'error'>;
  addProvider: (input: {
    name: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    thinking?: string;
    env?: Record<string, string>;
  }) => Promise<'live' | 'error'>;
  removeProvider: (provider: string) => Promise<'live' | 'error'>;
  activateProvider: (provider: string) => Promise<'live' | 'error'>;
  setModel: (model: string) => Promise<'live' | 'error'>;
  pauseHeartbeat: () => Promise<'live' | 'error'>;
  resumeHeartbeat: () => Promise<'live' | 'error'>;
  runHeartbeat: () => Promise<'live' | 'error'>;
  updateHeartbeatInterval: (minutes: number) => Promise<'live' | 'error'>;
  createCronPrompt: (input: {
    cronExpr: string;
    prompt: string;
    description?: string;
    silent?: boolean;
  }) => Promise<'live' | 'error'>;
  deleteCronJob: (jobId: string) => Promise<'live' | 'error'>;
  clearError: () => void;
}

export const useCcConnectStore = create<CcConnectStore>()((set, get) => ({
  inspection: null,
  statusProjects: [],
  projects: [],
  bridges: [],
  selectedProjectName: null,
  selectedProject: null,
  sessionsByProject: {},
  selectedSessionIdByProject: {},
  sessionDetailsByProject: {},
  providersByProject: {},
  modelsByProject: {},
  heartbeatByProject: {},
  cronJobsByProject: {},
  loading: false,
  detailLoading: false,
  sendLoading: false,
  sessionActionLoading: false,
  controlActionLoading: false,
  error: null,
  sendReceipt: null,

  fetchSnapshot: async () => {
    set({ loading: true, error: null, sendReceipt: null });
    try {
      const [inspectionDto, statusDto, projectsDto, bridgesDto] = await Promise.all([
        api.getCcConnectDetect(),
        api.getCcConnectStatus(),
        api.listCcConnectProjects(),
        api.listCcConnectBridges(),
      ]);
      const projects = projectsDto.map(mapProjectSummary);
      const selectedProjectName = get().selectedProjectName ?? projects[0]?.name ?? null;
      set({
        inspection: mapInspection(inspectionDto),
        statusProjects: statusDto.map(mapProjectSummary),
        projects,
        bridges: bridgesDto.map(mapBridge),
        selectedProjectName,
        loading: false,
      });
      if (selectedProjectName) {
        await get().selectProject(selectedProjectName);
      } else {
        set({ selectedProject: null });
      }
      return 'live';
    } catch (error) {
      set({
        inspection: null,
        statusProjects: [],
        projects: [],
        bridges: [],
        selectedProjectName: null,
        selectedProject: null,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  selectProject: async (projectName) => {
    if (!projectName) {
      set({ selectedProjectName: null, selectedProject: null });
      return;
    }
    set({ selectedProjectName: projectName, detailLoading: true, error: null, sendReceipt: null });
    try {
      const [projectDto, sessionsDto, providersDto, modelsDto, heartbeatDto, cronJobsDto] = await Promise.all([
        api.getCcConnectProject(projectName),
        api.listCcConnectSessions(projectName),
        api.listCcConnectProviders(projectName),
        api.listCcConnectModels(projectName),
        api.getCcConnectHeartbeat(projectName),
        api.listCcConnectCronJobs(projectName),
      ]);
      const sessions = sessionsDto.map(mapSessionSummary);
      const selectedSession = pickDefaultSession(sessions);
      set((state) => ({
        selectedProject: mapProjectDetail(projectDto),
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectName]: sessions,
        },
        providersByProject: {
          ...state.providersByProject,
          [projectName]: mapProviderState(providersDto),
        },
        modelsByProject: {
          ...state.modelsByProject,
          [projectName]: mapModelState(modelsDto),
        },
        heartbeatByProject: {
          ...state.heartbeatByProject,
          [projectName]: mapHeartbeatStatus(heartbeatDto),
        },
        cronJobsByProject: {
          ...state.cronJobsByProject,
          [projectName]: cronJobsDto.map(mapCronJob),
        },
        selectedSessionIdByProject: {
          ...state.selectedSessionIdByProject,
          [projectName]: selectedSession?.id ?? null,
        },
        detailLoading: false,
      }));
      if (selectedSession) {
        await get().selectSession(projectName, selectedSession.id);
      }
    } catch (error) {
      set({
        selectedProject: null,
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  selectSession: async (projectName, sessionId) => {
    if (!sessionId) {
      set((state) => ({
        selectedSessionIdByProject: {
          ...state.selectedSessionIdByProject,
          [projectName]: null,
        },
      }));
      return;
    }
    set({ detailLoading: true, error: null, sendReceipt: null });
    try {
      const detail = mapSessionDetail(await api.getCcConnectSession(projectName, sessionId, 30));
      set((state) => ({
        selectedSessionIdByProject: {
          ...state.selectedSessionIdByProject,
          [projectName]: sessionId,
        },
        sessionDetailsByProject: {
          ...state.sessionDetailsByProject,
          [projectName]: {
            ...(state.sessionDetailsByProject[projectName] ?? {}),
            [sessionId]: detail,
          },
        },
        detailLoading: false,
      }));
    } catch (error) {
      set({
        detailLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  sendMessage: async (message) => {
    const trimmed = message.trim();
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const selectedSessionId = state.selectedSessionIdByProject[projectName];
    if (!selectedSessionId) {
      set({ error: 'No live cc-connect session is selected.' });
      return 'error';
    }
    const session = state.sessionsByProject[projectName]?.find((item) => item.id === selectedSessionId) ?? null;
    if (!session) {
      set({ error: 'Selected cc-connect session is unavailable.' });
      return 'error';
    }
    if (!trimmed) {
      set({ error: 'Message cannot be empty.' });
      return 'error';
    }

    set({ sendLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.sendCcConnectProjectMessage(projectName, {
        session_key: session.sessionKey,
        message: trimmed,
      });
      await get().selectSession(projectName, selectedSessionId);
      set({
        sendLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        sendLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  createNamedSession: async (name) => {
    const trimmed = name.trim();
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const sessionKey = state.selectedSessionIdByProject[projectName]
      ? state.sessionsByProject[projectName]?.find((item) => item.id === state.selectedSessionIdByProject[projectName])?.sessionKey
      : state.selectedProject?.activeSessionKeys[0];
    if (!sessionKey) {
      set({ error: 'No session key is available for session creation.' });
      return 'error';
    }
    if (!trimmed) {
      set({ error: 'Session name cannot be empty.' });
      return 'error';
    }

    set({ sessionActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.createCcConnectSession(projectName, {
        session_key: sessionKey,
        name: trimmed,
      });
      await get().selectProject(projectName);
      await get().selectSession(projectName, receipt.id);
      set({
        sessionActionLoading: false,
        sendReceipt: `session created: ${receipt.name ?? receipt.id}`,
      });
      return 'live';
    } catch (error) {
      set({
        sessionActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  switchActiveSession: async (sessionId) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const session = state.sessionsByProject[projectName]?.find((item) => item.id === sessionId) ?? null;
    if (!session) {
      set({ error: 'Selected cc-connect session is unavailable.' });
      return 'error';
    }

    set({ sessionActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.switchCcConnectSession(projectName, {
        session_key: session.sessionKey,
        session_id: session.id,
      });
      await get().selectProject(projectName);
      await get().selectSession(projectName, receipt.active_session_id);
      set({
        sessionActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        sessionActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  deleteSelectedSession: async () => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const selectedSessionId = state.selectedSessionIdByProject[projectName];
    if (!selectedSessionId) {
      set({ error: 'No cc-connect session is selected.' });
      return 'error';
    }

    set({ sessionActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.deleteCcConnectSession(projectName, selectedSessionId);
      await get().selectProject(projectName);
      set((current) => ({
        sessionActionLoading: false,
        sendReceipt: receipt.message,
        sessionDetailsByProject: {
          ...current.sessionDetailsByProject,
          [projectName]: Object.fromEntries(
            Object.entries(current.sessionDetailsByProject[projectName] ?? {}).filter(([id]) => id !== selectedSessionId),
          ),
        },
      }));
      return 'live';
    } catch (error) {
      set({
        sessionActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  addProvider: async (input) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const name = input.name.trim();
    if (!name) {
      set({ error: 'Provider name cannot be empty.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.addCcConnectProvider(projectName, {
        name,
        ...(input.apiKey?.trim() ? { api_key: input.apiKey.trim() } : {}),
        ...(input.baseUrl?.trim() ? { base_url: input.baseUrl.trim() } : {}),
        ...(input.model?.trim() ? { model: input.model.trim() } : {}),
        ...(input.thinking?.trim() ? { thinking: input.thinking.trim() } : {}),
        ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
      });
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  removeProvider: async (provider) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.removeCcConnectProvider(projectName, provider);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  activateProvider: async (provider) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.activateCcConnectProvider(projectName, provider);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  setModel: async (model) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.setCcConnectModel(projectName, model);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  pauseHeartbeat: async () => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.pauseCcConnectHeartbeat(projectName);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  resumeHeartbeat: async () => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.resumeCcConnectHeartbeat(projectName);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  runHeartbeat: async () => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.runCcConnectHeartbeat(projectName);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  updateHeartbeatInterval: async (minutes) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.updateCcConnectHeartbeatInterval(projectName, minutes);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  createCronPrompt: async (input) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    const selectedSessionId = state.selectedSessionIdByProject[projectName];
    const session = selectedSessionId
      ? state.sessionsByProject[projectName]?.find((item) => item.id === selectedSessionId) ?? null
      : null;
    const sessionKey = session?.sessionKey ?? state.selectedProject?.activeSessionKeys[0] ?? null;
    if (!sessionKey) {
      set({ error: 'No session key is available for cron creation.' });
      return 'error';
    }
    const cronExpr = input.cronExpr.trim();
    const prompt = input.prompt.trim();
    if (!cronExpr) {
      set({ error: 'Cron expression cannot be empty.' });
      return 'error';
    }
    if (!prompt) {
      set({ error: 'Cron prompt cannot be empty.' });
      return 'error';
    }

    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      await api.createCcConnectCronPrompt({
        project: projectName,
        session_key: sessionKey,
        cron_expr: cronExpr,
        prompt,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.silent !== undefined ? { silent: input.silent } : {}),
      });
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: 'cron job created',
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  deleteCronJob: async (jobId) => {
    const state = get();
    const projectName = state.selectedProjectName;
    if (!projectName) {
      set({ error: 'No cc-connect project is selected.' });
      return 'error';
    }
    set({ controlActionLoading: true, error: null, sendReceipt: null });
    try {
      const receipt = await api.deleteCcConnectCronJob(jobId);
      await get().selectProject(projectName);
      set({
        controlActionLoading: false,
        sendReceipt: receipt.message,
      });
      return 'live';
    } catch (error) {
      set({
        controlActionLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'error';
    }
  },

  clearError: () => set({ error: null }),
}));
