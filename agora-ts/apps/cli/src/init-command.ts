import { dirname, resolve } from 'node:path';
import { input, select, confirm } from '@inquirer/prompts';
import {
  defaultAgoraDbPath,
  ensureBundledAgoraAssetsInstalled,
  loadGlobalConfig,
  resolveAgoraRuntimeEnvironmentFromConfigPackage,
  resolveUserAgoraSkillDir,
  resolveUserSkillDirs,
  saveGlobalConfig,
} from '@agora-ts/config';
import type { HumanAccountService } from '@agora-ts/core';
import {
  detectOpenClawPluginSetupEnvironment,
  setupOpenClawAgoraPlugin,
} from './openclaw-plugin-setup.js';

export interface RunInitCommandOptions {
  humanAccountService?: HumanAccountService;
  bundledSkillsDir?: string;
  bundledBrainPackDir?: string;
  userAgoraDir?: string;
  userSkillDirs?: string[];
  runtimeEnvironment?: {
    projectRoot: string;
    serverUrl: string;
  };
  detectOpenClawSetupEnvironment?: typeof detectOpenClawPluginSetupEnvironment;
  setupOpenClawPlugin?: typeof setupOpenClawAgoraPlugin;
}

export async function runInitCommand(options: RunInitCommandOptions = {}): Promise<void> {
  console.log('\nAgora 初始化向导\n');

  const existing = loadGlobalConfig();
  const runtimeEnvironment = options.runtimeEnvironment ?? resolveAgoraRuntimeEnvironmentFromConfigPackage();
  const detectOpenClawSetupEnvironment = options.detectOpenClawSetupEnvironment ?? detectOpenClawPluginSetupEnvironment;
  const setupOpenClawPlugin = options.setupOpenClawPlugin ?? setupOpenClawAgoraPlugin;
  const existingIm = (existing.im as Record<string, unknown> | undefined) ?? {};
  const existingDiscord = (existingIm.discord as Record<string, unknown> | undefined) ?? {};
  const existingDashboardAuth = (existing.dashboard_auth as Record<string, unknown> | undefined) ?? {};
  const existingPermissions = (existing.permissions as Record<string, unknown> | undefined) ?? {};
  const existingArchonUsers = Array.isArray(existingPermissions.archonUsers)
    ? existingPermissions.archonUsers.filter((value): value is string => typeof value === 'string')
    : [];

  const adminUsername = await input({
    message: '首个管理员用户名（Dashboard / IM 人类审批身份）',
    default: existingArchonUsers[0] ?? 'admin',
    validate: (value) => value.trim().length > 0 || '管理员用户名不能为空',
  });

  const adminPassword = await input({
    message: '首个管理员密码（至少 8 位）',
    validate: (value) => value.trim().length >= 8 || '密码至少 8 位',
  });

  const provider = await select({
    message: '选择 IM 提供商',
    choices: [
      { name: 'Discord', value: 'discord' },
      { name: '暂不配置 (none)', value: 'none' },
    ],
    default: (existingIm.provider as string | undefined) ?? 'none',
  });

  if (provider === 'none') {
    const config = {
      ...existing,
      db_path: typeof existing.db_path === 'string' ? existing.db_path : defaultAgoraDbPath(),
      im: { provider: 'none' },
      dashboard_auth: {
        enabled: true,
        method: 'session',
        allowed_users: [],
        session_ttl_hours: Number(existingDashboardAuth.session_ttl_hours ?? 24),
      },
      permissions: {
        ...existingPermissions,
        archonUsers: Array.from(new Set([...existingArchonUsers, adminUsername.trim()])),
      },
    };
    saveGlobalConfig(config);
    const assets = ensureInstalledAssets(options);
    options.humanAccountService?.bootstrapAdmin({
      username: adminUsername.trim(),
      password: adminPassword,
    });
    console.log('\n配置已保存（无 IM 集成）');
    logInstalledAssets(assets);
    await maybeSetupOpenClawIntegration({
      config,
      runtimeEnvironment,
      detectOpenClawSetupEnvironment,
      setupOpenClawPlugin,
    });
    return;
  }

  // Discord config
  const botToken = await input({
    message: 'Discord Bot Token',
    default: (existingDiscord.bot_token as string | undefined) ?? '',
    validate: (v) => v.trim().length > 0 || 'Bot Token 不能为空',
  });

  const defaultChannelId = await input({
    message: '默认频道 ID（任务创建时在此频道建 thread）',
    default: (existingDiscord.default_channel_id as string | undefined) ?? '',
    validate: (v) => v.trim().length > 0 || '频道 ID 不能为空',
  });

  const notifyOnTaskCreate = await confirm({
    message: '创建任务时自动建 Discord thread？',
    default: (existingDiscord.notify_on_task_create as boolean | undefined) ?? true,
  });

  const discordHumanUserId = await input({
    message: '管理员 Discord 用户 ID（用于人类在 Discord 中审批，可留空跳过）',
    default: '',
  });

  const config = {
    ...existing,
    db_path: typeof existing.db_path === 'string' ? existing.db_path : defaultAgoraDbPath(),
    im: {
      provider: 'discord',
      discord: {
        bot_token: botToken.trim(),
        default_channel_id: defaultChannelId.trim(),
        notify_on_task_create: notifyOnTaskCreate,
      },
    },
    dashboard_auth: {
      enabled: true,
      method: 'session',
      allowed_users: [],
      session_ttl_hours: Number(existingDashboardAuth.session_ttl_hours ?? 24),
    },
    permissions: {
      ...existingPermissions,
      archonUsers: Array.from(new Set([...existingArchonUsers, adminUsername.trim()])),
    },
  };

  saveGlobalConfig(config);
  const assets = ensureInstalledAssets(options);
  if (options.humanAccountService) {
    options.humanAccountService.bootstrapAdmin({
      username: adminUsername.trim(),
      password: adminPassword,
    });
    if (discordHumanUserId.trim()) {
      options.humanAccountService.bindIdentity({
        username: adminUsername.trim(),
        provider: 'discord',
        externalUserId: discordHumanUserId.trim(),
      });
    }
  }
  console.log('\n配置已保存到 ~/.agora/agora.json');
  console.log(`  IM 提供商: discord`);
  console.log(`  默认频道: ${defaultChannelId.trim()}`);
  console.log(`  创建任务时建 thread: ${notifyOnTaskCreate ? '是' : '否'}`);
  console.log(`  Dashboard Session: 已启用`);
  logInstalledAssets(assets);
  console.log(`  管理员: ${adminUsername.trim()}`);
  if (discordHumanUserId.trim()) {
    console.log(`  管理员 Discord 用户 ID: ${discordHumanUserId.trim()}`);
  }
  await maybeSetupOpenClawIntegration({
    config,
    runtimeEnvironment,
    detectOpenClawSetupEnvironment,
    setupOpenClawPlugin,
  });
}

function resolveBundledSkillsDir(options: RunInitCommandOptions) {
  return options.bundledSkillsDir ?? resolve(dirname(new URL(import.meta.url).pathname), '../../../../.skills');
}

function resolveBundledBrainPackDir(options: RunInitCommandOptions) {
  return options.bundledBrainPackDir ?? resolve(dirname(new URL(import.meta.url).pathname), '../../../../agora-ai-brain');
}

function ensureInstalledAssets(options: RunInitCommandOptions) {
  return ensureBundledAgoraAssetsInstalled({
    projectRoot: resolve(dirname(new URL(import.meta.url).pathname), '../../../..'),
    bundledSkillsDir: resolveBundledSkillsDir(options),
    bundledBrainPackDir: resolveBundledBrainPackDir(options),
    ...(options.userAgoraDir ? { userAgoraDir: options.userAgoraDir } : {}),
    ...(options.userSkillDirs ? { userSkillDirs: options.userSkillDirs } : {}),
  });
}

function logInstalledAssets(assets: ReturnType<typeof ensureInstalledAssets>) {
  console.log(`  Agora Home: ${assets.userAgoraDir}`);
  console.log(`  Agora Bootstrap Skill: 已安装到 ${assets.agoraSkillDir}`);
  const mirrorTargets = assets.installedSkillTargets.filter((target) => target !== assets.agoraSkillDir);
  if (mirrorTargets.length > 0) {
    console.log(`  Agent Skill Mirrors: ${mirrorTargets.join(', ')}`);
  }
  const expectedMirrors = resolveUserSkillDirs({ userSkillDirs: assets.userSkillDirs });
  const unresolvedMirrors = expectedMirrors
    .map((dir) => resolve(dir, 'agora-bootstrap'))
    .filter((target) => !mirrorTargets.includes(target));
  if (unresolvedMirrors.length > 0) {
    console.log(`  Agent Skill Mirrors (missing source): ${unresolvedMirrors.join(', ')}`);
  }
  console.log(`  Agora Brain Pack: ${assets.userBrainPackDir}`);
  console.log(`  Skill Doctor: 期望路径包括 ${resolveUserAgoraSkillDir({ userAgoraDir: assets.userAgoraDir })}`);
}

async function maybeSetupOpenClawIntegration(args: {
  config: Record<string, unknown>;
  runtimeEnvironment: {
    projectRoot: string;
    serverUrl: string;
  };
  detectOpenClawSetupEnvironment: typeof detectOpenClawPluginSetupEnvironment;
  setupOpenClawPlugin: typeof setupOpenClawAgoraPlugin;
}) {
  const pluginSourcePath = resolve(args.runtimeEnvironment.projectRoot, 'extensions/agora-plugin');
  const environment = await args.detectOpenClawSetupEnvironment({
    pluginSourcePath,
    ...(process.env.AGORA_OPENCLAW_CONFIG_PATH ? { openClawConfigPath: process.env.AGORA_OPENCLAW_CONFIG_PATH } : {}),
  });

  if (!environment.openClawCommandAvailable && !environment.openClawConfigExists) {
    console.log('\n未检测到 OpenClaw，本次仅完成 Agora 自身初始化。');
    console.log('如需接入 OpenClaw，请先安装/初始化 OpenClaw，再重新运行 `./agora init`。');
    return;
  }

  if (!environment.pluginSourceExists) {
    console.log('\n检测到 OpenClaw，但未检测到本地 Agora plugin 源码，跳过自动接线。');
    console.log(`期望插件路径: ${environment.pluginSourcePath}`);
    console.log('请确认你使用的是完整 Agora 仓库源码，然后参考白皮书继续手工安装。');
    return;
  }

  console.log('\n检测到 OpenClaw 环境。');
  console.log('Agora 可以自动完成以下安全操作：');
  console.log('- 构建本地 agora-plugin');
  console.log('- 备份并更新 openclaw.json 中的插件注册与 serverUrl/apiToken');
  console.log('以下内容不会自动修改：Discord bot token、allowBots、requireMention、channel allowlist、systemPrompt。');

  const shouldSetup = await confirm({
    message: '现在自动接入 OpenClaw 的 Agora plugin？',
    default: true,
  });

  if (!shouldSetup) {
    console.log('已跳过 OpenClaw 自动接线。请按白皮书中的手工步骤完成剩余配置。');
    return;
  }

  const typedConfig = args.config as {
    api_auth?: {
      enabled?: boolean;
      token?: string;
    };
  };
  const apiToken = typedConfig.api_auth?.enabled
    ? (typeof typedConfig.api_auth.token === 'string' ? typedConfig.api_auth.token : null)
    : null;
  const result = await args.setupOpenClawPlugin({
    openClawConfigPath: environment.openClawConfigPath,
    pluginSourcePath: environment.pluginSourcePath,
    serverUrl: args.runtimeEnvironment.serverUrl,
    apiToken,
  });

  console.log('\nOpenClaw Agora plugin 已接线完成。');
  console.log(`  OpenClaw Config: ${result.openClawConfigPath}`);
  if (result.backupPath) {
    console.log(`  Config Backup: ${result.backupPath}`);
  }
  console.log(`  Plugin Version: ${result.pluginVersion ?? 'unknown'}`);
  console.log('  验证命令: openclaw plugins info agora');
}
