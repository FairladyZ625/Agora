import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '@/components/layouts/TopNav';

const taskStoreState = {
  tasks: [
    { id: 'OC-001', state: 'in_progress' },
    { id: 'OC-002', state: 'gate_waiting' },
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

describe('dashboard topbar particle rail', () => {
  beforeEach(() => {
    taskStoreState.fetchTasks.mockClear();
    sessionState.logout.mockClear();
    feedbackState.showMessage.mockClear();
    themeState.setMode.mockClear();
    motionState.setMode.mockClear();
  });

  it('renders a non-layout ambient particle background for the desktop topbar', () => {
    render(
      <MemoryRouter>
        <TopNav isMobile={false} onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    const particleLayer = screen.getByTestId('topbar-intelligence-bar');
    expect(particleLayer).toHaveClass('topbar-intelligence');
    expect(particleLayer).toHaveClass('topbar-intelligence--bar');
    expect(particleLayer).toHaveClass('topbar-intelligence--ambient');
    expect(
      particleLayer.querySelector('.topbar-intelligence__ornaments'),
    ).toBeNull();
    expect(
      particleLayer.querySelector('.topbar-intelligence__carrier'),
    ).toBeNull();
    expect(
      particleLayer.querySelectorAll('.topbar-intelligence__dot'),
    ).toHaveLength(0);
    expect(
      particleLayer.querySelectorAll('.topbar-intelligence__rail'),
    ).toHaveLength(0);
    expect(screen.getByRole('navigation', { name: 'Global navigation' })).toBeInTheDocument();
  });

  it('keeps the six desktop topbar destinations reachable and maps system routes active', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/bridges']}>
        <TopNav isMobile={false} onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/projects', '/reviews', '/participants', '/system', '/settings']);
    expect(screen.getByRole('link', { name: /系统|System/i })).toHaveClass('topbar-nav__link--active');

    unmount();

    render(
      <MemoryRouter initialEntries={['/templates/flow_editor/graph']}>
        <TopNav isMobile={false} onOpenMobileNav={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /系统|System/i })).toHaveClass('topbar-nav__link--active');
  });
});
