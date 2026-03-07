import dashboardCss from '../index.css?raw';

describe('dashboard performance guardrails', () => {
  it('removes continuous decorative animations from the main dashboard stylesheet', () => {
    expect(dashboardCss).not.toContain('animation: ambient-flow');
    expect(dashboardCss).not.toContain('animation: sigil-flow');
    expect(dashboardCss).not.toContain('animation: sigil-core');
    expect(dashboardCss).not.toContain('filter: blur(12px)');
  });

  it('keeps primary workbench surfaces off heavy backdrop blur paths', () => {
    expect(dashboardCss).not.toMatch(/\.surface-panel\s*\{[^}]*backdrop-filter:/);
    expect(dashboardCss).not.toMatch(/\.filter-popover\s*\{[^}]*backdrop-filter:/);
    expect(dashboardCss).not.toMatch(/\.workbench-sheet__panel\s*\{[^}]*backdrop-filter:/);
  });
});
