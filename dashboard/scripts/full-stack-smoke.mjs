import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.AGORA_DASHBOARD_SMOKE_URL ?? 'http://127.0.0.1:4191/dashboard';
const username = process.env.AGORA_DASHBOARD_SMOKE_USERNAME ?? 'admin';
const password = process.env.AGORA_DASHBOARD_SMOKE_PASSWORD ?? 'lzy990625';
const outDir = process.env.AGORA_DASHBOARD_SMOKE_OUT_DIR ?? '/tmp/agora-dashboard-2-1-full-stack-smoke';
const smokeProjectId = process.env.AGORA_DASHBOARD_SMOKE_PROJECT_ID ?? 'proj-agora';

const pages = [
  {
    name: 'home',
    path: '/',
    readySelector: '.home-mgo__grid, .dashboard-home',
    interactions: async (page) => {
      const firstProject = page.locator('.home-mgo__project-card button').first();
      if (await firstProject.count()) {
        await firstProject.click();
      }
    },
  },
  {
    name: 'projects',
    path: '/projects',
    readySelector: '.projects-mgo__layout',
    interactions: async (page) => {
      const search = page.locator('input[aria-label="Search Projects"]').first();
      await search.fill('agora');
      await page.waitForTimeout(250);
      await search.fill('');
      const reviewQueue = page.getByRole('button', { name: /Review Queue/i }).first();
      if (await reviewQueue.count()) {
        await reviewQueue.click();
      }
      const allProjects = page.getByRole('button', { name: /All Projects/i }).first();
      if (await allProjects.count()) {
        await allProjects.click();
      }
      await page.waitForFunction(() => {
        const panel = document.querySelector('[data-testid="projects-list-panel"]');
        return Boolean(panel) && !(panel.textContent ?? '').includes('Task signals loading');
      }, null, { timeout: 15000 });
    },
  },
  {
    name: 'project-overview',
    path: `/projects/${smokeProjectId}`,
    readySelector: '.project-workspace-mgo__overview-grid',
    layoutSelectors: [
      '.project-workspace-shell',
      '.project-workspace-mgo__hero',
      '.project-workspace-mgo__overview-grid',
      '.project-workspace-mgo__bottom',
      '.project-workspace-mgo__legacy-work',
      '[data-testid="project-current-work-panel"]',
    ],
    requiredApi: [
      new RegExp(`/api/projects/${smokeProjectId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`),
      new RegExp(`/api/projects/${smokeProjectId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/members`),
      new RegExp(`/api/projects/${smokeProjectId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/runtime-policy`),
    ],
    interactions: async (page) => {
      await page.waitForSelector('[data-testid="project-overview-panel"]', { timeout: 15000 });
      await page.waitForFunction((projectId) => {
        const text = document.body.textContent ?? '';
        return text.includes('Runtime Truth') && text.includes('Project Signal Composition') && text.includes(projectId);
      }, smokeProjectId, { timeout: 15000 });
      const activeFilter = page.getByRole('button', { name: /Active Tasks/i }).first();
      if (await activeFilter.count()) {
        await activeFilter.click();
      }
      const allFilter = page.getByRole('button', { name: /All Tasks/i }).first();
      if (await allFilter.count()) {
        await allFilter.click();
      }
      await page.waitForFunction(() => {
        const panel = document.querySelector('.project-workspace-mgo__overview-grid');
        return Boolean(panel) && !(panel.textContent ?? '').includes('Loading project');
      }, null, { timeout: 15000 });
    },
  },
  {
    name: 'current-work',
    path: `/projects/${smokeProjectId}/work`,
    readySelector: '.current-work-mgo__layout',
    layoutSelectors: [
      '.project-workspace-shell',
      '.current-work-mgo__command',
      '.current-work-mgo__tabs',
      '.current-work-mgo__layout',
      '.current-work-mgo__center',
      '.current-work-mgo__execution-console',
    ],
    requiredApi: [
      new RegExp(`/api/projects/${smokeProjectId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`),
      /\/api\/tasks\/[^/]+$/u,
      /\/api\/tasks\/[^/]+\/status$/u,
      /\/api\/tasks\/[^/]+\/conversation$/u,
      /\/api\/tasks\/[^/]+\/conversation\/summary$/u,
      /\/api\/craftsmen\/governance$/u,
      /\/api\/craftsmen\/tasks\/[^/]+\/subtasks\/[^/]+\/executions$/u,
      /\/api\/craftsmen\/executions\/[^/]+\/tail$/u,
    ],
    clippedDescendantSelectors: ['.workflow-graph-view'],
    interactions: async (page) => {
      await page.waitForFunction((projectId) => {
        const text = document.body.textContent ?? '';
        return text.includes('Current Work / Execution Workbench') && text.includes('Runtime Truth') && text.includes(projectId);
      }, smokeProjectId, { timeout: 15000 });
      const firstRelated = page.locator('.current-work-mgo__related-row').first();
      if (await firstRelated.count()) {
        await firstRelated.click();
        await page.waitForSelector('.current-work-mgo__layout', { timeout: 15000 });
      }
      const viewport = page.viewportSize();
      if (viewport && viewport.width <= 860) {
        const commandColumns = await page.locator('.current-work-mgo__command').evaluate((node) => (
          getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/u).filter(Boolean).length
        ));
        if (commandColumns !== 1) {
          throw new Error(`current-work mobile command expected one column, received ${commandColumns}`);
        }
      }
      const workspaceTabs = page.locator('.project-workspace-tab');
      if (await workspaceTabs.count() < 6) {
        throw new Error('project workspace shell navigation is incomplete');
      }
    },
  },
  {
    name: 'reviews',
    path: '/reviews',
    readySelector: '.reviews-mgo__layout',
    layoutSelectors: [
      '.reviews-mgo__masthead',
      '.reviews-mgo__layout',
      '.reviews-mgo__queue',
      '.reviews-mgo__decision',
      '.reviews-mgo__truth',
    ],
    requiredApi: [
      /\/api\/tasks(?:\?|$)/u,
      /\/api\/tasks\/[^/]+$/u,
      /\/api\/tasks\/[^/]+\/status$/u,
      /\/api\/tasks\/[^/]+\/conversation$/u,
      /\/api\/tasks\/[^/]+\/conversation\/summary$/u,
      /\/api\/tasks\/[^/]+\/conversation\/read$/u,
      /\/api\/craftsmen\/governance$/u,
      /\/api\/health\/snapshot$/u,
    ],
    interactions: async (page) => {
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? '';
        return text.includes('Reviews') && text.includes('Review queue');
      }, null, { timeout: 15000 });
      const assigned = page.getByRole('button', { name: /Assigned to me/i }).first();
      if (await assigned.count()) {
        await assigned.click();
        await page.waitForTimeout(150);
      }
      const allRows = page.locator('.reviews-mgo__queue-row');
      const rowCount = await allRows.count();
      if (rowCount === 0) {
        throw new Error('reviews smoke requires at least one live review row');
      }
      await allRows.first().click();
      const viewport = page.viewportSize();
      if (viewport && viewport.width <= 760) {
        await page.getByRole('dialog', { name: /Review details panel/i }).waitFor({ timeout: 15000 });
        await page.getByRole('button', { name: /^Close$/i }).click();
      }
      await page.waitForSelector('.reviews-mgo__decision', { timeout: 15000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('.reviews-mgo__decision')?.textContent ?? '';
        return text.includes('Review signal summary');
      }, null, { timeout: 15000 });
      const tabs = page.locator('.reviews-mgo__tabs button');
      if (await tabs.count() < 5) {
        throw new Error('reviews section navigation is incomplete');
      }
      if (viewport && viewport.width <= 760) {
        const compressedRows = await page.locator('.reviews-mgo__queue-row').evaluateAll((rows) => rows.filter((row) => {
          const main = row.firstElementChild;
          if (!main) {
            return true;
          }
          const rect = main.getBoundingClientRect();
          return rect.width < Math.min(260, window.innerWidth - 96);
        }).length);
        if (compressedRows > 0) {
          throw new Error(`reviews mobile queue has ${compressedRows} compressed row(s)`);
        }
      }
    },
  },
  {
    name: 'participants',
    path: '/participants',
    readySelector: '.participants-mgo__workspace',
    layoutSelectors: [
      '.participants-mgo__masthead',
      '.participants-mgo__workspace',
      '.participants-mgo__inventory',
      '.participants-mgo__map',
      '.participants-mgo__truth',
      '.participants-mgo__bottom',
    ],
    overlapSelectors: [
      '.participants-mgo__node',
      '.participants-mgo__hub',
    ],
    requiredApi: [
      /\/api\/agents\/status$/u,
    ],
    interactions: async (page) => {
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? '';
        return text.includes('Participants') && text.includes('PARTICIPATION MAP') && text.includes('RUNTIME TRUTH');
      }, null, { timeout: 15000 });
      const search = page.locator('input[aria-label="Search participants"]').first();
      if (await search.count()) {
        await search.fill('codex');
        await page.waitForTimeout(150);
        await search.fill('');
      }
      const rows = page.locator('.participants-mgo__row');
      if (await rows.count() === 0) {
        throw new Error('participants smoke requires live participant inventory rows');
      }
      const selectedRowIndex = await rows.count() > 1 ? 1 : 0;
      await rows.nth(selectedRowIndex).click();
      await page.waitForFunction((index) => {
        const row = document.querySelectorAll('.participants-mgo__row').item(index);
        return Boolean(row?.classList.contains('participants-mgo__row--active'));
      }, selectedRowIndex, { timeout: 15000 });
      const channels = page.getByRole('button', { name: /Channel participation/i }).first();
      if (await channels.count()) {
        await channels.click();
        await page.getByRole('dialog', { name: /Channel participation detail workspace/i }).waitFor({ timeout: 15000 });
        await page.getByRole('button', { name: /^Close$/i }).click();
      }
      const runtime = page.getByRole('button', { name: /Runtime sessions/i }).first();
      if (await runtime.count()) {
        await runtime.click();
        await page.getByRole('dialog', { name: /Runtime session detail workspace/i }).waitFor({ timeout: 15000 });
        await page.getByRole('button', { name: /^Close$/i }).click();
      }
    },
  },
  {
    name: 'system',
    path: '/system',
    readySelector: '.system-mgo__layout',
    layoutSelectors: [
      '.system-mgo__masthead',
      '.system-mgo__tabs',
      '.system-mgo__layout',
      '.system-mgo__precedence',
      '.system-mgo__cards',
      '.system-mgo__rail',
      '.system-mgo__capability',
      '.system-mgo__footer',
    ],
    requiredApi: [
      /\/api\/runtime-targets$/u,
      /\/api\/external-bridges\/cc-connect\/bridges$/u,
      /\/api\/templates$/u,
      /\/api\/agents\/status$/u,
      /\/api\/health\/snapshot$/u,
    ],
    interactions: async (page) => {
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? '';
        return text.includes('System capabilities') && text.includes('Dispatch precedence') && text.includes('System health');
      }, null, { timeout: 15000 });
      const tabs = page.locator('.system-mgo__tabs a');
      if (await tabs.count() < 7) {
        throw new Error('system surface navigation is incomplete');
      }
      const targetRows = page.locator('.system-mgo__target-row');
      if (await targetRows.count() === 0) {
        throw new Error('system smoke requires live runtime / bridge / policy rows');
      }
      await page.locator('.system-mgo__tabs a[href="#audit-trace"]').click();
      await page.waitForTimeout(150);
      await page.locator('.system-mgo__tabs a[href="#system-overview"]').click();
    },
  },
  {
    name: 'settings',
    path: '/settings',
    readySelector: '.settings-mgo__layout',
    layoutSelectors: [
      '.settings-mgo__masthead',
      '.settings-mgo__tabs',
      '.settings-mgo__layout',
      '.settings-mgo__main',
      '.settings-mgo__rail',
      '[data-testid="settings-gateway-panel"]',
      '[data-testid="settings-sync-panel"]',
      '[data-testid="settings-appearance-panel"]',
      '[data-testid="settings-language-panel"]',
    ],
    requiredApi: [
      /\/api\/dashboard\/users$/u,
      /\/api\/health$/u,
    ],
    interactions: async (page) => {
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? '';
        return text.includes('Settings') && text.includes('Workspace defaults') && text.includes('Account and environment');
      }, null, { timeout: 15000 });
      await page.getByRole('button', { name: /Test connection/i }).first().click();
      await page.waitForFunction(() => {
        const text = document.body.textContent ?? '';
        return text.includes('Agora Core is reachable') || text.includes('Connection failed');
      }, null, { timeout: 15000 });
      await page.locator('.settings-mgo__tabs a[href="#api"]').click();
      await page.waitForTimeout(150);
      const cadence = page.getByRole('button', { name: /^10s$/i }).first();
      if (await cadence.count()) {
        await cadence.click();
      }
    },
  },
];

const viewports = [
  { name: 'desktop', width: 1512, height: 982 },
  { name: 'intermediate', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function pageUrl(path) {
  const normalizedBase = baseUrl.replace(/\/+$/u, '');
  return `${normalizedBase}${path}`;
}

async function ensureLogin(page) {
  await page.goto(pageUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 }),
    page.locator('[data-testid="login-card"] button[type="submit"]').click(),
  ]);
}

async function assertLoginViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(pageUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="login-card"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="login-context-field"]', { timeout: 15000 });
  await page.locator('.login-shell__theme-button').click();
  await page.waitForTimeout(150);
  const issueCount = await countPageOverflowIssues(page);
  await page.screenshot({ path: `${outDir}/login-${viewport.name}.png`, fullPage: true });
  console.log(`login/${viewport.name}: rendered, overflow-like issues=${issueCount}`);
  if (issueCount > 0) {
    const details = await describeLayoutIssues(page, ['.login-shell', '[data-testid="login-card"]']);
    console.error(JSON.stringify(details, null, 2));
    throw new Error(`login/${viewport.name} has ${issueCount} overflow-like issue(s)`);
  }
}

async function assertNoVisibleApiError(page, pageName) {
  const alertTexts = await page.locator('.inline-alert, [role="alert"]').evaluateAll((nodes) => (
    nodes
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean)
  ));
  const blockingAlerts = alertTexts.filter((text) => (
    /invalid input|missing bearer token|unauthorized|failed to fetch|apierror|zod|expected|required/i.test(text)
  ));
  if (blockingAlerts.length > 0) {
    throw new Error(`${pageName} rendered blocking alert(s): ${blockingAlerts.join(' | ')}`);
  }
}

async function countLayoutIssues(page, selector) {
  return page.evaluate((rootSelector) => {
    const nodes = [...document.querySelectorAll(rootSelector)];
    return nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width <= 0 || rect.height <= 0 || rect.right > window.innerWidth + 2;
    }).length;
  }, selector);
}

async function countPageOverflowIssues(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const horizontalOverflow = Math.max(root.scrollWidth, body.scrollWidth) > window.innerWidth + 2;
    const brokenNodes = [...document.querySelectorAll('main, section, article, aside, nav, [data-testid]')].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width <= 0 || rect.height <= 0 || rect.left < -2 || rect.right > window.innerWidth + 2;
    }).length;
    return (horizontalOverflow ? 1 : 0) + brokenNodes;
  });
}

async function countClippedDescendantIssues(page, selector) {
  return page.evaluate((rootSelector) => {
    const roots = [...document.querySelectorAll(rootSelector)];
    return roots.reduce((total, root) => {
      const rootRect = root.getBoundingClientRect();
      const clipped = [...root.querySelectorAll('svg, [class*="__node"], [class*="__edge"], [class*="__canvas"], .template-graph-edge__label')].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && (
            rect.left < rootRect.left - 2
            || rect.right > rootRect.right + 2
            || rect.top < rootRect.top - 2
            || rect.bottom > rootRect.bottom + 2
          );
      }).length;
      return total + clipped;
    }, 0);
  }, selector);
}

async function countOverlapIssues(page, selectors) {
  return page.evaluate((targetSelectors) => {
    const nodes = targetSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const rects = nodes
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    let count = 0;
    for (let left = 0; left < rects.length; left += 1) {
      for (let right = left + 1; right < rects.length; right += 1) {
        const a = rects[left];
        const b = rects[right];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 6 && overlapY > 6) {
          count += 1;
        }
      }
    }
    return count;
  }, selectors);
}

async function describeLayoutIssues(page, selectors, clippedSelectors = [], overlapSelectors = []) {
  return page.evaluate(({ targetSelectors, clippedSelectors, overlapSelectors }) => {
    const describe = (node, source) => {
      const rect = node.getBoundingClientRect();
      return {
        source,
        tag: node.tagName,
        className: typeof node.className === 'string' ? node.className : '',
        testId: node.getAttribute('data-testid'),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const pageNodes = [...document.querySelectorAll('main, section, article, aside, nav, [data-testid]')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width <= 0 || rect.height <= 0 || rect.left < -2 || rect.right > window.innerWidth + 2;
      })
      .map((node) => describe(node, 'page'));
    const selectorNodes = targetSelectors.flatMap((selector) => (
      [...document.querySelectorAll(selector)]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width <= 0 || rect.height <= 0 || rect.right > window.innerWidth + 2;
        })
        .map((node) => describe(node, selector))
    ));
    const clippedNodes = clippedSelectors.flatMap((selector) => (
      [...document.querySelectorAll(selector)].flatMap((root) => {
        const rootRect = root.getBoundingClientRect();
        return [...root.querySelectorAll('svg, [class*="__node"], [class*="__edge"], [class*="__canvas"], .template-graph-edge__label')]
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0
              && rect.height > 0
              && (
                rect.left < rootRect.left - 2
                || rect.right > rootRect.right + 2
                || rect.top < rootRect.top - 2
                || rect.bottom > rootRect.bottom + 2
              );
          })
          .map((node) => describe(node, `clipped:${selector}`));
      })
    ));
    const overlapNodes = overlapSelectors.flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .flatMap((entry, index, entries) => entries.slice(index + 1)
        .filter((candidate) => {
          const overlapX = Math.min(entry.rect.right, candidate.rect.right) - Math.max(entry.rect.left, candidate.rect.left);
          const overlapY = Math.min(entry.rect.bottom, candidate.rect.bottom) - Math.max(entry.rect.top, candidate.rect.top);
          return overlapX > 6 && overlapY > 6;
        })
        .map((candidate) => ({
          source: 'overlap',
          left: `${Math.round(entry.rect.left)},${Math.round(candidate.rect.left)}`,
          right: `${Math.round(entry.rect.right)},${Math.round(candidate.rect.right)}`,
          width: `${Math.round(entry.rect.width)},${Math.round(candidate.rect.width)}`,
          height: `${Math.round(entry.rect.height)},${Math.round(candidate.rect.height)}`,
          className: `${typeof entry.node.className === 'string' ? entry.node.className : ''} <> ${typeof candidate.node.className === 'string' ? candidate.node.className : ''}`,
          tag: `${entry.node.tagName} <> ${candidate.node.tagName}`,
          testId: null,
        })));
    return {
      viewportWidth: window.innerWidth,
      scrollX: window.scrollX,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      issues: [...pageNodes, ...selectorNodes, ...clippedNodes, ...overlapNodes],
    };
  }, { targetSelectors: selectors, clippedSelectors, overlapSelectors });
}

async function countAllLayoutIssues(page, target) {
  const selectors = target.layoutSelectors ?? [target.readySelector];
  let issueCount = await countPageOverflowIssues(page);
  for (const selector of selectors) {
    issueCount += await countLayoutIssues(page, selector);
  }
  for (const selector of target.clippedDescendantSelectors ?? []) {
    issueCount += await countClippedDescendantIssues(page, selector);
  }
  if (target.overlapSelectors) {
    issueCount += await countOverlapIssues(page, target.overlapSelectors);
  }
  return issueCount;
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const apiFailures = [];
const consoleFailures = [];
const apiHits = [];
const page = await context.newPage();

page.on('response', (response) => {
  const url = response.url();
  if (!url.includes('/api/')) {
    return;
  }
  const status = response.status();
  if (status >= 400) {
    apiFailures.push(`${status} ${url}`);
  }
  apiHits.push(url);
});

page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('/api/')) {
    return;
  }
  apiFailures.push(`request failed ${request.failure()?.errorText ?? 'unknown'} ${url}`);
});

page.on('console', (message) => {
  if (message.type() === 'error') {
    const text = message.text();
    if (/^Failed to load resource:/iu.test(text)) {
      return;
    }
    consoleFailures.push(text);
  }
});

page.on('pageerror', (error) => {
  consoleFailures.push(error.message);
});

await page.addInitScript(() => {
  window.localStorage.setItem('agora-theme', JSON.stringify({ state: { mode: 'dark', resolved: 'dark' }, version: 0 }));
  window.localStorage.setItem('i18nextLng', 'en-US');
});

for (const viewport of viewports) {
  await assertLoginViewport(page, viewport);
}

await ensureLogin(page);

for (const viewport of viewports) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  for (const target of pages) {
    const beforeFailures = apiFailures.length;
    const beforeApiHits = apiHits.length;
    await page.goto(pageUrl(target.path), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(target.readySelector, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await target.interactions(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop = 0;
        document.scrollingElement.scrollLeft = 0;
      }
      document.querySelectorAll('html, body, main, .app-shell, .app-shell__main, .app-frame, .app-frame--page, [class*="mgo"], [class*="scroll"]').forEach((node) => {
        if (node instanceof HTMLElement) {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        }
      });
    });
    await assertNoVisibleApiError(page, target.name);
    const selectors = target.layoutSelectors ?? [target.readySelector];
    let issueCount = await countAllLayoutIssues(page, target);
    const pageApiHits = apiHits.slice(beforeApiHits);
    const missingApis = (target.requiredApi ?? []).filter((pattern) => !pageApiHits.some((url) => pattern.test(new URL(url).pathname)));
    await page.screenshot({ path: `${outDir}/${target.name}-${viewport.name}.png`, fullPage: true });
    const newFailures = apiFailures.slice(beforeFailures);
    if (missingApis.length > 0) {
      throw new Error(`${target.name}/${viewport.name} did not hit required API pattern(s): ${missingApis.map((pattern) => pattern.source).join(', ')}`);
    }
    if (issueCount > 0) {
      let details = await describeLayoutIssues(page, selectors, target.clippedDescendantSelectors ?? [], target.overlapSelectors ?? []);
      if (details.issues.length === 0) {
        await page.waitForTimeout(350);
        issueCount = await countAllLayoutIssues(page, target);
        details = await describeLayoutIssues(page, selectors, target.clippedDescendantSelectors ?? [], target.overlapSelectors ?? []);
      }
      if (issueCount > 0) {
        console.error(JSON.stringify(details, null, 2));
        throw new Error(`${target.name}/${viewport.name} has ${issueCount} overflow-like issue(s)`);
      }
    }
    console.log(`${target.name}/${viewport.name}: rendered, overflow-like issues=${issueCount}, apiFailures=${newFailures.length}, requiredApiMissing=${missingApis.length}`);
  }
}

await browser.close();

if (apiFailures.length > 0) {
  throw new Error(`API failures during full-stack smoke:\n${apiFailures.join('\n')}`);
}

if (consoleFailures.length > 0) {
  throw new Error(`Browser console/page errors during full-stack smoke:\n${consoleFailures.join('\n')}`);
}

console.log(`full-stack smoke completed: ${pages.length} pages x ${viewports.length} viewports`);
