import type { GateQueryPort } from '@agora-ts/contracts';
import { GateType, TaskState } from './enums.js';
import { orderedRuntimeGraphStageIds } from './template-graph-service.js';

type WorkflowStage = {
  id: string;
  next?: string[] | undefined;
  reject_target?: string | undefined;
  gate?: {
    type?: string | undefined;
    [key: string]: unknown;
  } | null | undefined;
};

type WorkflowTerminal = {
  outcome: string;
  summary?: string | undefined;
};

type WorkflowGraphNode = {
  id: string;
  kind?: 'stage' | 'terminal' | undefined;
  terminal?: WorkflowTerminal | undefined;
};

type AdvanceKind = 'advance' | 'timeout';

type WorkflowDefinition = {
  stages?: WorkflowStage[] | undefined;
  graph?: {
    graph_version?: number;
    entry_nodes: string[];
    nodes: WorkflowGraphNode[];
    edges: Array<{ from: string; to: string; kind: string }>;
  } | undefined;
};

type TaskShape = {
  id: string;
  workflow: WorkflowDefinition;
};

export class StateMachine {
  private readonly validTransitions: Record<TaskState, TaskState[]> = {
    [TaskState.DRAFT]: [TaskState.CREATED, TaskState.ORPHANED],
    [TaskState.CREATED]: [TaskState.ACTIVE],
    [TaskState.ACTIVE]: [TaskState.ACTIVE, TaskState.BLOCKED, TaskState.PAUSED, TaskState.DONE, TaskState.CANCELLED],
    [TaskState.BLOCKED]: [TaskState.ACTIVE, TaskState.CANCELLED],
    [TaskState.PAUSED]: [TaskState.ACTIVE, TaskState.CANCELLED],
    [TaskState.DONE]: [],
    [TaskState.CANCELLED]: [],
    [TaskState.ORPHANED]: [],
  };

  validateTransition(fromState: TaskState, toState: TaskState): boolean {
    return this.validTransitions[fromState].includes(toState);
  }

  getCurrentStage(workflow: WorkflowDefinition, currentStageId: string): WorkflowStage {
    const stage = (workflow.stages ?? []).find((item) => item.id === currentStageId);
    if (!stage) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    return stage;
  }

  getNextStage(workflow: WorkflowDefinition, currentStageId: string, nextStageId?: string): WorkflowStage | null {
    return this.resolveAdvance(workflow, currentStageId, nextStageId).nextStage;
  }

  private resolveAdvance(
    workflow: WorkflowDefinition,
    currentStageId: string,
    nextStageId?: string,
    advanceKind: AdvanceKind = 'advance',
  ): {
    nextStage: WorkflowStage | null;
    terminalNode: WorkflowGraphNode | null;
  } {
    const stages = workflow.stages ?? [];
    const currentIndex = stages.findIndex((item) => item.id === currentStageId);
    if (currentIndex === -1) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    const graphCompleteTarget = resolveGraphNextNode(workflow, currentStageId, 'complete');
    if (graphCompleteTarget) {
      return {
        nextStage: null,
        terminalNode: graphCompleteTarget,
      };
    }
    const branchTargets = resolveGraphBranchTargets(workflow, currentStageId);
    if (branchTargets.length > 0) {
      if (!nextStageId) {
        throw new Error(`Stage '${currentStageId}' branches and requires next_stage_id`);
      }
      if (!branchTargets.includes(nextStageId)) {
        throw new Error(`next_stage_id '${nextStageId}' does not match a branch target for stage '${currentStageId}'`);
      }
      return {
        nextStage: stages.find((item) => item.id === nextStageId) ?? null,
        terminalNode: null,
      };
    }
    if (advanceKind === 'timeout') {
      const timeoutTarget = resolveGraphNextNode(workflow, currentStageId, 'timeout');
      if (timeoutTarget) {
        if ((timeoutTarget.kind ?? 'stage') === 'terminal') {
          return {
            nextStage: null,
            terminalNode: timeoutTarget,
          };
        }
        return {
          nextStage: stages.find((item) => item.id === timeoutTarget.id) ?? null,
          terminalNode: null,
        };
      }
    }
    const graphNextId = resolveGraphNextNode(workflow, currentStageId, 'advance')?.id;
    if (graphNextId) {
      return {
        nextStage: stages.find((item) => item.id === graphNextId) ?? null,
        terminalNode: null,
      };
    }
    const current = stages[currentIndex]!;
    if (current.next && current.next.length > 0) {
      return {
        nextStage: stages.find((item) => item.id === current.next?.[0]) ?? null,
        terminalNode: null,
      };
    }
    return {
      nextStage: stages[currentIndex + 1] ?? null,
      terminalNode: null,
    };
  }

  getRejectStage(workflow: WorkflowDefinition, currentStageId: string): WorkflowStage | null {
    const stages = workflow.stages ?? [];
    const currentIndex = stages.findIndex((item) => item.id === currentStageId);
    if (currentIndex === -1) {
      throw new Error(`Stage '${currentStageId}' not found in workflow`);
    }
    const graphRejectId = resolveGraphNextNode(workflow, currentStageId, 'reject')?.id;
    if (graphRejectId) {
      assertGraphRejectRewindsToEarlierStage(workflow, currentStageId, graphRejectId);
      return stages.find((item) => item.id === graphRejectId) ?? null;
    }
    const current = stages[currentIndex]!;
    const rejectTarget = current.reject_target;
    if (!rejectTarget) {
      return null;
    }
    const targetIndex = stages.findIndex((item) => item.id === rejectTarget);
    if (targetIndex === -1) {
      throw new Error(`reject_target '${rejectTarget}' not found in workflow`);
    }
    if (targetIndex >= currentIndex) {
      throw new Error(`reject_target '${rejectTarget}' for stage '${currentStageId}' must reference an earlier stage`);
    }
    return stages[targetIndex] ?? null;
  }

  advance(workflow: WorkflowDefinition, currentStageId: string, nextStageId?: string, advanceKind: AdvanceKind = 'advance'): {
    currentStage: WorkflowStage;
    nextStage: WorkflowStage | null;
    completesTask: boolean;
    terminalNode: WorkflowGraphNode | null;
  } {
    const currentStage = this.getCurrentStage(workflow, currentStageId);
    const resolved = this.resolveAdvance(workflow, currentStageId, nextStageId, advanceKind);
    return {
      currentStage,
      nextStage: resolved.nextStage,
      completesTask: resolved.nextStage === null,
      terminalNode: resolved.terminalNode,
    };
  }

  checkGate(gateQuery: GateQueryPort, task: TaskShape, stage: WorkflowStage, callerId?: string, now = new Date().toISOString()): boolean {
    const gateType = stage.gate?.type ?? GateType.COMMAND;

    if (gateType === GateType.COMMAND) {
      return typeof callerId === 'string' && callerId.length > 0;
    }

    if (gateType === GateType.ARCHON_REVIEW) {
      const row = gateQuery.getLatestArchonReview(task.id, stage.id);
      return row?.decision === 'approved';
    }

    if (gateType === GateType.ALL_SUBTASKS_DONE) {
      const rows = gateQuery.getSubtaskStatuses(task.id, stage.id);
      if (rows.length === 0) {
        return true;
      }
      return rows.every((row) => ['done', 'cancelled', 'archived'].includes(row.status));
    }

    if (gateType === GateType.APPROVAL) {
      return gateQuery.hasApproval(task.id, stage.id);
    }

    if (gateType === GateType.QUORUM) {
      const required = Number(stage.gate?.required ?? 1);
      if (!Number.isFinite(required) || required <= 0) {
        return false;
      }
      return gateQuery.getQuorumApproveCount(task.id, stage.id) >= required;
    }

    if (gateType === GateType.AUTO_TIMEOUT) {
      const enteredAt = gateQuery.getStageEntryTime(task.id, stage.id);
      if (!enteredAt) {
        return false;
      }
      const elapsedMs = Date.parse(now) - Date.parse(enteredAt);
      const timeoutSeconds = Number(stage.gate?.timeout_sec ?? 0);
      if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
        return elapsedMs >= timeoutSeconds * 1000;
      }
      const timeoutMinutes = Number(stage.gate?.timeout_minutes ?? stage.gate?.timeoutMinutes ?? 0);
      if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
        return false;
      }
      return elapsedMs >= timeoutMinutes * 60_000;
    }

    return false;
  }
}

function resolveGraphNextNode(
  workflow: WorkflowDefinition,
  currentStageId: string,
  kind: 'advance' | 'reject' | 'complete' | 'timeout',
) {
  const graph = workflow.graph;
  if (!graph) {
    return null;
  }
  const edge = graph.edges.find((candidate) => candidate.from === currentStageId && candidate.kind === kind);
  if (!edge) {
    return null;
  }
  return graph.nodes.find((node) => node.id === edge.to) ?? null;
}

function resolveGraphBranchTargets(workflow: WorkflowDefinition, currentStageId: string) {
  const graph = workflow.graph;
  if (!graph) {
    return [];
  }
  return graph.edges
    .filter((candidate) => candidate.from === currentStageId && candidate.kind === 'branch')
    .map((edge) => edge.to);
}

function assertGraphRejectRewindsToEarlierStage(
  workflow: WorkflowDefinition,
  currentStageId: string,
  targetStageId: string,
) {
  const graph = workflow.graph;
  if (!graph) {
    return;
  }
  const orderedIds = orderedRuntimeGraphStageIds(graph);
  const currentIndex = orderedIds.indexOf(currentStageId);
  const targetIndex = orderedIds.indexOf(targetStageId);
  if (currentIndex === -1 || targetIndex === -1) {
    return;
  }
  if (targetIndex >= currentIndex) {
    throw new Error(`graph reject target '${targetStageId}' for stage '${currentStageId}' must reference an earlier stage`);
  }
}
