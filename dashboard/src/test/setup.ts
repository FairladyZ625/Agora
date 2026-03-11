import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

function installLocalStorageMock() {
  if (typeof window === 'undefined') {
    return;
  }
  const storage = new Map<string, string>();
  const mock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };

  const candidate = globalThis.window?.localStorage as Partial<typeof mock> | undefined;
  if (
    !candidate
    || typeof candidate.getItem !== 'function'
    || typeof candidate.setItem !== 'function'
    || typeof candidate.removeItem !== 'function'
    || typeof candidate.clear !== 'function'
  ) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: mock,
    });
  }
}

installLocalStorageMock();

if (typeof window !== 'undefined') {
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
}

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
  if (typeof window === 'undefined') {
    return;
  }
  const { default: i18n } = await import('@/lib/i18n');
  localStorage.clear();
  await i18n.changeLanguage('zh-CN');
  document.documentElement.lang = 'zh-CN';
});
