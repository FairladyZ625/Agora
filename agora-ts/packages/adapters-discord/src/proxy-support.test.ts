import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureDiscordProxySupportForTests,
  type DiscordProxyEnvironment,
  ensureDiscordGatewayProxy,
  resetDiscordGatewayProxyBootstrapForTests,
  resolveDiscordProxyEnvironment,
  sanitizeProxyForLogs,
} from './proxy-support.js';

describe('proxy-support', () => {
  afterEach(() => {
    resetDiscordGatewayProxyBootstrapForTests();
  });

  it('prefers explicit https proxy and falls back to all_proxy/http_proxy', () => {
    expect(resolveDiscordProxyEnvironment({
      HTTPS_PROXY: 'http://127.0.0.1:7897',
      HTTP_PROXY: 'http://127.0.0.1:8080',
      ALL_PROXY: 'socks5://127.0.0.1:1080',
    })).toEqual({
      enabled: true,
      httpsProxy: 'http://127.0.0.1:7897',
      httpProxy: 'http://127.0.0.1:8080',
      noProxy: null,
    });
  });

  it('bootstraps global-agent once and updates global proxy state', () => {
    const bootstrap = vi.fn();
    const env: DiscordProxyEnvironment = {
      HTTPS_PROXY: 'http://127.0.0.1:7897',
      HTTP_PROXY: 'http://127.0.0.1:7897',
      NO_PROXY: 'localhost,127.0.0.1',
    };

    const first = ensureDiscordGatewayProxy(env, bootstrap);
    const second = ensureDiscordGatewayProxy(env, bootstrap);

    expect(first.enabled).toBe(true);
    expect(second.enabled).toBe(true);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(env.GLOBAL_AGENT_HTTPS_PROXY).toBe('http://127.0.0.1:7897');
    expect(env.GLOBAL_AGENT_HTTP_PROXY).toBe('http://127.0.0.1:7897');
    expect(env.GLOBAL_AGENT_NO_PROXY).toBe('localhost,127.0.0.1');
  });

  it('sanitizes credentials in proxy logs', () => {
    expect(sanitizeProxyForLogs('http://user:secret@127.0.0.1:7897')).toBe('http://127.0.0.1:7897');
  });

  it('auto-detects a local proxy from macOS PAC when env vars are absent', async () => {
    configureDiscordProxySupportForTests({
      platform: () => 'darwin',
      execFileSync: ((file: string) => {
        if (file === 'scutil') {
          return `ProxyAutoConfigEnable : 1\nProxyAutoConfigURLString : http://127.0.0.1:33331/commands/pac\n`;
        }
        if (file === 'curl') {
          return 'function FindProxyForURL(url, host) { return "PROXY 127.0.0.1:7897; SOCKS5 127.0.0.1:7897; DIRECT;"; }';
        }
        throw new Error(`unexpected command: ${file}`);
      }) as never,
    });

    expect(resolveDiscordProxyEnvironment({})).toEqual({
      enabled: true,
      httpsProxy: 'http://127.0.0.1:7897',
      httpProxy: 'http://127.0.0.1:7897',
      noProxy: null,
    });
  });
});
