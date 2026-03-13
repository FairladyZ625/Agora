import { describe, expect, it } from 'vitest';
import {
  ActivityKind,
  AgentRole,
  CollaborationMode,
  CraftsmanType,
  DispatchStatus,
  EscalationLevel,
  GateType,
  GovernancePreset,
  SubtaskState,
  TaskPriority,
  TaskState,
  TaskType,
} from './enums.js';

describe('canonical enums', () => {
  it('matches the TS migration canonical values', () => {
    expect(TaskState.ORPHANED).toBe('orphaned');
    expect(SubtaskState.WAITING_INPUT).toBe('waiting_input');
    expect(CollaborationMode.INDEPENDENT_EXECUTE).toBe('execute');
    expect(GateType.QUORUM).toBe('quorum');
    expect(AgentRole.CRAFTSMAN).toBe('craftsman');
    expect(DispatchStatus.GATEWAY_OFFLINE).toBe('gateway_offline');
    expect(EscalationLevel.HUMAN).toBe(4);
    expect(ActivityKind.ARCHON).toBe('archon');
    expect(GovernancePreset.STRICT).toBe('strict');
    expect(CraftsmanType.GEMINI_CLI).toBe('gemini_cli');
    expect(TaskType.CODING_HEAVY).toBe('coding_heavy');
    expect(TaskPriority.HIGH).toBe('high');
  });
});
