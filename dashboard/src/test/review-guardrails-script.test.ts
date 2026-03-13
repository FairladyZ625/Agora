import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootScriptSource = readFileSync(resolve(import.meta.dirname, '../../../scripts/check-review-guardrails.mjs'), 'utf8');
const rootCheckSource = readFileSync(resolve(import.meta.dirname, '../../../scripts/check-ts-all.sh'), 'utf8');
const baselineSource = readFileSync(resolve(import.meta.dirname, '../../../scripts/review-guardrails-baseline.json'), 'utf8');

describe('root review guardrail checks', () => {
  it('wires the recurring review guardrail scan into the root TypeScript gate', () => {
    expect(rootCheckSource).toContain('check-review-guardrails.mjs');
    expect(rootCheckSource).toContain('recurring review guardrails');
  });

  it('tracks baseline debt explicitly while scanning for new violations', () => {
    expect(rootScriptSource).toContain('review-guardrails-baseline.json');
    expect(rootScriptSource).toContain('providerFallbackHardcode');
    expect(rootScriptSource).toContain('rawJsonParse');
    expect(rootScriptSource).toContain('repositoryNonNullReload');
    expect(rootScriptSource).toContain('dashboardEmptyCatch');
    expect(rootScriptSource).toContain('Baseline debt tracked');
    expect(baselineSource).toContain('repositoryNonNullReload');
  });
});
