import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { HumanAccountRepository, HumanIdentityBindingRepository } from '@agora-ts/db';
import { HumanAccountService } from '@agora-ts/core';
import { createTaskServiceFromDb } from '@agora-ts/testing';
import { buildApp } from './app.js';

const tempPaths: string[] = [];
const templatesDir = resolve(process.cwd(), 'templates');

function createHumanAccountServiceFromDb(db: ReturnType<typeof createAgoraDatabase>) {
  return new HumanAccountService({
    accountRepository: new HumanAccountRepository(db),
    identityBindingRepository: new HumanIdentityBindingRepository(db),
  });
}

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-human-review-auth-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('human review auth', () => {
  it('rejects approval-gate decisions from a human actor who is not the designated task approver', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    const approver = humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const outsider = humanAccounts.createUser({
      username: 'other-admin',
      password: 'member-pass',
      role: 'admin',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-APPROVER-GATE',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'approval gate needs designated approver',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
      team_override: {
        members: [
          {
            role: 'architect',
            agentId: 'opus',
            member_kind: 'controller',
            model_preference: 'strong_reasoning',
          },
          {
            role: 'reviewer',
            agentId: outsider.username,
            member_kind: 'citizen',
            model_preference: 'human_review',
          },
        ],
      },
      authority: {
        approver_account_id: approver.id,
      },
    });
    taskService.archonApproveTask('OC-HUMAN-APPROVER-GATE', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-APPROVER-GATE');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-APPROVER-GATE', 'review');

    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: outsider.username,
        password: 'member-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-APPROVER-GATE/approve',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        approver_id: outsider.username,
        comment: 'should fail',
      },
    });

    expect(login.statusCode).toBe(200);
    expect(approve.statusCode).toBe(403);
    expect(approve.json()).toMatchObject({
      message: expect.stringContaining(`task OC-HUMAN-APPROVER-GATE requires approver account ${approver.id}`),
    });
  });

  it('allows approve and reject from a dashboard session without trusting payload actor fields', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: (() => {
        const ids = ['OC-HUMAN-SESSION-APPROVE', 'OC-HUMAN-SESSION-REJECT'];
        return () => ids.shift() ?? 'OC-HUMAN-SESSION-FALLBACK';
      })(),
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'dashboard session approve',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-HUMAN-SESSION-APPROVE', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-SESSION-APPROVE');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-SESSION-APPROVE', 'review');
    taskService.createTask({
      title: 'dashboard session reject',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-HUMAN-SESSION-REJECT', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-SESSION-REJECT');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-SESSION-REJECT', 'review');
    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const headers = {
      cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
    };

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-SESSION-APPROVE/approve',
      headers,
      payload: {
        approver_id: 'spoofed-approver',
        comment: 'approved by session user',
      },
    });
    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-SESSION-REJECT/reject',
      headers,
      payload: {
        rejector_id: 'spoofed-rejector',
        reason: 'rejected by session user',
      },
    });
    expect(login.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(reject.statusCode).toBe(200);

    const approveStatus = taskService.getTaskStatus('OC-HUMAN-SESSION-APPROVE');
    const rejectStatus = taskService.getTaskStatus('OC-HUMAN-SESSION-REJECT');
    expect(approveStatus.flow_log).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: 'gate_passed', actor: 'lizeyu' })]),
    );
    expect(rejectStatus.flow_log).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: 'rejected', actor: 'lizeyu' })]),
    );
  });

  it('allows archon approval from a dashboard session without trusting reviewer_id in the payload', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-1',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'human review auth session',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      dashboardAuth: {
        enabled: true,
        method: 'session',
        allowedUsers: [],
        sessionTtlHours: 24,
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/dashboard/session/login',
      payload: {
        username: 'lizeyu',
        password: 'secret-pass',
      },
    });
    const cookie = login.headers['set-cookie'];
    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-1/archon-approve',
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        reviewer_id: 'spoofed-reviewer',
        comment: 'approved by session user',
      },
    });

    expect(login.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: 'OC-HUMAN-1',
      current_stage: 'write',
    });
    const status = taskService.getTaskStatus('OC-HUMAN-1');
    expect(status.flow_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'archon_approved',
          actor: 'lizeyu',
        }),
      ]),
    );
  });

  it('allows archon approval from a bound discord sender identity when bearer auth is present', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    humanAccounts.bootstrapAdmin({
      username: 'discord-admin',
      password: 'secret-pass',
    });
    humanAccounts.bindIdentity({
      username: 'discord-admin',
      provider: 'discord',
      externalUserId: 'discord-user-42',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-2',
      archonUsers: ['discord-admin'],
    });
    taskService.createTask({
      title: 'human review auth discord',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });

    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
    });

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-2/archon-approve',
      headers: {
        authorization: 'Bearer test-token',
        'x-agora-human-provider': 'discord',
        'x-agora-human-external-id': 'discord-user-42',
      },
      payload: {
        reviewer_id: 'spoofed-reviewer',
        comment: 'approved from discord',
      },
    });

    expect(approve.statusCode).toBe(200);
    const status = taskService.getTaskStatus('OC-HUMAN-2');
    expect(status.flow_log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'archon_approved',
          actor: 'discord-admin',
        }),
      ]),
    );
  });

  it('rejects bare bearer-token calls for human-only approve and reject routes', async () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const humanAccounts = createHumanAccountServiceFromDb(db);
    humanAccounts.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const taskService = createTaskServiceFromDb(db, {
      templatesDir,
      taskIdGenerator: () => 'OC-HUMAN-BEARER',
      archonUsers: ['lizeyu'],
    });
    taskService.createTask({
      title: 'bearer approve reject auth',
      type: 'document',
      creator: 'archon',
      description: '',
      priority: 'normal',
    });
    taskService.archonApproveTask('OC-HUMAN-BEARER', {
      reviewerId: 'lizeyu',
      comment: 'outline ok',
    });
    db.prepare('UPDATE tasks SET state = ?, current_stage = ? WHERE id = ?').run('active', 'review', 'OC-HUMAN-BEARER');
    db.prepare('INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)').run('OC-HUMAN-BEARER', 'review');
    const app = buildApp({
      taskService,
      humanAccountService: humanAccounts,
      apiAuth: {
        enabled: true,
        token: 'test-token',
      },
    });

    const approve = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-BEARER/approve',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        approver_id: 'spoofed-approver',
        comment: 'approved from bearer',
      },
    });
    const reject = await app.inject({
      method: 'POST',
      url: '/api/tasks/OC-HUMAN-BEARER/reject',
      headers: {
        authorization: 'Bearer test-token',
      },
      payload: {
        rejector_id: 'spoofed-rejector',
        reason: 'rejected from bearer',
      },
    });
    expect(approve.statusCode).toBe(403);
    expect(approve.json()).toEqual({ message: 'missing authenticated human actor' });
    expect(reject.statusCode).toBe(403);
    expect(reject.json()).toEqual({ message: 'missing authenticated human actor' });
  });
});
