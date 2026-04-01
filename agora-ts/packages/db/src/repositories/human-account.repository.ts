import type { IHumanAccountRepository } from '@agora-ts/contracts';
import type { AgoraDatabase } from '../database.js';

export interface StoredHumanAccount {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsertHumanAccountInput {
  username: string;
  password_hash: string;
  role: string;
  enabled?: boolean;
}

export interface UpdateHumanAccountInput {
  password_hash?: string;
  role?: string;
  enabled?: boolean;
}

export class HumanAccountRepository implements IHumanAccountRepository {
  constructor(private readonly db: AgoraDatabase) {}

  insertAccount(input: InsertHumanAccountInput): StoredHumanAccount {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO human_accounts (
        username, password_hash, role, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.username,
      input.password_hash,
      input.role,
      input.enabled === false ? 0 : 1,
      now,
      now,
    );

    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): StoredHumanAccount | null {
    const row = this.db.prepare('SELECT * FROM human_accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByUsername(username: string): StoredHumanAccount | null {
    const row = this.db.prepare('SELECT * FROM human_accounts WHERE username = ?').get(username) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listAccounts(): StoredHumanAccount[] {
    const rows = this.db.prepare('SELECT * FROM human_accounts ORDER BY username ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  countAccounts(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM human_accounts').get() as { count: number };
    return Number(row.count);
  }

  updateAccount(username: string, updates: UpdateHumanAccountInput): StoredHumanAccount {
    const assignments: string[] = [];
    const values: Array<string | number> = [];

    if (updates.password_hash !== undefined) {
      assignments.push('password_hash = ?');
      values.push(updates.password_hash);
    }
    if (updates.role !== undefined) {
      assignments.push('role = ?');
      values.push(updates.role);
    }
    if (updates.enabled !== undefined) {
      assignments.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    assignments.push('updated_at = ?');
    values.push(new Date().toISOString(), username);

    const result = this.db.prepare(`
      UPDATE human_accounts
      SET ${assignments.join(', ')}
      WHERE username = ?
    `).run(...values);

    if (result.changes === 0) {
      throw new Error(`human account ${username} not found`);
    }

    return this.getByUsername(username)!;
  }

  private parseRow(row: Record<string, unknown>): StoredHumanAccount {
    return {
      id: Number(row.id),
      username: String(row.username),
      password_hash: String(row.password_hash),
      role: String(row.role),
      enabled: Number(row.enabled) === 1,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
