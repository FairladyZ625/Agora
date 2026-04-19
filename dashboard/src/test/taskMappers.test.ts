import { describe, expect, it } from 'vitest';
import type { ApiTaskDto, ApiTaskStatusDto } from '@/types/api';
import {
  mapCraftsmanExecutionDto,
  mapCraftsmanGovernanceSnapshotDto,
  isTaskVisibleInWorkbench,
  mapTaskConversationEntryDto,
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
    locale: 'zh-CN',
    state: 'active',
    archive_status: null,
    controller_ref: 'opus',
    current_stage: 'develop',
    team: {
      members: [
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
        { role: 'reviewer', agentId: 'glm5', member_kind: 'citizen', model_preference: 'chinese_strong' },
        { role: 'craftsman', agentId: 'claude_code', member_kind: 'craftsman', model_preference: 'coding_cli' },
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
    expect(task.controllerRef).toBe('opus');
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
      current_stage_roster: {
        stage_id: 'review',
        roster: {
          include_roles: ['reviewer'],
          keep_controller: true,
        },
        desired_participant_refs: ['opus', 'glm5'],
        joined_participant_refs: ['opus'],
      },
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
        controller_ref: 'opus',
        nodes: [
          { id: 'discuss', kind: 'stage', name: '方案讨论', mode: 'discuss', gate_type: 'archon_review' },
          { id: 'develop', kind: 'stage', name: '并行开发', mode: 'execute', gate_type: 'all_subtasks_done' },
          { id: 'review', kind: 'stage', name: '合并审查', mode: 'discuss', gate_type: 'archon_review' },
        ],
        edges: [
          { from: 'discuss', to: 'develop', kind: 'advance' },
          { from: 'develop', to: 'review', kind: 'advance' },
          { from: 'review', to: 'discuss', kind: 'reject' },
        ],
        artifact_contracts: [{ node_id: 'develop', artifact_type: 'stage_output' }],
        role_bindings: [
          { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
          { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
        ],
      },
    };

    const status = mapTaskStatusDto(statusDto);

    expect(status.task.state).toBe('gate_waiting');
    expect(status.task.controllerRef).toBe('opus');
    expect(status.currentStageRoster).toEqual({
      stageId: 'review',
      roster: {
        include_roles: ['reviewer'],
        keep_controller: true,
      },
      desiredParticipantRefs: ['opus', 'glm5'],
      joinedParticipantRefs: ['opus'],
    });
    expect(status.flow_log).toHaveLength(1);
    expect(status.flow_log[0]?.event).toBe('archon_review_entered');
    expect(status.taskBlueprint).toEqual({
      graphVersion: 1,
      entryNodes: ['discuss'],
      controllerRef: 'opus',
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
        { role: 'architect', agentId: 'opus', member_kind: 'controller', model_preference: 'strong_reasoning' },
        { role: 'developer', agentId: 'sonnet', member_kind: 'citizen', model_preference: 'fast_coding' },
      ],
    });
  });

  it('maps structured conversation status metadata into a status event view model', () => {
    const entry = mapTaskConversationEntryDto({
      id: 'entry-status-1',
      task_id: 'OC-001',
      binding_id: 'binding-1',
      provider: 'discord',
      provider_message_ref: 'msg-status-1',
      parent_message_ref: null,
      direction: 'system',
      author_kind: 'system',
      author_ref: 'agora-bot',
      display_name: 'agora-bot',
      body: 'Agora status update',
      body_format: 'plain_text',
      occurred_at: '2026-03-07T01:20:00.000Z',
      ingested_at: '2026-03-07T01:20:01.000Z',
      metadata: {
        event_type: 'craftsman_completed',
        task_id: 'OC-001',
        task_state: 'active',
        current_stage: 'develop',
        execution_kind: 'craftsman_dispatch',
        allowed_actions: ['dispatch_craftsman'],
        controller_ref: 'opus',
        workspace_path: '/tmp/agora-ai-brain/tasks/OC-001',
        participant_refs: ['opus'],
      },
    });

    expect(entry.statusEvent).toEqual({
      eventType: 'craftsman_completed',
      taskId: 'OC-001',
      taskState: 'active',
      currentStage: 'develop',
      executionKind: 'craftsman_dispatch',
      allowedActions: ['dispatch_craftsman'],
      controllerRef: 'opus',
      workspacePath: '/tmp/agora-ai-brain/tasks/OC-001',
      participantRefs: ['opus'],
    });
  });

  it('maps craftsman execution and governance DTOs into operator view models', () => {
    const execution = mapCraftsmanExecutionDto({
      execution_id: 'exec-1',
      task_id: 'OC-001',
      subtask_id: 'subtask-1',
      adapter: 'codex',
      mode: 'one_shot',
      session_id: 'tmux:1',
      status: 'awaiting_choice',
      brief_path: '/tmp/brief.md',
      workdir: '/tmp/agora',
      callback_payload: {
        input_request: {
          transport: 'choice',
          hint: 'Choose one',
          choice_options: [
            { id: 'continue', label: 'Continue', keys: ['Down'], submit: true },
            { id: 'abort', label: 'Abort', keys: ['Up'], submit: true },
          ],
        },
      },
      error: null,
      started_at: '2026-03-07T02:00:00.000Z',
      finished_at: null,
      created_at: '2026-03-07T02:00:00.000Z',
      updated_at: '2026-03-07T02:00:00.000Z',
    });
    const governance = mapCraftsmanGovernanceSnapshotDto({
      limits: {
        max_concurrent_running: 4,
        max_concurrent_per_agent: 2,
        host_memory_warning_utilization_limit: 0.7,
        host_memory_utilization_limit: 0.8,
        host_swap_warning_utilization_limit: 0.1,
        host_swap_utilization_limit: 0.2,
        host_load_per_cpu_warning_limit: 1.2,
        host_load_per_cpu_limit: 1.5,
      },
      active_executions: 2,
      active_by_assignee: [{ assignee: 'opus', count: 2 }],
      active_execution_details: [],
      host_pressure_status: 'healthy',
      warnings: [],
      host: {
        observed_at: '2026-03-07T02:00:00.000Z',
        cpu_count: 8,
        load_1m: 0.75,
        memory_total_bytes: 1000,
        memory_used_bytes: 500,
        memory_utilization: 0.5,
        swap_total_bytes: 1000,
        swap_used_bytes: 0,
        swap_utilization: 0,
      },
    });

    expect(execution.executionId).toBe('exec-1');
    expect(execution.callbackPayload?.inputRequest?.choiceOptions).toHaveLength(2);
    expect(governance.activeExecutions).toBe(2);
    expect(governance.host?.load1m).toBe(0.75);
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
