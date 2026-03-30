#!/usr/bin/env tsx
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  type DiscordSmokeCommandSpec,
  extractDiscordResponseDelta,
  expectedMarkersForSlashCommand,
  isDiscordLoginUrl,
  isDiscordPendingResponse,
  normalizeDiscordSmokeCommandSpecs,
  parseRunningChromeRemoteDebuggingPort,
  resolveSmokeCommandTemplate,
  slashCommandAssertionPassed,
  shouldSettleDiscordResponse,
  splitSlashCommand,
} from "./discord-web-slash-lib.ts";

type Options = {
  channelUrl: string;
  profileDir: string;
  dbPath: string;
  outDir: string;
  commands: DiscordSmokeCommandSpec[];
  probeOnly: boolean;
  headless: boolean;
  settleTimeoutMs: number;
  minQuietMs: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.profileDir)) {
    throw new Error(`profile dir does not exist: ${options.profileDir}`);
  }
  mkdirSync(options.outDir, { recursive: true });

  const processList = await captureCommand("ps", ["aux"]);
  const remoteDebuggingPort = parseRunningChromeRemoteDebuggingPort(processList, options.profileDir);
  const commands = options.probeOnly
    ? []
    : await resolveSmokeCommands(options.commands, options.dbPath);
  const dashboardRoot = resolveDashboardRoot(process.cwd());
  const playwrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
    || join(homedir(), "Library", "Caches", "ms-playwright");
  const beforeScreenshot = join(options.outDir, "discord-before.png");
  const afterScreenshot = join(options.outDir, "discord-after.png");
  const commandScript = buildBrowserScript({
    channelUrl: options.channelUrl,
    profileDir: options.profileDir,
    commands,
    probeOnly: options.probeOnly,
    headless: options.headless,
    settleTimeoutMs: options.settleTimeoutMs,
    minQuietMs: options.minQuietMs,
    remoteDebuggingPort,
    beforeScreenshot,
    afterScreenshot,
  });

  const output = await runNodeScript(commandScript, dashboardRoot, {
    PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
  });
  const parsed = parseResultPayload(output);
  const currentUrl = String(parsed.currentUrl || "");
  const loginRequired = isDiscordLoginUrl(currentUrl);
  const responseSettled = parsed.responseSettled === true;
  const assertionsPassed = parsed.assertionsPassed === true;
  const shouldFail = !options.probeOnly && (loginRequired || !responseSettled || !assertionsPassed);
  const status = loginRequired
    ? "login_required"
    : !responseSettled
      ? "response_unsettled"
      : !assertionsPassed
        ? "assertion_failed"
        : "ok";
  const failureReason = !shouldFail
    ? undefined
    : loginRequired
      ? "discord_web_session_requires_login"
      : !responseSettled
        ? "slash_response_did_not_settle"
        : "slash_response_assertion_failed";
  process.stdout.write(`${JSON.stringify({
    status,
    connectionMode: parsed.connectionMode,
    currentUrl,
    profileDir: options.profileDir,
    remoteDebuggingPort,
    commandsAttempted: options.commands,
    commandsResolved: commands,
    commandsSent: parsed.commandsSent,
    commandResults: parsed.commandResults,
    beforeTail: parsed.beforeTail,
    afterTail: parsed.afterTail,
    deltaTail: parsed.deltaTail,
    responseSettled,
    assertionsPassed,
    failureReason,
    beforeScreenshot,
    afterScreenshot,
    note: loginRequired
      ? "Discord Web redirected to login; complete login in the persistent profile and retry."
      : "Discord Web slash smoke executed; verify screenshots and pair with debug:plugin:slash if needed.",
  }, null, 2)}\n`);
  if (shouldFail) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): Options {
  const defaults = {
    profileDir: process.env.DISCORD_WEB_PROFILE_DIR || join(homedir(), "Library", "Caches", "ms-playwright", "mcp-chrome"),
    dbPath: process.env.AGORA_DB_PATH || join(homedir(), ".agora", "agora.db"),
    outDir: mkdtempSync(join(tmpdir(), "agora-discord-web-slash-")),
    commands: [] as DiscordSmokeCommandSpec[],
    pendingResponder: undefined as string | undefined,
    probeOnly: false,
    headless: false,
    settleTimeoutMs: 20_000,
    minQuietMs: 2_500,
  };
  let channelUrl = process.env.DISCORD_WEB_TARGET_URL || "";
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    switch (token) {
      case "--channel-url":
        channelUrl = args[index + 1] || "";
        index += 1;
        break;
      case "--profile-dir":
        defaults.profileDir = args[index + 1] || defaults.profileDir;
        index += 1;
        break;
      case "--out-dir":
        defaults.outDir = args[index + 1] || defaults.outDir;
        index += 1;
        break;
      case "--db-path":
        defaults.dbPath = args[index + 1] || defaults.dbPath;
        index += 1;
        break;
      case "--command":
        defaults.commands.push({
          command: args[index + 1] || "",
          responder: defaults.pendingResponder,
        });
        defaults.pendingResponder = undefined;
        index += 1;
        break;
      case "--command-responder":
        defaults.pendingResponder = args[index + 1] || undefined;
        index += 1;
        break;
      case "--probe-only":
        defaults.probeOnly = true;
        break;
      case "--headless":
        defaults.headless = true;
        break;
      case "--settle-timeout-ms":
        defaults.settleTimeoutMs = Number(args[index + 1] || defaults.settleTimeoutMs);
        index += 1;
        break;
      case "--min-quiet-ms":
        defaults.minQuietMs = Number(args[index + 1] || defaults.minQuietMs);
        index += 1;
        break;
      default:
        throw new Error(`unknown arg: ${token}`);
    }
  }
  if (!channelUrl) {
    throw new Error("missing --channel-url (or DISCORD_WEB_TARGET_URL)");
  }
  const commands = defaults.probeOnly
    ? []
    : normalizeDiscordSmokeCommandSpecs(
        defaults.commands.length
          ? defaults.commands
          : [{ command: "/task create" }, { command: "/task guided-task-debug" }, { command: "/task coding" }, { command: "/project list active" }],
      );
  return {
    channelUrl,
    profileDir: defaults.profileDir,
    dbPath: defaults.dbPath,
    outDir: defaults.outDir,
    commands,
    probeOnly: defaults.probeOnly,
    headless: defaults.headless,
    settleTimeoutMs: defaults.settleTimeoutMs,
    minQuietMs: defaults.minQuietMs,
  };
}

async function resolveSmokeCommands(commands: DiscordSmokeCommandSpec[], dbPath: string) {
  const needsProjectId = commands.some((command) => command.command.includes("{{firstActiveProjectId}}"));
  const needsTaskId = commands.some((command) => command.command.includes("{{firstActiveTaskId}}"));
  const replacements = {
    firstActiveProjectId: needsProjectId ? await lookupSingleValue(dbPath, "select id from projects where status = 'active' order by rowid desc limit 1;") : undefined,
    firstActiveTaskId: needsTaskId ? await lookupSingleValue(dbPath, "select id from tasks where state = 'active' order by rowid desc limit 1;") : undefined,
  };
  return commands.map((command) => ({
    command: resolveSmokeCommandTemplate(command.command, replacements),
    responder: command.responder,
  }));
}

function resolveDashboardRoot(cwd: string) {
  const localDashboardRoot = join(cwd, "..", "dashboard");
  if (existsSync(join(localDashboardRoot, "node_modules", "playwright"))) {
    return localDashboardRoot;
  }
  const worktreeMarker = `${sep}.worktrees${sep}`;
  const markerIndex = cwd.indexOf(worktreeMarker);
  if (markerIndex !== -1) {
    const repoRoot = cwd.slice(0, markerIndex);
    const canonicalDashboardRoot = resolve(repoRoot, "dashboard");
    if (existsSync(join(canonicalDashboardRoot, "node_modules", "playwright"))) {
      return canonicalDashboardRoot;
    }
  }
  return localDashboardRoot;
}

function buildBrowserScript(input: {
  channelUrl: string;
  profileDir: string;
  commands: DiscordSmokeCommandSpec[];
  probeOnly: boolean;
  headless: boolean;
  settleTimeoutMs: number;
  minQuietMs: number;
  remoteDebuggingPort: number | null;
  beforeScreenshot: string;
  afterScreenshot: string;
}) {
  return `
    import { chromium } from 'playwright';
    let browser = null;
    let context = null;
    let page = null;
    let connectionMode = 'launch';
    const readBodyText = async () => await page.locator('body').innerText();
    const expectedMarkersForSlashCommand = ${expectedMarkersForSlashCommand.toString()};
    const slashCommandAssertionPassed = ${slashCommandAssertionPassed.toString()};
    const isDiscordPendingResponse = ${isDiscordPendingResponse.toString()};
    const extractDiscordResponseDelta = ${extractDiscordResponseDelta.toString()};
    const shouldSettleDiscordResponse = ${shouldSettleDiscordResponse.toString()};
    const waitForSettledResponse = async (beforeText, command, timeoutMs, minQuietMs) => {
      const startedAt = Date.now();
      let lastText = beforeText;
      let lastChangedAt = startedAt;
      let observedPending = false;
      while (Date.now() - startedAt < timeoutMs) {
        await page.waitForTimeout(1000);
        const currentText = await readBodyText();
        if (currentText !== lastText) {
          lastText = currentText;
          lastChangedAt = Date.now();
        }
        const currentDelta = extractDiscordResponseDelta(beforeText, currentText);
        if (isDiscordPendingResponse(currentDelta)) {
          observedPending = true;
        }
        const quietMs = Date.now() - lastChangedAt;
        const assertionPassed = slashCommandAssertionPassed(command, currentText);
        const expectedMarkers = expectedMarkersForSlashCommand(command);
        if (shouldSettleDiscordResponse({
          beforeText,
          currentText,
          quietMs,
          minQuietMs,
          assertionPassed,
          hasExpectedMarkers: expectedMarkers.length > 0,
        })) {
          return {
            settled: true,
            waitedMs: Date.now() - startedAt,
            observedPending,
            expectedMarkers,
            assertionPassed,
            bodyTail: currentText.slice(-1200),
          };
        }
      }
      const currentText = await readBodyText();
      return {
        settled: false,
        waitedMs: Date.now() - startedAt,
        observedPending: observedPending || isDiscordPendingResponse(currentText),
        expectedMarkers: expectedMarkersForSlashCommand(command),
        assertionPassed: slashCommandAssertionPassed(command, currentText),
        bodyTail: currentText.slice(-1200),
      };
    };
    const selectResponderOption = async (commandName, responder) => {
      const key = commandName + '::' + responder;
      const arrowDownStepsByCommand = {
        '/project::Codex Main': 1,
      };
      const steps = arrowDownStepsByCommand[key];
      if (!Number.isFinite(steps)) {
        throw new Error('no responder selection strategy registered for ' + key);
      }
      for (let index = 0; index < steps; index += 1) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(250);
      }
      await page.keyboard.press('Tab');
      await page.waitForTimeout(400);
    };
    try {
      if (${input.remoteDebuggingPort !== null}) {
        const version = await fetch('http://127.0.0.1:${input.remoteDebuggingPort ?? 0}/json/version').then((response) => response.json());
        browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
        context = browser.contexts()[0] ?? await browser.newContext();
        page = context.pages()[0] ?? await context.newPage();
        connectionMode = 'connect';
      } else {
        context = await chromium.launchPersistentContext(${JSON.stringify(input.profileDir)}, {
          channel: 'chrome',
          headless: ${input.headless},
        });
        page = context.pages()[0] ?? await context.newPage();
      }
      await page.goto(${JSON.stringify(input.channelUrl)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: ${JSON.stringify(input.beforeScreenshot)}, fullPage: true });
      const beforeBodyText = await readBodyText();
      const commandsSent = [];
      const commandResults = [];
      if (!page.url().includes('/login') && !${input.probeOnly}) {
        const textbox = page.locator('div[role="textbox"]').last();
        await textbox.waitFor({ timeout: 10000 });
        for (const commandSpec of ${JSON.stringify(input.commands)}) {
          const command = commandSpec.command;
          const commandBeforeText = await readBodyText();
          const { commandName, argsText } = ${splitSlashCommand.toString()}(command);
          await textbox.click();
          await page.keyboard.press('Meta+A');
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(150);
          await page.keyboard.type(commandName);
          await page.waitForTimeout(800);
          if (commandSpec.responder) {
            await selectResponderOption(commandName, commandSpec.responder);
          } else {
            await page.keyboard.press('Tab');
            await page.waitForTimeout(500);
          }
          if (argsText) {
            await page.keyboard.type(argsText);
            await page.waitForTimeout(300);
          }
          await page.keyboard.press('Enter');
          commandsSent.push(commandSpec);
          commandResults.push({
            command,
            responder: commandSpec.responder || null,
            ...(await waitForSettledResponse(commandBeforeText, command, ${input.settleTimeoutMs}, ${input.minQuietMs})),
          });
        }
      }
      await page.screenshot({ path: ${JSON.stringify(input.afterScreenshot)}, fullPage: true });
      const afterBodyText = await readBodyText();
      console.log('__AGORA_RESULT__' + JSON.stringify({
        connectionMode,
        currentUrl: page.url(),
        commandsSent,
        commandResults,
        beforeTail: beforeBodyText.slice(-1200),
        afterTail: afterBodyText.slice(-1200),
        deltaTail: afterBodyText.length > beforeBodyText.length
          ? afterBodyText.slice(Math.max(beforeBodyText.length - 200, 0))
          : afterBodyText.slice(-1200),
        responseSettled: commandResults.every((entry) => entry.settled),
        assertionsPassed: commandResults.every((entry) => entry.assertionPassed),
      }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      process.exit(0);
    } finally {
      if (connectionMode === 'launch' && context) {
        await context.close();
      }
    }
  `;
}

async function captureCommand(command: string, args: string[]) {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(stderr || stdout || `${command} ${args.join(" ")} failed with code ${code ?? "unknown"}`));
    });
  });
}

async function runNodeScript(script: string, cwd: string, env: NodeJS.ProcessEnv) {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn("node", ["--input-type=module", "-e", script], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      reject(new Error(stderr || stdout || `browser script failed with code ${code ?? "unknown"}`));
    });
  });
}

async function lookupSingleValue(dbPath: string, sql: string) {
  const output = await captureCommand("sqlite3", [dbPath, sql]);
  return output.trim() || undefined;
}

function parseResultPayload(output: string) {
  const line = output
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("__AGORA_RESULT__"))
    .at(-1);
  if (!line) {
    throw new Error(`missing __AGORA_RESULT__ payload in output:\n${output}`);
  }
  return JSON.parse(line.slice("__AGORA_RESULT__".length)) as Record<string, unknown>;
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  void main();
}
