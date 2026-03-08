import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { promoteTodoResultSchema, taskStateSchema } from '@agora-ts/contracts';

const projectRoot = resolve(process.cwd(), '..');

describe('shared contracts drift guard', () => {
  it('keeps dashboard api dto types sourced from agora-ts contracts', () => {
    const apiTypesSource = readFileSync(resolve(projectRoot, 'dashboard/src/types/api.ts'), 'utf8');

    expect(apiTypesSource).not.toMatch(/export interface Api[A-Za-z0-9]+Dto/);
    expect(apiTypesSource).not.toContain("| 'draft'");
    expect(apiTypesSource).toContain('export type ApiTaskState = TaskState;');
    expect(apiTypesSource).not.toMatch(/export interface ApiPromoteTodoResultDto/);

    const parsedState = taskStateSchema.parse('active');
    const parsedPromoteResult = promoteTodoResultSchema.parse({
      todo: {
        id: 1,
        text: 'promote',
        status: 'pending',
        due: null,
        created_at: '2026-03-08T00:00:00.000Z',
        completed_at: null,
        tags: [],
        promoted_to: 'OC-100',
      },
      task: {
        id: 'OC-100',
        version: 1,
        title: 'promote',
        description: null,
        type: 'quick',
        priority: 'normal',
        creator: 'archon',
        state: 'active',
        current_stage: 'execute',
        team: { members: [] },
        workflow: { stages: [] },
        scheduler: null,
        scheduler_snapshot: null,
        discord: null,
        metrics: null,
        error_detail: null,
        created_at: '2026-03-08T00:00:00.000Z',
        updated_at: '2026-03-08T00:00:00.000Z',
      },
    });

    expect(parsedState).toBe('active');
    expect(parsedPromoteResult.task.id).toBe('OC-100');
  });

  it('keeps the OpenClaw plugin wired to shared contracts', () => {
    const pluginPackage = readFileSync(resolve(projectRoot, 'extensions/agora-plugin/package.json'), 'utf8');
    const pluginBridge = readFileSync(resolve(projectRoot, 'extensions/agora-plugin/src/bridge.ts'), 'utf8');

    expect(pluginPackage).toContain('"@agora-ts/contracts"');
    expect(pluginBridge).toContain('from "@agora-ts/contracts"');
  });
});
