import { randomUUID } from 'node:crypto';
import type { LiveSessionDto, TeamDto } from '@agora-ts/contracts';
import {
  ParticipantBindingRepository,
  RuntimeSessionBindingRepository,
  TaskContextBindingRepository,
  type AgoraDatabase,
  type StoredParticipantBinding,
  type StoredRuntimeSessionBinding,
} from '@agora-ts/db';
import type { AgentRuntimePort } from './runtime-ports.js';
import { isInteractiveParticipant } from './team-member-kind.js';

export interface TaskParticipationServiceOptions {
  participantIdGenerator?: () => string;
  runtimeSessionIdGenerator?: () => string;
  agentRuntimePort?: AgentRuntimePort;
}

function defaultId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export class TaskParticipationService {
  private readonly participants: ParticipantBindingRepository;
  private readonly runtimeSessions: RuntimeSessionBindingRepository;
  private readonly taskBindings: TaskContextBindingRepository;
  private readonly participantIdGenerator: () => string;
  private readonly runtimeSessionIdGenerator: () => string;
  private readonly agentRuntimePort: AgentRuntimePort | undefined;

  constructor(
    db: AgoraDatabase,
    options: TaskParticipationServiceOptions = {},
  ) {
    this.participants = new ParticipantBindingRepository(db);
    this.runtimeSessions = new RuntimeSessionBindingRepository(db);
    this.taskBindings = new TaskContextBindingRepository(db);
    this.participantIdGenerator = options.participantIdGenerator ?? (() => defaultId('participant'));
    this.runtimeSessionIdGenerator = options.runtimeSessionIdGenerator ?? (() => defaultId('runtime-session'));
    this.agentRuntimePort = options.agentRuntimePort;
  }

  seedParticipants(taskId: string, team: TeamDto | null | undefined, bindingId?: string | null): StoredParticipantBinding[] {
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

  listParticipants(taskId: string): StoredParticipantBinding[] {
    return this.participants.listByTask(taskId);
  }

  listRuntimeSessions(taskId: string): StoredRuntimeSessionBinding[] {
    return this.runtimeSessions.listByTask(taskId);
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
        last_seen_at: session.last_event_at,
      });
    }

    return {
      matched_participant_ids: matchedParticipantIds,
      matched_task_ids: Array.from(matchedTaskIds),
    };
  }

  private findMatchingTaskBindings(session: LiveSessionDto) {
    const candidates = new Map<string, ReturnType<TaskContextBindingRepository['getById']>>();
    for (const taskBinding of this.taskBindings.listByTaskBindingsForRefs({
      thread_ref: session.thread_id ?? null,
      conversation_ref: session.conversation_id ?? null,
    })) {
      candidates.set(taskBinding.id, taskBinding);
    }
    return Array.from(candidates.values()).filter((value): value is NonNullable<typeof value> => value !== null);
  }
}
