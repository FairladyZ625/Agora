import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { templateDetailSchema, type TemplateDetailDto } from '@agora-ts/contracts';
import type { ITemplateRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';
import { parseJsonValue, stringifyJsonValue } from './json.js';

export interface StoredTemplate {
  id: string;
  version: number;
  source: string;
  template: TemplateDetailDto;
  created_at: string;
  updated_at: string;
}

export interface TemplateRepairResult {
  scanned: number;
  updated: number;
}

export class TemplateRepository implements ITemplateRepository {
  constructor(private readonly db: AgoraDatabase) {}

  listTemplates(): StoredTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM templates ORDER BY id')
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.parseTemplateRow(row));
  }

  getTemplate(templateId: string): StoredTemplate | null {
    const row = this.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(templateId) as Record<string, unknown> | undefined;
    return row ? this.parseTemplateRow(row) : null;
  }

  saveTemplate(templateId: string, template: TemplateDetailDto, source = 'user'): StoredTemplate {
    const now = new Date().toISOString();
    const normalized = templateDetailSchema.parse(template);
    const existing = this.getTemplate(templateId);

    if (existing) {
      this.db.prepare(`
        UPDATE templates
        SET payload = ?, source = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `).run(
        stringifyJsonValue(normalized),
        source,
        now,
        templateId,
      );
    } else {
      this.db.prepare(`
        INSERT INTO templates (id, source, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        templateId,
        source,
        stringifyJsonValue(normalized),
        now,
        now,
      );
    }

    return this.getTemplate(templateId)!;
  }

  seedFromDir(templatesDir: string): { inserted: number } {
    const dir = resolve(templatesDir, 'tasks');
    if (!existsSync(dir)) {
      return { inserted: 0 };
    }

    let inserted = 0;
    this.db.exec('BEGIN');
    try {
      for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
        const templateId = name.slice(0, -5);
        if (this.getTemplate(templateId)) {
          continue;
        }
        const template = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as TemplateDetailDto;
        this.saveTemplate(templateId, normalizeTemplateGraphPayload(template), 'seed');
        inserted += 1;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { inserted };
  }

  repairMemberKindsFromDir(templatesDir: string): TemplateRepairResult {
    const dir = resolve(templatesDir, 'tasks');
    if (!existsSync(dir)) {
      return { scanned: 0, updated: 0 };
    }

    let scanned = 0;
    let updated = 0;
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
      const templateId = name.slice(0, -5);
      const existing = this.getTemplate(templateId);
      if (!existing) {
        continue;
      }
      scanned += 1;
      const seedTemplate = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as TemplateDetailDto;
      const repaired = repairTemplateMemberKinds(existing.template, seedTemplate);
      if (!repaired.changed) {
        continue;
      }
      this.saveTemplate(templateId, repaired.template, existing.source);
      updated += 1;
    }

    return { scanned, updated };
  }

  repairStageSemanticsFromDir(templatesDir: string): TemplateRepairResult {
    const dir = resolve(templatesDir, 'tasks');
    if (!existsSync(dir)) {
      return { scanned: 0, updated: 0 };
    }

    let scanned = 0;
    let updated = 0;
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
      const templateId = name.slice(0, -5);
      const existing = this.getTemplate(templateId);
      if (!existing) {
        continue;
      }
      scanned += 1;
      const seedTemplate = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as TemplateDetailDto;
      const repaired = repairTemplateStageSemantics(existing.template, seedTemplate);
      if (!repaired.changed) {
        continue;
      }
      this.saveTemplate(templateId, repaired.template, existing.source);
      updated += 1;
    }

    return { scanned, updated };
  }

  repairGraphsFromDir(templatesDir: string): TemplateRepairResult {
    const dir = resolve(templatesDir, 'tasks');
    if (!existsSync(dir)) {
      return { scanned: 0, updated: 0 };
    }

    let scanned = 0;
    let updated = 0;
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
      const templateId = name.slice(0, -5);
      const existing = this.getTemplate(templateId);
      if (!existing) {
        continue;
      }
      scanned += 1;
      const normalized = normalizeTemplateGraphPayload(existing.template);
      if (JSON.stringify(normalized.graph ?? null) === JSON.stringify(existing.template.graph ?? null)) {
        continue;
      }
      this.saveTemplate(templateId, normalized, existing.source);
      updated += 1;
    }
    return { scanned, updated };
  }

  private parseTemplateRow(row: Record<string, unknown>): StoredTemplate {
    return {
      id: String(row.id),
      version: Number(row.version),
      source: String(row.source),
      template: parseJsonValue<TemplateDetailDto>(row.payload, {} as TemplateDetailDto),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}

function normalizeTemplateGraphPayload(template: TemplateDetailDto): TemplateDetailDto {
  if (template.graph) {
    return template;
  }
  const stages = template.stages ?? [];
  return {
    ...template,
    graph: {
      graph_version: 1,
      entry_nodes: stages[0] ? [stages[0].id] : ['entry'],
      nodes: stages.map((stage, index) => ({
        id: stage.id,
        ...(stage.name ? { name: stage.name } : {}),
        kind: 'stage',
        ...(stage.execution_kind ? { execution_kind: stage.execution_kind } : {}),
        ...(stage.allowed_actions ? { allowed_actions: stage.allowed_actions } : {}),
        ...(stage.roster ? { roster: stage.roster } : {}),
        ...(stage.gate ? { gate: stage.gate } : {}),
        layout: {
          x: index * 280,
          y: 0,
        },
      })),
      edges: stages.flatMap((stage, index) => {
        const edges: NonNullable<TemplateDetailDto['graph']>['edges'] = [];
        const nextStage = stages[index + 1];
        if (nextStage) {
          edges.push({
            id: `${stage.id}__advance__${nextStage.id}`,
            from: stage.id,
            to: nextStage.id,
            kind: 'advance',
          });
        }
        if (stage.reject_target) {
          edges.push({
            id: `${stage.id}__reject__${stage.reject_target}`,
            from: stage.id,
            to: stage.reject_target,
            kind: 'reject',
          });
        }
        return edges;
      }),
    },
  };
}

function repairTemplateMemberKinds(
  existing: TemplateDetailDto,
  seedTemplate: TemplateDetailDto,
): { changed: boolean; template: TemplateDetailDto } {
  const existingTeam = existing.defaultTeam ?? {};
  const seedTeam = seedTemplate.defaultTeam ?? {};
  let changed = false;

  const repairedTeam = Object.fromEntries(Object.entries(existingTeam).map(([role, member]) => {
    if (member.member_kind) {
      return [role, member];
    }
    const seedMemberKind = seedTeam[role]?.member_kind;
    if (!seedMemberKind) {
      return [role, member];
    }
    changed = true;
    return [
      role,
      {
        ...member,
        member_kind: seedMemberKind,
      },
    ];
  }));

  if (!changed) {
    return { changed: false, template: existing };
  }

  return {
    changed: true,
    template: {
      ...existing,
      defaultTeam: repairedTeam,
    },
  };
}

function repairTemplateStageSemantics(
  existing: TemplateDetailDto,
  seedTemplate: TemplateDetailDto,
): { changed: boolean; template: TemplateDetailDto } {
  const existingStages = existing.stages ?? [];
  const seedStagesById = new Map((seedTemplate.stages ?? []).map((stage) => [stage.id, stage]));
  let changed = false;

  const repairedStages = existingStages.map((stage) => {
    const seedStage = seedStagesById.get(stage.id);
    if (!seedStage) {
      return stage;
    }
    const nextStage = {
      ...stage,
      ...(stage.execution_kind ? {} : (seedStage.execution_kind ? { execution_kind: seedStage.execution_kind } : {})),
      ...(stage.allowed_actions?.length ? {} : (seedStage.allowed_actions?.length ? { allowed_actions: seedStage.allowed_actions } : {})),
    };
    if (nextStage !== stage && (
      nextStage.execution_kind !== stage.execution_kind
      || JSON.stringify(nextStage.allowed_actions ?? []) !== JSON.stringify(stage.allowed_actions ?? [])
    )) {
      changed = true;
    }
    return nextStage;
  });

  if (!changed) {
    return { changed: false, template: existing };
  }

  return {
    changed: true,
    template: {
      ...existing,
      stages: repairedStages,
    },
  };
}
