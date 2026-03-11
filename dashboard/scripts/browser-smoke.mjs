import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import {
  createAuditOutputDir,
  ensureServerReachable,
  isIgnorableRequestFailure,
  loginIfNeeded,
  resolveAuditConfig,
  sanitizePathForFile,
  writeJsonReport,
} from './audit-helpers.mjs';

const browserEntries = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];
const unauthenticatedFallbackRoute = '/dashboard/login';

async function run() {
  const config = resolveAuditConfig();
  await ensureServerReachable(config.entryUrl);
  const outputDir = createAuditOutputDir('compat');
  const results = [];

  for (const [browserName, browserType] of browserEntries) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const pageErrors = [];
    const requestFailures = [];
    const consoleErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('requestfailed', (request) => {
      const errorText = request.failure()?.errorText ?? 'unknown';
      if (isIgnorableRequestFailure(request.url(), errorText)) {
        return;
      }
      requestFailures.push(`${request.method()} ${request.url()} :: ${errorText}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    const loggedIn = await loginIfNeeded(page, config);

    for (const route of config.pages) {
      const url = new URL(route, config.baseUrl).toString();
      const startedAt = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const currentPath = new URL(page.url()).pathname;
      const screenshotPath = path.join(outputDir, `${browserName}-${sanitizePathForFile(currentPath)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      results.push({
        browser: browserName,
        targetPath: route,
        resolvedPath: currentPath,
        title: await page.title(),
        durationMs: Date.now() - startedAt,
        pageErrors: [...pageErrors],
        requestFailures: [...requestFailures],
        consoleErrors: [...consoleErrors],
        loggedIn,
        screenshotPath,
      });

      pageErrors.length = 0;
      requestFailures.length = 0;
      consoleErrors.length = 0;
    }

    await browser.close();
  }

  const reportPath = path.join(outputDir, 'compat-report.json');
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    authenticated: config.authenticated,
    pages: config.pages,
    results,
  };

  await writeJsonReport(reportPath, summary);
  await writeFile(path.join(outputDir, 'README.txt'), `Compatibility audit report: ${reportPath}\n`, 'utf8');

  const failures = results.filter((result) => (
    result.pageErrors.length > 0
    || result.requestFailures.length > 0
  ));

  console.log(`Compatibility audit report written to ${reportPath}`);
  if (!config.authenticated) {
    console.log(`Protected pages were skipped because DASHBOARD_LOGIN_USER / DASHBOARD_LOGIN_PASSWORD were not provided. Baseline route: ${unauthenticatedFallbackRoute}.`);
  }
  if (failures.length > 0) {
    console.error(`Compatibility audit found ${failures.length} failing page loads.`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
