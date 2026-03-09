import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ templatesDir });

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

    const written = JSON.parse(readFileSync(join(templatesDir, 'tasks', 'brainwave_copy.json'), 'utf8')) as {
      name: string;
      stages: Array<{ id: string }>;
    };
    expect(written).toMatchObject({
      name: '脑暴模板副本',
      stages: [{ id: 'brainstorm' }, { id: 'review' }],
    });
  });

  it('writes templates atomically to the tasks directory', () => {
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ templatesDir });
    const targetPath = join(templatesDir, 'tasks', 'atomic.json');

    writeFileSync(targetPath, '{"name":"old","type":"atomic","stages":[{"id":"old"}]}');

    service.saveTemplate('atomic', {
      name: 'atomic',
      type: 'atomic',
      stages: [{ id: 'new', gate: { type: 'command' } }],
    });

    expect(readFileSync(targetPath, 'utf8')).toContain('"new"');
  });

  it('rejects invalid governance, team role, and workflow mode values', () => {
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ templatesDir });

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

  it('rejects invalid gate semantics and duplicate stage ids during authoring validation', () => {
    const templatesDir = makeTemplatesDir();
    const service = new TemplateAuthoringService({ templatesDir });

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
