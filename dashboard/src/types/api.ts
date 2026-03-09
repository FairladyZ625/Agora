import type {
  AgentsStatusDto,
  ArchiveJobDto,
  FlowLogDto,
  HealthResponse,
  PromoteTodoResultDto,
  ProgressLogDto,
  SubtaskDto,
  TaskDto,
  TaskState,
  TaskStatusDto,
  TeamDto,
  TeamMemberDto,
  TemplateDetailDto,
  TemplateSummaryDto,
  TodoItemDto,
  WorkflowDto,
  WorkflowGateDto,
  WorkflowStageDto,
} from '@agora-ts/contracts';

export type ApiTaskState = TaskState;

export type ApiTeamMemberDto = TeamMemberDto;
export type ApiTeamDto = TeamDto;
export type ApiWorkflowGateDto = WorkflowGateDto;
export type ApiWorkflowStageDto = WorkflowStageDto;
export type ApiWorkflowDto = WorkflowDto;
export type ApiTaskDto = TaskDto;
export type ApiFlowLogDto = FlowLogDto;
export type ApiProgressLogDto = ProgressLogDto;
export type ApiSubtaskDto = SubtaskDto;
export type ApiTaskStatusDto = TaskStatusDto;
export type ApiHealthDto = HealthResponse;
export type ApiAgentsStatusDto = AgentsStatusDto;
export type ApiAgentSummaryDto = ApiAgentsStatusDto['summary'];
export type ApiAgentDto = ApiAgentsStatusDto['agents'][number];
export type ApiCraftsmanDto = ApiAgentsStatusDto['craftsmen'][number];
export type ApiAgentChannelSummaryDto = ApiAgentsStatusDto['channel_summaries'][number];
export type ApiArchiveJobDto = ArchiveJobDto;
export type ApiTodoDto = TodoItemDto;
export type ApiTemplateSummaryDto = TemplateSummaryDto;
export type ApiTemplateDetailDto = TemplateDetailDto;
export type ApiTemplateStageDto = NonNullable<ApiTemplateDetailDto['stages']>[number];
export type ApiPromoteTodoResultDto = PromoteTodoResultDto;
