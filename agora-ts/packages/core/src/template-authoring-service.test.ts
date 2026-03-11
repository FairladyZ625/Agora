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
    const service = new TemplateAuthoringService({ db, templatesDir });

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
        architect: { suggested: ['opus'] },
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
        { id: 'review', name: '评审', mode: 'discuss', gate: { type: 'archon_review' } },
      ],
    });
    expect(workflowUpdated.template.defaultWorkflow).toBe('brainstorm-review');
    expect(workflowUpdated.template.stages).toHaveLength(2);

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
    const service = new TemplateAuthoringService({ db, templatesDir });

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
    const service = new TemplateAuthoringService({ db, templatesDir });

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

  it('rejects invalid governance, team role, and workflow mode values', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ db, templatesDir });

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
        wizard: { suggested: ['merlin'] },
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

  it('accepts template stages with reject_target backedges to earlier stages', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ db, templatesDir });

    const result = service.validateTemplate({
      name: '带回边模板',
      type: 'reworkable',
      governance: 'lean',
      stages: [
        { id: 'draft', mode: 'discuss', gate: { type: 'command' } },
        { id: 'review', mode: 'discuss', gate: { type: 'approval', approver: 'reviewer' }, reject_target: 'draft' },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.normalized?.stages?.[1]?.reject_target).toBe('draft');
  });

  it('rejects invalid gate semantics and duplicate stage ids during authoring validation', () => {
    const db = createAgoraDatabase({ dbPath: makeDbPath() });
    runMigrations(db);
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ db, templatesDir });

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
});
