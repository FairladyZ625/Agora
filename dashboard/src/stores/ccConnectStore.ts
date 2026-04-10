import { create } from 'zustand';
import * as api from '@/lib/api';
import type {
  CcConnectBridgeAdapterSummary,
  CcConnectInspection,
  CcConnectProjectDetail,
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
    showContextIndicator: dto.show_context_indicator,
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
  loading: boolean;
  detailLoading: boolean;
  sendLoading: boolean;
  sessionActionLoading: boolean;
  error: string | null;
  sendReceipt: string | null;
  fetchSnapshot: () => Promise<'live' | 'error'>;
  selectProject: (projectName: string | null) => Promise<void>;
  selectSession: (projectName: string, sessionId: string | null) => Promise<void>;
  sendMessage: (message: string) => Promise<'live' | 'error'>;
  createNamedSession: (name: string) => Promise<'live' | 'error'>;
  switchActiveSession: (sessionId: string) => Promise<'live' | 'error'>;
  deleteSelectedSession: () => Promise<'live' | 'error'>;
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
  loading: false,
  detailLoading: false,
  sendLoading: false,
  sessionActionLoading: false,
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
      const [projectDto, sessionsDto] = await Promise.all([
        api.getCcConnectProject(projectName),
        api.listCcConnectSessions(projectName),
      ]);
      const sessions = sessionsDto.map(mapSessionSummary);
      const selectedSession = pickDefaultSession(sessions);
      set((state) => ({
        selectedProject: mapProjectDetail(projectDto),
        sessionsByProject: {
          ...state.sessionsByProject,
          [projectName]: sessions,
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

  clearError: () => set({ error: null }),
}));
