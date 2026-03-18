import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  loadOpenClawConfigDocument,
  resolveOpenClawConfigPath,
  upsertAgoraPluginRegistration,
} from '@agora-ts/adapters-openclaw';

const execFileAsync = promisify(execFile);

export interface DetectOpenClawPluginSetupEnvironmentOptions {
  openClawConfigPath?: string;
  pluginSourcePath: string;
}

export interface OpenClawPluginSetupEnvironment {
  openClawCommandAvailable: boolean;
  openClawConfigPath: string;
  openClawConfigExists: boolean;
  pluginSourcePath: string;
  pluginSourceExists: boolean;
  pluginPackagePath: string;
}

export interface SetupOpenClawAgoraPluginOptions {
  openClawConfigPath?: string;
  pluginSourcePath: string;
  serverUrl: string;
  apiToken?: string | null;
}

export interface SetupOpenClawAgoraPluginResult {
  openClawConfigPath: string;
  backupPath: string | null;
  configCreated: boolean;
  pluginVersion: string | null;
}

interface RunCommandArgs {
  command: string;
  args: string[];
  cwd?: string;
}

export interface OpenClawPluginSetupDependencies {
  commandExists: (command: string) => Promise<boolean>;
  runCommand: (input: RunCommandArgs) => Promise<void>;
  now: () => Date;
}

const defaultDeps: OpenClawPluginSetupDependencies = {
  commandExists: async (command) => {
    try {
      await execFileAsync(command, ['--version']);
      return true;
    } catch {
      return false;
    }
  },
  runCommand: async ({ command, args, cwd }) => {
    await execFileAsync(command, args, cwd ? { cwd } : {});
  },
  now: () => new Date(),
};

export async function detectOpenClawPluginSetupEnvironment(
  options: DetectOpenClawPluginSetupEnvironmentOptions,
  deps: Partial<OpenClawPluginSetupDependencies> = {},
): Promise<OpenClawPluginSetupEnvironment> {
  const resolvedDeps = { ...defaultDeps, ...deps };
  const openClawConfigPath = resolveOpenClawConfigPath(options.openClawConfigPath);
  const pluginSourcePath = resolve(options.pluginSourcePath);
  const pluginPackagePath = resolve(pluginSourcePath, 'package.json');

  return {
    openClawCommandAvailable: await resolvedDeps.commandExists('openclaw'),
    openClawConfigPath,
    openClawConfigExists: existsSync(openClawConfigPath),
    pluginSourcePath,
    pluginSourceExists: existsSync(pluginPackagePath),
    pluginPackagePath,
  };
}

export async function setupOpenClawAgoraPlugin(
  options: SetupOpenClawAgoraPluginOptions,
  deps: Partial<OpenClawPluginSetupDependencies> = {},
): Promise<SetupOpenClawAgoraPluginResult> {
  const resolvedDeps = { ...defaultDeps, ...deps };
  const environment = await detectOpenClawPluginSetupEnvironment({
    pluginSourcePath: options.pluginSourcePath,
    ...(options.openClawConfigPath ? { openClawConfigPath: options.openClawConfigPath } : {}),
  }, resolvedDeps);

  if (!environment.pluginSourceExists) {
    throw new Error(`Agora plugin source was not found at ${environment.pluginSourcePath}`);
  }

  await resolvedDeps.runCommand({
    command: 'npm',
    args: ['install'],
    cwd: environment.pluginSourcePath,
  });
  await resolvedDeps.runCommand({
    command: 'npm',
    args: ['run', 'build'],
    cwd: environment.pluginSourcePath,
  });

  const pluginVersion = readPluginVersion(environment.pluginPackagePath);
  const document = loadOpenClawConfigDocument({ configPath: environment.openClawConfigPath });
  const next = upsertAgoraPluginRegistration(document.data, {
    pluginPath: environment.pluginSourcePath,
    serverUrl: options.serverUrl,
    apiToken: options.apiToken ?? null,
    installedAt: resolvedDeps.now().toISOString(),
    ...(pluginVersion ? { version: pluginVersion } : {}),
  });

  mkdirSync(dirname(environment.openClawConfigPath), { recursive: true });
  const backupPath = document.exists ? `${environment.openClawConfigPath}.bak` : null;
  if (backupPath) {
    copyFileSync(environment.openClawConfigPath, backupPath);
  }
  writeFileSync(environment.openClawConfigPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  return {
    openClawConfigPath: environment.openClawConfigPath,
    backupPath,
    configCreated: !document.exists,
    pluginVersion,
  };
}

function readPluginVersion(packagePath: string) {
  const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
  return typeof parsed.version === 'string' ? parsed.version : null;
}
