import { RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearRuntimeTargetOverlay,
  listRuntimeTargets,
  updateRuntimeTargetOverlay,
} from '@/lib/api';
import { useRuntimeTargetsPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';
import type { RuntimeTarget, RuntimeTargetOverlayInput } from '@/types/runtime-target';

interface RuntimeTargetDraft {
  enabled: boolean;
  displayName: string;
  tags: string;
  allowedProjects: string;
  defaultRoles: string;
  presentationMode: RuntimeTarget['presentationMode'];
  presentationProvider: string;
  presentationIdentityRef: string;
}

function buildDraft(target: RuntimeTarget): RuntimeTargetDraft {
  return {
    enabled: target.enabled,
    displayName: target.displayName ?? '',
    tags: target.tags.join(', '),
    allowedProjects: target.allowedProjects.join(', '),
    defaultRoles: target.defaultRoles.join(', '),
    presentationMode: target.presentationMode,
    presentationProvider: target.presentationProvider ?? '',
    presentationIdentityRef: target.presentationIdentityRef ?? '',
  };
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatList(values: string[], fallback: string) {
  return values.length > 0 ? values.join(', ') : fallback;
}

export function RuntimeTargetsPage() {
  const copy = useRuntimeTargetsPageCopy();
  const { showMessage } = useFeedbackStore();
  const [targets, setTargets] = useState<RuntimeTarget[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuntimeTargetDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextTargets = await listRuntimeTargets();
      setTargets(nextTargets);
      setDrafts(Object.fromEntries(nextTargets.map((target) => [target.runtimeTargetRef, buildDraft(target)])));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const enabledCount = useMemo(
    () => targets.filter((target) => target.enabled).length,
    [targets],
  );
  const presentedCount = useMemo(
    () => targets.filter((target) => target.presentationMode === 'im_presented').length,
    [targets],
  );

  const updateDraft = (runtimeTargetRef: string, patch: Partial<RuntimeTargetDraft>) => {
    setDrafts((current) => ({
      ...current,
      [runtimeTargetRef]: {
        ...(current[runtimeTargetRef] ?? buildDraft(targets.find((target) => target.runtimeTargetRef === runtimeTargetRef)!)),
        ...patch,
      },
    }));
  };

  const handleSave = async (target: RuntimeTarget) => {
    const draft = drafts[target.runtimeTargetRef] ?? buildDraft(target);
    const payload: RuntimeTargetOverlayInput = {
      enabled: draft.enabled,
      displayName: draft.displayName.trim() || null,
      tags: parseCsv(draft.tags),
      allowedProjects: parseCsv(draft.allowedProjects),
      defaultRoles: parseCsv(draft.defaultRoles),
      presentationMode: draft.presentationMode,
      presentationProvider: draft.presentationProvider.trim() || null,
      presentationIdentityRef: draft.presentationIdentityRef.trim() || null,
    };

    setSavingRef(target.runtimeTargetRef);
    try {
      await updateRuntimeTargetOverlay(target.runtimeTargetRef, payload);
      await refresh();
      showMessage(copy.feedback.saveSuccessTitle, copy.feedback.saveSuccessDetail(target.runtimeTargetRef), 'success');
    } catch (saveError) {
      showMessage(copy.feedback.saveFailureTitle, saveError instanceof Error ? saveError.message : String(saveError), 'warning');
    } finally {
      setSavingRef(null);
    }
  };

  const handleClear = async (runtimeTargetRef: string) => {
    setSavingRef(runtimeTargetRef);
    try {
      await clearRuntimeTargetOverlay(runtimeTargetRef);
      await refresh();
      showMessage(copy.feedback.clearSuccessTitle, copy.feedback.clearSuccessDetail(runtimeTargetRef), 'success');
    } catch (clearError) {
      showMessage(copy.feedback.clearFailureTitle, clearError instanceof Error ? clearError.message : String(clearError), 'warning');
    } finally {
      setSavingRef(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace" data-testid="runtime-targets-masthead">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.total}</span>
              <span className="inline-stat__value">{targets.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.enabled}</span>
              <span className="inline-stat__value">{enabledCount}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.metrics.presented}</span>
              <span className="inline-stat__value">{presentedCount}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="button-secondary" onClick={() => void refresh()}>
            <RefreshCcw size={16} />
            <span>{copy.refreshAction}</span>
          </button>
        </div>
        {loading ? <div className="inline-alert inline-alert--info mt-5">{copy.loading}</div> : null}
        {error ? <div className="inline-alert inline-alert--warning mt-5">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="runtime-targets-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.inventoryTitle}</h3>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {targets.length === 0 ? (
            <div className="empty-state">{copy.empty}</div>
          ) : targets.map((target) => {
            const draft = drafts[target.runtimeTargetRef] ?? buildDraft(target);
            const busy = savingRef === target.runtimeTargetRef;

            return (
              <div key={target.runtimeTargetRef} className="selection-card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong className="type-heading-sm">{target.displayName ?? target.runtimeTargetRef}</strong>
                    <p className="type-text-xs mt-2">{target.runtimeTargetRef}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={target.enabled ? 'status-pill status-pill--success' : 'status-pill status-pill--neutral'}>
                      {target.enabled ? copy.enabledLabel : copy.disabledLabel}
                    </span>
                    <span className="status-pill status-pill--neutral">
                      {copy.presentationModeLabels[target.presentationMode]}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="field-label">{copy.workspaceLabel}</p>
                    <p className="type-body-sm break-all">{target.workspaceDir ?? copy.emptyValue}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="field-label">{copy.runtimeFlavorLabel}</p>
                    <p className="type-body-sm">{target.runtimeFlavor ?? copy.emptyValue}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="field-label">{copy.modelLabel}</p>
                    <p className="type-body-sm">{target.primaryModel ?? copy.emptyValue}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="field-label">{copy.channelsLabel}</p>
                    <p className="type-body-sm">{formatList(target.channelProviders, copy.emptyValue)}</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="field-label">{copy.displayNameLabel}</span>
                    <input
                      aria-label={`${copy.displayNameLabel} ${target.runtimeTargetRef}`}
                      className="field-input"
                      value={draft.displayName}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { displayName: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.presentationModeLabel}</span>
                    <select
                      className="field-input"
                      value={draft.presentationMode}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, {
                        presentationMode: event.target.value as RuntimeTarget['presentationMode'],
                      })}
                    >
                      <option value="headless">{copy.presentationModeLabels.headless}</option>
                      <option value="im_presented">{copy.presentationModeLabels.im_presented}</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.tagsLabel}</span>
                    <input
                      aria-label={`${copy.tagsLabel} ${target.runtimeTargetRef}`}
                      className="field-input"
                      value={draft.tags}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { tags: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.defaultRolesLabel}</span>
                    <input
                      className="field-input"
                      value={draft.defaultRoles}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { defaultRoles: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.allowedProjectsLabel}</span>
                    <input
                      aria-label={`${copy.allowedProjectsLabel} ${target.runtimeTargetRef}`}
                      className="field-input"
                      value={draft.allowedProjects}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { allowedProjects: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.presentationProviderLabel}</span>
                    <input
                      className="field-input"
                      value={draft.presentationProvider}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { presentationProvider: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="field-label">{copy.presentationIdentityLabel}</span>
                    <input
                      className="field-input"
                      value={draft.presentationIdentityRef}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { presentationIdentityRef: event.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => updateDraft(target.runtimeTargetRef, { enabled: event.target.checked })}
                    />
                    <span className="type-body-sm">{copy.enabledToggle}</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    aria-label={`${copy.saveAction} ${target.runtimeTargetRef}`}
                    onClick={() => void handleSave(target)}
                    disabled={busy}
                  >
                    {busy ? copy.savingAction : copy.saveAction}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    aria-label={`${copy.clearAction} ${target.runtimeTargetRef}`}
                    onClick={() => void handleClear(target.runtimeTargetRef)}
                    disabled={busy}
                  >
                    {copy.clearAction}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
