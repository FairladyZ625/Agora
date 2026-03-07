import '@testing-library/jest-dom/vitest';
import i18n from '@/lib/i18n';
import { beforeEach } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverMock {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

globalThis.ResizeObserver = ResizeObserverMock;

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('zh-CN');
  document.documentElement.lang = 'zh-CN';
});
