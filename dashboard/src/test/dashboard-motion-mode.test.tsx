import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '@/components/layouts/TopNav';

const taskStoreState = {
  tasks: [
    {
      id: 'OC-001',
      state: 'in_progress',
    },
    {
      id: 'OC-002',
      state: 'gate_waiting',
    },
  ],
  loading: false,
  error: null,
  fetchTasks: vi.fn(async () => 'live'),
};

const sessionState = {
  username: 'lizeyu',
  role: 'admin' as const,
  logout: vi.fn(async () => undefined),
};

const feedbackState = {
  showMessage: vi.fn(),
};

const themeState = {
  mode: 'system' as const,
  resolved: 'light' as const,
  setMode: vi.fn(),
};

const motionState = {
  mode: 'full' as const,
  setMode: vi.fn(),
};

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector?: (state: typeof taskStoreState) => unknown) =>
    selector ? selector(taskStoreState) : taskStoreState,
}));

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector?: (state: typeof sessionState) => unknown) => (
    selector ? selector(sessionState) : sessionState
  ),
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => feedbackState,
}));

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => themeState,
}));

vi.mock('@/stores/motionStore', () => ({
  useMotionStore: (selector?: (state: typeof motionState) => unknown) => (
    selector ? selector(motionState) : motionState
  ),
}));

const indexHtmlSource = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const motionCssSource = fs.readFileSync(path.resolve(__dirname, '../styles/motion.css'), 'utf8');
const tokenCssSource = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf8');

describe('dashboard motion mode controls', () => {
  beforeEach(() => {
    motionState.mode = 'full';
    motionState.setMode.mockReset();
    feedbackState.showMessage.mockReset();
  });

  it('renders a topbar control that switches from full motion to lite motion', () => {
    render(
      <MemoryRouter>
        <TopNav isMobile={false} onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    const toggleButton = screen.getByRole('button', { name: '切换到轻量动效' });
    fireEvent.click(toggleButton);

    expect(motionState.setMode).toHaveBeenCalledWith('lite');
    expect(feedbackState.showMessage).toHaveBeenCalledWith(
      '动效模式已切换',
      '当前已切换到轻量动效。',
      'info',
    );
  });

  it('hydrates the motion preference before React mounts', () => {
    expect(indexHtmlSource).toContain('agora-motion');
    expect(indexHtmlSource).toContain('document.documentElement.dataset.motion');
  });

  it('defines a lite motion profile that slows or pauses looping signals', () => {
    expect(tokenCssSource).toContain("[data-motion='lite']");
    expect(tokenCssSource).toContain('--motion-loop-play-state');
    expect(motionCssSource).toContain('animation-play-state: var(--motion-loop-play-state);');
  });
});
