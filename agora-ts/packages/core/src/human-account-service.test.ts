import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { HumanAccountService } from './human-account-service.js';

const tempPaths: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-human-account-'));
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

describe('human account service', () => {
  it('bootstraps an admin account, verifies password, and resolves discord identity bindings', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const service = new HumanAccountService(db);

    const admin = service.bootstrapAdmin({
      username: 'lizeyu',
      password: 'secret-pass',
    });
    const member = service.createUser({
      username: 'alice',
      password: 'alice-pass',
      role: 'member',
    });

    service.bindIdentity({
      username: member.username,
      provider: 'discord',
      externalUserId: 'discord-user-123',
    });

    expect(admin.role).toBe('admin');
    expect(service.authenticate('lizeyu', 'secret-pass')?.username).toBe('lizeyu');
    expect(service.authenticate('lizeyu', 'wrong-pass')).toBeNull();
    expect(service.resolveIdentity('discord', 'discord-user-123')).toMatchObject({
      username: 'alice',
      role: 'member',
    });
    expect(service.getIdentityByUsername('alice', 'discord')).toEqual({
      provider: 'discord',
      external_user_id: 'discord-user-123',
    });
    expect(service.getIdentityByUsername('unknown', 'discord')).toBeNull();
    expect(service.listUsers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'lizeyu', role: 'admin', enabled: true }),
        expect.objectContaining({ username: 'alice', role: 'member', enabled: true }),
      ]),
    );
  });
});
