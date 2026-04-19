import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import * as api from '@/lib/api';
import { useProjectBrainPageCopy } from '@/lib/dashboardCopy';
import { mapProjectContextDeliveryDto } from '@/lib/projectContextMappers';
import {
  buildProjectBrainSourceContextHref,
  summarizeProjectBrainContent,
  type ProjectBrainSourceContext,
} from '@/lib/projectBrainContext';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import { useProjectStore } from '@/stores/projectStore';
import type { ProjectContextDelivery } from '@/types/projectContext';

type BrainFilter = 'all' | 'core' | 'knowledge' | 'recaps' | 'citizens';
type BrainItem =
  | {
    key: string;
    label: string;
    kind: 'core';
    searchText: string;
    detail: { title: string; path: string; content: string; sourceTaskIds: string[] };
  }
  | {
    key: string;
    label: string;
    kind: 'recap';
    searchText: string;
    detail: { title: string; path: string; content: string; taskId: string };
  }
  | {
    key: string;
    label: string;
    kind: 'knowledge';
    searchText: string;
    detail: { title: string; path: string; content: string; sourceTaskIds: string[] };
  }
  | {
    key: string;
    label: string;
    kind: 'citizen';
    searchText: string;
    detail: {
      title: string;
      citizenId: string;
      roleId: string;
      persona: string | null;
      boundaries: string[];
      skillsRef: string[];
      channelPolicies: Record<string, unknown>;
      runtimeAdapter: string;
      runtimeMetadata: Record<string, unknown>;
    };
  };

function renderJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function buildBrainTaskHref(context: ProjectBrainSourceContext) {
  return buildProjectBrainSourceContextHref(context);
}

function pickDefaultTaskId(taskIds: Array<{ id: string; state: string }>) {
  return taskIds.find((task) => ['active', 'in_progress', 'gate_waiting', 'paused', 'blocked'].includes(task.state))?.id
    ?? taskIds[0]?.id
    ?? '';
}

export function ProjectBrainPage() {
  const copy = useProjectBrainPageCopy();
  const { projectId } = useParams<{ projectId: string }>();
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const error = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);
  const [filter, setFilter] = useState<BrainFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<{ projectId: string | null; key: string | null }>({
    projectId: null,
    key: null,
  });
  const [audience, setAudience] = useState<'controller' | 'citizen' | 'craftsman'>('controller');
  const [contextTaskId, setContextTaskId] = useState('');
  const [deliveryState, setDeliveryState] = useState<{
    loading: boolean;
    error: string | null;
    delivery: ProjectContextDelivery | null;
  }>({
    loading: false,
    error: null,
    delivery: null,
  });
  const [deliveryRefreshNonce, setDeliveryRefreshNonce] = useState(0);

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

  const workTasks = selectedProject?.work.tasks ?? [];

  useEffect(() => {
    const nextTaskId = pickDefaultTaskId(workTasks);
    setContextTaskId((current) => {
      if (current && workTasks.some((task) => task.id === current)) {
        return current;
      }
      return nextTaskId;
    });
  }, [workTasks]);

  useEffect(() => {
    if (!selectedProject || !projectId) {
      return;
    }
    let active = true;
    setDeliveryState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    void api.getProjectContextDelivery(projectId, {
      audience,
      ...(contextTaskId ? { task_id: contextTaskId } : {}),
    })
      .then((response) => {
        if (!active) {
          return;
        }
        setDeliveryState({
          loading: false,
          error: null,
          delivery: mapProjectContextDeliveryDto(response),
        });
      })
      .catch((deliveryError) => {
        if (!active) {
          return;
        }
        setDeliveryState({
          loading: false,
          error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
          delivery: null,
        });
      });
    return () => {
      active = false;
    };
  }, [audience, contextTaskId, deliveryRefreshNonce, projectId, selectedProject]);

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

  const { project, surfaces, work, operator } = selectedProject;
  const brainItems: BrainItem[] = [];
  if (surfaces.index) {
    brainItems.push({
        key: 'index',
        label: surfaces.index.title ?? copy.indexFallbackTitle,
        kind: 'core' as const,
        searchText: `${surfaces.index.title ?? ''} ${surfaces.index.content}`,
        detail: {
          title: surfaces.index.title ?? copy.indexFallbackTitle,
          path: surfaces.index.path,
          content: surfaces.index.content,
          sourceTaskIds: [],
        },
      });
  }
  if (surfaces.timeline) {
    brainItems.push({
        key: 'timeline',
        label: surfaces.timeline.title ?? copy.timelineFallbackTitle,
        kind: 'core' as const,
        searchText: `${surfaces.timeline.title ?? ''} ${surfaces.timeline.content}`,
        detail: {
          title: surfaces.timeline.title ?? copy.timelineFallbackTitle,
          path: surfaces.timeline.path,
          content: surfaces.timeline.content,
          sourceTaskIds: surfaces.timeline.sourceTaskIds,
        },
      });
  }
  brainItems.push(
    ...work.recaps.map((recap) => ({
      key: `recap:${recap.taskId}`,
      label: recap.title ?? recap.taskId,
      kind: 'recap' as const,
      searchText: `${recap.taskId} ${recap.title ?? ''} ${recap.content}`,
      detail: {
        title: recap.title ?? recap.taskId,
        path: recap.summaryPath,
        content: recap.content,
        taskId: recap.taskId,
      },
    })),
    ...work.knowledge.map((doc) => ({
      key: `knowledge:${doc.kind}:${doc.slug}`,
      label: doc.title ?? doc.slug,
      kind: 'knowledge' as const,
      searchText: `${doc.slug} ${doc.title ?? ''} ${doc.content} ${doc.sourceTaskIds.join(' ')}`,
      detail: {
        title: doc.title ?? doc.slug,
        path: doc.path,
        content: doc.content,
        sourceTaskIds: doc.sourceTaskIds,
      },
    })),
    ...operator.citizens.map((citizen) => ({
      key: `citizen:${citizen.citizenId}`,
      label: citizen.displayName,
      kind: 'citizen' as const,
      searchText: `${citizen.citizenId} ${citizen.displayName} ${citizen.roleId} ${citizen.persona ?? ''}`,
      detail: {
        title: citizen.displayName,
        citizenId: citizen.citizenId,
        roleId: citizen.roleId,
        persona: citizen.persona,
        boundaries: citizen.boundaries,
        skillsRef: citizen.skillsRef,
        channelPolicies: citizen.channelPolicies,
        runtimeAdapter: citizen.runtimeAdapter,
        runtimeMetadata: citizen.runtimeMetadata,
      },
    })),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = brainItems.filter((item) => {
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'recaps'
        ? item.kind === 'recap'
        : filter === 'citizens'
          ? item.kind === 'citizen'
          : item.kind === filter;
    if (!matchesFilter) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return item.searchText.toLowerCase().includes(normalizedSearch);
  });
  const selectedKey = selectedState.projectId === (projectId ?? null) ? selectedState.key : null;
  const selectedItem = visibleItems.find((item) => item.key === selectedKey)
    ?? brainItems.find((item) => item.key === selectedKey)
    ?? null;
  const selectedItemTaskHref = selectedItem
    ? 'citizenId' in selectedItem.detail
      ? buildBrainTaskHref({
          kind: 'citizen',
          projectId,
          title: selectedItem.detail.title,
          sourceRef: `citizens/${selectedItem.detail.citizenId}`,
          sourceTaskIds: [],
          snippet: [selectedItem.detail.persona ?? '', ...selectedItem.detail.boundaries].filter(Boolean).join(' '),
        })
      : 'taskId' in selectedItem.detail
        ? buildBrainTaskHref({
            kind: 'recap',
            projectId,
            title: selectedItem.detail.title,
            sourceRef: `recaps/${selectedItem.detail.taskId}`,
            sourceTaskIds: [selectedItem.detail.taskId],
            snippet: summarizeProjectBrainContent(selectedItem.detail.content, selectedItem.detail.title),
          })
        : buildBrainTaskHref({
            kind: 'knowledge',
            projectId,
            title: selectedItem.detail.title,
            sourceRef: selectedItem.detail.path,
            sourceTaskIds: selectedItem.detail.sourceTaskIds,
            snippet: summarizeProjectBrainContent(selectedItem.detail.content, selectedItem.detail.title),
          })
    : null;

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{project.name}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}`}>{copy.backToProjectDetailAction}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <h3 className="section-title">{copy.deliveryTitle}</h3>
            <p className="type-body-sm mt-2">{copy.deliverySummary}</p>
          </div>
          <button type="button" className="button-secondary" onClick={() => setDeliveryRefreshNonce((value) => value + 1)}>
            {copy.refreshAction}
          </button>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="field-label">{copy.audienceLabel}</span>
              <div className="flex flex-wrap gap-2">
                {(['controller', 'citizen', 'craftsman'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={audience === value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                    onClick={() => setAudience(value)}
                  >
                    {copy.audienceOptions[value]}
                  </button>
                ))}
              </div>
            </div>
            <label className="space-y-2">
              <span className="field-label">{copy.taskLabel}</span>
              <select
                value={contextTaskId}
                onChange={(event) => setContextTaskId(event.target.value)}
                className="input"
              >
                <option value="">{copy.taskOptionProjectWide}</option>
                {work.tasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="surface-panel surface-panel--workspace">
            {deliveryState.loading ? (
              <p className="type-body-sm">{copy.deliveryLoadingTitle}</p>
            ) : deliveryState.error ? (
              <div className="empty-state">
                <p className="type-heading-sm">{copy.deliveryErrorTitle}</p>
                <p className="type-body-sm mt-2">{deliveryState.error}</p>
              </div>
            ) : deliveryState.delivery ? (
              <div className="space-y-4">
                <section className="sheet-section">
                  <h4 className="section-title">{copy.briefingTitle}</h4>
                  <pre className="type-text-xs mt-4 whitespace-pre-wrap">{deliveryState.delivery.briefing.markdown}</pre>
                </section>
                <section className="sheet-section">
                  <h4 className="section-title">{copy.referenceBundleTitle}</h4>
                  {deliveryState.delivery.referenceBundle ? (
                    <div className="space-y-2 mt-4">
                      <p className="type-body-sm">{copy.referenceCountLabel(deliveryState.delivery.referenceBundle.references.length)}</p>
                      {deliveryState.delivery.referenceBundle.references.slice(0, 6).map((reference) => (
                        <p key={reference.referenceKey} className="type-text-xs break-all">
                          {reference.referenceKey}
                          {' | '}
                          {reference.path}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="type-body-sm mt-4">{copy.referenceBundleEmpty}</p>
                  )}
                </section>
                <section className="sheet-section">
                  <h4 className="section-title">{copy.attentionRoutingTitle}</h4>
                  {deliveryState.delivery.attentionRoutingPlan ? (
                    <div className="space-y-2 mt-4">
                      <p className="type-body-sm">{deliveryState.delivery.attentionRoutingPlan.summary}</p>
                      {deliveryState.delivery.attentionRoutingPlan.routes.length > 0 ? (
                        deliveryState.delivery.attentionRoutingPlan.routes.map((route) => (
                          <p key={`${route.ordinal}-${route.referenceKey}`} className="type-text-xs">
                            {route.ordinal}
                            {'. '}
                            {route.referenceKey}
                            {' — '}
                            {route.rationale}
                          </p>
                        ))
                      ) : (
                        <p className="type-body-sm">{copy.attentionRoutesEmpty}</p>
                      )}
                    </div>
                  ) : (
                    <p className="type-body-sm mt-4">{copy.attentionRoutingEmpty}</p>
                  )}
                </section>
                <section className="sheet-section">
                  <h4 className="section-title">{copy.runtimeDeliveryTitle}</h4>
                  {deliveryState.delivery.runtimeDelivery ? (
                    <div className="space-y-2 mt-4">
                      <p className="type-body-sm">{deliveryState.delivery.runtimeDelivery.taskTitle}</p>
                      <p className="type-text-xs break-all">
                        {copy.workspacePathLabel}
                        {': '}
                        {deliveryState.delivery.runtimeDelivery.workspacePath}
                      </p>
                      <p className="type-text-xs break-all">
                        {copy.manifestPathLabel}
                        {': '}
                        {deliveryState.delivery.runtimeDelivery.manifestPath}
                      </p>
                      <div className="space-y-1">
                        <p className="type-label-sm">{copy.artifactPathsTitle}</p>
                        {Object.entries(deliveryState.delivery.runtimeDelivery.artifactPaths).map(([key, value]) => (
                          <p key={key} className="type-text-xs break-all">
                            {copy.audienceOptions[key as keyof typeof copy.audienceOptions]}
                            {': '}
                            {value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="type-body-sm mt-4">{copy.runtimeDeliveryEmpty}</p>
                  )}
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <h3 className="section-title">{copy.surfaceTitle}</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={filter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setFilter('all')}>{copy.filters.all}</button>
            <button type="button" className={filter === 'core' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setFilter('core')}>{copy.filters.core}</button>
            <button type="button" className={filter === 'knowledge' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setFilter('knowledge')}>{copy.filters.knowledge}</button>
            <button type="button" className={filter === 'recaps' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setFilter('recaps')}>{copy.filters.recaps}</button>
            <button type="button" className={filter === 'citizens' ? 'choice-pill choice-pill--active' : 'choice-pill'} onClick={() => setFilter('citizens')}>{copy.filters.citizens}</button>
          </div>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="field-label">{copy.searchLabel}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input"
                placeholder={copy.searchPlaceholder}
              />
            </label>
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={selectedKey === item.key ? 'selection-card selection-card--active w-full text-left' : 'selection-card w-full text-left'}
                  aria-label={copy.openBrainItemAria(item.label)}
                  onClick={() => setSelectedState({ projectId: projectId ?? null, key: item.key })}
                >
                  <p className="type-heading-sm">{item.label}</p>
                  <p className="type-text-xs mt-2">{copy.kindLabels[item.kind]}</p>
                </button>
              ))}
              {visibleItems.length === 0 ? <p className="type-body-sm">{copy.emptyListTitle}</p> : null}
            </div>
          </div>
          <div className="surface-panel surface-panel--workspace">
            {selectedItem ? (
              <>
                <div className="sheet-summary">
                  <p className="type-label-sm">{copy.kindLabels[selectedItem.kind]}</p>
                  <h3 className="section-title mt-3">{selectedItem.detail.title}</h3>
                  {'path' in selectedItem.detail ? (
                    <p className="type-body-sm mt-3 break-all">{selectedItem.detail.path}</p>
                  ) : null}
                </div>
                {'sourceTaskIds' in selectedItem.detail ? (
                  <section className="sheet-section">
                    <h4 className="section-title">{copy.sourceTasksTitle}</h4>
                    {selectedItem.detail.sourceTaskIds.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedItem.detail.sourceTaskIds.map((taskId) => (
                          <Link key={taskId} className="button-secondary" to={buildProjectTaskHref(taskId, projectId)}>
                            {copy.openSourceTaskAction(taskId)}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="type-body-sm mt-4">{copy.noSourceTasks}</p>
                    )}
                  </section>
                ) : null}
                {'taskId' in selectedItem.detail ? (
                  <section className="sheet-section">
                    <h4 className="section-title">{copy.actionBridgeTitle}</h4>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link className="button-secondary" to={buildProjectTaskHref(selectedItem.detail.taskId, projectId)}>
                        {copy.openSourceTaskAction(selectedItem.detail.taskId)}
                      </Link>
                      {selectedItemTaskHref ? (
                        <Link className="button-secondary" to={selectedItemTaskHref}>
                          {copy.createTaskInProjectAction}
                        </Link>
                      ) : null}
                    </div>
                  </section>
                ) : null}
                {'citizenId' in selectedItem.detail ? (
                  <>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.citizenIdentityTitle}</h4>
                      <p className="type-body-sm mt-4">
                        {selectedItem.detail.citizenId}
                        {' / '}
                        {selectedItem.detail.roleId}
                        {' / '}
                        {selectedItem.detail.runtimeAdapter}
                      </p>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.personaTitle}</h4>
                      <p className="type-body-sm mt-4">{selectedItem.detail.persona ?? copy.noPersona}</p>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.boundariesTitle}</h4>
                      <p className="type-body-sm mt-4">{selectedItem.detail.boundaries.join(' / ') || copy.noBoundaries}</p>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.skillsTitle}</h4>
                      <p className="type-body-sm mt-4">{selectedItem.detail.skillsRef.join(', ') || copy.noSkills}</p>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.channelPoliciesTitle}</h4>
                      <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(selectedItem.detail.channelPolicies)}</pre>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.runtimeMetadataTitle}</h4>
                      <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(selectedItem.detail.runtimeMetadata)}</pre>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.actionBridgeTitle}</h4>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedItemTaskHref ? (
                          <Link className="button-secondary" to={selectedItemTaskHref}>
                            {copy.createTaskInProjectAction}
                          </Link>
                        ) : null}
                      </div>
                    </section>
                  </>
                ) : (
                  <>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.contentTitle}</h4>
                      <p className="type-body-sm mt-4 whitespace-pre-wrap">{selectedItem.detail.content}</p>
                    </section>
                    <section className="sheet-section">
                      <h4 className="section-title">{copy.actionBridgeTitle}</h4>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedItemTaskHref ? (
                          <Link className="button-secondary" to={selectedItemTaskHref}>
                            {copy.createTaskInProjectAction}
                          </Link>
                        ) : null}
                        <Link className="button-secondary" to={`/todos?project=${projectId}`}>
                          {copy.createTodoInProjectAction}
                        </Link>
                      </div>
                    </section>
                  </>
                )}
              </>
            ) : (
              <div className="empty-state">
                <p className="type-heading-sm">{copy.detailEmptyTitle}</p>
                <p className="type-body-sm mt-2">{copy.detailEmptySummary}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
