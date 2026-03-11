import dashboardCss from '../index.css?raw';
import controlGlassSource from '../components/ui/ControlGlass.tsx?raw';
import navigationCss from '../styles/navigation.css?raw';
import layoutCss from '../styles/layout.css?raw';
import tokenCss from '../styles/tokens.css?raw';
import topNavSource from '../components/layouts/TopNav.tsx?raw';
import pageTransitionSource from '../components/ui/PageTransition.tsx?raw';
import staggeredItemSource from '../components/ui/StaggeredItem.tsx?raw';
import dashboardHomeSource from '../pages/DashboardHome.tsx?raw';

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

  it('keeps workbench controls off runtime liquid glass rendering paths', () => {
    expect(controlGlassSource).not.toContain('liquid-glass-react');
    expect(controlGlassSource).not.toContain('<LiquidGlass');
  });

  it('keeps shell backdrop blur on a restrained budget', () => {
    expect(navigationCss).not.toContain('backdrop-filter: blur(18px)');
    expect(navigationCss).not.toContain('backdrop-filter: var(--sidebar-backdrop);');
    expect(tokenCss).not.toContain('--sidebar-backdrop: blur(24px)');
    expect(tokenCss).not.toContain('--sidebar-backdrop: blur(28px)');
  });

  it('avoids over-animating the topbar intelligence rail', () => {
    const animatedSignalMatches = topNavSource.match(/signal-pulse|flow-shift|signal-travel/g) ?? [];
    expect(animatedSignalMatches.length).toBeLessThanOrEqual(3);
    expect(layoutCss).not.toContain('animation-delay: 220ms;');
    expect(layoutCss).not.toContain('animation-delay: 440ms;');
  });

  it('does not re-render the full topbar on a sub-second timer', () => {
    expect(topNavSource).not.toContain('}, 120);');
  });

  it('keeps page and list entry motion on CSS paths instead of a heavy runtime animation library', () => {
    expect(pageTransitionSource).not.toContain("from 'motion/react'");
    expect(staggeredItemSource).not.toContain("from 'motion/react'");
  });

  it('avoids keeping a continuous scan animation on the homepage hero shell', () => {
    expect(dashboardHomeSource).not.toContain('className="home-os__hero signal-scan"');
  });
});
