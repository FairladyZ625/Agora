#!/usr/bin/env tsx
import { createWriteStream, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Command } from 'commander';
import { createCliProgram } from '../apps/cli/dist/index.js';
import { ensureBundledAgoraAssetsInstalled } from '../packages/config/dist/index.js';

class BufferStream {
  private readonly chunks: string[] = [];

  write(chunk: string) {
    this.chunks.push(chunk);
  }

  toString() {
    return this.chunks.join('');
  }
}

async function runCli(args: string[], options: { configPath: string; dbPath: string }) {
  const stdout = new BufferStream();
  const stderr = new BufferStream();
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  const program = createCliProgram({
    configPath: options.configPath,
    dbPath: options.dbPath,
    stdout,
    stderr,
  });
  await program.parseAsync(args, { from: 'user' });
  const result = {
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exitCode: process.exitCode ?? 0,
  };
  process.exitCode = previousExitCode;
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `cli command failed: ${args.join(' ')}`);
  }
  return result;
}

function parseLineValue(output: string, prefix: string) {
  return output
    .split('\n')
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? null;
}

function requireLineValue(output: string, prefix: string) {
  const value = parseLineValue(output, prefix);
  if (!value) {
    throw new Error(`failed to parse "${prefix}" from output:\n${output}`);
  }
  return value;
}

async function waitFor(check: () => Promise<boolean>, label: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await delay(300);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function spawnLoggedProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    logPath: string;
  },
) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream(options.logPath, { flags: 'a' });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return { child, log };
}

async function stopProcess(child: ChildProcessWithoutNullStreams | null | undefined) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await delay(500);
  if (child.exitCode === null && !child.killed) {
    child.kill('SIGKILL');
  }
}

async function ensureDashboardDependenciesInstalled(dashboardRoot: string) {
  if (existsSync(join(dashboardRoot, 'node_modules'))) {
    return;
  }
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('npm', ['install'], {
      cwd: dashboardRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`dashboard npm install failed with code ${code ?? 'unknown'}`));
    });
  });
}

function resolvePlaywrightBrowsersPath(originalHome: string | undefined) {
  return process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? (originalHome ? join(originalHome, 'Library', 'Caches', 'ms-playwright') : '')
    ?? '';
}

async function loginDashboard(baseUrl: string, username: string, password: string) {
  const response = await fetch(`${baseUrl}/api/dashboard/session/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`dashboard login failed: ${response.status} ${await response.text()}`);
  }
  const cookieHeader = response.headers.get('set-cookie');
  const token = cookieHeader?.match(/agora_dashboard_session=([^;]+)/)?.[1];
  if (!token) {
    throw new Error('dashboard login did not return session cookie');
  }
  return token;
}

async function captureDashboardScreenshots(input: {
  dashboardRoot: string;
  origin: string;
  cookie: string;
  projectId: string;
  exportDir: string;
  projectsScreenshotPath: string;
  detailScreenshotPath: string;
  playwrightBrowsersPath: string;
}) {
  const script = `
    import { chromium } from 'playwright';
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
    await context.addCookies([{
      name: 'agora_dashboard_session',
      value: ${JSON.stringify(input.cookie)},
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    }]);
    const page = await context.newPage();
    await page.goto(${JSON.stringify(`${input.origin}/dashboard/projects`)}, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: ${JSON.stringify(input.projectsScreenshotPath)}, fullPage: true });
    await page.goto(${JSON.stringify(`${input.origin}/dashboard/projects/${input.projectId}`)}, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    let reviewVisible = false;
    let validationVisible = false;
	    let diffVisible = false;
	    let exportVisible = false;
	    let publishVisible = false;
	    let catalogVisible = false;
	    let installCatalogVisible = false;
	    let installVisible = false;
	    let importSourceVisible = false;
	    let installSourceVisible = false;
	    let sourcePanelVisible = false;
      let registerSourceVisible = false;
      let sourcesListVisible = false;
      let sourceShowVisible = false;
      let syncRegisteredSourceVisible = false;
      let installRegisteredSourceVisible = false;
	    let activationVisible = false;
    await page.getByRole('button', { name: 'Review Draft' }).click();
    await page.getByText('Can Activate').waitFor({ timeout: 3000 });
    reviewVisible = true;
    await page.getByRole('button', { name: 'Validate Draft' }).click();
    await page.getByText('Validation Issues').waitFor({ timeout: 3000 });
    validationVisible = true;
    await page.getByRole('button', { name: 'Diff Draft' }).click();
    await page.getByText('Changed Fields').waitFor({ timeout: 3000 });
    diffVisible = true;
    await page.getByRole('button', { name: 'Activate Draft' }).click();
    await page.getByText('Project Nomos activated.').waitFor({ timeout: 3000 });
    activationVisible = true;
	    await page.getByLabel('Export Dir').fill(${JSON.stringify(input.exportDir)});
	    await page.getByRole('button', { name: 'Export Pack' }).click();
	    await page.getByText('Nomos pack exported.').waitFor({ timeout: 3000 });
	    exportVisible = true;
	    await page.getByLabel('Publish Note').fill('dashboard smoke');
	    await page.getByRole('button', { name: 'Publish To Catalog' }).click();
	    await page.getByText('Nomos pack published to catalog.').waitFor({ timeout: 3000 });
	    publishVisible = true;
	    await page.getByRole('button', { name: 'Refresh Catalog' }).click();
	    await page.getByText('Nomos Catalog').waitFor({ timeout: 3000 });
	    catalogVisible = true;
	    await page.getByLabel('Catalog Pack Id').fill(${JSON.stringify(`project/${input.projectId}`)});
	    await page.getByRole('button', { name: 'Show Catalog Entry' }).click();
	    await page.getByTestId('project-nomos-catalog-panel').locator('pre').waitFor({ timeout: 3000 });
	    await page.getByRole('button', { name: 'Install From Catalog' }).click();
	    await page.getByText('Catalog pack installed into draft.').waitFor({ timeout: 3000 });
	    installCatalogVisible = true;
	    await page.getByLabel('Pack Dir').fill(${JSON.stringify(input.exportDir)});
	    await page.getByRole('button', { name: 'Install Pack' }).click();
	    await page.getByText('Nomos pack installed into draft.').waitFor({ timeout: 3000 });
    installVisible = true;
	    await page.getByLabel('Source Dir').fill(${JSON.stringify(input.exportDir)});
	    await page.getByRole('button', { name: 'Import Source' }).click();
	    await page.getByText('Nomos source imported into catalog.').waitFor({ timeout: 3000 });
	    importSourceVisible = true;
      await page.getByLabel('Source Id').fill('shared/dashboard-smoke');
      await page.getByRole('button', { name: 'Register Source' }).click();
      await page.getByText('Nomos source registered into the source registry.').waitFor({ timeout: 3000 });
      registerSourceVisible = true;
      await page.getByRole('button', { name: 'Refresh Sources' }).click();
      await page.getByText('Registered Sources').waitFor({ timeout: 3000 });
      sourcesListVisible = true;
      await page.getByRole('button', { name: 'Show Source Entry' }).click();
      await page.getByTestId('project-nomos-registered-sources-panel').locator('pre').waitFor({ timeout: 3000 });
      sourceShowVisible = true;
      await page.getByRole('button', { name: 'Sync Registered Source' }).click();
      await page.getByText('Registered source synced into the catalog.').waitFor({ timeout: 3000 });
      syncRegisteredSourceVisible = true;
      await page.getByRole('button', { name: 'Install From Registered Source' }).click();
      await page.getByText('Registered source installed into draft.').waitFor({ timeout: 3000 });
      installRegisteredSourceVisible = true;
	    await page.getByRole('button', { name: 'Install From Source' }).click();
	    await page.getByText('Nomos source imported and installed into draft.').waitFor({ timeout: 3000 });
	    installSourceVisible = true;
	    await page.getByTestId('project-nomos-source-panel').waitFor({ timeout: 3000 });
	    sourcePanelVisible = true;
    await page.screenshot({ path: ${JSON.stringify(input.detailScreenshotPath)}, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    console.log(JSON.stringify({
      detailUrl: page.url(),
      bodyText: bodyText.slice(0, 1600),
      nomosVisible: bodyText.includes('Nomos State'),
      actionVisible: bodyText.includes('Review Draft')
        && bodyText.includes('Activate Draft')
        && bodyText.includes('Validate Draft')
        && bodyText.includes('Diff Draft')
        && bodyText.includes('Import Source')
        && bodyText.includes('Install From Source')
        && bodyText.includes('Register Source')
        && bodyText.includes('Refresh Sources')
        && bodyText.includes('Show Source Entry')
        && bodyText.includes('Sync Registered Source')
        && bodyText.includes('Install From Registered Source')
        && bodyText.includes('Reinstall Nomos')
        && bodyText.includes('Rerun Bootstrap')
        && bodyText.includes('Run Doctor'),
      reviewVisible,
      validationVisible,
	      diffVisible,
	      exportVisible,
	      publishVisible,
	      catalogVisible,
	      installCatalogVisible,
	      installVisible,
	      importSourceVisible,
	      installSourceVisible,
	      sourcePanelVisible,
        registerSourceVisible,
        sourcesListVisible,
        sourceShowVisible,
        syncRegisteredSourceVisible,
        installRegisteredSourceVisible,
	      activationVisible,
	    }));
    await browser.close();
  `;

  const result = await new Promise<string>((resolvePromise, reject) => {
    const child = spawn('node', ['--input-type=module', '-e', script], {
      cwd: input.dashboardRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: input.playwrightBrowsersPath,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(stderr || stdout || `dashboard screenshot process failed with code ${code ?? 'unknown'}`));
    });
  });

  return JSON.parse(result) as {
    detailUrl: string;
    bodyText: string;
    nomosVisible: boolean;
    actionVisible: boolean;
    reviewVisible: boolean;
    validationVisible: boolean;
    diffVisible: boolean;
    exportVisible: boolean;
    publishVisible: boolean;
    catalogVisible: boolean;
    installCatalogVisible: boolean;
    installVisible: boolean;
    importSourceVisible: boolean;
    installSourceVisible: boolean;
    sourcePanelVisible: boolean;
    registerSourceVisible: boolean;
    sourcesListVisible: boolean;
    sourceShowVisible: boolean;
    syncRegisteredSourceVisible: boolean;
    installRegisteredSourceVisible: boolean;
    activationVisible: boolean;
  };
}

async function main() {
  const program = new Command();
  program
    .option('--keep-temp', 'keep temporary smoke dir', false)
    .parse(process.argv);
  const options = program.opts<{ keepTemp: boolean }>();

  const smokeRoot = mkdtempSync(join(tmpdir(), 'agora-nomos-layered-smoke-'));
  const homeDir = join(smokeRoot, 'home');
  const agoraHomeDir = join(homeDir, '.agora');
  const configPath = join(agoraHomeDir, 'agora.json');
  const dbPath = join(agoraHomeDir, 'agora.db');
  const dashboardPort = 4177;
  const serverPort = 4327;
  const dashboardRoot = join(process.cwd(), '..', 'dashboard');
  const serverOrigin = `http://127.0.0.1:${serverPort}`;
  const dashboardOrigin = `http://127.0.0.1:${dashboardPort}`;
  const dashboardPassword = 'smoke-pass';
  const dashboardUser = 'smoke-admin';
  const projectsScreenshotPath = join(smokeRoot, 'dashboard-projects.png');
  const detailScreenshotPath = join(smokeRoot, 'dashboard-project-detail.png');
  const dashboardExportDir = join(smokeRoot, 'dashboard-exported-pack');

  const restoreEnv = {
    HOME: process.env.HOME,
    AGORA_HOME_DIR: process.env.AGORA_HOME_DIR,
    AGORA_DB_PATH: process.env.AGORA_DB_PATH,
    AGORA_CONFIG_PATH: process.env.AGORA_CONFIG_PATH,
    AGORA_DASHBOARD_BASIC_PASSWORD: process.env.AGORA_DASHBOARD_BASIC_PASSWORD,
  };
  const playwrightBrowsersPath = resolvePlaywrightBrowsersPath(restoreEnv.HOME);

  let serverChild: ChildProcessWithoutNullStreams | null = null;
  let dashboardChild: ChildProcessWithoutNullStreams | null = null;

  process.env.HOME = homeDir;
  process.env.AGORA_HOME_DIR = agoraHomeDir;
  process.env.AGORA_DB_PATH = dbPath;
  process.env.AGORA_CONFIG_PATH = configPath;
  process.env.AGORA_DASHBOARD_BASIC_PASSWORD = dashboardPassword;

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(agoraHomeDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    db_path: dbPath,
    dashboard_auth: {
      enabled: true,
      method: 'session',
      allowed_users: [],
      session_ttl_hours: 24,
    },
    im: {
      provider: 'none',
    },
  }, null, 2));

  try {
    const installedAssets = ensureBundledAgoraAssetsInstalled({
      projectRoot: join(process.cwd(), '..'),
      bundledSkillsDir: join(process.cwd(), '..', '.skills'),
      userAgoraDir: agoraHomeDir,
      userSkillDirs: [
        join(smokeRoot, 'agents-skills'),
        join(smokeRoot, 'codex-skills'),
      ],
    });
    const installHealth = await runCli(['health'], { configPath, dbPath });
    const nomosShow = await runCli(['nomos', 'show', 'agora/default', '--json'], { configPath, dbPath });
    const nomosShowJson = JSON.parse(nomosShow.stdout) as Record<string, any>;
    const installLayer = {
      health_stdout: installHealth.stdout.trim(),
      bootstrap_skill_installed: existsSync(join(agoraHomeDir, 'skills', 'agora-bootstrap', 'SKILL.md')),
      create_nomos_skill_installed: existsSync(join(agoraHomeDir, 'skills', 'create-nomos', 'SKILL.md')),
      create_nomos_template_installed: existsSync(join(agoraHomeDir, 'skills', 'create-nomos', 'assets', 'pack-template', 'profile.toml')),
      bundled_skill_names: installedAssets.bundledSkillNames,
      seeded_assets: nomosShowJson.seeded_assets,
    };

    const bootstrapProjectId = 'proj-nomos-bootstrap-smoke';
    const bootstrapRepoRoot = join(smokeRoot, 'bootstrap-repo');
    const bootstrapCreate = await runCli([
      'projects', 'create',
      '--id', bootstrapProjectId,
      '--name', 'Nomos Bootstrap Smoke',
      '--repo-path', bootstrapRepoRoot,
      '--new-repo',
    ], { configPath, dbPath });
    const bootstrapTaskId = requireLineValue(bootstrapCreate.stdout, 'Bootstrap Task: ');
    const bootstrapProjectStateRoot = requireLineValue(bootstrapCreate.stdout, 'Project State: ');
    const bootstrapInspect = await runCli(['nomos', 'inspect-project', bootstrapProjectId, '--json'], { configPath, dbPath });
    const bootstrapLayer = {
      project_id: bootstrapProjectId,
      bootstrap_task_id: bootstrapTaskId,
      repo_shim_path: join(bootstrapRepoRoot, 'AGENTS.md'),
      project_state_root: bootstrapProjectStateRoot,
      repo_shim_installed: existsSync(join(bootstrapRepoRoot, 'AGENTS.md')),
      profile_installed: existsSync(join(bootstrapProjectStateRoot, 'profile.toml')),
      operating_model_present: existsSync(join(bootstrapProjectStateRoot, 'docs', 'architecture', 'operating-model.md')),
      bootstrap_prompt_present: existsSync(join(bootstrapProjectStateRoot, 'prompts', 'bootstrap', 'interview.md')),
      inspect: JSON.parse(bootstrapInspect.stdout),
    };

    const lifecycleProjectId = 'proj-nomos-lifecycle-smoke';
    const lifecycleRepoRoot = join(smokeRoot, 'lifecycle-repo');
    const lifecycleCreate = await runCli([
      'projects', 'create',
      '--id', lifecycleProjectId,
      '--name', 'Nomos Lifecycle Smoke',
      '--repo-path', lifecycleRepoRoot,
      '--new-repo',
    ], { configPath, dbPath });
    const lifecycleBootstrapTaskId = requireLineValue(lifecycleCreate.stdout, 'Bootstrap Task: ');
    await runCli(['cancel', lifecycleBootstrapTaskId, '--reason', 'bootstrap closeout smoke'], { configPath, dbPath });
    const lifecycleTaskCreate = await runCli([
      'create',
      'Nomos lifecycle smoke task',
      '--type', 'quick',
      '--project-id', lifecycleProjectId,
    ], { configPath, dbPath });
    const lifecycleTaskId = requireLineValue(lifecycleTaskCreate.stdout, '任务已创建: ');
    const lifecycleWorkspaceRoot = join(agoraHomeDir, 'agora-ai-brain', 'projects', lifecycleProjectId, 'tasks', lifecycleTaskId);
    const lifecycleCraftsmanContextPath = join(lifecycleWorkspaceRoot, '04-context', 'project-context-craftsman.md');
    const lifecycleCitizenContextPath = join(lifecycleWorkspaceRoot, '04-context', 'project-context-citizen.md');
    const lifecycleControllerContextPath = join(lifecycleWorkspaceRoot, '04-context', 'project-context-controller.md');

    await runCli(['advance', lifecycleTaskId, '--caller-id', 'archon'], { configPath, dbPath });

    const bootstrapArchiveJobs = JSON.parse((await runCli(['archive', 'jobs', 'list', '--task-id', lifecycleBootstrapTaskId, '--json'], { configPath, dbPath })).stdout) as Array<Record<string, any>>;
    const lifecycleArchiveJobs = JSON.parse((await runCli(['archive', 'jobs', 'list', '--task-id', lifecycleTaskId, '--json'], { configPath, dbPath })).stdout) as Array<Record<string, any>>;
    const bootstrapArchiveJobId = Number(bootstrapArchiveJobs[0]?.id);
    const lifecycleArchiveJobId = Number(lifecycleArchiveJobs[0]?.id);
    if (!Number.isFinite(bootstrapArchiveJobId) || !Number.isFinite(lifecycleArchiveJobId)) {
      throw new Error(`failed to discover archive jobs for lifecycle smoke: bootstrap=${JSON.stringify(bootstrapArchiveJobs)} lifecycle=${JSON.stringify(lifecycleArchiveJobs)}`);
    }
    await runCli(['archive', 'jobs', 'approve', String(bootstrapArchiveJobId), '--approver-id', 'smoke-admin', '--comment', 'bootstrap ok'], { configPath, dbPath });
    await runCli(['archive', 'jobs', 'approve', String(lifecycleArchiveJobId), '--approver-id', 'smoke-admin', '--comment', 'lifecycle ok'], { configPath, dbPath });
    const lifecycleArchiveShow = JSON.parse((await runCli(['archive', 'jobs', 'show', String(lifecycleArchiveJobId), '--json'], { configPath, dbPath })).stdout) as Record<string, any>;
    const archivedProject = await runCli(['projects', 'archive', lifecycleProjectId], { configPath, dbPath });
    const harvestDraftPath = lifecycleArchiveShow.payload?.closeout_review?.harvest_draft_path as string | undefined;
    const lifecycleLayer = {
      project_id: lifecycleProjectId,
      task_id: lifecycleTaskId,
      context_files: {
        controller: existsSync(lifecycleControllerContextPath),
        craftsman: existsSync(lifecycleCraftsmanContextPath),
        citizen: existsSync(lifecycleCitizenContextPath),
      },
      archive_job_id: lifecycleArchiveJobId,
      archive_job_status: lifecycleArchiveShow.status,
      closeout_review_state: lifecycleArchiveShow.payload?.closeout_review?.state ?? null,
      harvest_draft_path: harvestDraftPath ?? null,
      harvest_draft_present: Boolean(harvestDraftPath && existsSync(harvestDraftPath)),
      project_archive_stdout: archivedProject.stdout.trim(),
    };

    const serverLogPath = join(smokeRoot, 'server.log');
    const dashboardLogPath = join(smokeRoot, 'dashboard.log');
    const serverProcess = spawnLoggedProcess(
      'node',
      ['apps/server/dist/index.js'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(serverPort),
          AGORA_HOME_DIR: agoraHomeDir,
          AGORA_DB_PATH: dbPath,
          AGORA_CONFIG_PATH: configPath,
          AGORA_DASHBOARD_BASIC_PASSWORD: dashboardPassword,
          HOME: homeDir,
          http_proxy: '',
          https_proxy: '',
          HTTP_PROXY: '',
          HTTPS_PROXY: '',
          no_proxy: '127.0.0.1,localhost',
          NO_PROXY: '127.0.0.1,localhost',
        },
        logPath: serverLogPath,
      },
    );
    serverChild = serverProcess.child;
    await waitFor(async () => {
      try {
        const response = await fetch(`${serverOrigin}/api/dashboard/session`);
        return response.ok;
      } catch {
        return false;
      }
    }, 'server startup');

    await ensureDashboardDependenciesInstalled(dashboardRoot);
    const dashboardProcess = spawnLoggedProcess(
      'npm',
      ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(dashboardPort)],
      {
        cwd: dashboardRoot,
        env: {
          ...process.env,
          VITE_API_BASE_URL: serverOrigin,
          PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
        },
        logPath: dashboardLogPath,
      },
    );
    dashboardChild = dashboardProcess.child;
    await waitFor(async () => {
      try {
        const response = await fetch(`${dashboardOrigin}/dashboard/login`);
        return response.ok;
      } catch {
        return false;
      }
    }, 'dashboard startup', 45_000);

    const dashboardCookie = await loginDashboard(serverOrigin, dashboardUser, dashboardPassword);
    const dashboardUi = await captureDashboardScreenshots({
      dashboardRoot,
      origin: dashboardOrigin,
      cookie: dashboardCookie,
      projectId: bootstrapProjectId,
      exportDir: dashboardExportDir,
      projectsScreenshotPath,
      detailScreenshotPath,
      playwrightBrowsersPath,
    });
    if (!dashboardUi.nomosVisible || !dashboardUi.actionVisible || !dashboardUi.reviewVisible
      || !dashboardUi.validationVisible || !dashboardUi.diffVisible || !dashboardUi.activationVisible
      || !dashboardUi.exportVisible || !dashboardUi.publishVisible || !dashboardUi.catalogVisible
      || !dashboardUi.installCatalogVisible || !dashboardUi.installVisible
      || !dashboardUi.importSourceVisible || !dashboardUi.installSourceVisible || !dashboardUi.sourcePanelVisible
      || !dashboardUi.registerSourceVisible || !dashboardUi.sourcesListVisible || !dashboardUi.sourceShowVisible
      || !dashboardUi.syncRegisteredSourceVisible || !dashboardUi.installRegisteredSourceVisible) {
      throw new Error(`dashboard nomos click-path incomplete: ${JSON.stringify(dashboardUi)}`);
    }

    const dashboardLayer = {
      project_id: bootstrapProjectId,
      server_origin: serverOrigin,
      dashboard_origin: dashboardOrigin,
      projects_screenshot: projectsScreenshotPath,
      detail_screenshot: detailScreenshotPath,
      detail_url: dashboardUi.detailUrl,
      nomos_visible: dashboardUi.nomosVisible,
      actions_visible: dashboardUi.actionVisible,
      review_visible: dashboardUi.reviewVisible,
      validation_visible: dashboardUi.validationVisible,
      diff_visible: dashboardUi.diffVisible,
      activation_visible: dashboardUi.activationVisible,
      export_visible: dashboardUi.exportVisible,
      publish_visible: dashboardUi.publishVisible,
      catalog_visible: dashboardUi.catalogVisible,
      install_catalog_visible: dashboardUi.installCatalogVisible,
      install_visible: dashboardUi.installVisible,
      import_source_visible: dashboardUi.importSourceVisible,
      install_source_visible: dashboardUi.installSourceVisible,
      source_panel_visible: dashboardUi.sourcePanelVisible,
      register_source_visible: dashboardUi.registerSourceVisible,
      sources_list_visible: dashboardUi.sourcesListVisible,
      source_show_visible: dashboardUi.sourceShowVisible,
      sync_registered_source_visible: dashboardUi.syncRegisteredSourceVisible,
      install_registered_source_visible: dashboardUi.installRegisteredSourceVisible,
      detail_excerpt: dashboardUi.bodyText,
    };

    process.stdout.write(JSON.stringify({
      smoke_root: smokeRoot,
      install: installLayer,
      bootstrap: bootstrapLayer,
      lifecycle: lifecycleLayer,
      dashboard: dashboardLayer,
    }, null, 2));
    process.stdout.write('\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.stderr.write(`smoke_root=${smokeRoot}\n`);
    process.exitCode = 1;
  } finally {
    await stopProcess(dashboardChild);
    await stopProcess(serverChild);
    process.env.HOME = restoreEnv.HOME;
    process.env.AGORA_HOME_DIR = restoreEnv.AGORA_HOME_DIR;
    process.env.AGORA_DB_PATH = restoreEnv.AGORA_DB_PATH;
    process.env.AGORA_CONFIG_PATH = restoreEnv.AGORA_CONFIG_PATH;
    process.env.AGORA_DASHBOARD_BASIC_PASSWORD = restoreEnv.AGORA_DASHBOARD_BASIC_PASSWORD;
    if (!options.keepTemp) {
      rmSync(smokeRoot, { recursive: true, force: true });
    }
  }
}

void main();
