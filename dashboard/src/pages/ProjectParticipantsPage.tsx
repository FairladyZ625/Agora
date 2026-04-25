import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import * as api from '@/lib/api';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import { useProjectParticipantsPageCopy } from '@/lib/dashboardCopy';
import { humanizeWorkspaceFallback } from '@/lib/projectWorkspaceUtils';
import { isTaskVisibleInWorkbench, mapTaskDto } from '@/lib/taskMappers';
import { useProjectStore } from '@/stores/projectStore';
import type { Task } from '@/types/task';

function readRuntimeText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function ProjectParticipantsPage() {
  const copy = useProjectParticipantsPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const projectMembershipsByProject = useProjectStore((state) => state.projectMembershipsByProject ?? {});
  const fetchProjectMembers = useProjectStore((state) => state.fetchProjectMembers ?? (async () => []));
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const memberships = projectId ? (projectMembershipsByProject[projectId] ?? []).filter((entry) => entry.status === 'active') : [];
  const citizens = selectedProject?.operator.citizens ?? [];
  const activeTaskCount = selectedProject?.overview.stats.activeTaskCount ?? 0;
  const waitingReviewCount = selectedProject?.overview.stats.reviewTaskCount ?? 0;
  const runtimeBoundTasks = useMemo(() => (
    projectTasks.filter((task) => (task.teamMembers ?? []).length > 0)
  ), [projectTasks]);

  useEffect(() => {
    if (!projectId || projectMembershipsByProject[projectId]) {
      return;
    }
    void fetchProjectMembers(projectId).catch(() => undefined);
  }, [fetchProjectMembers, projectId, projectMembershipsByProject]);

  useEffect(() => {
    let active = true;
    if (!projectId) {
      return () => {
        active = false;
      };
    }

    void api.listTasks(undefined, projectId)
      .then((tasks) => {
        if (!active) {
          return;
        }
        setProjectTasks(tasks.filter(isTaskVisibleInWorkbench).map(mapTaskDto));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setProjectTasks([]);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

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
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor" data-testid="project-participants-page-panel">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals project-overview-signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.humans}</span>
              <span className="inline-stat__value">{memberships.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.runtimeCitizens}</span>
              <span className="inline-stat__value">{citizens.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.activeTasks}</span>
              <span className="inline-stat__value">{activeTaskCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.waitingReview}</span>
              <span className="inline-stat__value">{waitingReviewCount}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.humanMembersTitle}</h3>
        </div>
        <div className="project-list-stack">
          {memberships.length === 0 ? (
            <p className="type-body-sm">{copy.humanMembersEmpty}</p>
          ) : memberships.map((membership) => (
            <div key={membership.id} className="data-row">
              <div className="min-w-0 flex-1">
                <div className="project-row-titleline">
                  <strong className="type-heading-sm">{`${copy.accountLabel} #${membership.accountId}`}</strong>
                  <span className="status-pill status-pill--neutral">{membership.role}</span>
                </div>
                <div className="type-text-xs project-row-meta">
                  <span>{copy.roleLabel}: {membership.role}</span>
                  <span>{copy.statusLabel}: {membership.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.runtimeCitizensTitle}</h3>
        </div>
        <div className="project-list-stack">
          {citizens.length === 0 ? (
            <p className="type-body-sm">{copy.runtimeCitizensEmpty}</p>
          ) : citizens.map((citizen) => {
            const runtimeTarget = readRuntimeText(citizen.runtimeMetadata, 'runtime_target_ref');
            const runtimeFlavor = readRuntimeText(citizen.runtimeMetadata, 'runtime_flavor');
            return (
              <div key={citizen.citizenId} className="selection-card space-y-3">
                <div className="project-row-titleline">
                  <strong className="type-heading-sm">{citizen.displayName}</strong>
                  <span className="status-pill status-pill--neutral">{citizen.status}</span>
                </div>
                <div className="type-text-xs project-row-meta">
                  <span>{copy.roleLabel}: {citizen.roleId}</span>
                  <span>{copy.adapterLabel}: {citizen.runtimeAdapter}</span>
                  <span>{copy.scaffoldModeLabel}: {citizen.brainScaffoldMode}</span>
                </div>
                <div className="project-inline-actions">
                  <span className="status-pill status-pill--neutral">
                    {copy.skillsLabel}: {citizen.skillsRef.length > 0 ? citizen.skillsRef.length : copy.noSkills}
                  </span>
                  {runtimeTarget ? <span className="status-pill status-pill--neutral">{copy.runtimeTargetLabel}: {runtimeTarget}</span> : null}
                  {runtimeFlavor ? <span className="status-pill status-pill--neutral">{copy.runtimeFlavorLabel}: {runtimeFlavor}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.activeParticipationTitle}</h3>
        </div>
        <div className="project-list-stack">
          {runtimeBoundTasks.length === 0 ? (
            <p className="type-body-sm">{copy.activeParticipationEmpty}</p>
          ) : runtimeBoundTasks.map((task) => (
            <div key={task.id} className="selection-card space-y-3">
              <div className="project-row-titleline">
                <Link className="type-heading-sm" to={`/projects/${projectId}/work/${task.id}`}>{task.title}</Link>
                <span className="status-pill status-pill--neutral">{humanizeWorkspaceFallback(task.state)}</span>
              </div>
              <div className="space-y-2">
                {(task.teamMembers ?? []).map((member) => (
                  <div key={`${task.id}-${member.role}-${member.agentId}`} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="project-row-titleline">
                        <strong className="type-heading-sm">{member.agentId}</strong>
                        <span className="status-pill status-pill--neutral">{member.role}</span>
                      </div>
                      <div className="type-text-xs project-row-meta">
                        <span>{copy.runtimeTargetLabel}: {member.runtime_target_ref ?? copy.noRuntimeBinding}</span>
                        <span>{copy.runtimeFlavorLabel}: {member.runtime_flavor ?? copy.noRuntimeBinding}</span>
                        <span>{copy.selectionSourceLabel}: {member.runtime_selection_source ?? copy.noRuntimeBinding}</span>
                        <span>{copy.selectionReasonLabel}: {member.runtime_selection_reason ?? copy.noSelectionReason}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
