import { beforeEach, describe, expect, it } from 'vitest';
import i18n, {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectInitialLocale,
  ensureI18nReady,
  setLocale,
} from '@/lib/i18n';

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language,
  });
}

describe('dashboard i18n', () => {
  beforeEach(async () => {
    await ensureI18nReady();
    localStorage.clear();
    setNavigatorLanguage('zh-CN');
    await i18n.changeLanguage(DEFAULT_LOCALE);
    document.documentElement.lang = DEFAULT_LOCALE;
  });

  it('uses the browser language when no manual locale is stored', () => {
    setNavigatorLanguage('en-US');

    expect(detectInitialLocale()).toBe('en-US');
  });

  it('prefers the stored locale over the browser language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN');
    setNavigatorLanguage('en-US');

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('persists manual locale changes and syncs document language', async () => {
    await setLocale('en-US');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en-US');
    expect(i18n.resolvedLanguage).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });
});
