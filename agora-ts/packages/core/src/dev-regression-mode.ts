import type { TaskControlMode } from '@agora-ts/contracts';

const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isDeveloperRegressionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.AGORA_DEV_REGRESSION_MODE?.trim().toLowerCase();
  return raw ? TRUE_LIKE_VALUES.has(raw) : false;
}

export function isRegressionOperatorProxyEnabled(
  controlMode: TaskControlMode | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return controlMode === 'regression_test' && isDeveloperRegressionEnabled(env);
}
