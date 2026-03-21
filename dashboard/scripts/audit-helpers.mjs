import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_FRONTEND_PORT = 33173;
const DEFAULT_PAGES = ['/dashboard/'];
const DEFAULT_PROTECTED_PAGES = ['/dashboard/', '/dashboard/board', '/dashboard/tasks', '/dashboard/reviews'];

export const dashboardDir = path.resolve(import.meta.dirname, '..');
export const projectRoot = path.resolve(dashboardDir, '..');

function parseEnvFile(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, '');
    entries[key] = value;
  }

  return entries;
}

function loadRootEnv() {
  const envPath = path.join(projectRoot, '.env');
  if (!existsSync(envPath)) {
    return {};
  }
  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

export function resolveAuditConfig() {
  const rootEnv = loadRootEnv();
  const host = process.env.AGORA_SERVER_HOST ?? rootEnv.AGORA_SERVER_HOST ?? DEFAULT_HOST;
  const frontendPort = Number(process.env.AGORA_FRONTEND_PORT ?? rootEnv.AGORA_FRONTEND_PORT ?? DEFAULT_FRONTEND_PORT);
  const baseUrl = process.env.DASHBOARD_BASE_URL ?? `http://${host}:${frontendPort}`;
  const dashboardBaseUrl = new URL('/dashboard/', baseUrl).toString().replace(/\/$/, '');
  const username = (
    process.env.AGORA_DASHBOARD_LOGIN_USER
    ?? rootEnv.AGORA_DASHBOARD_LOGIN_USER
    ?? process.env.AGORA_DASHBOARD_USER
    ?? rootEnv.AGORA_DASHBOARD_USER
    ?? process.env.DASHBOARD_LOGIN_USER
    ?? rootEnv.DASHBOARD_LOGIN_USER
    ?? ''
  );
  const password = (
    process.env.AGORA_DASHBOARD_LOGIN_PASSWORD
    ?? rootEnv.AGORA_DASHBOARD_LOGIN_PASSWORD
    ?? process.env.AGORA_DASHBOARD_PASSWORD
    ?? rootEnv.AGORA_DASHBOARD_PASSWORD
    ?? process.env.DASHBOARD_LOGIN_PASSWORD
    ?? rootEnv.DASHBOARD_LOGIN_PASSWORD
    ?? ''
  );
  const authenticated = username.length > 0 && password.length > 0;
  const pages = authenticated ? DEFAULT_PROTECTED_PAGES : DEFAULT_PAGES;

  return {
    baseUrl,
    dashboardBaseUrl,
    entryUrl: `${dashboardBaseUrl}/`,
    loginUrl: `${dashboardBaseUrl}/login`,
    username,
    password,
    authenticated,
    pages,
  };
}

export async function ensureServerReachable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
    if (!response.ok && response.status >= 500) {
      throw new Error(`server responded ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `Dashboard is not reachable at ${url}. Start it with ./scripts/dev-start.sh or set DASHBOARD_BASE_URL.`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createAuditOutputDir(name) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const outputDir = path.join(dashboardDir, '.artifacts', 'browser-audits', `${timestamp}-${name}`);
  mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

export async function loginIfNeeded(page, config) {
  if (!config.authenticated) {
    return false;
  }

  await page.goto(config.entryUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.getByLabel('Username').fill(config.username);
  await page.getByLabel('Password').fill(config.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10000 });
  await page.waitForTimeout(1200);
  return true;
}

export function sanitizePathForFile(route) {
  return route
    .replace(/^\/+/u, '')
    .replace(/\/+/gu, '-')
    .replace(/[^a-z0-9-]/giu, '_') || 'dashboard-root';
}

export async function writeJsonReport(filePath, payload) {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await import('node:fs/promises').then((fs) => fs.writeFile(filePath, json, 'utf8'));
}

export function isIgnorableRequestFailure(url, errorText = '') {
  const normalized = `${errorText}`.toLowerCase();
  if (
    url.startsWith('https://fonts.googleapis.com/')
    || url.startsWith('https://fonts.gstatic.com/')
  ) {
    return true;
  }

  return url.includes('/api/dashboard/session/login')
    && (normalized.includes('aborted') || normalized.includes('cancelled'));
}
