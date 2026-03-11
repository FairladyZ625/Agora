import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TemplateDetailDto } from '@agora-ts/contracts';
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

export class TemplateRepository {
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
    const existing = this.getTemplate(templateId);

    if (existing) {
      this.db.prepare(`
        UPDATE templates
        SET payload = ?, source = ?, version = version + 1, updated_at = ?
        WHERE id = ?
      `).run(
        stringifyJsonValue(template),
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
        stringifyJsonValue(template),
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
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.json')).sort()) {
      const templateId = name.slice(0, -5);
      if (this.getTemplate(templateId)) {
        continue;
      }
      const template = JSON.parse(readFileSync(resolve(dir, name), 'utf8')) as TemplateDetailDto;
      this.saveTemplate(templateId, template, 'seed');
      inserted += 1;
    }
    return { inserted };
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
