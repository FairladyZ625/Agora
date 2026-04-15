import { useState } from 'react';
import { Link } from 'react-router';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import {
  formatWorkspaceTimestamp,
  summarizeProjectDocument,
} from '@/lib/projectWorkspaceUtils';
import type { ProjectKnowledgeDoc } from '@/types/project';

export function ProjectKnowledgePage() {
  const copy = useProjectDetailPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const [selectedDoc, setSelectedDoc] = useState<ProjectKnowledgeDoc | null>(null);

  if (detailLoading) {
    return (
      <div className="surface-panel surface-panel--workspace">
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

  const { project, surfaces, work } = selectedProject;

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">Knowledge</h2>
            <p className="page-summary">{project.name}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}`}>Overview</Link>
              <Link className="button-secondary" to={`/projects/${project.id}/brain`}>{copy.openBrainAction}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-knowledge-surfaces-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.surfacesTitle}</h3>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{surfaces.index?.title ?? 'Project Index'}</strong>
            <p className="type-body-sm">{summarizeProjectDocument(surfaces.index?.content ?? '', copy.emptySurface)}</p>
            <p className="type-text-xs break-all">{copy.surfacePathLabel}: {surfaces.index?.path ?? copy.noneLabel}</p>
            <p className="type-text-xs">{copy.surfaceUpdatedLabel}: {formatWorkspaceTimestamp(surfaces.index?.updatedAt)}</p>
          </div>
          <div className="selection-card space-y-3">
            <strong className="type-heading-sm">{surfaces.timeline?.title ?? 'Project Timeline'}</strong>
            <p className="type-body-sm">{summarizeProjectDocument(surfaces.timeline?.content ?? '', copy.emptySurface)}</p>
            <p className="type-text-xs break-all">{copy.surfacePathLabel}: {surfaces.timeline?.path ?? copy.noneLabel}</p>
            <p className="type-text-xs">{copy.surfaceSourceTasksLabel}: {surfaces.timeline?.sourceTaskIds.join(', ') || copy.noSourceTasks}</p>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-knowledge-page-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.knowledgeTitle}</h3>
        </div>
        <div className="mt-5 space-y-3">
          {work.knowledge.length === 0 ? <p className="type-body-sm">{copy.knowledgeEmpty}</p> : work.knowledge.map((doc) => (
            <button
              key={`${doc.kind}:${doc.slug}`}
              type="button"
              className="selection-card w-full text-left"
              aria-label={copy.openKnowledgeAria(doc.title ?? doc.slug)}
              onClick={() => setSelectedDoc(doc)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="type-heading-sm">{doc.title ?? doc.slug}</strong>
                <span className="status-pill status-pill--neutral">{doc.kind}</span>
              </div>
              <p className="type-body-sm mt-3 line-clamp-3">{summarizeProjectDocument(doc.content, copy.documentFallback)}</p>
            </button>
          ))}
        </div>
      </section>

      {selectedDoc ? (
        <WorkbenchDetailSheet
          label={copy.knowledgeDialogLabel}
          title={selectedDoc.title ?? selectedDoc.slug}
          onClose={() => setSelectedDoc(null)}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-pill status-pill--neutral">{selectedDoc.kind}</span>
              <span className="type-mono-sm">{selectedDoc.slug}</span>
            </div>
            <p className="type-body-sm mt-3 break-all">{selectedDoc.path}</p>
            <p className="type-text-xs mt-3">{selectedDoc.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeSourceTasksTitle}</h4>
            <p className="type-body-sm mt-4">{selectedDoc.sourceTaskIds.join(', ') || copy.noSourceTasks}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{selectedDoc.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
