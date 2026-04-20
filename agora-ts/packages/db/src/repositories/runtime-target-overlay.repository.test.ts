import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '../database.js';
import { RuntimeTargetOverlayRepository } from './runtime-target-overlay.repository.js';

const tempDirs: string[] = [];

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-runtime-target-overlay-'));
  tempDirs.push(dir);
  return join(dir, 'tasks.db');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('RuntimeTargetOverlayRepository', () => {
  it('upserts, reads, lists, and deletes runtime target overlays', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const repository = new RuntimeTargetOverlayRepository(db);

    const created = repository.upsertOverlay({
      runtime_target_ref: 'cc-connect:agora-claude',
      display_name: 'Agora Claude',
      presentation_mode: 'im_presented',
      presentation_provider: 'discord',
      presentation_identity_ref: '1491747877792387203',
      tags: ['review', 'claude'],
      allowed_projects: ['agora'],
      default_roles: ['reviewer'],
      metadata: { source: 'manual' },
    });

    expect(created).toMatchObject({
      runtime_target_ref: 'cc-connect:agora-claude',
      enabled: true,
      display_name: 'Agora Claude',
      presentation_mode: 'im_presented',
      presentation_provider: 'discord',
      presentation_identity_ref: '1491747877792387203',
      tags: ['review', 'claude'],
      allowed_projects: ['agora'],
      default_roles: ['reviewer'],
      metadata: { source: 'manual' },
    });

    const updated = repository.upsertOverlay({
      runtime_target_ref: 'cc-connect:agora-claude',
      enabled: false,
      display_name: 'Agora Claude Review',
      tags: ['review'],
    });

    expect(updated).toMatchObject({
      runtime_target_ref: 'cc-connect:agora-claude',
      enabled: false,
      display_name: 'Agora Claude Review',
      presentation_mode: 'im_presented',
      tags: ['review'],
      allowed_projects: ['agora'],
      default_roles: ['reviewer'],
      metadata: { source: 'manual' },
    });
    expect(repository.getOverlay('cc-connect:agora-claude')).toEqual(updated);
    expect(repository.listOverlays()).toEqual([updated]);
    expect(repository.deleteOverlay('cc-connect:agora-claude')).toBe(true);
    expect(repository.getOverlay('cc-connect:agora-claude')).toBeNull();
    expect(repository.deleteOverlay('cc-connect:agora-claude')).toBe(false);
  });
});
