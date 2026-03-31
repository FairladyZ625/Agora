import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  HumanAccountRepository,
  HumanIdentityBindingRepository,
  type AgoraDatabase,
} from '@agora-ts/db';

export type HumanAccountRole = 'admin' | 'member';

export interface HumanAccount {
  id: number;
  username: string;
  role: HumanAccountRole;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface HumanAccountIdentityBinding {
  provider: string;
  external_user_id: string;
}

export interface HumanAccountWithIdentities extends HumanAccount {
  identities: HumanAccountIdentityBinding[];
}

function assertPassword(password: string) {
  if (!password || password.trim().length < 8) {
    throw new Error('password must be at least 8 characters');
  }
}

function hashPassword(password: string): string {
  assertPassword(password);
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, expectedHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) {
    return false;
  }
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.byteLength !== expected.byteLength) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export interface HumanAccountServiceOptions {
  accountRepository?: HumanAccountRepository;
  identityBindingRepository?: HumanIdentityBindingRepository;
}

export class HumanAccountService {
  private readonly accounts: HumanAccountRepository;
  private readonly identities: HumanIdentityBindingRepository;

  constructor(db: AgoraDatabase, options: HumanAccountServiceOptions = {}) {
    this.accounts = options.accountRepository ?? new HumanAccountRepository(db);
    this.identities = options.identityBindingRepository ?? new HumanIdentityBindingRepository(db);
  }

  hasAccounts(): boolean {
    return this.accounts.countAccounts() > 0;
  }

  bootstrapAdmin(input: { username: string; password: string }): HumanAccount {
    const existing = this.accounts.getByUsername(input.username);
    if (existing) {
      return this.toHumanAccount(this.accounts.updateAccount(input.username, {
        password_hash: hashPassword(input.password),
        role: 'admin',
        enabled: true,
      }));
    }
    return this.toHumanAccount(this.accounts.insertAccount({
      username: input.username,
      password_hash: hashPassword(input.password),
      role: 'admin',
      enabled: true,
    }));
  }

  createUser(input: { username: string; password: string; role?: HumanAccountRole }): HumanAccount {
    if (this.accounts.getByUsername(input.username)) {
      throw new Error(`human account ${input.username} already exists`);
    }
    return this.toHumanAccount(this.accounts.insertAccount({
      username: input.username,
      password_hash: hashPassword(input.password),
      role: input.role ?? 'member',
      enabled: true,
    }));
  }

  listUsers(): HumanAccount[] {
    return this.accounts.listAccounts().map((account) => this.toHumanAccount(account));
  }

  listUsersWithIdentities(): HumanAccountWithIdentities[] {
    return this.accounts.listAccounts().map((account) => ({
      ...this.toHumanAccount(account),
      identities: this.identities.listByAccountId(account.id).map((binding) => ({
        provider: binding.provider,
        external_user_id: binding.external_user_id,
      })),
    }));
  }

  disableUser(username: string): HumanAccount {
    return this.toHumanAccount(this.accounts.updateAccount(username, { enabled: false }));
  }

  setPassword(username: string, password: string): HumanAccount {
    return this.toHumanAccount(this.accounts.updateAccount(username, {
      password_hash: hashPassword(password),
    }));
  }

  bindIdentity(input: { username: string; provider: string; externalUserId: string }): HumanAccountIdentityBinding {
    const account = this.accounts.getByUsername(input.username);
    if (!account) {
      throw new Error(`human account ${input.username} not found`);
    }
    const binding = this.identities.bindIdentity(account.id, input.provider, input.externalUserId);
    return {
      provider: binding.provider,
      external_user_id: binding.external_user_id,
    };
  }

  getIdentity(accountId: number, provider: string): HumanAccountIdentityBinding | null {
    const binding = this.identities.listByAccountId(accountId).find((item) => item.provider === provider);
    if (!binding) {
      return null;
    }
    return {
      provider: binding.provider,
      external_user_id: binding.external_user_id,
    };
  }

  getIdentityByUsername(username: string, provider: string): HumanAccountIdentityBinding | null {
    const account = this.accounts.getByUsername(username);
    if (!account || !account.enabled) {
      return null;
    }
    return this.getIdentity(account.id, provider);
  }

  authenticate(username: string, password: string): HumanAccount | null {
    const account = this.accounts.getByUsername(username);
    if (!account || !account.enabled) {
      return null;
    }
    if (!verifyPassword(password, account.password_hash)) {
      return null;
    }
    return this.toHumanAccount(account);
  }

  resolveIdentity(provider: string, externalUserId: string): HumanAccount | null {
    const binding = this.identities.getByProviderExternalId(provider, externalUserId);
    if (!binding) {
      return null;
    }
    const account = this.accounts.getById(binding.account_id);
    if (!account || !account.enabled) {
      return null;
    }
    return this.toHumanAccount(account);
  }

  private toHumanAccount(account: {
    id: number;
    username: string;
    role: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  }): HumanAccount {
    return {
      id: account.id,
      username: account.username,
      role: account.role === 'admin' ? 'admin' : 'member',
      enabled: account.enabled,
      created_at: account.created_at,
      updated_at: account.updated_at,
    };
  }
}
