import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '@/stores/agentStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { useTemplateStore } from '@/stores/templateStore';
import { useTodoStore } from '@/stores/todoStore';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getAgentsStatus: vi.fn(),
  listArchiveJobs: vi.fn(),
  getArchiveJob: vi.fn(),
  retryArchiveJob: vi.fn(),
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  promoteTodo: vi.fn(),
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
}));

describe('dashboard expansion stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({
      summary: null,
      agents: [],
      craftsmen: [],
      loading: false,
      error: null,
    });
    useArchiveStore.setState({
      jobs: [],
      selectedJobId: null,
      selectedJob: null,
      loading: false,
      detailLoading: false,
      error: null,
      filters: { status: null, taskId: '' },
    });
    useTodoStore.setState({
      todos: [],
      loading: false,
      error: null,
      filter: 'all',
    });
    useTemplateStore.setState({
      templates: [],
      selectedTemplateId: null,
      selectedTemplate: null,
      loading: false,
      detailLoading: false,
      error: null,
    });
  });

  it('loads agent status into a dedicated dashboard store', async () => {
    vi.mocked(api.getAgentsStatus).mockResolvedValue({
      summary: { active_tasks: 1, active_agents: 1, total_agents: 2, busy_craftsmen: 1 },
      agents: [
        {
          id: 'sonnet',
          role: 'developer',
          status: 'busy',
          source: 'openclaw',
          primary_model: 'gac/claude-sonnet-4-6',
          workspace_dir: '/tmp/sonnet',
          active_task_ids: ['OC-101'],
          active_subtask_ids: ['dev-api'],
          load: 1,
          last_active_at: null,
        },
      ],
      craftsmen: [],
    });

    const result = await useAgentStore.getState().fetchStatus();
    const state = useAgentStore.getState();

    expect(result).toBe('live');
    expect(state.summary?.activeTasks).toBe(1);
    expect(state.summary?.totalAgents).toBe(2);
    expect(state.agents[0]?.id).toBe('sonnet');
  });

  it('loads archive list and detail while preserving split-view state', async () => {
    vi.mocked(api.listArchiveJobs).mockResolvedValue([
      {
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
      },
    ]);
    vi.mocked(api.getArchiveJob).mockResolvedValue({
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
    });

    await useArchiveStore.getState().fetchJobs();
    await useArchiveStore.getState().selectJob(7);
    const state = useArchiveStore.getState();

    expect(state.jobs).toHaveLength(1);
    expect(state.selectedJob?.id).toBe(7);
    expect(state.selectedJob?.canRetry).toBe(true);
  });

  it('supports todo CRUD and promote refreshes through the store layer', async () => {
    vi.mocked(api.listTodos).mockResolvedValue([
      {
        id: 3,
        text: '补前端',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T09:00:00.000Z',
        completed_at: null,
        tags: [],
        promoted_to: null,
      },
    ]);
    vi.mocked(api.createTodo).mockResolvedValue({
      id: 4,
      text: '补前端 v2',
      status: 'pending',
      due: null,
      created_at: '2026-03-07T10:00:00.000Z',
      completed_at: null,
      tags: [],
      promoted_to: null,
    });
    vi.mocked(api.promoteTodo).mockResolvedValue({
      todo: {
        id: 4,
        text: '补前端 v2',
        status: 'pending',
        due: null,
        created_at: '2026-03-07T10:00:00.000Z',
        completed_at: null,
        tags: [],
        promoted_to: 'OC-401',
      },
      task: {
        id: 'OC-401',
      },
    } as never);

    await useTodoStore.getState().fetchTodos();
    await useTodoStore.getState().createTodo({ text: '补前端 v2' });
    const promoted = await useTodoStore.getState().promoteTodo(4, {
      type: 'quick',
      creator: 'archon',
      priority: 'high',
    });

    expect(useTodoStore.getState().todos[0]?.id).toBe(4);
    expect(promoted.task.id).toBe('OC-401');
  });

  it('loads template summaries first and then full template detail', async () => {
    vi.mocked(api.listTemplates).mockResolvedValue([
      {
        id: 'coding',
        name: 'Coding Task',
        type: 'coding',
        description: '实现代码任务',
        governance: 'archon',
        stage_count: 4,
      },
    ]);
    vi.mocked(api.getTemplate).mockResolvedValue({
      type: 'coding',
      name: 'Coding Task',
      description: '实现代码任务',
      governance: 'archon',
      defaultTeam: {
        architect: {
          suggested: ['opus'],
        },
      },
      stages: [{ id: 'develop', name: '开发', mode: 'execute' }],
    });

    await useTemplateStore.getState().fetchTemplates();
    await useTemplateStore.getState().selectTemplate('coding');
    const state = useTemplateStore.getState();

    expect(state.templates[0]?.id).toBe('coding');
    expect(state.selectedTemplate?.stageCount).toBe(1);
  });
});
