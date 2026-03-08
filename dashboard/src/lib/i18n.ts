import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { resources } from '@/locales/resources';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_STORAGE_KEY = 'agora-locale';

function isBrowser() {
  return typeof window !== 'undefined';
}

function getBrowserStorage() {
  if (!isBrowser()) return null;
  const storage = window.localStorage;
  if (
    typeof storage?.getItem !== 'function'
    || typeof storage?.setItem !== 'function'
  ) {
    return null;
  }
  return storage;
}

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  return input.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export function detectInitialLocale(): Locale {
  if (!isBrowser()) return DEFAULT_LOCALE;

  const stored = getBrowserStorage()?.getItem(LOCALE_STORAGE_KEY);
  if (stored) return normalizeLocale(stored);

  return normalizeLocale(window.navigator.language);
}

function setDocumentLanguage(locale: Locale) {
  if (!isBrowser()) return;
  document.documentElement.lang = locale;
}

const initialLocale = detectInitialLocale();

const initPromise = i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    escapeValue: false,
  },
});

i18n.on('languageChanged', (language) => {
  setDocumentLanguage(normalizeLocale(language));
});

setDocumentLanguage(initialLocale);

export async function ensureI18nReady() {
  await initPromise;
}

export async function setLocale(locale: Locale) {
  await ensureI18nReady();
  await i18n.changeLanguage(locale);
  getBrowserStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
  setDocumentLanguage(locale);
}

export function getLocale(): Locale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language ?? initialLocale);
}

export function translate(key: string, options?: Record<string, unknown>) {
  return i18n.t(key, options) as string;
}

export function useLocale() {
  const { i18n: i18nInstance } = useTranslation();
  const locale = normalizeLocale(i18nInstance.resolvedLanguage ?? i18nInstance.language);

  return {
    locale,
    locales: SUPPORTED_LOCALES,
    setLocale,
  };
}

export default i18n;
