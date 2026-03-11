import { describe, expect, it } from 'vitest';
import type { ApiTaskDto, ApiTaskStatusDto } from '@/types/api';
import {
  isTaskVisibleInWorkbench,
  mapTaskDto,
  mapTaskStatusDto,
} from '@/lib/taskMappers';

function buildTaskDto(overrides: Partial<ApiTaskDto> = {}): ApiTaskDto {
  return {
    id: 'OC-001',
    version: 3,
    title: '真实 API 任务',
    description: '把 dashboard 收到真实后端上。',
    type: 'coding',
    priority: 'high',
    creator: 'archon',
    state: 'active',
    archive_status: null,
    current_stage: 'develop',
    team: {
      members: [
        { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
        { role: 'reviewer', agentId: 'glm5', model_preference: 'chinese_strong' },
        { role: 'craftsman', agentId: 'claude_code', model_preference: 'coding_cli' },
      ],
    },
    workflow: {
      type: 'discuss-execute-review',
      stages: [
        { id: 'discuss', name: '方案讨论', mode: 'discuss', gate: { type: 'archon_review' } },
        { id: 'develop', name: '并行开发', mode: 'execute', gate: { type: 'all_subtasks_done' } },
        { id: 'review', name: '合并审查', mode: 'discuss', gate: { type: 'archon_review' } },
      ],
    },
    scheduler: null,
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: '2026-03-07T00:00:00.000Z',
    updated_at: '2026-03-07T01:00:00.000Z',
    ...overrides,
  };
}

describe('task mappers', () => {
  it('maps active execution tasks into workbench view models', () => {
    const task = mapTaskDto(buildTaskDto());

    expect(task.state).toBe('in_progress');
    expect(task.teamLabel).toContain('opus');
    expect(task.workflowLabel).toBe('discuss-execute-review');
    expect(task.memberCount).toBe(4);
    expect(task.isReviewStage).toBe(false);
    expect(task.sourceState).toBe('active');
  });

  it('maps active review stages into gate waiting state', () => {
    const task = mapTaskDto(
      buildTaskDto({
        current_stage: 'review',
      }),
    );

    expect(task.state).toBe('gate_waiting');
    expect(task.isReviewStage).toBe(true);
  });

  it('preserves live status logs while mapping nested task data', () => {
    const statusDto: ApiTaskStatusDto = {
      task: buildTaskDto({ current_stage: 'review' }),
      flow_log: [
        {
          id: 1,
          task_id: 'OC-001',
          kind: 'state',
          event: 'archon_review_entered',
          stage_id: 'review',
          from_state: 'active',
          to_state: 'active',
          detail: '进入 Archon 审批门。',
          actor: 'system',
          created_at: '2026-03-07T01:10:00.000Z',
        },
      ],
      progress_log: [],
      subtasks: [],
      task_blueprint: {
        graph_version: 1,
        entry_nodes: ['discuss'],
        nodes: [
          { id: 'discuss', name: '方案讨论', mode: 'discuss', gate_type: 'archon_review' },
          { id: 'develop', name: '并行开发', mode: 'execute', gate_type: 'all_subtasks_done' },
          { id: 'review', name: '合并审查', mode: 'discuss', gate_type: 'archon_review' },
        ],
        edges: [
          { from: 'discuss', to: 'develop', kind: 'advance' },
          { from: 'develop', to: 'review', kind: 'advance' },
          { from: 'review', to: 'discuss', kind: 'reject' },
        ],
        artifact_contracts: [{ node_id: 'develop', artifact_type: 'stage_output' }],
        role_bindings: [
          { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
        ],
      },
    };

    const status = mapTaskStatusDto(statusDto);

    expect(status.task.state).toBe('gate_waiting');
    expect(status.flow_log).toHaveLength(1);
    expect(status.flow_log[0]?.event).toBe('archon_review_entered');
    expect(status.taskBlueprint).toEqual({
      graphVersion: 1,
      entryNodes: ['discuss'],
      nodes: [
        { id: 'discuss', name: '方案讨论', mode: 'discuss', gateType: 'archon_review' },
        { id: 'develop', name: '并行开发', mode: 'execute', gateType: 'all_subtasks_done' },
        { id: 'review', name: '合并审查', mode: 'discuss', gateType: 'archon_review' },
      ],
      edges: [
        { from: 'discuss', to: 'develop', kind: 'advance' },
        { from: 'develop', to: 'review', kind: 'advance' },
        { from: 'review', to: 'discuss', kind: 'reject' },
      ],
      artifactContracts: [{ nodeId: 'develop', artifactType: 'stage_output' }],
      roleBindings: [
        { role: 'architect', agentId: 'opus', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', model_preference: 'fast_coding' },
      ],
    });
  });

  it('hides draft, created, and orphaned tasks from the workbench list', () => {
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'draft' }))).toBe(false);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'created' }))).toBe(false);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'orphaned' }))).toBe(false);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'paused' }))).toBe(true);
  });

  it('keeps pending-archive tasks visible until archive sync completes', () => {
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'cancelled', archive_status: 'pending' }))).toBe(true);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'done', archive_status: 'notified' }))).toBe(false);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'done', archive_status: 'failed' }))).toBe(false);
    expect(isTaskVisibleInWorkbench(buildTaskDto({ state: 'done', archive_status: 'synced' }))).toBe(false);
  });
});
