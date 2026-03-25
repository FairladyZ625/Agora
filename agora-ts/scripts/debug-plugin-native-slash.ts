#!/usr/bin/env tsx
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

type OpenClawConfig = {
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
  plugins?: {
    load?: {
      paths?: string[];
    };
    installs?: Record<string, { sourcePath?: string; installPath?: string }>;
    entries?: {
      agora?: {
        config?: {
          traceNativeSlash?: boolean | string;
        };
      };
    };
  };
};

type LogFreshness = {
  path: string;
  exists: boolean;
  mtime?: string;
  ageMinutes?: number;
  stale: boolean;
};

async function main() {
  const configPath = process.env.OPENCLAW_CONFIG_PATH || join(homedir(), ".openclaw", "openclaw.json");
  const config = readConfig(configPath);
  const agoraInstall = config?.plugins?.installs?.agora;
  const sourcePath = agoraInstall?.sourcePath || config?.plugins?.load?.paths?.[0] || null;
  const installPath = agoraInstall?.installPath || null;
  const configTraceEnabled = parseBoolean(config?.plugins?.entries?.agora?.config?.traceNativeSlash);
  const envTraceEnabled = parseBoolean(process.env.AGORA_PLUGIN_TRACE_NATIVE_SLASH);
  const traceEnabled = envTraceEnabled ?? configTraceEnabled ?? false;
  const cliVersion = readOpenClawCliVersion();
  const configVersion = config?.meta?.lastTouchedVersion ?? null;
  const versionMismatch = cliVersion && configVersion ? cliVersion !== configVersion : null;
  const health = await probeGateway(process.env.OPENCLAW_GATEWAY_HEALTH_URL || "http://127.0.0.1:18789/health");
  const logFreshness = [
    describeLogFreshness(join(homedir(), ".openclaw", "logs", "gateway.log")),
    describeLogFreshness(join(homedir(), ".openclaw", "logs", "commands.log")),
    describeLogFreshness(join(homedir(), ".openclaw", "logs", "gateway.err.log")),
  ];
  const runtimeDriftSuspected = isLikelyRuntimeDrift(versionMismatch, logFreshness);

  const result = {
    openclaw_config_path: configPath,
    config_last_touched_version: configVersion,
    openclaw_cli_version: cliVersion,
    version_mismatch: versionMismatch,
    plugin_source_path: sourcePath,
    plugin_install_path: installPath,
    source_path_exists: sourcePath ? existsSync(sourcePath) : false,
    install_path_exists: installPath ? existsSync(installPath) : false,
    expected_dist_entry: sourcePath ? existsSync(resolve(sourcePath, "dist", "index.js")) : false,
    gateway_health: health,
    config_trace_enabled: configTraceEnabled,
    env_trace_enabled: envTraceEnabled,
    trace_enabled: traceEnabled,
    log_freshness: logFreshness,
    runtime_drift_suspected: runtimeDriftSuspected,
    expected_log_prefix: "[agora-plugin-trace]",
    next_human_smoke: [
      "/task create",
      "/task guided-task-debug",
      "/task coding",
    ],
    notes: [
      "trace logs are emitted through the OpenClaw gateway logger",
      "if trace_enabled=false, export AGORA_PLUGIN_TRACE_NATIVE_SLASH=true before restarting the gateway",
    ],
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readConfig(path: string): OpenClawConfig | null {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as OpenClawConfig;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return null;
}

export function describeLogFreshness(path: string, now = new Date()): LogFreshness {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      stale: true,
    };
  }
  const stats = statSync(path);
  const ageMinutes = Math.round((now.getTime() - stats.mtime.getTime()) / 60000);
  return {
    path,
    exists: true,
    mtime: stats.mtime.toISOString(),
    ageMinutes,
    stale: ageMinutes > 60,
  };
}

export function isLikelyRuntimeDrift(versionMismatch: boolean | null, logFreshness: LogFreshness[]): boolean {
  const staleGatewayLog = logFreshness.find((item) => item.path.endsWith("/gateway.log"))?.stale ?? true;
  const staleCommandsLog = logFreshness.find((item) => item.path.endsWith("/commands.log"))?.stale ?? true;
  const freshErrLog = (logFreshness.find((item) => item.path.endsWith("/gateway.err.log"))?.stale ?? true) === false;
  return Boolean(versionMismatch) || ((staleGatewayLog || staleCommandsLog) && freshErrLog);
}

function readOpenClawCliVersion() {
  const result = spawnSync("openclaw", ["--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  const output = (result.stdout || result.stderr || "").trim();
  const match = output.match(/OpenClaw\s+([0-9.]+)/i);
  return match?.[1] ?? null;
}

async function probeGateway(url: string) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: text,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: error instanceof Error ? error.message : String(error),
      url,
    };
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  void main();
}
