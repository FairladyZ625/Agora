import {
  dashboardSessionLoginRequestSchema,
  dashboardSessionLoginResponseSchema,
  dashboardSessionLogoutResponseSchema,
  dashboardSessionStatusResponseSchema,
  type DashboardSessionLoginRequestDto,
  type DashboardSessionLoginResponseDto,
  type DashboardSessionLogoutResponseDto,
  type DashboardSessionStatusResponseDto,
} from '@agora-ts/contracts';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const storedDashboardSessionSchema = z.object({
  cookie: z.string().min(1),
  username: z.string(),
  method: z.literal('session'),
  api_base_url: z.string().min(1),
  updated_at: z.string(),
});

type StoredDashboardSession = z.infer<typeof storedDashboardSessionSchema>;

export type DashboardSessionClientFetch = typeof fetch;

export interface DashboardSessionClient {
  sessionFilePath: string;
  login(payload: DashboardSessionLoginRequestDto): Promise<DashboardSessionLoginResponseDto>;
  status(): Promise<DashboardSessionStatusResponseDto>;
  logout(): Promise<DashboardSessionLogoutResponseDto>;
}

export interface CreateDashboardSessionClientOptions {
  apiBaseUrl: string;
  sessionFilePath: string;
  fetchImpl?: DashboardSessionClientFetch;
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function readStoredDashboardSession(sessionFilePath: string): StoredDashboardSession | null {
  if (!existsSync(sessionFilePath)) {
    return null;
  }
  return storedDashboardSessionSchema.parse(JSON.parse(readFileSync(sessionFilePath, 'utf8')));
}

function persistDashboardSession(sessionFilePath: string, stored: StoredDashboardSession) {
  mkdirSync(dirname(sessionFilePath), { recursive: true });
  writeFileSync(sessionFilePath, JSON.stringify(stored, null, 2));
}

function clearStoredDashboardSession(sessionFilePath: string) {
  rmSync(sessionFilePath, { force: true });
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

async function parseErrorMessage(response: Response) {
  const payload = await parseJsonResponse(response);
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') {
    return payload.message;
  }
  return `${response.status} ${response.statusText}`.trim();
}

function extractSessionCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('dashboard session cookie missing from login response');
  }
  const first = setCookie.split(',')[0]?.trim() ?? setCookie;
  return first.split(';')[0]?.trim() ?? first.trim();
}

export function createDashboardSessionClient(
  options: CreateDashboardSessionClientOptions,
): DashboardSessionClient {
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    sessionFilePath: options.sessionFilePath,
    async login(payload) {
      const parsed = dashboardSessionLoginRequestSchema.parse(payload);
      const response = await fetchImpl(`${apiBaseUrl}/api/dashboard/session/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(parsed),
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const body = dashboardSessionLoginResponseSchema.parse(await parseJsonResponse(response));
      persistDashboardSession(options.sessionFilePath, {
        cookie: extractSessionCookie(response),
        username: body.username,
        method: body.method,
        api_base_url: apiBaseUrl,
        updated_at: new Date().toISOString(),
      });
      return body;
    },
    async status() {
      const stored = readStoredDashboardSession(options.sessionFilePath);
      const headers: Record<string, string> = {};
      if (stored) {
        headers.cookie = stored.cookie;
      }
      const response = await fetchImpl(`${apiBaseUrl}/api/dashboard/session`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const body = dashboardSessionStatusResponseSchema.parse(await parseJsonResponse(response));
      if (!body.authenticated) {
        clearStoredDashboardSession(options.sessionFilePath);
      }
      return body;
    },
    async logout() {
      const stored = readStoredDashboardSession(options.sessionFilePath);
      if (!stored) {
        return dashboardSessionLogoutResponseSchema.parse({ ok: true });
      }
      const response = await fetchImpl(`${apiBaseUrl}/api/dashboard/session/logout`, {
        method: 'POST',
        headers: {
          cookie: stored.cookie,
        },
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      clearStoredDashboardSession(options.sessionFilePath);
      return dashboardSessionLogoutResponseSchema.parse(await parseJsonResponse(response));
    },
  };
}
