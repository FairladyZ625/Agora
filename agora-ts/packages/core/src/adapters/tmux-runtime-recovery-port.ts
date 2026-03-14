import type { RuntimeDiagnosisResultDto, RuntimeRecoveryActionDto } from '@agora-ts/contracts';
import type { RuntimeRecoveryPort } from '../runtime-recovery-port.js';
import type { TmuxRuntimeService } from '../tmux-runtime-service.js';

const TMUX_AGENTS = new Set(['codex', 'claude', 'gemini']);

export class TmuxRuntimeRecoveryPort implements RuntimeRecoveryPort {
  constructor(private readonly runtime: Pick<TmuxRuntimeService, 'doctor' | 'tail' | 'sendKeys'>) {}

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
      detail: input.runtimeProvider
        ? `Current runtime provider ${input.runtimeProvider} does not expose a restart seam yet.`
        : 'No runtime provider is bound to this agent.',
    };
  }

  requestRuntimeDiagnosis(input: {
    taskId: string;
    agentRef: string;
    runtimeProvider: string | null;
    runtimeActorRef: string | null;
    reason?: string | null;
  }): RuntimeDiagnosisResultDto {
    const actor = input.runtimeActorRef ?? input.agentRef;
    if (!TMUX_AGENTS.has(actor)) {
      return {
        operation: 'request_runtime_diagnosis',
        task_id: input.taskId,
        agent_ref: input.agentRef,
        status: input.runtimeProvider ? 'unsupported' : 'unavailable',
        health: 'unavailable',
        runtime_provider: input.runtimeProvider,
        runtime_actor_ref: input.runtimeActorRef,
        summary: `Runtime diagnosis is unavailable for ${input.agentRef}.`,
        detail: input.runtimeProvider
          ? `Provider ${input.runtimeProvider} has no diagnosis adapter yet.`
          : 'No runtime provider is bound to this agent.',
      };
    }

    const pane = this.runtime.doctor().panes.find((item) => item.agent === actor);
    if (!pane) {
      return {
        operation: 'request_runtime_diagnosis',
        task_id: input.taskId,
        agent_ref: input.agentRef,
        status: 'unavailable',
        health: 'unavailable',
        runtime_provider: input.runtimeProvider,
        runtime_actor_ref: actor,
        summary: `No tmux pane was found for ${actor}.`,
        detail: null,
      };
    }

    const tail = pane.pane ? this.runtime.tail(actor, 40).trim() : '';
    const health = !pane.ready ? 'degraded' : 'healthy';
    return {
      operation: 'request_runtime_diagnosis',
      task_id: input.taskId,
      agent_ref: input.agentRef,
      status: 'accepted',
      health,
      runtime_provider: input.runtimeProvider,
      runtime_actor_ref: actor,
      summary: pane.ready ? `${actor} pane is ready.` : `${actor} pane is present but not ready.`,
      detail: tail || null,
    };
  }

  stopExecution(input: {
    taskId: string;
    subtaskId: string;
    executionId: string;
    adapter: string;
    sessionId: string | null;
    reason?: string | null;
  }): RuntimeRecoveryActionDto {
    if (!TMUX_AGENTS.has(input.adapter) || (input.sessionId && !input.sessionId.startsWith('tmux:'))) {
      return {
        operation: 'stop_execution',
        status: 'unsupported',
        task_id: input.taskId,
        agent_ref: input.adapter,
        execution_id: input.executionId,
        summary: `Execution ${input.executionId} cannot be stopped by the tmux recovery port.`,
        detail: 'Only tmux-backed codex/claude/gemini executions are currently supported.',
      };
    }

    this.runtime.sendKeys(input.adapter, ['C-c']);
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
