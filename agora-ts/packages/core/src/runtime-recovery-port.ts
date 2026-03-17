import type { RuntimeDiagnosisResultDto, RuntimeRecoveryActionDto } from '@agora-ts/contracts';

export interface RuntimeRecoveryPort {
  restartCitizenRuntime(input: {
    taskId: string;
    agentRef: string;
    runtimeProvider: string | null;
    runtimeActorRef: string | null;
    reason?: string | null;
  }): RuntimeRecoveryActionDto;
  requestRuntimeDiagnosis(input: {
    taskId: string;
    agentRef: string;
    runtimeProvider: string | null;
    runtimeActorRef: string | null;
    reason?: string | null;
  }): RuntimeDiagnosisResultDto;
  stopExecution(input: {
    taskId: string;
    subtaskId: string;
    executionId: string;
    adapter: string;
    sessionId: string | null;
    workdir: string | null;
    reason?: string | null;
  }): RuntimeRecoveryActionDto;
}
