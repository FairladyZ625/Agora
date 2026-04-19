import { randomUUID } from 'node:crypto';
import type {
  IParticipantBindingRepository,
  IRuntimeSessionBindingRepository,
  ITaskContextBindingRepository,
  LiveSessionDto,
  ParticipantBindingRecord,
  RuntimeSessionBindingRecord,
  TeamDto,
} from '@agora-ts/contracts';
import type { AgentRuntimePort } from './runtime-ports.js';
import { isInteractiveParticipant } from './team-member-kind.js';

export interface TaskParticipationServiceOptions {
  participantRepository: IParticipantBindingRepository;
  runtimeSessionRepository: IRuntimeSessionBindingRepository;
  taskBindingRepository: ITaskContextBindingRepository;
  participantIdGenerator?: () => string;
  runtimeSessionIdGenerator?: () => string;
  agentRuntimePort?: AgentRuntimePort;
}

export interface ParticipantExposureStateInput {
  agent_ref: string;
  desired_exposure: 'in_thread' | 'hidden';
  exposure_reason: string;
}

export interface BindRuntimeSessionInput {
  participant_binding_id: string;
  runtime_provider: string;
  runtime_session_ref: string;
  runtime_actor_ref: string | null;
  continuity_ref?: string | null;
  presence_state: 'active' | 'idle' | 'closed';
  binding_reason: string;
  desired_runtime_presence?: 'attached' | 'detached';
  reconcile_stage_id?: string | null;
  reconciled_at?: string | null;
  last_seen_at: string;
}

function desiredRuntimePresence(desiredExposure: ParticipantExposureStateInput['desired_exposure']) {
  return desiredExposure === 'in_thread' ? 'attached' : 'detached';
}

function defaultId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export class TaskParticipationService {
  private readonly participants: IParticipantBindingRepository;
  private readonly runtimeSessions: IRuntimeSessionBindingRepository;
  private readonly taskBindings: ITaskContextBindingRepository;
  private readonly participantIdGenerator: () => string;
  private readonly runtimeSessionIdGenerator: () => string;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;

  constructor(
    options: TaskParticipationServiceOptions,
  ) {
    this.participants = options.participantRepository;
    this.runtimeSessions = options.runtimeSessionRepository;
    this.taskBindings = options.taskBindingRepository;
    this.participantIdGenerator = options.participantIdGenerator ?? (() => defaultId('participant'));
    this.runtimeSessionIdGenerator = options.runtimeSessionIdGenerator ?? (() => defaultId('runtime-session'));
    this.agentRuntimePort = options.agentRuntimePort;
  }

  seedParticipants(taskId: string, team: TeamDto | null | undefined, bindingId?: string | null): ParticipantBindingRecord[] {
    const members = (team?.members ?? []).filter(isInteractiveParticipant);
    return members.map((member) => {
      const resolved = this.agentRuntimePort?.resolveAgent(member.agentId);
      return this.participants.insert({
        id: this.participantIdGenerator(),
        task_id: taskId,
        binding_id: bindingId ?? null,
        agent_ref: member.agentId,
        runtime_provider: resolved?.runtime_provider ?? null,
        task_role: member.role,
        source: 'template',
        join_status: 'pending',
      });
    });
  }

  attachContextBinding(taskId: string, bindingId: string): void {
    this.participants.attachContextBinding(taskId, bindingId);
  }

  listParticipants(taskId: string): ParticipantBindingRecord[] {
    return this.participants.listByTask(taskId);
  }

  getParticipantById(participantId: string): ParticipantBindingRecord | null {
    return this.participants.getById(participantId);
  }

  listRuntimeSessions(taskId: string): RuntimeSessionBindingRecord[] {
    return this.runtimeSessions.listByTask(taskId);
  }

  getRuntimeSessionByParticipant(participantId: string): RuntimeSessionBindingRecord | null {
    return this.runtimeSessions.getByParticipantBinding(participantId);
  }

  bindRuntimeSession(input: BindRuntimeSessionInput): RuntimeSessionBindingRecord | null {
    const participant = this.participants.getById(input.participant_binding_id);
    if (!participant) {
      return null;
    }
    return this.runtimeSessions.upsertByParticipant({
      id: this.runtimeSessionIdGenerator(),
      participant_binding_id: input.participant_binding_id,
      runtime_provider: input.runtime_provider,
      runtime_session_ref: input.runtime_session_ref,
      runtime_actor_ref: input.runtime_actor_ref,
      continuity_ref: input.continuity_ref ?? null,
      presence_state: input.presence_state,
      binding_reason: input.binding_reason,
      desired_runtime_presence: input.desired_runtime_presence
        ?? desiredRuntimePresence(participant.desired_exposure as 'in_thread' | 'hidden'),
      reconcile_stage_id: input.reconcile_stage_id ?? participant.exposure_stage_id,
      reconciled_at: input.reconciled_at ?? participant.reconciled_at,
      last_seen_at: input.last_seen_at,
    });
  }

  markParticipantJoinState(
    taskId: string,
    agentRef: string,
    joinStatus: 'joined' | 'left' | 'failed',
    timestamps: { joined_at?: string | null; left_at?: string | null } = {},
  ): void {
    const participant = this.participants.getByTaskAndAgent(taskId, agentRef);
    if (!participant) {
      return;
    }
    this.participants.updateJoinState(participant.id, joinStatus, timestamps);
  }

  applyExposureStates(taskId: string, stageId: string, exposures: ParticipantExposureStateInput[]): void {
    const participants = this.participants.listByTask(taskId);
    const byAgent = new Map(participants.map((participant) => [participant.agent_ref, participant]));
    const reconciledAt = new Date().toISOString();
    for (const exposure of exposures) {
      const participant = byAgent.get(exposure.agent_ref);
      if (!participant) {
        continue;
      }
      this.participants.updateExposureState(participant.id, {
        desired_exposure: exposure.desired_exposure,
        exposure_reason: exposure.exposure_reason,
        exposure_stage_id: stageId,
        reconciled_at: reconciledAt,
      });
    }
  }

  syncLiveSession(session: LiveSessionDto): { matched_participant_ids: string[]; matched_task_ids: string[] } {
    const matchedBindings = this.findMatchingTaskBindings(session);
    const matchedParticipantIds: string[] = [];
    const matchedTaskIds = new Set<string>();

    for (const binding of matchedBindings) {
      const participant = this.participants.getByTaskAndAgent(binding.task_id, session.agent_id);
      if (!participant) {
        continue;
      }
      matchedTaskIds.add(binding.task_id);
      matchedParticipantIds.push(participant.id);
      if (participant.binding_id !== binding.id) {
        this.participants.attachContextBinding(binding.task_id, binding.id);
      }
      if (session.status === 'closed') {
        this.participants.updateJoinState(participant.id, 'left', {
          joined_at: participant.joined_at ?? session.last_event_at,
          left_at: session.last_event_at,
        });
      } else {
        this.participants.updateJoinState(participant.id, 'joined', {
          joined_at: participant.joined_at ?? session.last_event_at,
          left_at: null,
        });
      }
      const continuityRef = typeof session.metadata.continuity_ref === 'string'
        ? session.metadata.continuity_ref
        : null;
      this.runtimeSessions.upsertByParticipant({
        id: this.runtimeSessionIdGenerator(),
        participant_binding_id: participant.id,
        runtime_provider: session.source,
        runtime_session_ref: session.session_key,
        runtime_actor_ref: session.agent_id,
        continuity_ref: continuityRef,
        presence_state: session.status,
        binding_reason: participant.exposure_reason ?? 'live_session_match',
        desired_runtime_presence: desiredRuntimePresence(participant.desired_exposure as 'in_thread' | 'hidden'),
        reconcile_stage_id: participant.exposure_stage_id,
        reconciled_at: participant.reconciled_at,
        last_seen_at: session.last_event_at,
      });
    }

    return {
      matched_participant_ids: matchedParticipantIds,
      matched_task_ids: Array.from(matchedTaskIds),
    };
  }

  reconcileRuntimeSessions(taskId: string, stageId: string, exposures: ParticipantExposureStateInput[]): void {
    const participants = this.participants.listByTask(taskId);
    const byAgent = new Map(participants.map((participant) => [participant.agent_ref, participant]));
    const reconciledAt = new Date().toISOString();

    for (const exposure of exposures) {
      const participant = byAgent.get(exposure.agent_ref);
      if (!participant) {
        continue;
      }
      this.runtimeSessions.reconcileByParticipant(participant.id, {
        binding_reason: exposure.exposure_reason,
        desired_runtime_presence: desiredRuntimePresence(exposure.desired_exposure),
        reconcile_stage_id: stageId,
        reconciled_at: reconciledAt,
      });
    }
  }

  private findMatchingTaskBindings(session: LiveSessionDto) {
    const candidates = new Map<string, NonNullable<ReturnType<ITaskContextBindingRepository['getById']>>>();
    for (const taskBinding of this.taskBindings.listByTaskBindingsForRefs({
      thread_ref: session.thread_id ?? null,
      conversation_ref: session.conversation_id ?? null,
    })) {
      candidates.set(taskBinding.id, taskBinding);
    }
    return Array.from(candidates.values()).filter((value): value is NonNullable<typeof value> => value !== null);
  }
}
