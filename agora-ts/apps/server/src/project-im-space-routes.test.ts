import { describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { buildApp } from './app.js';
import { createProjectServiceFromDb } from '@agora-ts/testing';
import { StubIMProvisioningPort } from '@agora-ts/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('project IM space routes', () => {
  it('ensures and persists a discord project forum binding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agora-ts-project-im-space-route-'));
    try {
      const db = createAgoraDatabase({ dbPath: join(dir, 'agora.db') });
      runMigrations(db);
      const projectService = createProjectServiceFromDb(db);
      projectService.createProject({
        id: 'proj-discord-space',
        name: 'Project Discord Space',
      });
      const imProvisioningPort = new StubIMProvisioningPort({
        im_provider: 'discord',
        conversation_ref: 'forum-created-1',
      });
      imProvisioningPort.ensureProjectSpace = async (input) => ({
        im_provider: input.target?.provider ?? 'discord',
        conversation_ref: 'forum-created-1',
        parent_ref: 'category-7',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
      const app = buildApp({
        db,
        projectService,
        imProvisioningPort,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/projects/proj-discord-space/im-space/ensure',
        payload: {
          provider: 'discord',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        provider: 'discord',
        conversation_ref: 'forum-created-1',
        parent_ref: 'category-7',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
      expect(projectService.getProjectImSpace('proj-discord-space', 'discord')).toEqual({
        provider: 'discord',
        conversation_ref: 'forum-created-1',
        parent_ref: 'category-7',
        kind: 'forum_channel',
        managed_by: 'agora',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
