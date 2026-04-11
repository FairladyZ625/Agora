import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCcConnectStore } from '@/stores/ccConnectStore';

// ---------------------------------------------------------------------------
// Mock all api functions the store consumes
// ---------------------------------------------------------------------------

const mockGetCcConnectDetect = vi.fn();
const mockGetCcConnectStatus = vi.fn();
const mockListCcConnectProjects = vi.fn();
const mockListCcConnectBridges = vi.fn();
const mockGetCcConnectProject = vi.fn();
const mockListCcConnectSessions = vi.fn();
const mockGetCcConnectSession = vi.fn();
const mockListCcConnectProviders = vi.fn();
const mockListCcConnectModels = vi.fn();
const mockGetCcConnectHeartbeat = vi.fn();
const mockListCcConnectCronJobs = vi.fn();
const mockSendCcConnectProjectMessage = vi.fn();
const mockCreateCcConnectSession = vi.fn();
const mockSwitchCcConnectSession = vi.fn();
const mockDeleteCcConnectSession = vi.fn();
const mockAddCcConnectProvider = vi.fn();
const mockRemoveCcConnectProvider = vi.fn();
const mockActivateCcConnectProvider = vi.fn();
const mockSetCcConnectModel = vi.fn();
const mockPauseCcConnectHeartbeat = vi.fn();
const mockResumeCcConnectHeartbeat = vi.fn();
const mockRunCcConnectHeartbeat = vi.fn();
const mockUpdateCcConnectHeartbeatInterval = vi.fn();
const mockCreateCcConnectCronPrompt = vi.fn();
const mockDeleteCcConnectCronJob = vi.fn();

vi.mock('@/lib/api', () => ({
  getCcConnectDetect: (...args: unknown[]) => mockGetCcConnectDetect(...args),
  getCcConnectStatus: (...args: unknown[]) => mockGetCcConnectStatus(...args),
  listCcConnectProjects: (...args: unknown[]) => mockListCcConnectProjects(...args),
  listCcConnectBridges: (...args: unknown[]) => mockListCcConnectBridges(...args),
  getCcConnectProject: (...args: unknown[]) => mockGetCcConnectProject(...args),
  listCcConnectSessions: (...args: unknown[]) => mockListCcConnectSessions(...args),
  getCcConnectSession: (...args: unknown[]) => mockGetCcConnectSession(...args),
  listCcConnectProviders: (...args: unknown[]) => mockListCcConnectProviders(...args),
  listCcConnectModels: (...args: unknown[]) => mockListCcConnectModels(...args),
  getCcConnectHeartbeat: (...args: unknown[]) => mockGetCcConnectHeartbeat(...args),
  listCcConnectCronJobs: (...args: unknown[]) => mockListCcConnectCronJobs(...args),
  sendCcConnectProjectMessage: (...args: unknown[]) => mockSendCcConnectProjectMessage(...args),
  createCcConnectSession: (...args: unknown[]) => mockCreateCcConnectSession(...args),
  switchCcConnectSession: (...args: unknown[]) => mockSwitchCcConnectSession(...args),
  deleteCcConnectSession: (...args: unknown[]) => mockDeleteCcConnectSession(...args),
  addCcConnectProvider: (...args: unknown[]) => mockAddCcConnectProvider(...args),
  removeCcConnectProvider: (...args: unknown[]) => mockRemoveCcConnectProvider(...args),
  activateCcConnectProvider: (...args: unknown[]) => mockActivateCcConnectProvider(...args),
  setCcConnectModel: (...args: unknown[]) => mockSetCcConnectModel(...args),
  pauseCcConnectHeartbeat: (...args: unknown[]) => mockPauseCcConnectHeartbeat(...args),
  resumeCcConnectHeartbeat: (...args: unknown[]) => mockResumeCcConnectHeartbeat(...args),
  runCcConnectHeartbeat: (...args: unknown[]) => mockRunCcConnectHeartbeat(...args),
  updateCcConnectHeartbeatInterval: (...args: unknown[]) => mockUpdateCcConnectHeartbeatInterval(...args),
  createCcConnectCronPrompt: (...args: unknown[]) => mockCreateCcConnectCronPrompt(...args),
  deleteCcConnectCronJob: (...args: unknown[]) => mockDeleteCcConnectCronJob(...args),
}));

// ---------------------------------------------------------------------------
// Shared DTO fixtures
// ---------------------------------------------------------------------------

const DETECT_DTO = {
  binary: { command: 'cc-connect', found: true, resolvedPath: '/opt/homebrew/bin/cc-connect', version: 'v1.2.2', reason: null, error: null },
  config: { path: '/Users/test/.cc-connect/config.toml', exists: true, management: { enabled: true, port: 9820, tokenPresent: true } },
  management: {
    url: 'http://127.0.0.1:9820',
    reachable: true,
    version: 'v1.2.2-beta.5',
    projectsCount: 1,
    bridgeAdapterCount: 1,
    connectedPlatforms: ['discord'],
    reason: null,
    error: null,
  },
};

const PROJECT_SUMMARY_DTO = {
  name: 'agora-codex',
  agent_type: 'codex',
  platforms: ['discord'],
  sessions_count: 2,
  heartbeat_enabled: false,
};

const PROJECT_DETAIL_DTO = {
  name: 'agora-codex',
  agent_type: 'codex',
  platforms: [{ type: 'discord', connected: true }],
  platform_configs: [{ type: 'discord', allow_from: '*' }],
  sessions_count: 2,
  active_session_keys: ['discord:thread:1'],
  heartbeat: { enabled: true, paused: false, interval_mins: 30, session_key: 'discord:thread:1' },
  settings: { language: 'zh-CN', admin_from: null, disabled_commands: [], quiet: false },
  work_dir: '/Users/lizeyu/Projects/Agora',
  agent_mode: 'immediate',
  mode: 'channel',
  show_context_indicator: false,
};

const SESSION_SUMMARY_DTO = {
  id: 'session-1',
  session_key: 'discord:thread:1',
  name: 'Main Thread',
  platform: 'discord',
  agent_type: 'codex',
  active: true,
  live: true,
  history_count: 1,
  created_at: '2026-04-10T00:00:00.000Z',
  updated_at: '2026-04-10T00:05:00.000Z',
  user_name: 'FairladyZ',
  chat_name: 'main',
  last_message: { role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' },
};

const SESSION_DETAIL_DTO = {
  id: 'session-1',
  session_key: 'discord:thread:1',
  name: 'Main Thread',
  platform: 'discord',
  agent_type: 'codex',
  agent_session_id: 'codex-session-1',
  active: true,
  live: true,
  history_count: 1,
  created_at: '2026-04-10T00:00:00.000Z',
  updated_at: '2026-04-10T00:05:00.000Z',
  history: [{ role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' }],
};

const BRIDGE_DTO = {
  platform: 'discord',
  project: 'agora-codex',
  capabilities: ['reply', 'thread'],
  connected_at: '2026-04-10T00:00:00.000Z',
};

const PROVIDERS_DTO = {
  providers: [{ name: 'gac', active: true, model: 'gpt-5.4', base_url: 'https://gaccode.com/codex/v1' }],
  active_provider: 'gac',
};

const MODELS_DTO = {
  models: ['gpt-5.4', 'gpt-5.3-codex'],
  current: 'gpt-5.4',
};

const HEARTBEAT_DTO = {
  enabled: true,
  paused: false,
  interval_mins: 30,
  only_when_idle: true,
  session_key: 'discord:thread:1',
  silent: true,
  run_count: 4,
  error_count: 0,
  skipped_busy: 1,
  last_run: '2026-04-10T00:10:00.000Z',
  last_error: '',
};

const CRON_JOB_DTO = {
  id: 'cron-1',
  project: 'agora-codex',
  session_key: 'discord:thread:1',
  cron_expr: '0 * * * *',
  prompt: 'Summarize the latest thread state.',
  exec: null,
  work_dir: null,
  description: 'Hourly summary',
  enabled: true,
  silent: true,
  created_at: '2026-04-11T00:00:00.000Z',
  last_run: null,
  last_error: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
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
};

/**
 * Set up the project-selected state so that action methods
 * (sendMessage, addProvider, etc.) have a valid project context.
 */
function seedProjectSelected() {
  useCcConnectStore.setState({
    selectedProjectName: 'agora-codex',
    selectedProject: {
      name: 'agora-codex',
      agentType: 'codex',
      platforms: [{ type: 'discord', connected: true }],
      platformConfigs: [{ type: 'discord', allowFrom: '*' }],
      sessionsCount: 2,
      activeSessionKeys: ['discord:thread:1'],
      heartbeat: { enabled: true, paused: false, intervalMins: 30, sessionKey: 'discord:thread:1' },
      settings: { language: 'zh-CN', adminFrom: null, disabledCommands: [], quiet: false },
      workDir: '/Users/lizeyu/Projects/Agora',
      agentMode: 'immediate',
      mode: 'channel',
      showContextIndicator: false,
    },
    sessionsByProject: {
      'agora-codex': [{
        id: 'session-1',
        sessionKey: 'discord:thread:1',
        name: 'Main Thread',
        platform: 'discord',
        agentType: 'codex',
        active: true,
        live: true,
        historyCount: 1,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:05:00.000Z',
        userName: 'FairladyZ',
        chatName: 'main',
        lastMessage: { role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' },
      }],
    },
    selectedSessionIdByProject: { 'agora-codex': 'session-1' },
    sessionDetailsByProject: {
      'agora-codex': {
        'session-1': {
          id: 'session-1',
          sessionKey: 'discord:thread:1',
          name: 'Main Thread',
          platform: 'discord',
          agentType: 'codex',
          agentSessionId: 'codex-session-1',
          active: true,
          live: true,
          historyCount: 1,
          createdAt: '2026-04-10T00:00:00.000Z',
          updatedAt: '2026-04-10T00:05:00.000Z',
          history: [{ role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' }],
        },
      },
    },
    providersByProject: {},
    modelsByProject: {},
    heartbeatByProject: {},
    cronJobsByProject: {},
  });
}

/**
 * Wire up all the API mocks that selectProject calls internally,
 * so actions that call selectProject for refresh work properly.
 */
function wireSelectProjectMocks() {
  mockGetCcConnectProject.mockResolvedValue(PROJECT_DETAIL_DTO);
  mockListCcConnectSessions.mockResolvedValue([SESSION_SUMMARY_DTO]);
  mockGetCcConnectSession.mockResolvedValue(SESSION_DETAIL_DTO);
  mockListCcConnectProviders.mockResolvedValue(PROVIDERS_DTO);
  mockListCcConnectModels.mockResolvedValue(MODELS_DTO);
  mockGetCcConnectHeartbeat.mockResolvedValue(HEARTBEAT_DTO);
  mockListCcConnectCronJobs.mockResolvedValue([CRON_JOB_DTO]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ccConnectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCcConnectStore.setState({ ...INITIAL_STATE });
  });

  afterEach(() => {
    useCcConnectStore.setState({ ...INITIAL_STATE });
  });

  // -------------------------------------------------------------------------
  // fetchSnapshot
  // -------------------------------------------------------------------------
  describe('fetchSnapshot', () => {
    it('fetches detect, status, projects, bridges and auto-selects first project', async () => {
      mockGetCcConnectDetect.mockResolvedValue(DETECT_DTO);
      mockGetCcConnectStatus.mockResolvedValue([PROJECT_SUMMARY_DTO]);
      mockListCcConnectProjects.mockResolvedValue([PROJECT_SUMMARY_DTO]);
      mockListCcConnectBridges.mockResolvedValue([BRIDGE_DTO]);
      wireSelectProjectMocks();

      const result = await useCcConnectStore.getState().fetchSnapshot();

      expect(result).toBe('live');
      const state = useCcConnectStore.getState();
      expect(state.inspection).not.toBeNull();
      expect(state.inspection!.binary.found).toBe(true);
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].name).toBe('agora-codex');
      expect(state.bridges).toHaveLength(1);
      expect(state.bridges[0].platform).toBe('discord');
      expect(state.statusProjects).toHaveLength(1);
      expect(state.selectedProjectName).toBe('agora-codex');
      expect(state.selectedProject).not.toBeNull();
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('clears data and returns error when API throws', async () => {
      mockGetCcConnectDetect.mockRejectedValue(new Error('network failure'));

      const result = await useCcConnectStore.getState().fetchSnapshot();

      expect(result).toBe('error');
      const state = useCcConnectStore.getState();
      expect(state.inspection).toBeNull();
      expect(state.projects).toEqual([]);
      expect(state.bridges).toEqual([]);
      expect(state.selectedProjectName).toBeNull();
      expect(state.error).toBe('network failure');
      expect(state.loading).toBe(false);
    });

    it('sets selectedProjectName to null when no projects exist', async () => {
      mockGetCcConnectDetect.mockResolvedValue(DETECT_DTO);
      mockGetCcConnectStatus.mockResolvedValue([]);
      mockListCcConnectProjects.mockResolvedValue([]);
      mockListCcConnectBridges.mockResolvedValue([]);

      const result = await useCcConnectStore.getState().fetchSnapshot();

      expect(result).toBe('live');
      expect(useCcConnectStore.getState().selectedProjectName).toBeNull();
      expect(useCcConnectStore.getState().selectedProject).toBeNull();
    });

    it('preserves previously selected project name on re-fetch', async () => {
      useCcConnectStore.setState({ selectedProjectName: 'agora-codex' });
      mockGetCcConnectDetect.mockResolvedValue(DETECT_DTO);
      mockGetCcConnectStatus.mockResolvedValue([PROJECT_SUMMARY_DTO]);
      mockListCcConnectProjects.mockResolvedValue([PROJECT_SUMMARY_DTO]);
      mockListCcConnectBridges.mockResolvedValue([BRIDGE_DTO]);
      wireSelectProjectMocks();

      await useCcConnectStore.getState().fetchSnapshot();

      expect(useCcConnectStore.getState().selectedProjectName).toBe('agora-codex');
    });
  });

  // -------------------------------------------------------------------------
  // selectProject
  // -------------------------------------------------------------------------
  describe('selectProject', () => {
    it('clears selection when called with null', async () => {
      useCcConnectStore.setState({ selectedProjectName: 'old-project', selectedProject: {} as any });

      await useCcConnectStore.getState().selectProject(null);

      expect(useCcConnectStore.getState().selectedProjectName).toBeNull();
      expect(useCcConnectStore.getState().selectedProject).toBeNull();
    });

    it('clears selection when called with empty string', async () => {
      useCcConnectStore.setState({ selectedProjectName: 'old-project', selectedProject: {} as any });

      await useCcConnectStore.getState().selectProject('');

      expect(useCcConnectStore.getState().selectedProjectName).toBeNull();
      expect(useCcConnectStore.getState().selectedProject).toBeNull();
    });

    it('loads project detail, sessions, providers, models, heartbeat, cron jobs', async () => {
      wireSelectProjectMocks();

      await useCcConnectStore.getState().selectProject('agora-codex');

      const state = useCcConnectStore.getState();
      expect(state.selectedProjectName).toBe('agora-codex');
      expect(state.selectedProject).not.toBeNull();
      expect(state.selectedProject!.name).toBe('agora-codex');
      expect(state.sessionsByProject['agora-codex']).toHaveLength(1);
      expect(state.sessionsByProject['agora-codex'][0].sessionKey).toBe('discord:thread:1');
      expect(state.providersByProject['agora-codex']).toBeDefined();
      expect(state.providersByProject['agora-codex'].activeProvider).toBe('gac');
      expect(state.modelsByProject['agora-codex']).toBeDefined();
      expect(state.modelsByProject['agora-codex'].current).toBe('gpt-5.4');
      expect(state.heartbeatByProject['agora-codex']).toBeDefined();
      expect(state.heartbeatByProject['agora-codex'].enabled).toBe(true);
      expect(state.cronJobsByProject['agora-codex']).toHaveLength(1);
      expect(state.detailLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('auto-selects the live session', async () => {
      wireSelectProjectMocks();

      await useCcConnectStore.getState().selectProject('agora-codex');

      expect(useCcConnectStore.getState().selectedSessionIdByProject['agora-codex']).toBe('session-1');
    });

    it('sets error when API throws', async () => {
      mockGetCcConnectProject.mockRejectedValue(new Error('project not found'));

      await useCcConnectStore.getState().selectProject('agora-codex');

      const state = useCcConnectStore.getState();
      expect(state.selectedProject).toBeNull();
      expect(state.error).toBe('project not found');
      expect(state.detailLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // selectSession
  // -------------------------------------------------------------------------
  describe('selectSession', () => {
    it('loads session detail and stores it', async () => {
      mockGetCcConnectSession.mockResolvedValue(SESSION_DETAIL_DTO);
      useCcConnectStore.setState({ selectedSessionIdByProject: {}, sessionDetailsByProject: {} });

      await useCcConnectStore.getState().selectSession('agora-codex', 'session-1');

      const state = useCcConnectStore.getState();
      expect(state.selectedSessionIdByProject['agora-codex']).toBe('session-1');
      expect(state.sessionDetailsByProject['agora-codex']['session-1']).toBeDefined();
      expect(state.sessionDetailsByProject['agora-codex']['session-1'].agentSessionId).toBe('codex-session-1');
      expect(state.detailLoading).toBe(false);
    });

    it('clears session selection when called with null sessionId', async () => {
      useCcConnectStore.setState({
        selectedSessionIdByProject: { 'agora-codex': 'session-1' },
      });

      await useCcConnectStore.getState().selectSession('agora-codex', null);

      expect(useCcConnectStore.getState().selectedSessionIdByProject['agora-codex']).toBeNull();
    });

    it('sets error when API throws', async () => {
      mockGetCcConnectSession.mockRejectedValue(new Error('session not found'));

      await useCcConnectStore.getState().selectSession('agora-codex', 'bad-session');

      expect(useCcConnectStore.getState().error).toBe('session not found');
      expect(useCcConnectStore.getState().detailLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------
  describe('sendMessage', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().sendMessage('hello');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when no session is selected', async () => {
      useCcConnectStore.setState({
        selectedProjectName: 'agora-codex',
        selectedSessionIdByProject: { 'agora-codex': null },
      });

      const result = await useCcConnectStore.getState().sendMessage('hello');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No live cc-connect session is selected.');
    });

    it('returns error when selected session is not in sessionsByProject', async () => {
      useCcConnectStore.setState({
        selectedProjectName: 'agora-codex',
        selectedSessionIdByProject: { 'agora-codex': 'session-1' },
        sessionsByProject: { 'agora-codex': [] },
      });

      const result = await useCcConnectStore.getState().sendMessage('hello');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Selected cc-connect session is unavailable.');
    });

    it('returns error when message is empty', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().sendMessage('   ');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Message cannot be empty.');
    });

    it('sends message and refreshes session on success', async () => {
      seedProjectSelected();
      mockSendCcConnectProjectMessage.mockResolvedValue({ message: 'sent' });
      mockGetCcConnectSession.mockResolvedValue(SESSION_DETAIL_DTO);

      const result = await useCcConnectStore.getState().sendMessage('hello cc-connect');

      expect(result).toBe('live');
      expect(mockSendCcConnectProjectMessage).toHaveBeenCalledWith('agora-codex', {
        session_key: 'discord:thread:1',
        message: 'hello cc-connect',
      });
      expect(useCcConnectStore.getState().sendReceipt).toBe('sent');
      expect(useCcConnectStore.getState().sendLoading).toBe(false);
    });

    it('returns error when send API throws', async () => {
      seedProjectSelected();
      mockSendCcConnectProjectMessage.mockRejectedValue(new Error('send failed'));

      const result = await useCcConnectStore.getState().sendMessage('hello');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('send failed');
      expect(useCcConnectStore.getState().sendLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // createNamedSession
  // -------------------------------------------------------------------------
  describe('createNamedSession', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().createNamedSession('work');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when no session key is available', async () => {
      useCcConnectStore.setState({
        selectedProjectName: 'agora-codex',
        selectedProject: null,
        selectedSessionIdByProject: {},
        sessionsByProject: {},
      });

      const result = await useCcConnectStore.getState().createNamedSession('work');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No session key is available for session creation.');
    });

    it('returns error when name is empty', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().createNamedSession('   ');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Session name cannot be empty.');
    });

    it('creates session, refreshes project, and selects new session', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockCreateCcConnectSession.mockResolvedValue({ id: 'session-2', name: 'work', created_at: '2026-04-10T00:06:00.000Z' });

      const result = await useCcConnectStore.getState().createNamedSession('work');

      expect(result).toBe('live');
      expect(mockCreateCcConnectSession).toHaveBeenCalledWith('agora-codex', {
        session_key: 'discord:thread:1',
        name: 'work',
      });
      expect(useCcConnectStore.getState().sendReceipt).toContain('session created');
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });

    it('returns error when create API throws', async () => {
      seedProjectSelected();
      mockCreateCcConnectSession.mockRejectedValue(new Error('create failed'));

      const result = await useCcConnectStore.getState().createNamedSession('work');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('create failed');
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // switchActiveSession
  // -------------------------------------------------------------------------
  describe('switchActiveSession', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().switchActiveSession('session-2');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when session is not found in sessionsByProject', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().switchActiveSession('nonexistent');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Selected cc-connect session is unavailable.');
    });

    it('switches session and refreshes project on success', async () => {
      seedProjectSelected();
      // Add a second session to switch to
      useCcConnectStore.setState({
        sessionsByProject: {
          'agora-codex': [
            ...useCcConnectStore.getState().sessionsByProject['agora-codex'],
            { id: 'session-2', sessionKey: 'discord:thread:1', name: 'Work Thread', platform: 'discord', agentType: 'codex', active: false, live: false, historyCount: 0, createdAt: '2026-04-10T00:06:00.000Z', updatedAt: '2026-04-10T00:06:00.000Z', userName: null, chatName: null, lastMessage: null },
          ],
        },
      });
      wireSelectProjectMocks();
      mockSwitchCcConnectSession.mockResolvedValue({ message: 'active session switched', active_session_id: 'session-2' });

      const result = await useCcConnectStore.getState().switchActiveSession('session-2');

      expect(result).toBe('live');
      expect(mockSwitchCcConnectSession).toHaveBeenCalledWith('agora-codex', {
        session_key: 'discord:thread:1',
        session_id: 'session-2',
      });
      expect(useCcConnectStore.getState().sendReceipt).toBe('active session switched');
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });

    it('returns error when switch API throws', async () => {
      seedProjectSelected();
      useCcConnectStore.setState({
        sessionsByProject: {
          'agora-codex': [
            ...useCcConnectStore.getState().sessionsByProject['agora-codex'],
            { id: 'session-2', sessionKey: 'discord:thread:1', name: 'Work Thread', platform: 'discord', agentType: 'codex', active: false, live: false, historyCount: 0, createdAt: '2026-04-10T00:06:00.000Z', updatedAt: '2026-04-10T00:06:00.000Z', userName: null, chatName: null, lastMessage: null },
          ],
        },
      });
      mockSwitchCcConnectSession.mockRejectedValue(new Error('switch failed'));

      const result = await useCcConnectStore.getState().switchActiveSession('session-2');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('switch failed');
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // deleteSelectedSession
  // -------------------------------------------------------------------------
  describe('deleteSelectedSession', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().deleteSelectedSession();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when no session is selected', async () => {
      useCcConnectStore.setState({
        selectedProjectName: 'agora-codex',
        selectedSessionIdByProject: { 'agora-codex': null },
      });

      const result = await useCcConnectStore.getState().deleteSelectedSession();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect session is selected.');
    });

    it('deletes session and removes from sessionDetailsByProject on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockDeleteCcConnectSession.mockResolvedValue({ message: 'session deleted' });

      const result = await useCcConnectStore.getState().deleteSelectedSession();

      expect(result).toBe('live');
      expect(mockDeleteCcConnectSession).toHaveBeenCalledWith('agora-codex', 'session-1');
      expect(useCcConnectStore.getState().sendReceipt).toBe('session deleted');
      // session-1 should be removed from details
      expect(useCcConnectStore.getState().sessionDetailsByProject['agora-codex']['session-1']).toBeUndefined();
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });

    it('returns error when delete API throws', async () => {
      seedProjectSelected();
      mockDeleteCcConnectSession.mockRejectedValue(new Error('delete failed'));

      const result = await useCcConnectStore.getState().deleteSelectedSession();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('delete failed');
      expect(useCcConnectStore.getState().sessionActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // addProvider
  // -------------------------------------------------------------------------
  describe('addProvider', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().addProvider({ name: 'relay' });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when name is empty', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().addProvider({ name: '   ' });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Provider name cannot be empty.');
    });

    it('adds provider with all fields and refreshes project', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockAddCcConnectProvider.mockResolvedValue({ name: 'relay', message: 'provider added' });

      const result = await useCcConnectStore.getState().addProvider({
        name: 'relay',
        apiKey: 'sk-relay',
        baseUrl: 'https://relay.example.com',
        model: 'gpt-5.3-codex',
        thinking: 'disabled',
        env: { AWS_PROFILE: 'bedrock' },
      });

      expect(result).toBe('live');
      expect(mockAddCcConnectProvider).toHaveBeenCalledWith('agora-codex', {
        name: 'relay',
        api_key: 'sk-relay',
        base_url: 'https://relay.example.com',
        model: 'gpt-5.3-codex',
        thinking: 'disabled',
        env: { AWS_PROFILE: 'bedrock' },
      });
      expect(useCcConnectStore.getState().sendReceipt).toBe('provider added');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('omits optional fields when not provided', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockAddCcConnectProvider.mockResolvedValue({ name: 'minimal', message: 'provider added' });

      const result = await useCcConnectStore.getState().addProvider({ name: 'minimal' });

      expect(result).toBe('live');
      expect(mockAddCcConnectProvider).toHaveBeenCalledWith('agora-codex', {
        name: 'minimal',
      });
    });

    it('returns error when add API throws', async () => {
      seedProjectSelected();
      mockAddCcConnectProvider.mockRejectedValue(new Error('add provider failed'));

      const result = await useCcConnectStore.getState().addProvider({ name: 'relay' });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('add provider failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // removeProvider
  // -------------------------------------------------------------------------
  describe('removeProvider', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().removeProvider('gac');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('removes provider and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockRemoveCcConnectProvider.mockResolvedValue({ message: 'provider removed' });

      const result = await useCcConnectStore.getState().removeProvider('relay');

      expect(result).toBe('live');
      expect(mockRemoveCcConnectProvider).toHaveBeenCalledWith('agora-codex', 'relay');
      expect(useCcConnectStore.getState().sendReceipt).toBe('provider removed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when remove API throws', async () => {
      seedProjectSelected();
      mockRemoveCcConnectProvider.mockRejectedValue(new Error('remove failed'));

      const result = await useCcConnectStore.getState().removeProvider('gac');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('remove failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // activateProvider
  // -------------------------------------------------------------------------
  describe('activateProvider', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().activateProvider('relay');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('activates provider and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockActivateCcConnectProvider.mockResolvedValue({ active_provider: 'relay', message: 'provider activated' });

      const result = await useCcConnectStore.getState().activateProvider('relay');

      expect(result).toBe('live');
      expect(mockActivateCcConnectProvider).toHaveBeenCalledWith('agora-codex', 'relay');
      expect(useCcConnectStore.getState().sendReceipt).toBe('provider activated');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when activate API throws', async () => {
      seedProjectSelected();
      mockActivateCcConnectProvider.mockRejectedValue(new Error('activate failed'));

      const result = await useCcConnectStore.getState().activateProvider('relay');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('activate failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setModel
  // -------------------------------------------------------------------------
  describe('setModel', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().setModel('gpt-5.3-codex');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('sets model and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockSetCcConnectModel.mockResolvedValue({ model: 'gpt-5.3-codex', message: 'model updated' });

      const result = await useCcConnectStore.getState().setModel('gpt-5.3-codex');

      expect(result).toBe('live');
      expect(mockSetCcConnectModel).toHaveBeenCalledWith('agora-codex', 'gpt-5.3-codex');
      expect(useCcConnectStore.getState().sendReceipt).toBe('model updated');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when set model API throws', async () => {
      seedProjectSelected();
      mockSetCcConnectModel.mockRejectedValue(new Error('model set failed'));

      const result = await useCcConnectStore.getState().setModel('gpt-5.3-codex');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('model set failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // pauseHeartbeat
  // -------------------------------------------------------------------------
  describe('pauseHeartbeat', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().pauseHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('pauses heartbeat and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockPauseCcConnectHeartbeat.mockResolvedValue({ message: 'heartbeat paused' });

      const result = await useCcConnectStore.getState().pauseHeartbeat();

      expect(result).toBe('live');
      expect(mockPauseCcConnectHeartbeat).toHaveBeenCalledWith('agora-codex');
      expect(useCcConnectStore.getState().sendReceipt).toBe('heartbeat paused');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when pause API throws', async () => {
      seedProjectSelected();
      mockPauseCcConnectHeartbeat.mockRejectedValue(new Error('pause failed'));

      const result = await useCcConnectStore.getState().pauseHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('pause failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // resumeHeartbeat
  // -------------------------------------------------------------------------
  describe('resumeHeartbeat', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().resumeHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('resumes heartbeat and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockResumeCcConnectHeartbeat.mockResolvedValue({ message: 'heartbeat resumed' });

      const result = await useCcConnectStore.getState().resumeHeartbeat();

      expect(result).toBe('live');
      expect(mockResumeCcConnectHeartbeat).toHaveBeenCalledWith('agora-codex');
      expect(useCcConnectStore.getState().sendReceipt).toBe('heartbeat resumed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when resume API throws', async () => {
      seedProjectSelected();
      mockResumeCcConnectHeartbeat.mockRejectedValue(new Error('resume failed'));

      const result = await useCcConnectStore.getState().resumeHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('resume failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // runHeartbeat
  // -------------------------------------------------------------------------
  describe('runHeartbeat', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().runHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('runs heartbeat and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockRunCcConnectHeartbeat.mockResolvedValue({ message: 'heartbeat triggered' });

      const result = await useCcConnectStore.getState().runHeartbeat();

      expect(result).toBe('live');
      expect(mockRunCcConnectHeartbeat).toHaveBeenCalledWith('agora-codex');
      expect(useCcConnectStore.getState().sendReceipt).toBe('heartbeat triggered');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when run API throws', async () => {
      seedProjectSelected();
      mockRunCcConnectHeartbeat.mockRejectedValue(new Error('run failed'));

      const result = await useCcConnectStore.getState().runHeartbeat();

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('run failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // updateHeartbeatInterval
  // -------------------------------------------------------------------------
  describe('updateHeartbeatInterval', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().updateHeartbeatInterval(15);

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('updates interval and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockUpdateCcConnectHeartbeatInterval.mockResolvedValue({ interval_mins: 15, message: 'interval updated' });

      const result = await useCcConnectStore.getState().updateHeartbeatInterval(15);

      expect(result).toBe('live');
      expect(mockUpdateCcConnectHeartbeatInterval).toHaveBeenCalledWith('agora-codex', 15);
      expect(useCcConnectStore.getState().sendReceipt).toBe('interval updated');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when update API throws', async () => {
      seedProjectSelected();
      mockUpdateCcConnectHeartbeatInterval.mockRejectedValue(new Error('update interval failed'));

      const result = await useCcConnectStore.getState().updateHeartbeatInterval(15);

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('update interval failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // createCronPrompt
  // -------------------------------------------------------------------------
  describe('createCronPrompt', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '0 * * * *',
        prompt: 'Summarize',
      });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('returns error when no session key is available', async () => {
      useCcConnectStore.setState({
        selectedProjectName: 'agora-codex',
        selectedProject: { activeSessionKeys: [] } as any,
        selectedSessionIdByProject: {},
        sessionsByProject: {},
      });

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '0 * * * *',
        prompt: 'Summarize',
      });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No session key is available for cron creation.');
    });

    it('returns error when cron expression is empty', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '   ',
        prompt: 'Summarize',
      });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Cron expression cannot be empty.');
    });

    it('returns error when prompt is empty', async () => {
      seedProjectSelected();

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '0 * * * *',
        prompt: '   ',
      });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('Cron prompt cannot be empty.');
    });

    it('creates cron job and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockCreateCcConnectCronPrompt.mockResolvedValue({ id: 'cron-2' });

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '*/30 * * * *',
        prompt: 'Ping the live session.',
        description: 'Half-hour ping',
        silent: true,
      });

      expect(result).toBe('live');
      expect(mockCreateCcConnectCronPrompt).toHaveBeenCalledWith({
        project: 'agora-codex',
        session_key: 'discord:thread:1',
        cron_expr: '*/30 * * * *',
        prompt: 'Ping the live session.',
        description: 'Half-hour ping',
        silent: true,
      });
      expect(useCcConnectStore.getState().sendReceipt).toBe('cron job created');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('omits description and silent when not provided', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockCreateCcConnectCronPrompt.mockResolvedValue({ id: 'cron-3' });

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '0 * * * *',
        prompt: 'Summarize',
      });

      expect(result).toBe('live');
      expect(mockCreateCcConnectCronPrompt).toHaveBeenCalledWith({
        project: 'agora-codex',
        session_key: 'discord:thread:1',
        cron_expr: '0 * * * *',
        prompt: 'Summarize',
      });
    });

    it('returns error when create cron API throws', async () => {
      seedProjectSelected();
      mockCreateCcConnectCronPrompt.mockRejectedValue(new Error('cron create failed'));

      const result = await useCcConnectStore.getState().createCronPrompt({
        cronExpr: '0 * * * *',
        prompt: 'Summarize',
      });

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('cron create failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // deleteCronJob
  // -------------------------------------------------------------------------
  describe('deleteCronJob', () => {
    it('returns error when no project is selected', async () => {
      const result = await useCcConnectStore.getState().deleteCronJob('cron-1');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('No cc-connect project is selected.');
    });

    it('deletes cron job and refreshes project on success', async () => {
      seedProjectSelected();
      wireSelectProjectMocks();
      mockDeleteCcConnectCronJob.mockResolvedValue({ message: 'cron deleted' });

      const result = await useCcConnectStore.getState().deleteCronJob('cron-1');

      expect(result).toBe('live');
      expect(mockDeleteCcConnectCronJob).toHaveBeenCalledWith('cron-1');
      expect(useCcConnectStore.getState().sendReceipt).toBe('cron deleted');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });

    it('returns error when delete cron API throws', async () => {
      seedProjectSelected();
      mockDeleteCcConnectCronJob.mockRejectedValue(new Error('cron delete failed'));

      const result = await useCcConnectStore.getState().deleteCronJob('cron-1');

      expect(result).toBe('error');
      expect(useCcConnectStore.getState().error).toBe('cron delete failed');
      expect(useCcConnectStore.getState().controlActionLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // clearError
  // -------------------------------------------------------------------------
  describe('clearError', () => {
    it('clears the error state', () => {
      useCcConnectStore.setState({ error: 'something went wrong' });

      useCcConnectStore.getState().clearError();

      expect(useCcConnectStore.getState().error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DTO mapping coverage
  // -------------------------------------------------------------------------
  describe('DTO mapping', () => {
    it('maps inspection DTO with null optional fields', async () => {
      const dtoWithNulls = {
        binary: { command: 'cc-connect', found: false, resolvedPath: null, version: null, reason: 'not found', error: 'ENOENT' },
        config: { path: '', exists: false, management: { enabled: false, port: 0, tokenPresent: false } },
        management: { url: '', reachable: false, version: null, projectsCount: 0, bridgeAdapterCount: 0, connectedPlatforms: [], reason: 'unreachable', error: 'ECONNREFUSED' },
      };
      mockGetCcConnectDetect.mockResolvedValue(dtoWithNulls);
      mockGetCcConnectStatus.mockResolvedValue([]);
      mockListCcConnectProjects.mockResolvedValue([]);
      mockListCcConnectBridges.mockResolvedValue([]);

      await useCcConnectStore.getState().fetchSnapshot();

      const inspection = useCcConnectStore.getState().inspection!;
      expect(inspection.binary.found).toBe(false);
      expect(inspection.binary.error).toBe('ENOENT');
      expect(inspection.management.error).toBe('ECONNREFUSED');
    });

    it('maps session summary with null last_message', async () => {
      const dtoNoLastMsg = { ...SESSION_SUMMARY_DTO, last_message: null };
      wireSelectProjectMocks();
      mockListCcConnectSessions.mockResolvedValue([dtoNoLastMsg]);

      await useCcConnectStore.getState().selectProject('agora-codex');

      const sessions = useCcConnectStore.getState().sessionsByProject['agora-codex'];
      expect(sessions[0].lastMessage).toBeNull();
    });

    it('maps project detail with null heartbeat', async () => {
      const dtoNoHeartbeat = { ...PROJECT_DETAIL_DTO, heartbeat: null };
      mockGetCcConnectProject.mockResolvedValue(dtoNoHeartbeat);
      mockListCcConnectSessions.mockResolvedValue([]);
      mockListCcConnectProviders.mockResolvedValue(PROVIDERS_DTO);
      mockListCcConnectModels.mockResolvedValue(MODELS_DTO);
      mockGetCcConnectHeartbeat.mockResolvedValue(HEARTBEAT_DTO);
      mockListCcConnectCronJobs.mockResolvedValue([]);

      await useCcConnectStore.getState().selectProject('agora-codex');

      expect(useCcConnectStore.getState().selectedProject!.heartbeat).toBeNull();
    });

    it('maps heartbeat status with null optional fields', async () => {
      wireSelectProjectMocks();
      const minimalHeartbeat = {
        enabled: true,
        paused: false,
        interval_mins: 10,
        session_key: 'discord:thread:1',
      };
      mockGetCcConnectProject.mockResolvedValue(PROJECT_DETAIL_DTO);
      mockListCcConnectSessions.mockResolvedValue([SESSION_SUMMARY_DTO]);
      mockGetCcConnectSession.mockResolvedValue(SESSION_DETAIL_DTO);
      mockListCcConnectProviders.mockResolvedValue(PROVIDERS_DTO);
      mockListCcConnectModels.mockResolvedValue(MODELS_DTO);
      mockGetCcConnectHeartbeat.mockResolvedValue(minimalHeartbeat);
      mockListCcConnectCronJobs.mockResolvedValue([]);

      await useCcConnectStore.getState().selectProject('agora-codex');

      const hb = useCcConnectStore.getState().heartbeatByProject['agora-codex'];
      expect(hb.onlyWhenIdle).toBeNull();
      expect(hb.silent).toBeNull();
      expect(hb.runCount).toBeNull();
      expect(hb.lastRun).toBeNull();
    });

    it('maps cron job with null optional fields', async () => {
      wireSelectProjectMocks();
      const minimalCron = {
        id: 'cron-min',
        project: 'agora-codex',
        session_key: 'discord:thread:1',
        cron_expr: '@daily',
        prompt: 'ping',
        exec: null,
        work_dir: null,
        description: null,
        enabled: true,
        created_at: '2026-04-11T00:00:00.000Z',
      };
      mockGetCcConnectProject.mockResolvedValue(PROJECT_DETAIL_DTO);
      mockListCcConnectSessions.mockResolvedValue([SESSION_SUMMARY_DTO]);
      mockGetCcConnectSession.mockResolvedValue(SESSION_DETAIL_DTO);
      mockListCcConnectProviders.mockResolvedValue(PROVIDERS_DTO);
      mockListCcConnectModels.mockResolvedValue(MODELS_DTO);
      mockGetCcConnectHeartbeat.mockResolvedValue(HEARTBEAT_DTO);
      mockListCcConnectCronJobs.mockResolvedValue([minimalCron]);

      await useCcConnectStore.getState().selectProject('agora-codex');

      const jobs = useCcConnectStore.getState().cronJobsByProject['agora-codex'];
      expect(jobs[0].silent).toBeNull();
      expect(jobs[0].lastRun).toBeNull();
      expect(jobs[0].lastError).toBeNull();
    });
  });
});
