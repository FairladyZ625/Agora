import { useState } from 'react';
import { Link } from 'react-router';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import {
  summarizeProjectDocument,
} from '@/lib/projectWorkspaceUtils';
import type { ProjectRecap } from '@/types/project';

export function ProjectArchiveWorkspacePage() {
  const copy = useProjectDetailPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const [selectedRecap, setSelectedRecap] = useState<ProjectRecap | null>(null);

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

  const { project, work } = selectedProject;

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">Archive</h2>
            <p className="page-summary">{project.name}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}`}>Overview</Link>
              <Link className="button-secondary" to="/archive">Global Archive</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-archive-page-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.recapsTitle}</h3>
        </div>
        <div className="mt-5 space-y-3">
          {work.recaps.length === 0 ? <p className="type-body-sm">{copy.recapsEmpty}</p> : work.recaps.map((recap) => (
            <button
              key={recap.taskId}
              type="button"
              className="selection-card w-full text-left"
              aria-label={copy.openRecapAria(recap.title ?? recap.taskId)}
              onClick={() => setSelectedRecap(recap)}
            >
              <strong className="type-heading-sm">{recap.title ?? recap.taskId}</strong>
              <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                <span>{recap.taskId}</span>
                <span>{recap.updatedAt ?? '-'}</span>
              </div>
              <p className="type-body-sm mt-3 line-clamp-3">{summarizeProjectDocument(recap.content, copy.documentFallback)}</p>
            </button>
          ))}
        </div>
      </section>

      {selectedRecap ? (
        <WorkbenchDetailSheet
          label={copy.recapDialogLabel}
          title={selectedRecap.title ?? selectedRecap.taskId}
          onClose={() => setSelectedRecap(null)}
        >
          <div className="sheet-summary">
            <span className="type-mono-sm">{selectedRecap.taskId}</span>
            <p className="type-body-sm mt-3 break-all">{selectedRecap.summaryPath}</p>
            <p className="type-text-xs mt-3">{selectedRecap.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.recapContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{selectedRecap.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
