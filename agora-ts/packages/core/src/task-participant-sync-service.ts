import type { ITaskContextBindingRepository, TaskRecord, TeamDto, WorkflowDto } from '@agora-ts/contracts';
import type { IMProvisioningPort } from './im-ports.js';
import { StageRosterService } from './stage-roster-service.js';
import { isInteractiveParticipant } from './team-member-kind.js';

type WorkflowStageLike = NonNullable<WorkflowDto['stages']>[number];

type TrackBackgroundOperation = <T>(operation: Promise<T>) => Promise<T>;

type TaskParticipationSyncPort = {
  attachContextBinding(taskId: string, bindingId: string): void;
  markParticipantJoinState(
    taskId: string,
    agentRef: string,
    joinStatus: 'joined' | 'left' | 'failed',
    timestamps?: { joined_at?: string | null; left_at?: string | null },
  ): void;
  applyExposureStates(taskId: string, stageId: string, exposures: ReturnType<StageRosterService['resolveExposureDecisions']>): void;
  reconcileRuntimeSessions(taskId: string, stageId: string, exposures: ReturnType<StageRosterService['resolveExposureDecisions']>): void;
  listParticipants(taskId: string): Array<{
    agent_ref: string;
    join_status: string;
  }>;
};

type ProvisionedBinding = {
  id: string;
  conversation_ref?: string | null;
  thread_ref?: string | null;
};

export interface TaskParticipantSyncServiceOptions {
  taskContextBindingRepository: ITaskContextBindingRepository;
  taskParticipationService?: TaskParticipationSyncPort | undefined;
  imProvisioningPort?: IMProvisioningPort | undefined;
  stageRosterService?: StageRosterService | undefined;
  trackBackgroundOperation?: TrackBackgroundOperation | undefined;
}

export class TaskParticipantSyncService {
  private readonly taskContextBindingRepository: ITaskContextBindingRepository;
  private readonly taskParticipationService: TaskParticipationSyncPort | undefined;
  private readonly imProvisioningPort: IMProvisioningPort | undefined;
  private readonly stageRosterService: StageRosterService;
  private readonly trackBackgroundOperation: TrackBackgroundOperation | undefined;

  constructor(options: TaskParticipantSyncServiceOptions) {
    this.taskContextBindingRepository = options.taskContextBindingRepository;
    this.taskParticipationService = options.taskParticipationService;
    this.imProvisioningPort = options.imProvisioningPort;
    this.stageRosterService = options.stageRosterService ?? new StageRosterService();
    this.trackBackgroundOperation = options.trackBackgroundOperation;
  }

  seedStageExposure(taskId: string, team: TeamDto | null | undefined, stage: WorkflowStageLike | null | undefined) {
    if (!stage || !this.taskParticipationService) {
      return;
    }
    const exposureStates = this.stageRosterService.resolveExposureDecisions(team, stage);
    this.taskParticipationService.applyExposureStates(taskId, stage.id, exposureStates);
  }

  attachProvisionedContext(taskId: string, bindingId: string) {
    this.taskParticipationService?.attachContextBinding(taskId, bindingId);
  }

  async joinProvisionedParticipants(
    taskId: string,
    binding: ProvisionedBinding,
    participantRefs: string[],
  ): Promise<void> {
    if (!this.imProvisioningPort || participantRefs.length === 0) {
      return;
    }
    await Promise.all(participantRefs.map(async (participantRef) => {
      try {
        const result = await this.imProvisioningPort?.joinParticipant({
          binding_id: binding.id,
          participant_ref: participantRef,
          ...(binding.conversation_ref ? { conversation_ref: binding.conversation_ref } : {}),
          ...(binding.thread_ref ? { thread_ref: binding.thread_ref } : {}),
        });
        if (result?.status === 'joined' || result?.status === 'ignored') {
          this.markParticipantBindingJoined(taskId, participantRef);
        }
      } catch (error: unknown) {
        console.error(
          `[TaskParticipantSyncService] IM participant join failed for task ${taskId} participant ${participantRef}:`,
          error,
        );
      }
    }));
  }

  reconcileStageParticipants(task: TaskRecord, stage: WorkflowStageLike | null) {
    if (!stage || !this.imProvisioningPort || !this.taskParticipationService) {
      return;
    }
    const binding = this.taskContextBindingRepository.getActiveByTask(task.id);
    if (!binding) {
      return;
    }

    const exposureStates = this.stageRosterService.resolveExposureDecisions(task.team, stage);
    this.taskParticipationService.applyExposureStates(task.id, stage.id, exposureStates);
    this.taskParticipationService.reconcileRuntimeSessions(task.id, stage.id, exposureStates);

    const desiredRefs = exposureStates
      .filter((decision) => decision.desired_exposure === 'in_thread')
      .map((decision) => decision.agent_ref);
    const participants = this.taskParticipationService.listParticipants(task.id);
    const interactiveRefs = new Set(task.team.members.filter(isInteractiveParticipant).map((member) => member.agentId));
    const joinedRefs = new Set(
      participants
        .filter((participant) => participant.join_status === 'joined')
        .map((participant) => participant.agent_ref),
    );
    const toJoin = desiredRefs.filter((participantRef) => !joinedRefs.has(participantRef));
    const toLeave = participants
      .filter((participant) => participant.join_status === 'joined' && interactiveRefs.has(participant.agent_ref))
      .map((participant) => participant.agent_ref)
      .filter((participantRef, index, values) => values.indexOf(participantRef) === index)
      .filter((participantRef) => !desiredRefs.includes(participantRef));

    if (toJoin.length === 0 && toLeave.length === 0) {
      return;
    }

    const reconciliation = Promise.all([
      ...toJoin.map(async (participantRef) => {
        try {
          const result = await this.imProvisioningPort?.joinParticipant({
            binding_id: binding.id,
            participant_ref: participantRef,
            conversation_ref: binding.conversation_ref,
            thread_ref: binding.thread_ref,
          });
          if (result?.status === 'joined' || result?.status === 'ignored') {
            this.markParticipantBindingJoined(task.id, participantRef);
          }
        } catch (error: unknown) {
          console.error(
            `[TaskParticipantSyncService] stage roster join failed for task ${task.id} participant ${participantRef}:`,
            error,
          );
        }
      }),
      ...toLeave.map(async (participantRef) => {
        try {
          const result = await this.imProvisioningPort?.removeParticipant({
            binding_id: binding.id,
            participant_ref: participantRef,
            conversation_ref: binding.conversation_ref,
            thread_ref: binding.thread_ref,
          });
          if (result?.status === 'removed' || result?.status === 'ignored') {
            this.markParticipantBindingLeft(task.id, participantRef);
          }
        } catch (error: unknown) {
          console.error(
            `[TaskParticipantSyncService] stage roster remove failed for task ${task.id} participant ${participantRef}:`,
            error,
          );
        }
      }),
    ]);

    if (this.trackBackgroundOperation) {
      this.trackBackgroundOperation(reconciliation);
      return;
    }
    void reconciliation;
  }

  private markParticipantBindingJoined(taskId: string, participantRef: string) {
    this.taskParticipationService?.markParticipantJoinState(taskId, participantRef, 'joined', {
      joined_at: new Date().toISOString(),
      left_at: null,
    });
  }

  private markParticipantBindingLeft(taskId: string, participantRef: string) {
    this.taskParticipationService?.markParticipantJoinState(taskId, participantRef, 'left', {
      left_at: new Date().toISOString(),
    });
  }
}
