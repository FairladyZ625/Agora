import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useProjectBrainPageCopy } from '@/lib/dashboardCopy';
import {
  buildProjectBrainSourceContextHref,
  summarizeProjectBrainContent,
  type ProjectBrainSourceContext,
} from '@/lib/projectBrainContext';
import { buildProjectTaskHref } from '@/lib/projectTaskRoutes';
import { useProjectStore } from '@/stores/projectStore';

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

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

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
