import { z } from 'zod';

type GateLike = {
  type?: string | undefined;
  approver?: string | undefined;
  approver_role?: string | undefined;
  required?: number | undefined;
  timeout_sec?: number | undefined;
} | null | undefined;

type StageLike = {
  id?: string | undefined;
  gate?: GateLike;
  reject_target?: string | undefined;
};

function addIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

export function validateWorkflowStages(
  stages: StageLike[] | undefined,
  ctx: z.RefinementCtx,
  stagePath: Array<string | number> = ['stages'],
) {
  if (!stages || stages.length === 0) {
    return;
  }

  const seen = new Set<string>();
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const stageId = stage?.id?.trim();
    if (stageId) {
      if (seen.has(stageId)) {
        addIssue(ctx, [...stagePath, index, 'id'], `duplicate stage id: ${stageId}`);
      } else {
        seen.add(stageId);
      }
    }

    validateGate(stage?.gate, ctx, [...stagePath, index, 'gate']);

    const rejectTarget = stage?.reject_target?.trim();
    if (!rejectTarget) {
      continue;
    }
    if (!stageId) {
      continue;
    }
    const targetIndex = stages.findIndex((candidate) => candidate?.id?.trim() === rejectTarget);
    if (targetIndex === -1) {
      addIssue(ctx, [...stagePath, index, 'reject_target'], `unknown reject_target: ${rejectTarget}`);
      continue;
    }
    if (targetIndex >= index) {
      addIssue(ctx, [...stagePath, index, 'reject_target'], 'reject_target must reference an earlier stage');
    }
  }
}

function validateGate(
  gate: GateLike,
  ctx: z.RefinementCtx,
  gatePath: Array<string | number>,
) {
  const gateType = gate?.type ?? 'command';
  const hasApprover = Boolean(gate?.approver) || Boolean(gate?.approver_role);
  const hasRequired = typeof gate?.required === 'number';
  const hasTimeout = typeof gate?.timeout_sec === 'number';

  if (gateType === 'approval') {
    if (!hasApprover) {
      addIssue(ctx, [...gatePath, 'approver'], 'approval gate must declare approver or approver_role');
    }
    if (hasRequired) {
      addIssue(ctx, [...gatePath, 'required'], 'approval gate must not declare required');
    }
    if (hasTimeout) {
      addIssue(ctx, [...gatePath, 'timeout_sec'], 'approval gate must not declare timeout_sec');
    }
    return;
  }

  if (gateType === 'quorum') {
    if (!hasRequired || (gate?.required ?? 0) < 2) {
      addIssue(ctx, [...gatePath, 'required'], 'quorum gate must declare required >= 2');
    }
    if (hasApprover) {
      addIssue(ctx, [...gatePath, 'approver'], 'quorum gate must not declare approver or approver_role');
    }
    if (hasTimeout) {
      addIssue(ctx, [...gatePath, 'timeout_sec'], 'quorum gate must not declare timeout_sec');
    }
    return;
  }

  if (gateType === 'auto_timeout') {
    if (!hasTimeout) {
      addIssue(ctx, [...gatePath, 'timeout_sec'], 'auto_timeout gate must declare timeout_sec');
    }
    if (hasApprover) {
      addIssue(ctx, [...gatePath, 'approver'], 'auto_timeout gate must not declare approver or approver_role');
    }
    if (hasRequired) {
      addIssue(ctx, [...gatePath, 'required'], 'auto_timeout gate must not declare required');
    }
    return;
  }

  if (hasApprover) {
    addIssue(ctx, [...gatePath, 'approver'], `${gateType} gate must not declare approver or approver_role`);
  }
  if (hasRequired) {
    addIssue(ctx, [...gatePath, 'required'], `${gateType} gate must not declare required`);
  }
  if (hasTimeout) {
    addIssue(ctx, [...gatePath, 'timeout_sec'], `${gateType} gate must not declare timeout_sec`);
  }
}
