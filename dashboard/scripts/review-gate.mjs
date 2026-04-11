import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  createAuditOutputDir,
  ensureServerReachable,
  loginIfNeeded,
  resolveAuditConfig,
  sanitizePathForFile,
  writeJsonReport,
} from './audit-helpers.mjs';

const FIXTURE_TITLE = `B3 dashboard gate fixture ${Date.now()}`;
const FIXTURE_CREATOR = 'haiku';
const agoraTsRoot = path.resolve(import.meta.dirname, '..', '..', 'agora-ts');

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : `${response.status} ${response.statusText}`;
    throw new Error(`${url} -> ${message}`);
  }
  return payload;
}

function createReviewFixturePayload() {
  return {
    title: FIXTURE_TITLE,
    type: 'custom',
    creator: 'archon',
    description: 'dashboard session gate fixture',
    priority: 'normal',
    workflow_override: {
      type: 'graph-driven',
      stages: [
        { id: 'triage', mode: 'discuss', gate: { type: 'command' } },
        { id: 'review', mode: 'discuss', gate: { type: 'approval' } },
      ],
      graph: {
        graph_version: 1,
        entry_nodes: ['triage'],
        nodes: [
          { id: 'triage', kind: 'stage', gate: { type: 'command' } },
          { id: 'review', kind: 'stage', gate: { type: 'approval' } },
        ],
        edges: [
          { id: 'triage__advance__review', from: 'triage', to: 'review', kind: 'advance' },
        ],
      },
    },
  };
}

function createReviewFixtureTeamOverride() {
  return {
    members: [
      {
        role: 'architect',
        agentId: FIXTURE_CREATOR,
        member_kind: 'controller',
        model_preference: 'cost_regression',
      },
    ],
  };
}

async function seedReviewFixture(config) {
  const workflowJson = JSON.stringify(createReviewFixturePayload().workflow_override);
  const teamJson = JSON.stringify(createReviewFixtureTeamOverride());
  const createOutput = execFileSync(
    'npx',
    [
      'tsx',
      'apps/cli/src/index.ts',
      'create',
      FIXTURE_TITLE,
      '--type',
      'coding',
      '--creator',
      FIXTURE_CREATOR,
      '--team-json',
      teamJson,
      '--workflow-json',
      workflowJson,
    ],
    { cwd: agoraTsRoot, encoding: 'utf8' },
  );
  const taskIdMatch = createOutput.match(/任务已创建:\s*(\S+)/u);
  if (!taskIdMatch) {
    throw new Error(`unable to parse created task id from CLI output: ${createOutput}`);
  }
  const taskId = taskIdMatch[1];
  execFileSync(
    'npx',
    ['tsx', 'apps/cli/src/index.ts', 'advance', taskId, '--caller-id', FIXTURE_CREATOR],
    { cwd: agoraTsRoot, encoding: 'utf8' },
  );
  const advanced = readTaskStatusViaCli(taskId);
  return {
    taskId,
    title: FIXTURE_TITLE,
    currentStage: advanced.stage,
    state: advanced.state,
  };
}

function readTaskStatusViaCli(taskId) {
  const output = execFileSync(
    'npx',
    ['tsx', 'apps/cli/src/index.ts', 'status', taskId],
    { cwd: agoraTsRoot, encoding: 'utf8' },
  );
  const stateMatch = output.match(/状态:\s*(\S+)/u);
  const stageMatch = output.match(/阶段:\s*(\S+)/u);
  return {
    raw: output,
    state: stateMatch?.[1] ?? null,
    stage: stageMatch?.[1] ?? null,
  };
}

async function waitForTaskDone(taskId, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = readTaskStatusViaCli(taskId);
    if (status.state === 'done' && (status.stage === '-' || status.stage === 'null')) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`task ${taskId} did not converge to done within ${timeoutMs}ms`);
}

async function run() {
  const config = resolveAuditConfig();
  await ensureServerReachable(config.entryUrl);
  if (!config.authenticated) {
    throw new Error('Dashboard review gate requires AGORA_DASHBOARD_LOGIN_USER / AGORA_DASHBOARD_LOGIN_PASSWORD.');
  }

  const outputDir = createAuditOutputDir('review-gate');
  const fixture = await seedReviewFixture(config);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    console.log(`[review-gate] seed fixture task=${fixture.taskId} title="${fixture.title}" stage=${fixture.currentStage} state=${fixture.state}`);
    const loggedIn = await loginIfNeeded(page, config);
    console.log(`[review-gate] login=${loggedIn ? 'ok' : 'skipped'}`);
    await page.goto(new URL('/dashboard/reviews', config.baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    console.log('[review-gate] opened /dashboard/reviews');

    const refreshButton = page.getByRole('button', { name: '刷新工作区' });
    if (await refreshButton.count()) {
      await refreshButton.click();
      await page.waitForTimeout(1200);
      console.log('[review-gate] refresh clicked');
    }

    const taskRow = page.getByRole('button', { name: new RegExp(fixture.taskId) });
    await taskRow.waitFor({ timeout: 10000 });
    console.log('[review-gate] fixture row visible');
    await taskRow.click();
    await page.getByRole('heading', { name: fixture.title }).waitFor({ timeout: 10000 });
    console.log('[review-gate] detail pane selected');
    await page.getByRole('textbox', { name: '裁决说明' }).fill('dashboard session gate approve');
    const approveButton = page.locator('button').filter({ hasText: '批准执行' }).last();
    await approveButton.waitFor({ timeout: 10000 });
    await approveButton.click();
    console.log('[review-gate] approve clicked');
    await page.waitForTimeout(1500);
    await waitForTaskDone(fixture.taskId);
    console.log('[review-gate] backend converged to done');

    const currentPath = new URL(page.url()).pathname;
    const screenshotPath = path.join(outputDir, `${sanitizePathForFile(currentPath)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      taskId: fixture.taskId,
      title: fixture.title,
      loggedIn,
      currentPath,
      pageErrors,
      consoleErrors,
      screenshotPath,
    };
    const reportPath = path.join(outputDir, 'review-gate-report.json');
    await writeJsonReport(reportPath, report);
    await writeFile(path.join(outputDir, 'README.txt'), `Dashboard review gate report: ${reportPath}\n`, 'utf8');
    console.log(`Dashboard review gate passed for ${fixture.taskId}`);
    console.log(`Report written to ${reportPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
