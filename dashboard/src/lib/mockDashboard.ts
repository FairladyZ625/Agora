import type { Task, TaskPriority, TaskState, TaskStatus } from '@/types/task';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const MOCK_TASKS: Task[] = [
  {
    id: 'TSK-001',
    version: 3,
    title: '实现 Agent 权限分级验证',
    description: '补齐多级权限门控并验证 human override 路径。',
    type: 'governance',
    priority: 'high',
    creator: 'archon',
    state: 'in_progress',
    current_stage: 'policy-guard',
    teamLabel: 'core',
    workflowLabel: 'debate-review-execute',
    memberCount: 3,
    isReviewStage: false,
    sourceState: 'active',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"tokens": 4221}',
    error_detail: null,
    created_at: hoursAgo(6),
    updated_at: minutesAgo(2),
  },
  {
    id: 'TSK-002',
    version: 5,
    title: '任务编排器状态机重构',
    description: '把轮询式执行改为事件驱动状态机，并保留人工裁决节点。',
    type: 'architecture',
    priority: 'critical',
    creator: 'lizeyu',
    state: 'gate_waiting',
    current_stage: 'archon-review',
    teamLabel: 'core',
    workflowLabel: 'review-first',
    memberCount: 2,
    isReviewStage: true,
    sourceState: 'active',
    scheduler: 'sequential',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"blocked_agents": 2}',
    error_detail: null,
    created_at: hoursAgo(10),
    updated_at: minutesAgo(8),
  },
  {
    id: 'TSK-003',
    version: 2,
    title: '结构化日志脱敏过滤器',
    description: '增加 secrets scrubber，避免调试日志暴露 token。',
    type: 'security',
    priority: 'normal',
    creator: 'craftsman-1',
    state: 'completed',
    current_stage: 'done',
    teamLabel: 'platform',
    workflowLabel: 'execute-only',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'done',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"latency_ms": 48}',
    error_detail: null,
    created_at: daysAgo(1),
    updated_at: hoursAgo(1),
  },
  {
    id: 'TSK-004',
    version: 1,
    title: 'OpenClaw 插件 Bridge 测试',
    description: '验证 bridge 握手、任务转发和失败回退。',
    type: 'integration',
    priority: 'low',
    creator: 'archon',
    state: 'completed',
    current_stage: 'done',
    teamLabel: 'integrations',
    workflowLabel: 'integration-check',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'done',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"success_rate": 1}',
    error_detail: null,
    created_at: daysAgo(1),
    updated_at: hoursAgo(3),
  },
  {
    id: 'TSK-005',
    version: 2,
    title: '数据库 WAL 模式性能调优',
    description: '压测并调整 WAL、checkpoint、读写锁退避。',
    type: 'performance',
    priority: 'high',
    creator: 'lizeyu',
    state: 'in_progress',
    current_stage: 'benchmarks',
    teamLabel: 'core',
    workflowLabel: 'measure-adjust-verify',
    memberCount: 3,
    isReviewStage: false,
    sourceState: 'active',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"throughput": 1300}',
    error_detail: null,
    created_at: daysAgo(2),
    updated_at: hoursAgo(5),
  },
  {
    id: 'TSK-006',
    version: 4,
    title: 'CI/CD Pipeline 双 Job 配置',
    description: '拆分 lint/build 与 integration smoke job，缩短首轮反馈时间。',
    type: 'ops',
    priority: 'normal',
    creator: 'archon',
    state: 'completed',
    current_stage: 'done',
    teamLabel: 'operations',
    workflowLabel: 'ship',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'done',
    scheduler: 'sequential',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"build_minutes": 7}',
    error_detail: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(1),
  },
  {
    id: 'TSK-007',
    version: 1,
    title: 'Craftsmen Shell Adapter 封装',
    description: '抽象命令执行协议，统一 stdout/stderr 采集。',
    type: 'adapter',
    priority: 'normal',
    creator: 'lizeyu',
    state: 'pending',
    current_stage: 'backlog',
    teamLabel: 'adapters',
    workflowLabel: 'ready-to-dispatch',
    memberCount: 2,
    isReviewStage: false,
    sourceState: 'created',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: null,
    error_detail: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(1),
  },
  {
    id: 'TSK-008',
    version: 2,
    title: 'FastAPI 路由重构与中间件',
    description: '重新组织 dashboard API 路由并加入统一鉴权与 trace id。',
    type: 'backend',
    priority: 'high',
    creator: 'archon',
    state: 'in_progress',
    current_stage: 'middleware-rollout',
    teamLabel: 'server',
    workflowLabel: 'plan-implement-review',
    memberCount: 3,
    isReviewStage: false,
    sourceState: 'active',
    scheduler: 'parallel',
    scheduler_snapshot: null,
    discord: null,
    metrics: '{"routes": 12}',
    error_detail: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
  },
];

export const MOCK_TASK_STATUS: Record<string, TaskStatus> = {
  'TSK-001': {
    task: MOCK_TASKS[0],
    flow_log: [
      {
        id: 1,
        task_id: 'TSK-001',
        kind: 'state',
        event: 'created',
        stage_id: 'proposal',
        from_state: 'draft',
        to_state: 'pending',
        detail: '任务由 archon 发起并进入编排队列。',
        actor: 'archon',
        created_at: hoursAgo(5),
      },
      {
        id: 2,
        task_id: 'TSK-001',
        kind: 'state',
        event: 'dispatch',
        stage_id: 'policy-guard',
        from_state: 'pending',
        to_state: 'in_progress',
        detail: '已派发给 craftsmen 团队执行权限分级实现。',
        actor: 'scheduler',
        created_at: hoursAgo(2),
      },
    ],
    progress_log: [
      {
        id: 1,
        task_id: 'TSK-001',
        kind: 'note',
        stage_id: 'policy-guard',
        subtask_id: null,
        content: '权限矩阵初版已经落地，待补 CLI override 验证。',
        artifacts: null,
        actor: 'craftsman-2',
        created_at: minutesAgo(12),
      },
    ],
    subtasks: [
      {
        id: 'SUB-001',
        task_id: 'TSK-001',
        stage_id: 'policy-guard',
        title: '实现角色矩阵校验',
        assignee: 'craftsman-2',
        status: 'done',
        output: null,
        craftsman_type: 'backend',
        dispatch_status: 'completed',
        dispatched_at: hoursAgo(3),
        done_at: hoursAgo(1),
      },
      {
        id: 'SUB-002',
        task_id: 'TSK-001',
        stage_id: 'policy-guard',
        title: '补齐 override 审计日志',
        assignee: 'craftsman-3',
        status: 'running',
        output: null,
        craftsman_type: 'backend',
        dispatch_status: 'running',
        dispatched_at: hoursAgo(1),
        done_at: null,
      },
    ],
  },
  'TSK-002': {
    task: MOCK_TASKS[1],
    flow_log: [
      {
        id: 3,
        task_id: 'TSK-002',
        kind: 'state',
        event: 'proposal-approved',
        stage_id: 'design',
        from_state: 'pending',
        to_state: 'in_progress',
        detail: '状态机方案已完成并进入审查前的收敛阶段。',
        actor: 'archon',
        created_at: hoursAgo(3),
      },
      {
        id: 4,
        task_id: 'TSK-002',
        kind: 'state',
        event: 'gate-entered',
        stage_id: 'archon-review',
        from_state: 'in_progress',
        to_state: 'gate_waiting',
        detail: '本次重构影响核心调度器，需要 human-in-the-loop 审批。',
        actor: 'gate_keeper',
        created_at: minutesAgo(8),
      },
    ],
    progress_log: [
      {
        id: 2,
        task_id: 'TSK-002',
        kind: 'note',
        stage_id: 'archon-review',
        subtask_id: null,
        content: '当前版本解决了重复调度问题，但还需要确认回滚策略。',
        artifacts: null,
        actor: 'lizeyu',
        created_at: minutesAgo(16),
      },
    ],
    subtasks: [
      {
        id: 'SUB-003',
        task_id: 'TSK-002',
        stage_id: 'archon-review',
        title: '梳理状态迁移表',
        assignee: 'lizeyu',
        status: 'done',
        output: null,
        craftsman_type: 'architecture',
        dispatch_status: 'completed',
        dispatched_at: hoursAgo(4),
        done_at: hoursAgo(2),
      },
    ],
  },
};

export interface ReviewDecision {
  id: string;
  title: string;
  creator: string;
  gate: string;
  waitTime: string;
  summary: string;
  priority: TaskPriority;
  impact: string;
  state: TaskState;
}

export const MOCK_REVIEW_QUEUE: ReviewDecision[] = [
  {
    id: 'TSK-002',
    title: '任务编排器状态机重构',
    creator: 'lizeyu',
    gate: 'archon_review',
    waitTime: '8 分钟',
    summary: '把轮询驱动切换到事件状态机，需要人类确认失败回滚策略。',
    priority: 'critical',
    impact: '阻塞 2 个后续执行任务',
    state: 'gate_waiting',
  },
  {
    id: 'TSK-009',
    title: 'Agent 通信协议 v2 设计',
    creator: 'craftsman-2',
    gate: 'archon_review',
    waitTime: '25 分钟',
    summary: '新增消息确认机制、优先级队列和 retry envelope。',
    priority: 'high',
    impact: '影响插件桥和远程 craftsman 兼容性',
    state: 'gate_waiting',
  },
];

export function createMockTasks(): Task[] {
  return structuredClone(MOCK_TASKS);
}

export function getMockTaskStatus(taskId: string): TaskStatus | null {
  const status = MOCK_TASK_STATUS[taskId];
  return status ? structuredClone(status) : null;
}

export function formatRelativeTimestamp(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
