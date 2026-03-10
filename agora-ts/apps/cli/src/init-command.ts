import { input, select, confirm } from '@inquirer/prompts';
import { loadGlobalConfig, saveGlobalConfig } from '@agora-ts/config';

export async function runInitCommand(): Promise<void> {
  console.log('\nAgora 初始化向导\n');

  const existing = loadGlobalConfig();
  const existingIm = (existing.im as Record<string, unknown> | undefined) ?? {};
  const existingDiscord = (existingIm.discord as Record<string, unknown> | undefined) ?? {};

  const provider = await select({
    message: '选择 IM 提供商',
    choices: [
      { name: 'Discord', value: 'discord' },
      { name: '暂不配置 (none)', value: 'none' },
    ],
    default: (existingIm.provider as string | undefined) ?? 'none',
  });

  if (provider === 'none') {
    const config = { ...existing, im: { provider: 'none' } };
    saveGlobalConfig(config);
    console.log('\n配置已保存（无 IM 集成）');
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

  const config = {
    ...existing,
    im: {
      provider: 'discord',
      discord: {
        bot_token: botToken.trim(),
        default_channel_id: defaultChannelId.trim(),
        notify_on_task_create: notifyOnTaskCreate,
      },
    },
  };

  saveGlobalConfig(config);
  console.log('\n配置已保存到 ~/.agora/agora.json');
  console.log(`  IM 提供商: discord`);
  console.log(`  默认频道: ${defaultChannelId.trim()}`);
  console.log(`  创建任务时建 thread: ${notifyOnTaskCreate ? '是' : '否'}`);
}
