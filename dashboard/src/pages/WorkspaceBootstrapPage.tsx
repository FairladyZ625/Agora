import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import * as api from '@/lib/api';
import { useWorkspaceBootstrapPageCopy } from '@/lib/dashboardCopy';
import { mapWorkspaceBootstrapStatusDto } from '@/lib/projectMappers';
import type { WorkspaceBootstrapStatus } from '@/types/project';

export function WorkspaceBootstrapPage() {
  const copy = useWorkspaceBootstrapPageCopy();
  const [status, setStatus] = useState<WorkspaceBootstrapStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.getWorkspaceBootstrapStatus()
      .then((response) => {
        if (!active) {
          return;
        }
        setStatus(mapWorkspaceBootstrapStatusDto(response));
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  const runtimeValue = status
    ? (status.runtimeReady ? copy.readyValue : copy.blockedValue)
    : copy.pendingValue;
  const completionValue = status
    ? (status.bootstrapCompleted ? copy.completedValue : copy.pendingValue)
    : copy.pendingValue;

  return (
    <div className="interior-page">
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="inline-stat">
            <span className="inline-stat__label">{copy.runtimeReadyLabel}</span>
            <span className="inline-stat__value">{runtimeValue}</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat__label">{copy.bootstrapTaskLabel}</span>
            <span className="inline-stat__value">{status?.bootstrapTaskTitle ?? copy.emptyTaskValue}</span>
          </div>
          <div className="inline-stat">
            <span className="inline-stat__label">{copy.completedLabel}</span>
            <span className="inline-stat__value">{completionValue}</span>
          </div>
        </div>

        {status?.runtimeReadinessReason ? (
          <p className="type-text-xs mt-4">{`${copy.runtimeReasonLabel}: ${status.runtimeReadinessReason}`}</p>
        ) : null}

        {status?.bootstrapTaskId ? (
          <div className="mt-5">
            <Link to={`/tasks/${status.bootstrapTaskId}`} className="button-secondary">
              {copy.openTaskAction}
            </Link>
          </div>
        ) : null}
      </section>

      <section className="surface-panel surface-panel--workspace">
        <p className="page-kicker">{copy.guideTitle}</p>
        <p className="page-summary">{copy.guideSummary}</p>
        <ol className="mt-4 space-y-3">
          {copy.guideSteps.map((step, index) => (
            <li key={step} className="data-row">
              <strong className="type-mono-xs">{String(index + 1).padStart(2, '0')}</strong>
              <span className="type-body-sm">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
