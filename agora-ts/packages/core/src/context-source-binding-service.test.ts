import { describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations } from '@agora-ts/db';
import { createProjectServiceFromDb } from '@agora-ts/testing';
import { ContextSourceBindingService } from './context-source-binding-service.js';

describe('context source binding service', () => {
  it('persists project-scoped bindings inside project metadata and reads them back', () => {
    const db = createAgoraDatabase({ dbPath: ':memory:' });
    runMigrations(db);
    const projectService = createProjectServiceFromDb(db);
    projectService.createProject({
      id: 'proj-bindings',
      name: 'Bindings Project',
      summary: 'Context source bindings',
      metadata: {
        agora: {
          nomos: {
            active_root: '/Users/example/.agora/projects/proj-bindings',
          },
        },
      },
    });
    const service = new ContextSourceBindingService({
      projectService,
    });

    service.replaceProjectBindings('proj-bindings', [
      {
        source_id: 'docs-architecture',
        scope: 'project',
        kind: 'docs_repo',
        label: 'Architecture Docs',
        location: '/repo/docs/architecture',
        access: 'read_only',
        enabled: true,
      },
    ]);

    expect(service.listProjectBindings('proj-bindings')).toEqual([
      expect.objectContaining({
        source_id: 'docs-architecture',
        project_id: 'proj-bindings',
        kind: 'docs_repo',
      }),
    ]);
    expect(projectService.requireProject('proj-bindings').metadata).toEqual(
      expect.objectContaining({
        agora: expect.objectContaining({
          nomos: expect.objectContaining({
            active_root: '/Users/example/.agora/projects/proj-bindings',
          }),
          context_harness: expect.objectContaining({
            project_context_sources: expect.arrayContaining([
              expect.objectContaining({
                source_id: 'docs-architecture',
              }),
            ]),
          }),
        }),
      }),
    );
  });
});
