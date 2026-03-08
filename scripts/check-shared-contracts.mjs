#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const dashboardApiTypesPath = resolve(rootDir, 'dashboard/src/types/api.ts');
const dashboardApiClientPath = resolve(rootDir, 'dashboard/src/lib/api.ts');
const dashboardPackagePath = resolve(rootDir, 'dashboard/package.json');
const pluginPackagePath = resolve(rootDir, 'extensions/agora-plugin/package.json');
const pluginBridgePath = resolve(rootDir, 'extensions/agora-plugin/src/bridge.ts');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const dashboardApiTypes = readFileSync(dashboardApiTypesPath, 'utf8');
const dashboardApiClient = readFileSync(dashboardApiClientPath, 'utf8');
const dashboardPackage = readFileSync(dashboardPackagePath, 'utf8');
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
  dashboardPackage.includes('"@agora-ts/contracts"'),
  'dashboard/package.json must depend on @agora-ts/contracts',
);
assert(
  /reviewer_id:\s*reviewerId/.test(dashboardApiClient),
  'dashboard/src/lib/api.ts must send reviewer_id for archon review actions',
);
assert(
  /archon-approve[\s\S]*reviewer_id:\s*reviewerId[\s\S]*comment/.test(dashboardApiClient),
  'dashboard/src/lib/api.ts must include reviewer_id in archon approve payloads',
);
assert(
  /archon-reject[\s\S]*reviewer_id:\s*reviewerId[\s\S]*reason/.test(dashboardApiClient),
  'dashboard/src/lib/api.ts must include reviewer_id in archon reject payloads',
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
