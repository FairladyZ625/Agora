#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const dashboardApiTypesPath = resolve(rootDir, 'dashboard/src/types/api.ts');
const pluginPackagePath = resolve(rootDir, 'extensions/agora-plugin/package.json');
const pluginBridgePath = resolve(rootDir, 'extensions/agora-plugin/src/bridge.ts');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const dashboardApiTypes = readFileSync(dashboardApiTypesPath, 'utf8');
const pluginPackage = readFileSync(pluginPackagePath, 'utf8');
const pluginBridge = readFileSync(pluginBridgePath, 'utf8');

assert(
  dashboardApiTypes.includes("from '@agora-ts/contracts'"),
  'dashboard/src/types/api.ts must import DTOs from @agora-ts/contracts',
);
assert(
  !/export interface Api[A-Za-z0-9]+Dto/.test(dashboardApiTypes),
  'dashboard/src/types/api.ts must not define local Api*Dto interfaces',
);
assert(
  !dashboardApiTypes.includes("| 'draft'"),
  'dashboard/src/types/api.ts must not define a local ApiTaskState union',
);
assert(
  dashboardApiTypes.includes('export type ApiTaskState = TaskState;'),
  'dashboard/src/types/api.ts must alias ApiTaskState to TaskState from shared contracts',
);
assert(
  dashboardApiTypes.includes('export type ApiPromoteTodoResultDto = PromoteTodoResultDto;'),
  'dashboard/src/types/api.ts must alias ApiPromoteTodoResultDto to PromoteTodoResultDto from shared contracts',
);
assert(
  pluginPackage.includes('"@agora-ts/contracts"'),
  'extensions/agora-plugin/package.json must depend on @agora-ts/contracts',
);
assert(
  pluginBridge.includes('from "@agora-ts/contracts"'),
  'extensions/agora-plugin/src/bridge.ts must import from @agora-ts/contracts',
);

console.log('Shared contracts drift check passed.');
