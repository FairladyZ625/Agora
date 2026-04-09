import type { RuntimeDiagnosisResultDto, RuntimeRecoveryActionDto } from '@agora-ts/contracts';
import type { RuntimeRecoveryPort } from '../runtime-recovery-port.js';
import type { AcpRuntimePort } from '../acp-runtime-port.js';
import { parseAcpSessionId } from '../acp-session-ref.js';

const ACP_AGENTS = new Set(['codex', 'claude', 'gemini']);

export class AcpRuntimeRecoveryPort implements RuntimeRecoveryPort {
  constructor(private readonly runtime: AcpRuntimePort) {}

  restartCitizenRuntime(input: {
    taskId: string;
    agentRef: string;
    runtimeProvider: string | null;
    runtimeActorRef: string | null;
    reason?: string | null;
  }): RuntimeRecoveryActionDto {
    return {
      operation: 'restart_citizen_runtime',
      status: 'unsupported',
      task_id: input.taskId,
      agent_ref: input.agentRef,
      execution_id: null,
      summary: `Runtime restart is not implemented for ${input.agentRef}.`,
      detail: 'ACPX cutover in this phase only supports craftsman execution stop, not citizen runtime restart.',
    };
  }

  requestRuntimeDiagnosis(input: {
    taskId: string;
    agentRef: string;
    runtimeProvider: string | null;
    runtimeActorRef: string | null;
    reason?: string | null;
  }): RuntimeDiagnosisResultDto {
    return {
      operation: 'request_runtime_diagnosis',
      task_id: input.taskId,
      agent_ref: input.agentRef,
      status: 'unsupported',
      health: 'unavailable',
      runtime_provider: input.runtimeProvider,
      runtime_actor_ref: input.runtimeActorRef,
      summary: `Runtime diagnosis is unavailable for ${input.agentRef}.`,
      detail: 'ACPX phase 1 does not expose citizen-runtime diagnosis through the craftsman recovery port.',
    };
  }

  stopExecution(input: {
    taskId: string;
    subtaskId: string;
    executionId: string;
    adapter: string;
    sessionId: string | null;
    workdir: string | null;
    reason?: string | null;
  }): RuntimeRecoveryActionDto {
    if (!ACP_AGENTS.has(input.adapter)) {
      return {
        operation: 'stop_execution',
        status: 'unsupported',
        task_id: input.taskId,
        agent_ref: input.adapter,
        execution_id: input.executionId,
        summary: `Execution ${input.executionId} cannot be stopped by the acp recovery port.`,
        detail: `Unsupported adapter: ${input.adapter}`,
      };
    }
    const sessionName = parseAcpSessionId(input.sessionId);
    if (!sessionName) {
      return {
        operation: 'stop_execution',
        status: 'unsupported',
        task_id: input.taskId,
        agent_ref: input.adapter,
        execution_id: input.executionId,
        summary: `Execution ${input.executionId} cannot be stopped by the acp recovery port.`,
        detail: 'The execution has no ACPX session binding.',
      };
    }
    this.runtime.stopExecution({
      agent: input.adapter as 'codex' | 'claude' | 'gemini',
      cwd: input.workdir ?? process.cwd(),
      sessionName,
    });
    return {
      operation: 'stop_execution',
      status: 'accepted',
      task_id: input.taskId,
      agent_ref: input.adapter,
      execution_id: input.executionId,
      summary: `Stop signal sent to execution ${input.executionId}.`,
      detail: input.reason ?? null,
    };
  }
}
