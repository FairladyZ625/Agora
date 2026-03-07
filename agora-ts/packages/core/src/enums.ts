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
