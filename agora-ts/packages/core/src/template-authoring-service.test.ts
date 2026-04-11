import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgoraDatabase, runMigrations, TemplateRepository } from '@agora-ts/db';
import { TemplateAuthoringService } from './template-authoring-service.js';

const tempPaths: string[] = [];
const sourceTemplatesDir = resolve(process.cwd(), 'templates');

function makeTemplatesDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-template-authoring-'));
  tempPaths.push(dir);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  cpSync(join(sourceTemplatesDir, 'tasks', 'coding.json'), join(dir, 'tasks', 'coding.json'));
  return dir;
}

function makeDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-template-authoring-db-'));
  tempPaths.push(dir);
  return join(dir, 'tasks.db');
}

function createTemplateAuthoringServiceFromDb(db: ReturnType<typeof createAgoraDatabase>, templatesDir: string) {
  return new TemplateAuthoringService({
    templatesDir,
    templateRepository: new TemplateRepository(db),
  });
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('template authoring service', () => {
  it('validates, saves, updates workflow, and duplicates templates', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalid = service.validateTemplate({
      name: '非法模板',
      type: 'broken',
      stages: [
        { id: 'same', gate: { type: 'command' } },
        { id: 'same', gate: { type: 'command' } },
      ],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('duplicate');

    const saved = service.saveTemplate('brainwave', {
      name: '脑暴模板',
      type: 'brainwave',
      description: '头脑风暴流程',
      defaultWorkflow: 'brainstorm',
      governance: 'lean',
      defaultTeam: {
        architect: { member_kind: 'controller', suggested: ['opus'] },
      },
      stages: [
        { id: 'brainstorm', name: '脑暴', mode: 'discuss', gate: { type: 'command' } },
      ],
    });
    expect(saved.saved).toBe(true);
    expect(saved.template.type).toBe('brainwave');

    const workflowUpdated = service.updateTemplateWorkflow('brainwave', {
      defaultWorkflow: 'brainstorm-review',
      stages: [
        { id: 'brainstorm', name: '脑暴', mode: 'discuss', gate: { type: 'command' } },
        {
          id: 'review',
          name: '评审',
          mode: 'discuss',
          roster: { include_roles: ['reviewer'], keep_controller: true },
          gate: { type: 'archon_review' },
        },
      ],
    });
    expect(workflowUpdated.template.defaultWorkflow).toBe('brainstorm-review');
    expect(workflowUpdated.template.stages).toHaveLength(2);
    expect(workflowUpdated.template.stages?.[1]?.roster).toMatchObject({
      include_roles: ['reviewer'],
      keep_controller: true,
    });

    const duplicated = service.duplicateTemplate('brainwave', {
      new_id: 'brainwave_copy',
      name: '脑暴模板副本',
    });
    expect(duplicated.id).toBe('brainwave_copy');
    expect(duplicated.template.name).toBe('脑暴模板副本');

    expect(service.getTemplate('brainwave_copy')).toMatchObject({
      name: '脑暴模板副本',
      stages: [{ id: 'brainstorm' }, { id: 'review' }],
    });
  });

  it('updates existing templates inside the sqlite-backed template catalog', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const repository = new TemplateRepository(db);
    repository.saveTemplate('atomic', {
      name: 'old',
      type: 'atomic',
      stages: [{ id: 'old', gate: { type: 'command' } }],
    }, 'user');
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    service.saveTemplate('atomic', {
      name: 'atomic',
      type: 'atomic',
      stages: [{ id: 'new', gate: { type: 'command' } }],
    });

    expect(repository.getTemplate('atomic')).toMatchObject({
      template: {
        stages: [{ id: 'new' }],
      },
    });
  });

  it('persists authoring writes into the sqlite-backed template catalog', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const repository = new TemplateRepository(db);
    repository.seedFromDir(templatesDir);
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    service.saveTemplate('db_persisted', {
      name: '数据库持久化模板',
      type: 'db_persisted',
      governance: 'lean',
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    });

    expect(repository.getTemplate('db_persisted')).toMatchObject({
      id: 'db_persisted',
      template: {
        name: '数据库持久化模板',
      },
    });
  });

  it('repairs existing sqlite templates with missing member_kind on service bootstrap', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const repository = new TemplateRepository(db);

    db.prepare(`
      INSERT INTO templates (id, source, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'coding',
      'user',
      JSON.stringify({
        name: '旧编码模板',
        type: 'coding',
        governance: 'standard',
        defaultTeam: {
          architect: { suggested: ['opus'] },
          developer: { suggested: ['sonnet'] },
          craftsman: { suggested: ['codex'] },
        },
        stages: [{ id: 'discuss', mode: 'discuss', gate: { type: 'command' } }],
      }),
      '2026-03-13T00:00:00.000Z',
      '2026-03-13T00:00:00.000Z',
    );

    createTemplateAuthoringServiceFromDb(db, templatesDir);

    expect(repository.getTemplate('coding')).toMatchObject({
      template: {
        defaultTeam: {
          architect: { member_kind: 'controller' },
          developer: { member_kind: 'citizen' },
          craftsman: { member_kind: 'craftsman' },
        },
      },
    });
  });

  it('rejects invalid governance, team role, and workflow mode values', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    expect(service.validateTemplate({
      name: '非法治理模板',
      type: 'broken',
      governance: 'archon',
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    }).valid).toBe(false);

    expect(service.validateTemplate({
      name: '非法角色模板',
      type: 'broken',
      governance: 'lean',
      defaultTeam: {
        wizard: { member_kind: 'controller', suggested: ['merlin'] },
      },
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    }).valid).toBe(false);

    expect(service.validateTemplate({
      name: '非法阶段模板',
      type: 'broken',
      governance: 'lean',
      stages: [{ id: 'draft', mode: 'sidequest', gate: { type: 'magic_gate' } }],
    }).valid).toBe(false);
  });

  it('rejects templates with missing or duplicate controller roles', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const missingController = service.validateTemplate({
      name: '缺主控模板',
      type: 'broken',
      governance: 'lean',
      defaultTeam: {
        developer: { member_kind: 'citizen', suggested: ['sonnet'] },
        craftsman: { member_kind: 'craftsman', suggested: ['codex'] },
      },
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    });
    expect(missingController.valid).toBe(false);
    expect(missingController.errors.join(' ')).toContain('exactly one controller');

    const duplicateController = service.validateTemplate({
      name: '双主控模板',
      type: 'broken',
      governance: 'lean',
      defaultTeam: {
        architect: { member_kind: 'controller', suggested: ['opus'] },
        developer: { member_kind: 'controller', suggested: ['sonnet'] },
      },
      stages: [{ id: 'draft', mode: 'discuss', gate: { type: 'command' } }],
    });
    expect(duplicateController.valid).toBe(false);
    expect(duplicateController.errors.join(' ')).toContain('more than one controller');
  });

  it('accepts template stages with reject_target backedges to earlier stages', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const result = service.validateTemplate({
      name: '带回边模板',
      type: 'reworkable',
      governance: 'lean',
      stages: [
        { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
        {
          id: 'review',
          mode: 'discuss',
          roster: { include_roles: ['reviewer'], keep_controller: true },
          gate: { type: 'approval', approver: 'reviewer' },
          reject_target: 'draft',
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.normalized?.stages?.[1]?.reject_target).toBe('draft');
    expect(result.normalized?.graph).toMatchObject({
      entry_nodes: ['draft'],
      edges: [
        expect.objectContaining({ kind: 'advance', from: 'draft', to: 'review' }),
        expect.objectContaining({ kind: 'reject', from: 'review', to: 'draft' }),
      ],
    });
    expect(result.normalized?.graph?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'review',
        roster: expect.objectContaining({
          include_roles: ['reviewer'],
          keep_controller: true,
        }),
      }),
    ]));
  });

  it('normalizes templates to include canonical graph payloads even when authored from stages only', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const saved = service.saveTemplate('graph_ready', {
      name: '图就绪模板',
      type: 'graph_ready',
      governance: 'lean',
      defaultTeam: {
        architect: { member_kind: 'controller', suggested: ['opus'] },
      },
      stages: [
        { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
        { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'draft' },
      ],
    });

    expect(saved.template.graph).toMatchObject({
      graph_version: 1,
      entry_nodes: ['draft'],
      nodes: [
        expect.objectContaining({ id: 'draft', kind: 'stage' }),
        expect.objectContaining({ id: 'review', kind: 'stage' }),
      ],
      edges: [
        expect.objectContaining({ kind: 'advance', from: 'draft', to: 'review' }),
        expect.objectContaining({ kind: 'reject', from: 'review', to: 'draft' }),
      ],
    });
    expect(service.getTemplate('graph_ready').graph).toBeTruthy();
  });

  it('rejects invalid canonical graph payloads with dangling entry nodes and edges', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const result = service.validateTemplate({
      name: '坏图模板',
      type: 'broken_graph',
      governance: 'lean',
      defaultTeam: {
        architect: { member_kind: 'controller', suggested: ['opus'] },
      },
      graph: {
        graph_version: 1,
        entry_nodes: ['missing'],
        nodes: [
          { id: 'draft', kind: 'stage', gate: { type: 'command' } },
        ],
        edges: [
          { id: 'edge-1', from: 'draft', to: 'ghost', kind: 'advance' },
        ],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown entry node');
    expect(result.errors.join(' ')).toContain('unknown edge.to node');
  });

  it('rejects invalid gate semantics and duplicate stage ids during authoring validation', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalidApproval = service.validateTemplate({
      name: '缺 approver 的审批模板',
      type: 'broken',
      governance: 'lean',
      stages: [{ id: 'review', mode: 'discuss', gate: { type: 'approval' } }],
    });
    expect(invalidApproval.valid).toBe(false);
    expect(invalidApproval.errors.join(' ')).toContain('approver');

    const invalidTimeout = service.validateTemplate({
      name: '缺 timeout 的等待模板',
      type: 'broken',
      governance: 'lean',
      stages: [{ id: 'wait', mode: 'discuss', gate: { type: 'auto_timeout' } }],
    });
    expect(invalidTimeout.valid).toBe(false);
    expect(invalidTimeout.errors.join(' ')).toContain('timeout_sec');

    const duplicateStages = service.validateTemplate({
      name: '重复阶段模板',
      type: 'broken',
      governance: 'lean',
      stages: [
        { id: 'same', mode: 'discuss', gate: { type: 'command' } },
        { id: 'same', mode: 'execute', gate: { type: 'command' } },
      ],
    });
    expect(duplicateStages.valid).toBe(false);
    expect(duplicateStages.errors.join(' ')).toContain('duplicate');
  });

  it('rejects timeout edges that are not sourced from an auto-timeout stage', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['draft'],
      nodes: [
        { id: 'draft', kind: 'stage', gate: { type: 'command' } },
        { id: 'wait', kind: 'stage', gate: { type: 'auto_timeout', timeout_sec: 60 } },
      ],
      edges: [
        { id: 'draft__timeout__wait', from: 'draft', to: 'wait', kind: 'timeout' },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('timeout edges require auto_timeout gate');
  });

  it('rejects graph stages with ambiguous multiple advance or reject edges', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['draft'],
      nodes: [
        { id: 'draft', kind: 'stage', gate: { type: 'command' } },
        { id: 'review-a', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
        { id: 'review-b', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
      ],
      edges: [
        { id: 'draft__advance__review-a', from: 'draft', to: 'review-a', kind: 'advance' },
        { id: 'draft__advance__review-b', from: 'draft', to: 'review-b', kind: 'advance' },
        { id: 'review-a__reject__draft', from: 'review-a', to: 'draft', kind: 'reject' },
        { id: 'review-a__reject__review-b', from: 'review-a', to: 'review-b', kind: 'reject' },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('multiple advance edges');
    expect(invalid.errors.join(' ')).toContain('multiple reject edges');
  });

  it('rejects graph payloads that declare multiple entry stages or forward-only reject edges', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['draft', 'review'],
      nodes: [
        { id: 'draft', kind: 'stage', gate: { type: 'command' } },
        { id: 'review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
        { id: 'ship', kind: 'stage', gate: { type: 'command' } },
      ],
      edges: [
        { id: 'draft__advance__review', from: 'draft', to: 'review', kind: 'advance' },
        { id: 'review__advance__ship', from: 'review', to: 'ship', kind: 'advance' },
        { id: 'review__reject__ship', from: 'review', to: 'ship', kind: 'reject' },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('exactly one entry node');
    expect(invalid.errors.join(' ')).toContain('must reference an earlier stage');
  });

  it('accepts explicit branch edges only when they do not mix with advance edges on the same node', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const valid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['triage'],
      nodes: [
        { id: 'triage', kind: 'stage', gate: { type: 'command' } },
        { id: 'fast-path', kind: 'stage', gate: { type: 'command' } },
        { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
      ],
      edges: [
        { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch' },
        { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
      ],
    });

    expect(valid.valid).toBe(true);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['triage'],
      nodes: [
        { id: 'triage', kind: 'stage', gate: { type: 'command' } },
        { id: 'fast-path', kind: 'stage', gate: { type: 'command' } },
        { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
      ],
      edges: [
        { id: 'triage__advance__fast-path', from: 'triage', to: 'fast-path', kind: 'advance' },
        { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('cannot mix advance and branch edges');
  });

  it('rejects branch condition fields so graph branching stays explicitly caller-selected', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['triage'],
      nodes: [
        { id: 'triage', kind: 'stage', gate: { type: 'command' } },
        { id: 'fast-path', kind: 'stage', gate: { type: 'command' } },
        { id: 'deep-review', kind: 'stage', gate: { type: 'approval', approver: 'reviewer' } },
      ],
      edges: [
        { id: 'triage__branch__fast-path', from: 'triage', to: 'fast-path', kind: 'branch', condition: 'score < 0.5' } as unknown as never,
        { id: 'triage__branch__deep-review', from: 'triage', to: 'deep-review', kind: 'branch' },
      ],
    });

    expect(invalid.valid).toBe(false);
  });

  it('accepts terminal completion edges only when they point into terminal nodes', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const valid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['implement'],
      nodes: [
        { id: 'implement', kind: 'stage', gate: { type: 'command' } },
        { id: 'done', kind: 'terminal', terminal: { outcome: 'shipped', summary: 'Implementation closed successfully' } },
      ],
      edges: [
        { id: 'implement__complete__done', from: 'implement', to: 'done', kind: 'complete' },
      ],
    });

    expect(valid.valid).toBe(true);

    const invalid = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['implement'],
      nodes: [
        { id: 'implement', kind: 'stage', gate: { type: 'command' } },
        { id: 'ship', kind: 'stage', gate: { type: 'all_subtasks_done' } },
      ],
      edges: [
        { id: 'implement__complete__ship', from: 'implement', to: 'ship', kind: 'complete' },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('complete edges must target terminal nodes');
  });

  it('requires explicit terminal contracts and validates timeout edges as auto-timeout-only forward edges', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = createTemplateAuthoringServiceFromDb(db, templatesDir);

    const missingTerminalContract = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['implement'],
      nodes: [
        { id: 'implement', kind: 'stage', gate: { type: 'command' } },
        { id: 'done', kind: 'terminal' },
      ],
      edges: [
        { id: 'implement__complete__done', from: 'implement', to: 'done', kind: 'complete' },
      ],
    });

    expect(missingTerminalContract.valid).toBe(false);
    expect(missingTerminalContract.errors.join(' ')).toContain('terminal contract');

    const validTimeout = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['wait'],
      nodes: [
        { id: 'wait', kind: 'stage', gate: { type: 'auto_timeout', timeout_sec: 30 } },
        { id: 'escalate', kind: 'stage', gate: { type: 'command' } },
      ],
      edges: [
        { id: 'wait__timeout__escalate', from: 'wait', to: 'escalate', kind: 'timeout' },
      ],
    });

    expect(validTimeout.valid).toBe(true);

    const invalidTimeout = service.validateGraph({
      graph_version: 1,
      entry_nodes: ['wait'],
      nodes: [
        { id: 'wait', kind: 'stage', gate: { type: 'command' } },
        { id: 'next', kind: 'stage', gate: { type: 'command' } },
        { id: 'fallback', kind: 'stage', gate: { type: 'command' } },
      ],
      edges: [
        { id: 'wait__advance__next', from: 'wait', to: 'next', kind: 'advance' },
        { id: 'wait__timeout__fallback', from: 'wait', to: 'fallback', kind: 'timeout' },
      ],
    });

    expect(invalidTimeout.valid).toBe(false);
    expect(invalidTimeout.errors.join(' ')).toContain('timeout edges require auto_timeout gate');
    expect(invalidTimeout.errors.join(' ')).toContain('cannot mix timeout edges with other forward edges');
  });
});
