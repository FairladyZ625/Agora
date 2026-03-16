import { describe, expect, it } from 'vitest';
import { parseJsonWithContext } from './json-utils.js';

describe('json utils', () => {
  it('parses json with typed context', () => {
    expect(parseJsonWithContext<{ ok: boolean }>('{"ok":true}', 'test payload')).toEqual({ ok: true });
  });

  it('throws a contextual error for invalid json', () => {
    expect(() => parseJsonWithContext('{oops', 'runner payload')).toThrow(/Invalid runner payload/);
  });
});
