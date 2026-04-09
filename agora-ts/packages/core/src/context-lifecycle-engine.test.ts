import { describe, expect, it, vi } from 'vitest';
import type { ReferenceBundleDto } from '@agora-ts/contracts';
import { ContextLifecycleEngine } from './context-lifecycle-engine.js';

function makeReferenceBundle(): ReferenceBundleDto {
  return {
    scope: 'project_brain',
    mode: 'disclose',
    project_id: 'proj-brain',
    task_id: 'OC-200',
    project_map: {
      index_reference_key: 'index:index',
      timeline_reference_key: 'timeline:timeline',
      inventory_count: 4,
    },
    inventory: {
      scope: 'project_brain',
      project_id: 'proj-brain',
      generated_at: '2026-04-09T16:00:00.000Z',
      entries: [
        { scope: 'project_brain', reference_key: 'index:index', project_id: 'proj-brain', kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' },
        { scope: 'project_brain', reference_key: 'timeline:timeline', project_id: 'proj-brain', kind: 'timeline', slug: 'timeline', title: 'Timeline', path: '/brain/timeline.md' },
        { scope: 'project_brain', reference_key: 'decision:runtime-boundary', project_id: 'proj-brain', kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' },
        { scope: 'project_brain', reference_key: 'fact:bootstrap-current-surface', project_id: 'proj-brain', kind: 'fact', slug: 'bootstrap-current-surface', title: 'Bootstrap Current Surface', path: '/brain/knowledge/facts/bootstrap-current-surface.md' },
      ],
    },
    references: [
      { scope: 'project_brain', reference_key: 'index:index', project_id: 'proj-brain', kind: 'index', slug: 'index', title: 'Project Index', path: '/brain/index.md' },
      { scope: 'project_brain', reference_key: 'decision:runtime-boundary', project_id: 'proj-brain', kind: 'decision', slug: 'runtime-boundary', title: 'Runtime Boundary', path: '/brain/decision/runtime-boundary.md' },
    ],
    attention_anchors: [
      { reference_key: 'decision:runtime-boundary', reason: 'Matched current task query in project brain.', score: 4.2 },
    ],
  };
}

describe('context lifecycle engine', () => {
  it('maps existing platform capabilities into the six lifecycle phases', async () => {
    const engine = new ContextLifecycleEngine({
      clock: () => new Date('2026-04-09T16:00:00.000Z'),
      workspaceBootstrapService: {
        getStatus: () => ({
          runtime_ready: true,
          runtime_readiness_reason: null,
          bootstrap_task_id: 'OC-BOOTSTRAP',
          bootstrap_task_title: 'Workspace Bootstrap Interview',
          bootstrap_task_state: 'active',
          bootstrap_completed: false,
        }),
      },
      projectBootstrapService: {
        createHarnessBootstrapTask: vi.fn(),
      },
      referenceBundleService: {
        buildReferenceBundleAsync: vi.fn().mockResolvedValue(makeReferenceBundle()),
      },
      taskWorktreeService: {
        resolveBaseWorkdir: () => '/Users/example/.agora/projects/proj-brain',
      },
      projectBrainAutomationService: {
        recordTaskCloseRecap: vi.fn(),
      },
      projectContextWriter: {
        getLock: () => null,
      },
      projectBrainDoctorService: {
        diagnoseProject: vi.fn().mockResolvedValue({
          project_id: 'proj-brain',
          db_path: '/tmp/agora.db',
          embedding: { configured: true, healthy: true, provider: 'openai-compatible', model: 'text-embedding-3-large' },
          vector_index: { configured: true, provider: 'qdrant', healthy: true, chunk_count: 12 },
          jobs: { pending: 0, running: 0, failed: 0, succeeded: 12 },
          drift: { detected: false, documents_without_jobs: 0 },
        }),
      },
    });

    const snapshot = await engine.buildSnapshot({
      project_id: 'proj-brain',
      audience: 'controller',
      task: {
        id: 'OC-200',
        project_id: 'proj-brain',
        type: 'coding',
      },
      task_title: 'Implement hybrid retrieval',
      task_description: 'Need vector recall and lexical rerank.',
    });

    expect(snapshot.generated_at).toBe('2026-04-09T16:00:00.000Z');
    expect(snapshot.phases.map((phase) => phase.phase)).toEqual([
      'bootstrap',
      'disclose',
      'execute',
      'capture',
      'harvest',
      'evolve',
    ]);
    expect(snapshot.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'bootstrap', status: 'ready' }),
        expect.objectContaining({ phase: 'disclose', status: 'ready', reference_keys: ['index:index', 'decision:runtime-boundary'] }),
        expect.objectContaining({ phase: 'execute', status: 'ready' }),
        expect.objectContaining({ phase: 'capture', status: 'ready' }),
        expect.objectContaining({ phase: 'harvest', status: 'ready' }),
        expect.objectContaining({ phase: 'evolve', status: 'ready' }),
      ]),
    );
  });

  it('surfaces blocked and not-configured lifecycle phases explicitly', async () => {
    const engine = new ContextLifecycleEngine({
      workspaceBootstrapService: {
        getStatus: () => ({
          runtime_ready: false,
          runtime_readiness_reason: 'discord bot not configured',
          bootstrap_task_id: null,
          bootstrap_task_title: null,
          bootstrap_task_state: null,
          bootstrap_completed: false,
        }),
      },
      projectBootstrapService: {
        createHarnessBootstrapTask: vi.fn(),
      },
      projectContextWriter: {
        getLock: () => ({ project_id: 'proj-brain', holder_task_id: 'OC-OTHER', acquired_at: '2026-04-09T16:00:00.000Z' }),
      },
      projectBrainDoctorService: {
        diagnoseProject: vi.fn().mockResolvedValue({
          project_id: 'proj-brain',
          db_path: '/tmp/agora.db',
          embedding: { configured: true, healthy: true, provider: 'openai-compatible', model: 'text-embedding-3-large' },
          vector_index: { configured: true, provider: 'qdrant', healthy: true, chunk_count: 12 },
          jobs: { pending: 1, running: 0, failed: 0, succeeded: 11 },
          drift: { detected: true, documents_without_jobs: 1 },
        }),
      },
    });

    const snapshot = await engine.buildSnapshot({
      project_id: 'proj-brain',
      audience: 'controller',
      task: {
        id: 'OC-200',
        project_id: 'proj-brain',
        type: 'coding',
      },
    });

    expect(snapshot.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'bootstrap', status: 'blocked' }),
        expect.objectContaining({ phase: 'disclose', status: 'not_configured' }),
        expect.objectContaining({ phase: 'execute', status: 'not_configured' }),
        expect.objectContaining({ phase: 'capture', status: 'not_configured' }),
        expect.objectContaining({ phase: 'harvest', status: 'blocked' }),
        expect.objectContaining({ phase: 'evolve', status: 'blocked' }),
      ]),
    );
  });
});
