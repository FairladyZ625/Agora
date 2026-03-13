export const TaskState = {
  DRAFT: 'draft',
  CREATED: 'created',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  PAUSED: 'paused',
  DONE: 'done',
  CANCELLED: 'cancelled',
  ORPHANED: 'orphaned',
} as const;

export type TaskState = (typeof TaskState)[keyof typeof TaskState];

export const GateType = {
  ARCHON_REVIEW: 'archon_review',
  COMMAND: 'command',
  ALL_SUBTASKS_DONE: 'all_subtasks_done',
  APPROVAL: 'approval',
  AUTO_TIMEOUT: 'auto_timeout',
  QUORUM: 'quorum',
} as const;

export type GateType = (typeof GateType)[keyof typeof GateType];

export const SubtaskState = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  WAITING_INPUT: 'waiting_input',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
} as const;

export type SubtaskState = (typeof SubtaskState)[keyof typeof SubtaskState];

export const CollaborationMode = {
  DISCUSS: 'discuss',
  INDEPENDENT_EXECUTE: 'execute',
} as const;

export type CollaborationMode = (typeof CollaborationMode)[keyof typeof CollaborationMode];

export const AgentRole = {
  ARCHITECT: 'architect',
  DEVELOPER: 'developer',
  REVIEWER: 'reviewer',
  WRITER: 'writer',
  RESEARCHER: 'researcher',
  ANALYST: 'analyst',
  EXECUTOR: 'executor',
  CRAFTSMAN: 'craftsman',
} as const;

export type AgentRole = (typeof AgentRole)[keyof typeof AgentRole];

export const DispatchStatus = {
  QUEUED: 'queued',
  SUCCESS: 'success',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  GATEWAY_OFFLINE: 'gateway_offline',
  ERROR: 'error',
} as const;

export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];

export const EscalationLevel = {
  NONE: 0,
  RETRY: 1,
  NOTIFY: 2,
  ROLLBACK: 3,
  HUMAN: 4,
} as const;

export type EscalationLevel = (typeof EscalationLevel)[keyof typeof EscalationLevel];

export const ActivityKind = {
  FLOW: 'flow',
  PROGRESS: 'progress',
  TODOS: 'todos',
  ASSISTANT: 'assistant',
  TOOL_RESULT: 'tool_result',
  USER: 'user',
  SYSTEM: 'system',
  ARCHON: 'archon',
} as const;

export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

export const GovernancePreset = {
  LEAN: 'lean',
  STANDARD: 'standard',
  STRICT: 'strict',
  CUSTOM: 'custom',
} as const;

export type GovernancePreset = (typeof GovernancePreset)[keyof typeof GovernancePreset];

export const CraftsmanType = {
  CLAUDE_CODE: 'claude_code',
  CODEX: 'codex',
  GEMINI_CLI: 'gemini_cli',
  CUSTOM: 'custom',
} as const;

export type CraftsmanType = (typeof CraftsmanType)[keyof typeof CraftsmanType];

export const TaskType = {
  CODING: 'coding',
  CODING_HEAVY: 'coding_heavy',
  RESEARCH: 'research',
  DOCUMENT: 'document',
  QUICK: 'quick',
  BRAINSTORM: 'brainstorm',
  CUSTOM: 'custom',
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const TaskPriority = {
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];
