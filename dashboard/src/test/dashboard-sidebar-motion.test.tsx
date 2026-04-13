import { MemoryRouter } from 'react-router';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layouts/Sidebar';

describe('dashboard sidebar motion shell', () => {
  it('renders a telemetry seam and active-node cue for the desktop sidebar', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/projects']}>
        <Sidebar
          collapsed={false}
          onToggle={vi.fn()}
          mobileOpen={false}
          onCloseMobile={vi.fn()}
          isMobile={false}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('.sidebar-telemetry-seam')).toBeTruthy();
    expect(container.querySelector('.nav-link--active .nav-link__pulse')).toBeTruthy();
  });

  it('does not keep the tasks nav item active on the create-task route', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/tasks/new']}>
        <Sidebar
          collapsed={false}
          onToggle={vi.fn()}
          mobileOpen={false}
          onCloseMobile={vi.fn()}
          isMobile={false}
        />
      </MemoryRouter>,
    );

    const activeItems = Array.from(container.querySelectorAll('.nav-link--active'));
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]?.getAttribute('href')).toBe('/tasks/new');
  });
});
