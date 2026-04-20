import { useEffect, useMemo, useState } from 'react';
import {
  getProjectRuntimePolicy,
  listRuntimeTargets,
  updateProjectRuntimePolicy,
} from '@/lib/api';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import { getRuntimeTargetLabel, isRuntimeTargetAllowedForProject } from '@/lib/runtimeTargetUtils';
import { useFeedbackStore } from '@/stores/feedbackStore';
import type { ProjectRuntimePolicy, RuntimeTarget } from '@/types/runtime-target';

interface ProjectRuntimePolicyPanelProps {
  projectId: string;
  roles: string[];
}

function buildEmptyPolicy(): ProjectRuntimePolicy {
  return {
    runtimeTargets: null,
    roleRuntimePolicy: {},
  };
}

export function ProjectRuntimePolicyPanel({ projectId, roles }: ProjectRuntimePolicyPanelProps) {
  const copy = useProjectDetailPageCopy();
  const { showMessage } = useFeedbackStore();
  const [runtimeTargets, setRuntimeTargets] = useState<RuntimeTarget[]>([]);
  const [runtimePolicy, setRuntimePolicy] = useState<ProjectRuntimePolicy>(buildEmptyPolicy());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [targets, policyEnvelope] = await Promise.all([
          listRuntimeTargets(),
          getProjectRuntimePolicy(projectId),
        ]);
        if (cancelled) {
          return;
        }
        setRuntimeTargets(targets);
        setRuntimePolicy(policyEnvelope.runtimePolicy);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const targetOptions = useMemo(
    () => runtimeTargets.filter((target) => isRuntimeTargetAllowedForProject(target, projectId)),
    [projectId, runtimeTargets],
  );
  const flavors = useMemo(
    () => Array.from(new Set(
      targetOptions
        .map((target) => target.runtimeFlavor)
        .filter((value): value is string => Boolean(value)),
    )).sort((left, right) => left.localeCompare(right)),
    [targetOptions],
  );
  const roleOptions = useMemo(
    () => Array.from(new Set([
      ...roles,
      ...Object.keys(runtimePolicy.roleRuntimePolicy),
    ])).sort((left, right) => left.localeCompare(right)),
    [roles, runtimePolicy.roleRuntimePolicy],
  );

  const updateRuntimeTargetMap = (
    patch: Partial<NonNullable<ProjectRuntimePolicy['runtimeTargets']>>,
  ) => {
    setRuntimePolicy((current) => ({
      ...current,
      runtimeTargets: {
        ...(current.runtimeTargets ?? {}),
        ...patch,
      },
    }));
  };

  const updateFlavorBinding = (flavor: string, targetRef: string) => {
    setRuntimePolicy((current) => {
      const currentMap = current.runtimeTargets ?? {};
      const nextFlavors = { ...(currentMap.flavors ?? {}) };
      if (targetRef) {
        nextFlavors[flavor] = targetRef;
      } else {
        delete nextFlavors[flavor];
      }
      return {
        ...current,
        runtimeTargets: {
          ...currentMap,
          flavors: nextFlavors,
        },
      };
    });
  };

  const updateRoleFlavor = (role: string, preferredFlavor: string) => {
    setRuntimePolicy((current) => ({
      ...current,
      roleRuntimePolicy: {
        ...current.roleRuntimePolicy,
        [role]: {
          preferredFlavor: preferredFlavor || null,
        },
      },
    }));
  };

  const savePolicy = async () => {
    setSaving(true);
    try {
      const saved = await updateProjectRuntimePolicy(projectId, {
        runtimeTargets: runtimePolicy.runtimeTargets
          ? {
              ...(runtimePolicy.runtimeTargets.flavors && Object.keys(runtimePolicy.runtimeTargets.flavors).length > 0
                ? { flavors: runtimePolicy.runtimeTargets.flavors }
                : {}),
              ...(runtimePolicy.runtimeTargets.default ? { default: runtimePolicy.runtimeTargets.default } : {}),
              ...(runtimePolicy.runtimeTargets.defaultCoding ? { defaultCoding: runtimePolicy.runtimeTargets.defaultCoding } : {}),
              ...(runtimePolicy.runtimeTargets.defaultReview ? { defaultReview: runtimePolicy.runtimeTargets.defaultReview } : {}),
            }
          : null,
        roleRuntimePolicy: Object.fromEntries(
          Object.entries(runtimePolicy.roleRuntimePolicy)
            .filter(([, policy]) => policy.preferredFlavor !== undefined)
            .map(([role, policy]) => [
              role,
              { preferredFlavor: policy.preferredFlavor ?? null },
            ]),
        ),
      });
      setRuntimePolicy(saved.runtimePolicy);
      showMessage(copy.runtimePolicySaveSuccessTitle, copy.runtimePolicySaveSuccessDetail(projectId), 'success');
    } catch (saveError) {
      showMessage(copy.runtimePolicySaveFailureTitle, saveError instanceof Error ? saveError.message : String(saveError), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface-panel surface-panel--workspace" data-testid="project-runtime-policy-panel">
      <div className="section-title-row">
        <div>
          <h3 className="section-title">{copy.runtimePolicyTitle}</h3>
          <p className="type-body-sm mt-2">{copy.runtimePolicySummary}</p>
        </div>
      </div>
      {loading ? <div className="inline-alert inline-alert--info mt-5">{copy.runtimePolicyLoading}</div> : null}
      {error ? <div className="inline-alert inline-alert--warning mt-5">{error}</div> : null}
      {!loading ? (
        <div className="mt-5 grid gap-6 xl:grid-cols-3">
          <div className="space-y-4">
            <h4 className="type-heading-sm">{copy.runtimePolicyDefaultsTitle}</h4>
            <label className="space-y-2">
              <span className="field-label">{copy.runtimePolicyDefaultLabel}</span>
              <select
                className="field-input"
                value={runtimePolicy.runtimeTargets?.default ?? ''}
                onChange={(event) => updateRuntimeTargetMap({ default: event.target.value || undefined })}
              >
                <option value="">{copy.runtimePolicyNoTargetOption}</option>
                {targetOptions.map((target) => (
                  <option key={`default-${target.runtimeTargetRef}`} value={target.runtimeTargetRef}>
                    {getRuntimeTargetLabel(target)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="field-label">{copy.runtimePolicyDefaultCodingLabel}</span>
              <select
                aria-label={copy.runtimePolicyDefaultCodingLabel}
                className="field-input"
                value={runtimePolicy.runtimeTargets?.defaultCoding ?? ''}
                onChange={(event) => updateRuntimeTargetMap({ defaultCoding: event.target.value || undefined })}
              >
                <option value="">{copy.runtimePolicyNoTargetOption}</option>
                {targetOptions.map((target) => (
                  <option key={`coding-${target.runtimeTargetRef}`} value={target.runtimeTargetRef}>
                    {getRuntimeTargetLabel(target)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="field-label">{copy.runtimePolicyDefaultReviewLabel}</span>
              <select
                aria-label={copy.runtimePolicyDefaultReviewLabel}
                className="field-input"
                value={runtimePolicy.runtimeTargets?.defaultReview ?? ''}
                onChange={(event) => updateRuntimeTargetMap({ defaultReview: event.target.value || undefined })}
              >
                <option value="">{copy.runtimePolicyNoTargetOption}</option>
                {targetOptions.map((target) => (
                  <option key={`review-${target.runtimeTargetRef}`} value={target.runtimeTargetRef}>
                    {getRuntimeTargetLabel(target)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-4">
            <h4 className="type-heading-sm">{copy.runtimePolicyFlavorBindingsTitle}</h4>
            {flavors.length === 0 ? <p className="type-body-sm">{copy.runtimePolicyEmpty}</p> : flavors.map((flavor) => (
              <label key={`flavor-${flavor}`} className="space-y-2">
                <span className="field-label">{copy.runtimePolicyFlavorLabel(flavor)}</span>
                <select
                  aria-label={copy.runtimePolicyFlavorLabel(flavor)}
                  className="field-input"
                  value={runtimePolicy.runtimeTargets?.flavors?.[flavor] ?? ''}
                  onChange={(event) => updateFlavorBinding(flavor, event.target.value)}
                >
                  <option value="">{copy.runtimePolicyNoTargetOption}</option>
                  {targetOptions
                    .filter((target) => target.runtimeFlavor === flavor)
                    .map((target) => (
                      <option key={`${flavor}-${target.runtimeTargetRef}`} value={target.runtimeTargetRef}>
                        {getRuntimeTargetLabel(target)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>

          <div className="space-y-4">
            <h4 className="type-heading-sm">{copy.runtimePolicyRolePolicyTitle}</h4>
            {roleOptions.length === 0 ? <p className="type-body-sm">{copy.runtimePolicyEmpty}</p> : roleOptions.map((role) => (
              <label key={`role-${role}`} className="space-y-2">
                <span className="field-label">{copy.runtimePolicyRoleFlavorLabel(role)}</span>
                <select
                  aria-label={copy.runtimePolicyRoleFlavorLabel(role)}
                  className="field-input"
                  value={runtimePolicy.roleRuntimePolicy[role]?.preferredFlavor ?? ''}
                  onChange={(event) => updateRoleFlavor(role, event.target.value)}
                >
                  <option value="">{copy.runtimePolicyNoFlavorOption}</option>
                  {flavors.map((flavor) => (
                    <option key={`${role}-${flavor}`} value={flavor}>{flavor}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="button-secondary" onClick={() => void savePolicy()} disabled={saving}>
          {saving ? copy.runtimePolicySavingAction : copy.runtimePolicySaveAction}
        </button>
      </div>
    </section>
  );
}
