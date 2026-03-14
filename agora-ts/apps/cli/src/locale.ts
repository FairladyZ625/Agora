export type CliLocale = 'zh-CN' | 'en-US';

export function resolveCliLocale(env: NodeJS.ProcessEnv = process.env): CliLocale {
  const explicit = env.AGORA_LOCALE?.trim();
  if (explicit === 'zh-CN' || explicit === 'en-US') {
    return explicit;
  }

  const lang = env.LANG?.toLowerCase() ?? '';
  if (lang.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en-US';
}

export function cliText(locale: CliLocale, zh: string, en: string) {
  return locale === 'zh-CN' ? zh : en;
}
