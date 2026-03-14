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

export function resolveDiscordProxyEnvironment(env: DiscordProxyEnvironment = process.env): Omit<DiscordGatewayProxyBootstrapResult, 'bootstrapped' | 'enabled'> & { enabled: boolean } {
  const httpsProxy = firstProxyValue([
    env.https_proxy,
    env.HTTPS_PROXY,
    env.all_proxy,
    env.ALL_PROXY,
    env.http_proxy,
    env.HTTP_PROXY,
  ]);
  const httpProxy = firstProxyValue([
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
  const globalAgent = getGlobalAgent();
  if (globalAgent) {
    delete globalAgent.HTTP_PROXY;
    delete globalAgent.HTTPS_PROXY;
    delete globalAgent.NO_PROXY;
  }
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
