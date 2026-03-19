import { execFileSync } from 'node:child_process';
import { bootstrap as bootstrapGlobalAgent } from 'global-agent';

export interface DiscordProxyEnvironment {
  https_proxy?: string;
  HTTPS_PROXY?: string;
  http_proxy?: string;
  HTTP_PROXY?: string;
  all_proxy?: string;
  ALL_PROXY?: string;
  no_proxy?: string;
  NO_PROXY?: string;
  GLOBAL_AGENT_HTTP_PROXY?: string;
  GLOBAL_AGENT_HTTPS_PROXY?: string;
  GLOBAL_AGENT_NO_PROXY?: string;
}

export interface DiscordGatewayProxyBootstrapResult {
  enabled: boolean;
  bootstrapped: boolean;
  httpProxy: string | null;
  httpsProxy: string | null;
  noProxy: string | null;
}

type GlobalAgentShape = {
  HTTP_PROXY?: string;
  HTTPS_PROXY?: string;
  NO_PROXY?: string;
};

let globalAgentBootstrapped = false;
let cachedAutoProxy: { httpProxy: string | null; httpsProxy: string | null; noProxy: string | null } | null = null;
const proxySupportHooks = {
  execFileSync,
  platform: () => process.platform,
};

export function resolveDiscordProxyEnvironment(env: DiscordProxyEnvironment = process.env): Omit<DiscordGatewayProxyBootstrapResult, 'bootstrapped' | 'enabled'> & { enabled: boolean } {
  let httpsProxy = firstProxyValue([
    env.https_proxy,
    env.HTTPS_PROXY,
    env.all_proxy,
    env.ALL_PROXY,
    env.http_proxy,
    env.HTTP_PROXY,
  ]);
  let httpProxy = firstProxyValue([
    env.http_proxy,
    env.HTTP_PROXY,
    env.all_proxy,
    env.ALL_PROXY,
    env.https_proxy,
    env.HTTPS_PROXY,
  ]);
  const noProxy = firstProxyValue([
    env.no_proxy,
    env.NO_PROXY,
  ]);
  if (!httpsProxy && !httpProxy) {
    const autoDetected = detectMacOSProxyFallback();
    httpsProxy = autoDetected.httpsProxy;
    httpProxy = autoDetected.httpProxy;
  }
  return {
    enabled: Boolean(httpProxy || httpsProxy),
    httpProxy,
    httpsProxy,
    noProxy,
  };
}

export function ensureDiscordGatewayProxy(
  env: DiscordProxyEnvironment = process.env,
  bootstrap: () => void = bootstrapGlobalAgent,
): DiscordGatewayProxyBootstrapResult {
  const resolved = resolveDiscordProxyEnvironment(env);
  if (!resolved.enabled) {
    return {
      enabled: false,
      bootstrapped: false,
      httpProxy: null,
      httpsProxy: null,
      noProxy: resolved.noProxy,
    };
  }

  if (resolved.httpProxy) {
    env.GLOBAL_AGENT_HTTP_PROXY = resolved.httpProxy;
  }
  if (resolved.httpsProxy) {
    env.GLOBAL_AGENT_HTTPS_PROXY = resolved.httpsProxy;
  }
  if (resolved.noProxy) {
    env.GLOBAL_AGENT_NO_PROXY = resolved.noProxy;
  }

  if (!globalAgentBootstrapped) {
    bootstrap();
    globalAgentBootstrapped = true;
  }

  const globalAgent = getGlobalAgent();
  if (globalAgent) {
    if (resolved.httpProxy) {
      globalAgent.HTTP_PROXY = resolved.httpProxy;
    }
    if (resolved.httpsProxy) {
      globalAgent.HTTPS_PROXY = resolved.httpsProxy;
    }
    if (resolved.noProxy) {
      globalAgent.NO_PROXY = resolved.noProxy;
    }
  }

  return {
    enabled: true,
    bootstrapped: globalAgentBootstrapped,
    httpProxy: resolved.httpProxy,
    httpsProxy: resolved.httpsProxy,
    noProxy: resolved.noProxy,
  };
}

export function sanitizeProxyForLogs(proxyUrl: string | null): string | null {
  if (!proxyUrl) {
    return null;
  }
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return proxyUrl.replace(/\/\/.*@/, '//');
  }
}

export function resetDiscordGatewayProxyBootstrapForTests() {
  globalAgentBootstrapped = false;
  cachedAutoProxy = null;
  const globalAgent = getGlobalAgent();
  if (globalAgent) {
    delete globalAgent.HTTP_PROXY;
    delete globalAgent.HTTPS_PROXY;
    delete globalAgent.NO_PROXY;
  }
  proxySupportHooks.execFileSync = execFileSync;
  proxySupportHooks.platform = () => process.platform;
}

function firstProxyValue(values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getGlobalAgent() {
  return (globalThis as typeof globalThis & { GLOBAL_AGENT?: GlobalAgentShape }).GLOBAL_AGENT;
}

function detectMacOSProxyFallback() {
  if (cachedAutoProxy) {
    return cachedAutoProxy;
  }
  cachedAutoProxy = detectMacOSProxyFallbackUncached();
  return cachedAutoProxy;
}

function detectMacOSProxyFallbackUncached() {
  if (proxySupportHooks.platform() !== 'darwin') {
    return { httpProxy: null, httpsProxy: null, noProxy: null };
  }
  try {
    const scutilOutput = proxySupportHooks.execFileSync('scutil', ['--proxy'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pacUrl = matchScutilValue(scutilOutput, 'ProxyAutoConfigURLString');
    const pacEnabled = matchScutilValue(scutilOutput, 'ProxyAutoConfigEnable') === '1';
    if (!pacEnabled || !pacUrl || !/^http:\/\/127\.0\.0\.1:\d+\//.test(pacUrl)) {
      return { httpProxy: null, httpsProxy: null, noProxy: null };
    }
    const pacBody = proxySupportHooks.execFileSync('curl', ['--silent', '--show-error', '--max-time', '2', pacUrl], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = pacBody.match(/\bPROXY\s+([0-9.]+:\d+)/i) ?? pacBody.match(/\bSOCKS5?\s+([0-9.]+:\d+)/i);
    if (!match?.[1]) {
      return { httpProxy: null, httpsProxy: null, noProxy: null };
    }
    const proxy = `http://${match[1]}`;
    return {
      httpProxy: proxy,
      httpsProxy: proxy,
      noProxy: null,
    };
  } catch {
    return { httpProxy: null, httpsProxy: null, noProxy: null };
  }
}

function matchScutilValue(body: string, key: string) {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'm');
  const match = body.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function configureDiscordProxySupportForTests(overrides: {
  execFileSync?: typeof execFileSync;
  platform?: () => NodeJS.Platform;
}) {
  if (overrides.execFileSync) {
    proxySupportHooks.execFileSync = overrides.execFileSync;
  }
  if (overrides.platform) {
    proxySupportHooks.platform = overrides.platform;
  }
  cachedAutoProxy = null;
}
