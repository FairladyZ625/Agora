import path from 'node:path';
import { chromium } from 'playwright';
import {
  createAuditOutputDir,
  ensureServerReachable,
  isIgnorableRequestFailure,
  loginIfNeeded,
  resolveAuditConfig,
  sanitizePathForFile,
  writeJsonReport,
} from './audit-helpers.mjs';

const defaultBudget = {
  domContentLoadedMs: Number(process.env.DASHBOARD_PERF_BUDGET_DCL_MS ?? 2500),
  loadMs: Number(process.env.DASHBOARD_PERF_BUDGET_LOAD_MS ?? 5000),
  longTaskCount: Number(process.env.DASHBOARD_PERF_BUDGET_LONGTASKS ?? 2),
  requestFailures: Number(process.env.DASHBOARD_PERF_BUDGET_REQUEST_FAILURES ?? 0),
  pageErrors: Number(process.env.DASHBOARD_PERF_BUDGET_PAGE_ERRORS ?? 0),
};

async function collectPageSnapshot(context, page, route, outputDir, baseUrl) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  const pageErrors = [];
  const requestFailures = [];
  const handlePageError = (error) => {
    pageErrors.push(error.message);
  };
  const handleRequestFailed = (request) => {
    const errorText = request.failure()?.errorText ?? 'unknown';
    if (isIgnorableRequestFailure(request.url(), errorText)) {
      return;
    }
    requestFailures.push(`${request.method()} ${request.url()} :: ${errorText}`);
  };
  page.on('pageerror', handlePageError);
  page.on('requestfailed', handleRequestFailed);

  const tracePath = path.join(outputDir, `${sanitizePathForFile(route)}-trace.zip`);
  await context.tracing.start({ screenshots: true, snapshots: true });

  const startedAt = Date.now();
  await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const metrics = await cdp.send('Performance.getMetrics');
  const runtime = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const longTasks = window.__agoraLongTasks ?? [];
    const backdropFilterNodes = Array.from(document.querySelectorAll('*'))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return style.backdropFilter && style.backdropFilter !== 'none';
      }).length;

    return {
      title: document.title,
      path: window.location.pathname,
      domNodes: document.querySelectorAll('*').length,
      animatedSignals: document.querySelectorAll('.signal-pulse, .signal-scan, .flow-shift, .signal-travel').length,
      backdropFilterNodes,
      longTaskCount: longTasks.length,
      longestLongTaskMs: longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0),
      totalBlockingTimeMs: longTasks.reduce((sum, entry) => sum + Math.max(0, entry.duration - 50), 0),
      navigation: navigation ? {
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        responseEndMs: navigation.responseEnd,
        transferSize: navigation.transferSize,
      } : null,
      jsHeapSizeLimit: performance.memory?.jsHeapSizeLimit ?? null,
      usedJsHeapSize: performance.memory?.usedJSHeapSize ?? null,
      totalJsHeapSize: performance.memory?.totalJSHeapSize ?? null,
    };
  });

  await page.screenshot({
    path: path.join(outputDir, `${sanitizePathForFile(runtime.path)}-perf.png`),
    fullPage: true,
  });
  await context.tracing.stop({ path: tracePath });

  page.off('pageerror', handlePageError);
  page.off('requestfailed', handleRequestFailed);

  return {
    route,
    resolvedPath: runtime.path,
    runtime,
    cdpMetrics: metrics.metrics,
    pageErrors,
    requestFailures,
    durationMs: Date.now() - startedAt,
  };
}

function evaluateBudget(result) {
  const navigation = result.runtime.navigation;
  const failures = [];

  if (navigation?.domContentLoadedMs && navigation.domContentLoadedMs > defaultBudget.domContentLoadedMs) {
    failures.push(`domContentLoaded ${navigation.domContentLoadedMs.toFixed(0)}ms > ${defaultBudget.domContentLoadedMs}ms`);
  }
  if (navigation?.loadMs && navigation.loadMs > defaultBudget.loadMs) {
    failures.push(`load ${navigation.loadMs.toFixed(0)}ms > ${defaultBudget.loadMs}ms`);
  }
  if (result.runtime.longTaskCount > defaultBudget.longTaskCount) {
    failures.push(`long tasks ${result.runtime.longTaskCount} > ${defaultBudget.longTaskCount}`);
  }
  if (result.requestFailures.length > defaultBudget.requestFailures) {
    failures.push(`request failures ${result.requestFailures.length} > ${defaultBudget.requestFailures}`);
  }
  if (result.pageErrors.length > defaultBudget.pageErrors) {
    failures.push(`page errors ${result.pageErrors.length} > ${defaultBudget.pageErrors}`);
  }

  return failures;
}

async function run() {
  const config = resolveAuditConfig();
  await ensureServerReachable(config.entryUrl);
  const outputDir = createAuditOutputDir('perf');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__agoraLongTasks = [];
    const observer = new PerformanceObserver((list) => {
      window.__agoraLongTasks.push(
        ...list.getEntries().map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
        })),
      );
    });
    observer.observe({ entryTypes: ['longtask'] });
  });
  await page.route('**/*', async (routeHandler) => {
    await routeHandler.continue();
  });

  await loginIfNeeded(page, config);

  const targets = config.pages;
  const results = [];
  for (const route of targets) {
     const snapshot = await collectPageSnapshot(context, page, route, outputDir, config.baseUrl);
    results.push({
      ...snapshot,
      budgetFailures: evaluateBudget(snapshot),
    });
  }

  await browser.close();

  const reportPath = path.join(outputDir, 'perf-report.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    authenticated: config.authenticated,
    budgets: defaultBudget,
    results,
  };
  await writeJsonReport(reportPath, payload);

  const failures = results.flatMap((result) => result.budgetFailures.map((message) => `${result.resolvedPath}: ${message}`));
  console.log(`Performance audit report written to ${reportPath}`);
  if (!config.authenticated) {
    console.log('Protected pages were skipped because AGORA_DASHBOARD_LOGIN_USER / AGORA_DASHBOARD_LOGIN_PASSWORD were not provided.');
  }
  if (failures.length > 0) {
    console.error('Performance budget failures:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
