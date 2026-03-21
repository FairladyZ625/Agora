import { describe, expect, it } from 'vitest';
import {
  isDeveloperRegressionEnabled,
  isRegressionOperatorProxyEnabled,
} from './dev-regression-mode.js';

describe('developer regression mode', () => {
  it('defaults to disabled when the env flag is absent', () => {
    expect(isDeveloperRegressionEnabled({})).toBe(false);
  });

  it('treats true-like env values as enabled', () => {
    expect(isDeveloperRegressionEnabled({
      AGORA_DEV_REGRESSION_MODE: 'true',
    })).toBe(true);
    expect(isDeveloperRegressionEnabled({
      AGORA_DEV_REGRESSION_MODE: '1',
    })).toBe(true);
    expect(isDeveloperRegressionEnabled({
      AGORA_DEV_REGRESSION_MODE: 'ON',
    })).toBe(true);
  });

  it('requires both the env gate and regression task mode for operator proxy', () => {
    expect(isRegressionOperatorProxyEnabled('regression_test', {
      AGORA_DEV_REGRESSION_MODE: 'true',
    })).toBe(true);
    expect(isRegressionOperatorProxyEnabled('smoke_test', {
      AGORA_DEV_REGRESSION_MODE: 'true',
    })).toBe(false);
    expect(isRegressionOperatorProxyEnabled('regression_test', {})).toBe(false);
  });
});
