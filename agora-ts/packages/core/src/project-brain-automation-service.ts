import type { AttentionRoutingPlanDto, ReferenceBundleDto, RetrievalPlanDto, RetrievalResultDto, TaskRecord } from '@agora-ts/contracts';
import { AttentionRoutingService } from './attention-routing-service.js';
import { renderMarkdownFrontmatter, stripMarkdownFrontmatter } from './markdown-frontmatter.js';
import { ReferenceBundleService } from './reference-bundle-service.js';
import type { ProjectKnowledgeKind } from './project-knowledge-port.js';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import type { ProjectBrainService } from './project-brain-service.js';
import type { TaskBrainBindingService } from './task-brain-binding-service.js';
import type { TaskBrainWorkspacePort } from './task-brain-port.js';
import { resolveControllerRef } from './team-member-kind.js';
import {
  ProjectBrainAutomationPolicy,
  type ProjectBrainAutomationAudience,
} from './project-brain-automation-policy.js';

export interface ProjectContextBriefing {
  project_id: string;
  audience: ProjectBrainAutomationAudience;
  markdown: string;
  reference_bundle?: ReferenceBundleDto;
  attention_routing_plan?: AttentionRoutingPlanDto;
  source_documents: Array<{
    kind: ProjectBrainDocument['kind'];
    slug: string;
    title: string | null;
    path: string;
  }>;
}

export interface BuildProjectContextBriefingInput {
  project_id: string;
  audience: ProjectBrainAutomationAudience;
  citizen_id?: string | null;
  task_id?: string;
  task_title?: string;
  task_description?: string;
  allowed_citizen_ids?: string[];
}

export interface PromoteProjectBrainKnowledgeInput {
  project_id: string;
  kind: ProjectKnowledgeKind;
  slug?: string;
  title?: string;
  summary?: string | null;
  body: string;
  heading?: string;
  source_task_ids?: string[];
}

export interface ProjectBrainAutomationServiceOptions {
  projectBrainService: ProjectBrainService;
  policy?: ProjectBrainAutomationPolicy;
  taskBrainBindingService?: TaskBrainBindingService;
  taskBrainWorkspacePort?: TaskBrainWorkspacePort;
  retrievalService?: {
    retrieve(plan: RetrievalPlanDto): Promise<RetrievalResultDto[]>;
  };
}

export class ProjectBrainAutomationService {
  private readonly policy: ProjectBrainAutomationPolicy;
  private readonly referenceBundleService: ReferenceBundleService;
  private readonly attentionRoutingService: AttentionRoutingService;

  constructor(private readonly options: ProjectBrainAutomationServiceOptions) {
    this.policy = options.policy ?? new ProjectBrainAutomationPolicy();
    this.referenceBundleService = new ReferenceBundleService({
      projectBrainService: options.projectBrainService,
      policy: this.policy,
    });
    this.attentionRoutingService = new AttentionRoutingService({
      ...(options.retrievalService ? { retrievalService: options.retrievalService } : {}),
    });
  }

  buildProjectContextBriefing(input: BuildProjectContextBriefingInput): ProjectContextBriefing {
    const bundle = this.referenceBundleService.buildReferenceBundle({
      project_id: input.project_id,
      mode: 'bootstrap',
      audience: input.audience,
      ...(input.citizen_id ? { citizen_id: input.citizen_id } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
      ...(input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0 ? { allowed_citizen_ids: input.allowed_citizen_ids } : {}),
    });
    const attentionRoutingPlan = this.attentionRoutingService.buildPlan({
      project_id: input.project_id,
      mode: 'bootstrap',
      audience: input.audience,
      reference_bundle: bundle,
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
    });
    return this.renderProjectContextBriefing(input, bundle, attentionRoutingPlan);
  }

  async buildProjectContextBriefingAsync(input: BuildProjectContextBriefingInput): Promise<ProjectContextBriefing> {
    const bundle = await this.referenceBundleService.buildReferenceBundleAsync({
      project_id: input.project_id,
      mode: 'bootstrap',
      audience: input.audience,
      ...(input.citizen_id ? { citizen_id: input.citizen_id } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
      ...(input.allowed_citizen_ids && input.allowed_citizen_ids.length > 0 ? { allowed_citizen_ids: input.allowed_citizen_ids } : {}),
    });
    const attentionRoutingPlan = await this.attentionRoutingService.buildPlanAsync({
      project_id: input.project_id,
      mode: 'bootstrap',
      audience: input.audience,
      reference_bundle: bundle,
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.task_title ? { task_title: input.task_title } : {}),
      ...(input.task_description ? { task_description: input.task_description } : {}),
    });
    return this.renderProjectContextBriefing(input, bundle, attentionRoutingPlan);
  }

  private renderProjectContextBriefing(
    input: BuildProjectContextBriefingInput,
    bundle: ReferenceBundleDto,
    attentionRoutingPlan: AttentionRoutingPlanDto,
  ): ProjectContextBriefing {
    const selected = bundle.references
      .map((reference) => this.options.projectBrainService.getDocument(
        input.project_id,
        reference.kind as ProjectBrainDocument['kind'],
        reference.slug,
      ))
      .filter(Boolean) as ProjectBrainDocument[];
    return {
      project_id: input.project_id,
      audience: input.audience,
      reference_bundle: bundle,
      attention_routing_plan: attentionRoutingPlan,
      source_documents: selected.map((doc) => ({
        kind: doc.kind,
        slug: doc.slug,
        title: doc.title,
        path: doc.path,
      })),
      markdown: renderProjectContextBriefingMarkdown(input.project_id, input.audience, selected, attentionRoutingPlan),
    };
  }

  promoteKnowledge(input: PromoteProjectBrainKnowledgeInput) {
    return this.options.projectBrainService.appendDocument({
      project_id: input.project_id,
      kind: input.kind,
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.heading ? { heading: input.heading } : {}),
      ...(input.source_task_ids && input.source_task_ids.length > 0 ? { source_task_ids: input.source_task_ids } : {}),
      body: input.body,
    });
  }

  recordTaskCloseRecap(task: TaskRecord, actor: string, reason?: string) {
    if (!task.project_id || !this.options.taskBrainBindingService || !this.options.taskBrainWorkspacePort) {
      return;
    }
    const binding = this.options.taskBrainBindingService.getActiveBinding(task.id);
    if (!binding) {
      return;
    }
    this.options.taskBrainWorkspacePort.writeTaskCloseRecap(binding, {
      task_id: task.id,
      project_id: task.project_id,
      locale: task.locale,
      title: task.title,
      state: task.state,
      current_stage: task.current_stage,
      controller_ref: resolveControllerRef(task.team.members),
      completed_by: actor,
      completed_at: new Date().toISOString(),
      summary_lines: buildTaskCloseSummary(task, actor, reason),
    });
    this.options.taskBrainWorkspacePort.writeTaskHarvestDraft(binding, {
      task_id: task.id,
      project_id: task.project_id,
      locale: task.locale,
      title: task.title,
      state: task.state,
      current_stage: task.current_stage,
      controller_ref: resolveControllerRef(task.team.members),
      completed_by: actor,
      completed_at: new Date().toISOString(),
      summary_lines: buildTaskCloseSummary(task, actor, reason),
    });
  }
}

function renderProjectContextBriefingMarkdown(
  projectId: string,
  audience: ProjectBrainAutomationAudience,
  documents: ProjectBrainDocument[],
  attentionRoutingPlan: AttentionRoutingPlanDto,
) {
  const projectName = documents.find((doc) => doc.kind === 'index')?.title ?? projectId;
  const frontmatter = renderMarkdownFrontmatter({
    doc_type: 'project_context_briefing',
    project_id: projectId,
    audience,
    source_doc_kinds: documents.map((doc) => doc.kind),
    source_doc_slugs: documents.map((doc) => `${doc.kind}:${doc.slug}`),
  });
  const sections = [
    '# Project Context Briefing',
    '',
    `- Project: ${projectName}`,
    `- Audience: ${audience}`,
    `- Source Docs: ${documents.length}`,
    '',
    '## Read Order',
    '',
    ...documents.map((doc) => `- ${doc.kind}/${doc.slug} | ${doc.title ?? '-'} | ${doc.path}`),
    '',
    '## Attention Routing',
    '',
    attentionRoutingPlan.summary,
    '',
    ...attentionRoutingPlan.routes.map((route) => `${route.ordinal}. ${route.reference_key} — ${route.rationale}`),
  ];

  for (const doc of documents) {
    sections.push(
      '',
      `## ${doc.kind}/${doc.slug}`,
      '',
      `path: ${doc.path}`,
      ...(doc.title ? [`title: ${doc.title}`] : []),
      '',
      excerptDocument(doc),
    );
  }

  return `${frontmatter}${sections.join('\n').trimEnd()}\n`;
}

function excerptDocument(document: ProjectBrainDocument) {
  const body = stripMarkdownFrontmatter(document.content).trim();
  const lines = body.split('\n').map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) {
    return '(empty)';
  }
  return lines.slice(0, 12).join('\n');
}

function buildTaskCloseSummary(task: TaskRecord, actor: string, reason?: string) {
  return [
    task.locale === 'zh-CN'
      ? '任务已到达 done，已进入 archive 流程。'
      : 'Task reached done and has entered archive handling.',
    `${task.locale === 'zh-CN' ? '当前阶段' : 'Current Stage'}: ${task.current_stage ?? '-'}`,
    `${task.locale === 'zh-CN' ? '主控' : 'Controller'}: ${resolveControllerRef(task.team.members) ?? '-'}`,
    `${task.locale === 'zh-CN' ? '完成人' : 'Completed By'}: ${actor}`,
    ...(reason
      ? [`${task.locale === 'zh-CN' ? '原因' : 'Reason'}: ${reason}`]
      : []),
  ];
}
