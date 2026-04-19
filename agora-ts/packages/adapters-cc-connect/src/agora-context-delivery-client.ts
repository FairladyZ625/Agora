import {
  projectContextDeliveryResponseSchema,
  type ProjectContextDeliveryResponseDto,
} from '@agora-ts/contracts';

const DEFAULT_TIMEOUT_MS = 5_000;

type FetchJsonResult = {
  status: number;
  json: unknown;
};

type FetchJson = (url: string, init: {
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  timeoutMs: number;
  body?: string;
}) => Promise<FetchJsonResult>;

export interface CcConnectAgoraContextDeliveryClientOptions {
  fetchJson?: FetchJson;
}

export interface CcConnectAgoraApiInput {
  apiBaseUrl: string;
  apiToken?: string;
  timeoutMs?: number;
}

export interface CcConnectTaskContextDeliveryInput extends CcConnectAgoraApiInput {
  taskId: string;
  audience: 'controller' | 'citizen' | 'craftsman';
  citizenId?: string;
  allowedCitizenIds?: string[];
}

export interface CcConnectCurrentTaskContextDeliveryInput extends CcConnectAgoraApiInput {
  provider?: string;
  threadRef?: string;
  conversationRef?: string;
  audience: 'controller' | 'citizen' | 'craftsman';
  citizenId?: string;
  allowedCitizenIds?: string[];
}

export class CcConnectAgoraContextDeliveryClient {
  private readonly fetchJson: FetchJson;

  constructor(options: CcConnectAgoraContextDeliveryClientOptions = {}) {
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  async getTaskContextDelivery(
    input: CcConnectTaskContextDeliveryInput,
  ): Promise<ProjectContextDeliveryResponseDto> {
    return this.request(
      input,
      `/api/tasks/${encodeURIComponent(input.taskId)}/context/delivery`,
      {
        audience: input.audience,
        ...(input.citizenId !== undefined ? { citizen_id: input.citizenId } : {}),
        ...(input.allowedCitizenIds && input.allowedCitizenIds.length > 0
          ? { allowed_citizen_ids: input.allowedCitizenIds }
          : {}),
      },
    );
  }

  async getCurrentTaskContextDelivery(
    input: CcConnectCurrentTaskContextDeliveryInput,
  ): Promise<ProjectContextDeliveryResponseDto> {
    return this.request(input, '/api/im/tasks/current/context/delivery', {
      provider: input.provider ?? 'discord',
      ...(input.threadRef !== undefined ? { thread_ref: input.threadRef } : {}),
      ...(input.conversationRef !== undefined ? { conversation_ref: input.conversationRef } : {}),
      audience: input.audience,
      ...(input.citizenId !== undefined ? { citizen_id: input.citizenId } : {}),
      ...(input.allowedCitizenIds && input.allowedCitizenIds.length > 0
        ? { allowed_citizen_ids: input.allowedCitizenIds }
        : {}),
    });
  }

  private async request(
    input: CcConnectAgoraApiInput,
    path: string,
    body: Record<string, unknown>,
  ): Promise<ProjectContextDeliveryResponseDto> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (input.apiToken) {
      headers.Authorization = `Bearer ${input.apiToken}`;
    }
    const response = await this.fetchJson(`${normalizeBaseUrl(input.apiBaseUrl)}${path}`, {
      method: 'POST',
      headers,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(extractErrorMessage(response.status, response.json));
    }
    return projectContextDeliveryResponseSchema.parse(response.json);
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function extractErrorMessage(status: number, payload: unknown) {
  if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string') {
    return (payload as { message: string }).message;
  }
  return `agora context delivery api returned status ${status}`;
}

async function defaultFetchJson(
  url: string,
  init: {
    method?: 'GET' | 'POST';
    headers: Record<string, string>;
    timeoutMs: number;
    body?: string;
  },
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      signal: controller.signal,
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    return {
      status: response.status,
      json: await response.json(),
    };
  } finally {
    clearTimeout(timer);
  }
}
