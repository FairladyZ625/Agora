import '@/lib/i18n';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalBridgesPage } from '@/pages/ExternalBridgesPage';

const fetchSnapshot = vi.fn(async () => 'live');
const selectProject = vi.fn(async () => undefined);
const selectSession = vi.fn(async () => undefined);
const sendMessage = vi.fn(async () => 'live');
const createNamedSession = vi.fn(async () => 'live');
const switchActiveSession = vi.fn(async () => 'live');
const deleteSelectedSession = vi.fn(async () => 'live');
const showMessage = vi.fn();

const storeState = {
  inspection: {
    binary: {
      command: 'cc-connect',
      found: true,
      resolvedPath: '/opt/homebrew/bin/cc-connect',
      version: 'v1.2.2',
      reason: null,
      error: null,
    },
    config: {
      path: '/Users/lizeyu/.cc-connect/config.toml',
      exists: true,
      managementEnabled: true,
      managementPort: 9820,
      tokenPresent: true,
    },
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
  },
  statusProjects: [
    {
      name: 'agora-codex',
      agentType: 'codex',
      platforms: ['discord'],
      sessionsCount: 2,
      heartbeatEnabled: true,
    },
  ],
  projects: [
    {
      name: 'agora-codex',
      agentType: 'codex',
      platforms: ['discord'],
      sessionsCount: 2,
      heartbeatEnabled: true,
    },
  ],
  bridges: [
    {
      platform: 'discord',
      project: 'agora-codex',
      capabilities: ['reply', 'thread'],
      connectedAt: '2026-04-10T00:00:00.000Z',
    },
  ],
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
    'agora-codex': [
      {
        id: 'session-1',
        sessionKey: 'discord:thread:1',
        name: 'Main Thread',
        platform: 'discord',
        agentType: 'codex',
        active: true,
        live: true,
        historyCount: 2,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:05:00.000Z',
        userName: 'FairladyZ',
        chatName: 'main',
        lastMessage: { role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' },
      },
    ],
  },
  selectedSessionIdByProject: {
    'agora-codex': 'session-1',
  },
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
        historyCount: 2,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:05:00.000Z',
        history: [
          { role: 'assistant', content: 'hello', timestamp: '2026-04-10T00:05:00.000Z' },
          { role: 'user', content: 'ping', timestamp: '2026-04-10T00:04:00.000Z' },
        ],
      },
    },
  },
  loading: false,
  detailLoading: false,
  sendLoading: false,
  sessionActionLoading: false,
  error: null,
  sendReceipt: null,
  fetchSnapshot,
  selectProject,
  selectSession,
  sendMessage,
  createNamedSession,
  switchActiveSession,
  deleteSelectedSession,
  clearError: vi.fn(),
};

vi.mock('@/stores/ccConnectStore', () => ({
  useCcConnectStore: (selector?: (state: typeof storeState) => unknown) => (selector ? selector(storeState) : storeState),
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

describe('cc-connect dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders bridge inspection, projects, sessions, and session history', () => {
    render(
      <MemoryRouter>
        <ExternalBridgesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /cc-connect Runtime Host/i })).toBeInTheDocument();
    expect(screen.getByText('/opt/homebrew/bin/cc-connect')).toBeInTheDocument();
    expect(screen.getAllByText(/agora-codex/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Main Thread/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/discord:thread:1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('hello').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /create named session|创建命名 session/i })).toBeInTheDocument();
    expect(fetchSnapshot).toHaveBeenCalled();
  });

  it('sends a controlled message to the selected live session', async () => {
    render(
      <MemoryRouter>
        <ExternalBridgesPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Send message/i), {
      target: { value: 'hello cc-connect' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /live session/i }));
    });

    expect(sendMessage).toHaveBeenCalledWith('hello cc-connect');
  });

  it('creates, switches, and deletes sessions from the control surface', async () => {
    render(
      <MemoryRouter>
        <ExternalBridgesPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/new session/i), {
      target: { value: 'work' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create named session|创建命名 session/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /switch as active session|切换为当前活跃 session/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete current session|删除当前 session/i }));
    });

    expect(createNamedSession).toHaveBeenCalledWith('work');
    expect(switchActiveSession).toHaveBeenCalledWith('session-1');
    expect(deleteSelectedSession).toHaveBeenCalled();
  });
});
