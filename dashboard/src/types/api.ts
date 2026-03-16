import type {
  AgentsStatusDto,
  ArchiveJobDto,
  CraftsmanExecutionDto,
  CraftsmanGovernanceSnapshotDto,
  DashboardSessionLoginResponseDto,
  DashboardSessionLogoutResponseDto,
  DashboardSessionStatusResponseDto,
  DashboardUserListResponseDto,
  FlowLogDto,
  HealthResponse,
  PromoteTodoResultDto,
  ProgressLogDto,
  SubtaskDto,
  TaskDto,
  TaskConversationEntryDto,
  TaskConversationListResponseDto,
  TaskConversationMarkReadRequestDto,
  TaskConversationSummaryDto,
  TaskState,
  TaskStatusDto,
  TeamDto,
  TeamMemberDto,
  TemplateDetailDto,
  TemplateSummaryDto,
  TodoItemDto,
  ObserveCraftsmanExecutionsResponseDto,
  RuntimeDiagnosisResultDto,
  RuntimeRecoveryActionDto,
  WorkflowDto,
  WorkflowGateDto,
  WorkflowStageDto,
  UnifiedHealthSnapshotDto,
} from '@agora-ts/contracts';

export type ApiTaskState = TaskState;

export type ApiTeamMemberDto = TeamMemberDto;
export type ApiTeamDto = TeamDto;
export type ApiWorkflowGateDto = WorkflowGateDto;
export type ApiWorkflowStageDto = WorkflowStageDto;
export type ApiWorkflowDto = WorkflowDto;
export type ApiTaskDto = TaskDto;
export type ApiTaskConversationEntryDto = TaskConversationEntryDto;
export type ApiTaskConversationListResponseDto = TaskConversationListResponseDto;
export type ApiTaskConversationSummaryDto = TaskConversationSummaryDto;
export type ApiTaskConversationMarkReadRequestDto = TaskConversationMarkReadRequestDto;
export type ApiFlowLogDto = FlowLogDto;
export type ApiProgressLogDto = ProgressLogDto;
export type ApiSubtaskDto = SubtaskDto;
export type ApiTaskStatusDto = TaskStatusDto;
export type ApiHealthDto = HealthResponse;
export type ApiAgentsStatusDto = AgentsStatusDto;
export type ApiAgentSummaryDto = ApiAgentsStatusDto['summary'];
export type ApiAgentDto = ApiAgentsStatusDto['agents'][number];
export type ApiCraftsmanDto = ApiAgentsStatusDto['craftsmen'][number];
export type ApiCraftsmanExecutionDto = CraftsmanExecutionDto;
export type ApiCraftsmanGovernanceSnapshotDto = CraftsmanGovernanceSnapshotDto;
export type ApiObserveCraftsmanExecutionsResponseDto = ObserveCraftsmanExecutionsResponseDto;
export type ApiUnifiedHealthSnapshotDto = UnifiedHealthSnapshotDto;
export type ApiRuntimeDiagnosisResultDto = RuntimeDiagnosisResultDto;
export type ApiRuntimeRecoveryActionDto = RuntimeRecoveryActionDto;
export type ApiAgentChannelSummaryDto = ApiAgentsStatusDto['channel_summaries'][number];
export type ApiCraftsmanRuntimeDto = ApiAgentsStatusDto['craftsman_runtime'];
export type ApiArchiveJobDto = ArchiveJobDto;
export type ApiDashboardSessionStatusDto = DashboardSessionStatusResponseDto;
export type ApiDashboardSessionLoginDto = DashboardSessionLoginResponseDto;
export type ApiDashboardSessionLogoutDto = DashboardSessionLogoutResponseDto;
export type ApiDashboardUserListDto = DashboardUserListResponseDto;
export type ApiTodoDto = TodoItemDto;
export type ApiTemplateSummaryDto = TemplateSummaryDto;
export type ApiTemplateDetailDto = TemplateDetailDto;
export type ApiTemplateStageDto = NonNullable<ApiTemplateDetailDto['stages']>[number];
export type ApiPromoteTodoResultDto = PromoteTodoResultDto;
