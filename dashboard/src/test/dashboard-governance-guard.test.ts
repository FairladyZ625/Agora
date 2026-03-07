import tasksPageSource from '../pages/TasksPage.tsx?raw';
import reviewsPageSource from '../pages/ReviewsPage.tsx?raw';
import homePageSource from '../pages/DashboardHome.tsx?raw';
import settingsPageSource from '../pages/SettingsPage.tsx?raw';
import topNavSource from '../components/layouts/TopNav.tsx?raw';
import sidebarSource from '../components/layouts/Sidebar.tsx?raw';
import controlGlassSource from '../components/ui/ControlGlass.tsx?raw';
import governanceScriptSource from '../../scripts/check-visual-governance.mjs?raw';

const arbitraryTailwindPattern =
  /\b(?:text|tracking|grid-cols|bg|border|rounded|h|w|min-w|max-w|px|py|pt|pb|pl|pr|mt|mb|ml|mr)-\[[^\]]+\]/;

describe('dashboard governance guardrails', () => {
  it('removes Tailwind arbitrary values from page and layout sources', () => {
    const sources = [
      tasksPageSource,
      reviewsPageSource,
      homePageSource,
      settingsPageSource,
      topNavSource,
      sidebarSource,
    ];

    for (const source of sources) {
      expect(source).not.toMatch(arbitraryTailwindPattern);
    }
  });

  it('does not allow ControlGlass to accept free-form size props', () => {
    expect(controlGlassSource).not.toContain('cornerRadius?: number');
    expect(controlGlassSource).not.toContain('padding?: string');
    expect(controlGlassSource).toContain("radius?: keyof typeof radiusMap");
    expect(controlGlassSource).toContain("density?: keyof typeof densityPaddingMap");
  });

  it('extends the governance script beyond raw color checks', () => {
    expect(governanceScriptSource).toMatch(/arbitrary/i);
    expect(governanceScriptSource).toMatch(/padding|margin|gap|width|height|border-radius|font-size/);
  });

  it('guards against scattered product copy outside locale resources', () => {
    expect(governanceScriptSource).toMatch(/hardcoded|copy|locale/i);
    expect(governanceScriptSource).toMatch(/locales/);
    expect(governanceScriptSource).toMatch(/mockDashboard/);
  });
});
