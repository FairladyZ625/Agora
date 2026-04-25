import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { ProjectRuntimePolicyPanel } from '@/components/project/ProjectRuntimePolicyPanel';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import { useProjectGovernancePageCopy } from '@/lib/dashboardCopy';
import { humanizeWorkspaceFallback } from '@/lib/projectWorkspaceUtils';
import { useTaskStore } from '@/stores/taskStore';

const ACTIVE_TASK_STATES = new Set(['active', 'in_progress', 'gate_waiting', 'paused', 'blocked']);

export function ProjectGovernancePage() {
  const copy = useProjectGovernancePageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const tasks = useTaskStore((state) => state.tasks);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const projectTasks = projectId ? tasks.filter((task) => task.projectId === projectId) : [];
  const taskById = new Map(projectTasks.map((task) => [task.id, task]));
  const reviewQueue = selectedProject?.work.tasks.filter((task) => task.state === 'gate_waiting') ?? [];
  const runtimeSelectionRows = projectTasks.flatMap((task) => (
    (task.teamMembers ?? [])
      .filter((member) => Boolean(member.runtime_selection_source) || Boolean(member.runtime_selection_reason) || Boolean(member.runtime_target_ref))
      .map((member) => ({
        taskId: task.id,
        taskTitle: task.title,
        role: member.role,
        source: member.runtime_selection_source,
        reason: member.runtime_selection_reason,
        targetRef: member.runtime_target_ref,
      }))
  ));
  const activeTaskCount = selectedProject?.work.tasks.filter((task) => ACTIVE_TASK_STATES.has(task.state)).length ?? 0;
  const projectRoles = useMemo(
    () => Array.from(new Set((selectedProject?.operator.citizens ?? []).map((citizen) => citizen.roleId))).sort((left, right) => left.localeCompare(right)),
    [selectedProject?.operator.citizens],
  );

  useEffect(() => {
    if (tasks.length === 0) {
      void fetchTasks();
    }
  }, [fetchTasks, tasks.length]);

  if (detailLoading) {
    return (
      <div className="surface-panel surface-panel--workspace surface-panel--context-anchor">
        <p className="type-body-sm">{copy.loadingTitle}</p>
      </div>
    );
  }

  if (!selectedProject || !projectId) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{error ?? copy.notFoundTitle}</p>
      </div>
    );
  }

  return (
    <div className="project-overview-page interior-page">
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor" data-testid="project-governance-page-panel">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals project-overview-signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.waitingReview}</span>
              <span className="inline-stat__value">{reviewQueue.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.activeTasks}</span>
              <span className="inline-stat__value">{activeTaskCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.pendingTodos}</span>
              <span className="inline-stat__value">{selectedProject.overview.stats.pendingTodoCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.recaps}</span>
              <span className="inline-stat__value">{selectedProject.work.recaps.length}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.runtimePolicyTitle}</h3>
        </div>
        <ProjectRuntimePolicyPanel projectId={projectId} roles={projectRoles} />
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.reviewQueueTitle}</h3>
        </div>
        <div className="project-list-stack">
          {reviewQueue.length === 0 ? (
            <p className="type-body-sm">{copy.reviewQueueEmpty}</p>
          ) : reviewQueue.map((task) => (
            <div key={task.id} className="data-row">
              <div className="min-w-0 flex-1">
                <div className="project-row-titleline">
                  <Link className="type-heading-sm" to={`/projects/${projectId}/work/${task.id}`}>{task.title}</Link>
                  <span className="status-pill status-pill--neutral">{humanizeWorkspaceFallback(task.state)}</span>
                </div>
                <div className="type-text-xs project-row-meta">
                  <span>{task.id}</span>
                  <span>{humanizeWorkspaceFallback(taskById.get(task.id)?.gateType ?? 'review')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.runtimeSelectionTitle}</h3>
        </div>
        <div className="project-list-stack">
          {runtimeSelectionRows.length === 0 ? (
            <p className="type-body-sm">{copy.runtimeSelectionEmpty}</p>
          ) : runtimeSelectionRows.map((row) => (
            <div key={`${row.taskId}-${row.role}-${row.targetRef ?? 'none'}`} className="data-row">
              <div className="min-w-0 flex-1">
                <div className="project-row-titleline">
                  <Link className="type-heading-sm" to={`/projects/${projectId}/work/${row.taskId}`}>{row.taskTitle}</Link>
                  <span className="status-pill status-pill--neutral">{row.role}</span>
                </div>
                <div className="type-text-xs project-row-meta">
                  <span>{copy.sourceLabel}: {row.source ?? copy.noSource}</span>
                  <span>{copy.reasonLabel}: {row.reason ?? copy.noReason}</span>
                  <span>{copy.runtimePolicyTitle}: {row.targetRef ?? copy.noSource}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.auditTrailTitle}</h3>
        </div>
        <div className="project-overview-grid">
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{copy.timelineLabel}</strong>
            <p className="type-body-sm">{selectedProject.surfaces.timeline?.path ?? copy.noSource}</p>
          </div>
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{copy.knowledgeLabel}</strong>
            <p className="type-body-sm">{selectedProject.work.knowledge.length}</p>
          </div>
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{copy.recapsLabel}</strong>
            <p className="type-body-sm">{selectedProject.work.recaps.length}</p>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.nomosStatusTitle}</h3>
        </div>
        {!selectedProject.nomos ? (
          <p className="type-body-sm">{copy.nomosMissing}</p>
        ) : (
          <div className="project-overview-grid">
            <div className="space-y-2">
              <p className="field-label">{copy.activationStatusLabel}</p>
              <p className="type-body-sm">{selectedProject.nomos.activationStatus}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.repoShimLabel}</p>
              <p className="type-body-sm">{selectedProject.nomos.repoShimInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.profileInstalledLabel}</p>
              <p className="type-body-sm">{selectedProject.nomos.profileInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
