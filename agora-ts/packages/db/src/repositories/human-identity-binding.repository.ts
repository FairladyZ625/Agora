import type { AgoraDatabase } from '../database.js';

export interface StoredHumanIdentityBinding {
  id: number;
  account_id: number;
  provider: string;
  external_user_id: string;
  created_at: string;
}

export class HumanIdentityBindingRepository {
  constructor(private readonly db: AgoraDatabase) {}

  bindIdentity(accountId: number, provider: string, externalUserId: string): StoredHumanIdentityBinding {
    const now = new Date().toISOString();
    this.db.prepare(`
      DELETE FROM human_identity_bindings
      WHERE account_id = ? AND provider = ?
    `).run(accountId, provider);

    const result = this.db.prepare(`
      INSERT INTO human_identity_bindings (
        account_id, provider, external_user_id, created_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(provider, external_user_id)
      DO UPDATE SET account_id = excluded.account_id
    `).run(accountId, provider, externalUserId, now);

    return this.getById(Number(result.lastInsertRowid))
      ?? this.getByProviderExternalId(provider, externalUserId)!;
  }

  getById(id: number): StoredHumanIdentityBinding | null {
    const row = this.db.prepare('SELECT * FROM human_identity_bindings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  getByProviderExternalId(provider: string, externalUserId: string): StoredHumanIdentityBinding | null {
    const row = this.db.prepare(`
      SELECT * FROM human_identity_bindings
      WHERE provider = ? AND external_user_id = ?
    `).get(provider, externalUserId) as Record<string, unknown> | undefined;
    return row ? this.parseRow(row) : null;
  }

  listByAccountId(accountId: number): StoredHumanIdentityBinding[] {
    const rows = this.db.prepare(`
      SELECT * FROM human_identity_bindings
      WHERE account_id = ?
      ORDER BY provider ASC
    `).all(accountId) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  private parseRow(row: Record<string, unknown>): StoredHumanIdentityBinding {
    return {
      id: Number(row.id),
      account_id: Number(row.account_id),
      provider: String(row.provider),
      external_user_id: String(row.external_user_id),
      created_at: String(row.created_at),
    };
  }
}
