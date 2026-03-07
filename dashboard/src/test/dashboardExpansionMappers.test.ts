import { describe, expect, it } from 'vitest';
import type {
  ApiAgentsStatusDto,
  ApiArchiveJobDto,
  ApiTemplateDetailDto,
  ApiTemplateSummaryDto,
  ApiTodoDto,
} from '@/types/api';
import {
  mapAgentsStatusDto,
  mapArchiveJobDto,
  mapTemplateDetailDto,
  mapTemplateSummaryDto,
  mapTodoDto,
} from '@/lib/dashboardExpansionMappers';

describe('dashboard expansion mappers', () => {
  it('maps agent status payloads into stable dashboard view models', () => {
    const dto: ApiAgentsStatusDto = {
      summary: {
        active_tasks: 2,
        active_agents: 3,
        busy_craftsmen: 1,
      },
      agents: [
        {
          id: 'sonnet',
          role: 'developer',
          status: 'busy',
          active_task_ids: ['OC-101'],
          active_subtask_ids: ['dev-api'],
          load: 1,
          last_active_at: '2026-03-07T10:00:00.000Z',
        },
      ],
      craftsmen: [
        {
          id: 'codex',
          status: 'busy',
          task_id: 'OC-101',
          subtask_id: 'dev-api',
          title: '实现 API',
          running_since: '2026-03-07T09:30:00.000Z',
        },
      ],
    };

    const status = mapAgentsStatusDto(dto);

    expect(status.summary.activeTasks).toBe(2);
    expect(status.summary.activeAgents).toBe(3);
    expect(status.agents[0]?.taskCount).toBe(1);
    expect(status.craftsmen[0]?.taskId).toBe('OC-101');
  });

  it('maps todos while preserving tags and promoted task links', () => {
    const dto: ApiTodoDto = {
      id: 3,
      text: '补页面',
      status: 'pending',
      due: '2026-03-09',
      created_at: '2026-03-07T09:00:00.000Z',
      completed_at: null,
      tags: ['dashboard', 'frontend'],
      promoted_to: 'OC-201',
    };

    const todo = mapTodoDto(dto);

    expect(todo.id).toBe(3);
    expect(todo.tagLabel).toBe('dashboard / frontend');
    expect(todo.promotedTo).toBe('OC-201');
  });

  it('maps archive jobs into retry-friendly view models', () => {
    const dto: ApiArchiveJobDto = {
      id: 7,
      task_id: 'OC-301',
      task_title: '归档日报',
      task_type: 'document',
      status: 'failed',
      target_path: 'ZeYu-AI-Brain/docs/',
      writer_agent: 'writer-agent',
      commit_hash: null,
      requested_at: '2026-03-07T08:00:00.000Z',
      completed_at: null,
      payload: { error_message: 'timeout' },
    };

    const job = mapArchiveJobDto(dto);

    expect(job.id).toBe(7);
    expect(job.taskTitle).toBe('归档日报');
    expect(job.payloadSummary).toContain('timeout');
    expect(job.canRetry).toBe(true);
  });

  it('maps template summaries and details for explorer-style rendering', () => {
    const summaryDto: ApiTemplateSummaryDto = {
      id: 'coding',
      name: 'Coding Task',
      type: 'coding',
      description: '实现代码任务',
      governance: 'archon',
      stage_count: 4,
    };
    const detailDto: ApiTemplateDetailDto = {
      type: 'coding',
      name: 'Coding Task',
      description: '实现代码任务',
      governance: 'archon',
      defaultTeam: {
        architect: {
          suggested: ['opus'],
        },
      },
      stages: [
        { id: 'discuss', name: '讨论', mode: 'discuss' },
        { id: 'develop', name: '开发', mode: 'execute' },
      ],
    };

    const summary = mapTemplateSummaryDto(summaryDto);
    const detail = mapTemplateDetailDto('coding', detailDto);

    expect(summary.stageCountLabel).toBe('4 stages');
    expect(detail.id).toBe('coding');
    expect(detail.stageCount).toBe(2);
    expect(detail.defaultTeamRoles[0]).toBe('architect');
  });
});
