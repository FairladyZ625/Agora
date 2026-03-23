#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type OpenClawConfig = {
  plugins?: {
    load?: {
      paths?: string[];
    };
    installs?: Record<string, { sourcePath?: string; installPath?: string }>;
  };
};

async function main() {
  const configPath = process.env.OPENCLAW_CONFIG_PATH || join(homedir(), ".openclaw", "openclaw.json");
  const config = readConfig(configPath);
  const agoraInstall = config?.plugins?.installs?.agora;
  const sourcePath = agoraInstall?.sourcePath || config?.plugins?.load?.paths?.[0] || null;
  const installPath = agoraInstall?.installPath || null;
  const traceEnabled = process.env.AGORA_PLUGIN_TRACE_NATIVE_SLASH === "1"
    || process.env.AGORA_PLUGIN_TRACE_NATIVE_SLASH?.toLowerCase() === "true";
  const health = await probeGateway(process.env.OPENCLAW_GATEWAY_HEALTH_URL || "http://127.0.0.1:18789/health");

  const result = {
    openclaw_config_path: configPath,
    plugin_source_path: sourcePath,
    plugin_install_path: installPath,
    source_path_exists: sourcePath ? existsSync(sourcePath) : false,
    install_path_exists: installPath ? existsSync(installPath) : false,
    expected_dist_entry: sourcePath ? existsSync(resolve(sourcePath, "dist", "index.js")) : false,
    gateway_health: health,
    trace_enabled: traceEnabled,
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

void main();
