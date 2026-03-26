import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import * as api from '@/lib/api';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import {
  mapProjectNomosActivationDto,
  mapProjectNomosDiffDto,
  mapProjectNomosReviewDto,
  mapProjectNomosValidationDto,
} from '@/lib/projectMappers';
import { useProjectStore } from '@/stores/projectStore';
import { useTodoStore } from '@/stores/todoStore';
import type {
  ProjectCitizen,
  ProjectKnowledgeDoc,
  ProjectNomosActivation,
  ProjectNomosDiff,
  ProjectNomosReview,
  ProjectNomosValidation,
  ProjectRecap,
} from '@/types/project';

type ProjectDetailSelection =
  | { kind: 'recap'; item: ProjectRecap }
  | { kind: 'knowledge'; item: ProjectKnowledgeDoc }
  | { kind: 'citizen'; item: ProjectCitizen };

const ACTIVE_TASK_STATES = ['active', 'in_progress', 'gate_waiting', 'paused', 'blocked'];

function summarizeDocument(content: string, fallback: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '---' && !line.startsWith('title:') && !line.startsWith('updated_at:'));
  return lines.find((line) => !line.startsWith('#')) ?? lines[0] ?? fallback;
}

function renderJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

export function ProjectDetailPage() {
  const copy = useProjectDetailPageCopy();
  const { projectId } = useParams<{ projectId: string }>();
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const error = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);
  const updateTodo = useTodoStore((state) => state.updateTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const promoteTodo = useTodoStore((state) => state.promoteTodo);
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'review'>('all');
  const [todoFilter, setTodoFilter] = useState<'all' | 'pending'>('all');
  const [detailState, setDetailState] = useState<{
    projectId: string | null;
    selection: ProjectDetailSelection | null;
  }>({
    projectId: null,
    selection: null,
  });
  const [nomosActionPending, setNomosActionPending] = useState(false);
  const [nomosActionMessage, setNomosActionMessage] = useState<string | null>(null);
  const [exportDir, setExportDir] = useState('');
  const [packDir, setPackDir] = useState('');
  const [sourceDir, setSourceDir] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [publishNote, setPublishNote] = useState('');
  const [catalogPackId, setCatalogPackId] = useState('');
  const [doctorReport, setDoctorReport] = useState<Awaited<ReturnType<typeof api.runProjectNomosDoctor>> | null>(null);
  const [reviewReport, setReviewReport] = useState<ProjectNomosReview | null>(null);
  const [activationReport, setActivationReport] = useState<ProjectNomosActivation | null>(null);
  const [validationReport, setValidationReport] = useState<ProjectNomosValidation | null>(null);
  const [diffReport, setDiffReport] = useState<ProjectNomosDiff | null>(null);
  const [catalogList, setCatalogList] = useState<Awaited<ReturnType<typeof api.listPublishedNomosCatalog>> | null>(null);
  const [catalogEntry, setCatalogEntry] = useState<Awaited<ReturnType<typeof api.showPublishedNomosCatalog>> | null>(null);
  const [importedSource, setImportedSource] = useState<Awaited<ReturnType<typeof api.importNomosSource>> | null>(null);
  const [registeredSourceList, setRegisteredSourceList] = useState<Awaited<ReturnType<typeof api.listRegisteredNomosSources>> | null>(null);
  const [registeredSourceEntry, setRegisteredSourceEntry] = useState<Awaited<ReturnType<typeof api.showRegisteredNomosSource>> | null>(null);
  const [registeredSourceSync, setRegisteredSourceSync] = useState<Awaited<ReturnType<typeof api.syncRegisteredNomosSource>> | null>(null);

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

  const { project, recaps, knowledge, citizens } = selectedProject;
  const activeTasks = selectedProject.tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state)).length;
  const waitingReviewTasks = selectedProject.tasks.filter((task) => task.state === 'gate_waiting').length;
  const pendingTodos = selectedProject.todos.filter((todo) => todo.status === 'pending').length;
  const visibleTasks = taskFilter === 'review'
    ? selectedProject.tasks.filter((task) => task.state === 'gate_waiting')
    : taskFilter === 'active'
      ? selectedProject.tasks.filter((task) => ACTIVE_TASK_STATES.includes(task.state))
      : selectedProject.tasks;
  const visibleTodos = todoFilter === 'pending'
    ? selectedProject.todos.filter((todo) => todo.status === 'pending')
    : selectedProject.todos;
  const detailSelection = detailState.projectId === (projectId ?? null) ? detailState.selection : null;
  const nomos = selectedProject.nomos;

  const runNomosAction = async (
    mode: 'reinstall' | 'bootstrap' | 'doctor' | 'review' | 'activate' | 'validate' | 'diff' | 'export' | 'install-pack' | 'publish' | 'catalog-list' | 'catalog-show' | 'install-catalog' | 'import-source' | 'install-source' | 'register-source' | 'sources-list' | 'source-show' | 'sync-source' | 'install-registered-source',
  ) => {
    if (!projectId) {
      return;
    }
    setNomosActionPending(true);
    setNomosActionMessage(null);
    try {
      if (mode === 'doctor') {
        const report = await api.runProjectNomosDoctor(projectId);
        setDoctorReport(report);
        setNomosActionMessage(copy.nomosDoctorSuccess);
      } else if (mode === 'review') {
        const report = await api.reviewProjectNomos(projectId);
        setReviewReport(mapProjectNomosReviewDto(report));
        setNomosActionMessage(copy.nomosReviewSuccess);
      } else if (mode === 'activate') {
        const report = await api.activateProjectNomos(projectId, selectedProject.project.owner ?? 'archon');
        setActivationReport(mapProjectNomosActivationDto(report));
        await selectProject(projectId);
        setNomosActionMessage(copy.nomosActivateSuccess);
      } else if (mode === 'validate') {
        const report = await api.validateProjectNomos(projectId, 'draft');
        setValidationReport(mapProjectNomosValidationDto(report));
        setNomosActionMessage(copy.nomosValidateSuccess);
      } else if (mode === 'diff') {
        const report = await api.diffProjectNomos(projectId, {
          base: selectedProject.nomos?.activationStatus === 'active_project' ? 'active' : 'builtin',
          candidate: 'draft',
        });
        setDiffReport(mapProjectNomosDiffDto(report));
        setNomosActionMessage(copy.nomosDiffSuccess);
      } else if (mode === 'export') {
        const result = await api.exportProjectNomos(projectId, exportDir, 'draft');
        setNomosActionMessage(`${copy.nomosExportSuccess} ${result.output_dir}`);
      } else if (mode === 'publish') {
        const result = await api.publishProjectNomosToCatalog(projectId, {
          target: 'draft',
          published_by: selectedProject.project.owner ?? 'archon',
          ...(publishNote.trim().length > 0 ? { published_note: publishNote.trim() } : {}),
        });
        setCatalogPackId(result.entry.pack_id);
        setCatalogEntry(result.entry);
        setNomosActionMessage(`${copy.nomosPublishSuccess} ${result.entry.pack_id}`);
      } else if (mode === 'catalog-list') {
        const result = await api.listPublishedNomosCatalog();
        setCatalogList(result);
        setNomosActionMessage(copy.refreshCatalogAction);
      } else if (mode === 'catalog-show') {
        const result = await api.showPublishedNomosCatalog(catalogPackId);
        setCatalogEntry(result);
        setNomosActionMessage(copy.showCatalogEntryAction);
      } else if (mode === 'install-catalog') {
        const result = await api.installCatalogNomosPack(projectId, catalogPackId);
        await selectProject(projectId);
        setNomosActionMessage(`${copy.nomosInstallCatalogSuccess} ${result.installed_root}`);
      } else if (mode === 'import-source') {
        const result = await api.importNomosSource(sourceDir);
        setImportedSource(result);
        setCatalogEntry(result.entry);
        setCatalogPackId(result.entry.pack_id);
        setNomosActionMessage(`${copy.nomosImportSourceSuccess} ${result.entry.pack_id}`);
      } else if (mode === 'register-source') {
        const result = await api.registerNomosSource(sourceId, sourceDir);
        setRegisteredSourceEntry(result);
        setSourceId(result.source_id);
        setNomosActionMessage(`${copy.nomosRegisterSourceSuccess} ${result.source_id}`);
      } else if (mode === 'sources-list') {
        const result = await api.listRegisteredNomosSources();
        setRegisteredSourceList(result);
        setNomosActionMessage(copy.refreshSourcesAction);
      } else if (mode === 'source-show') {
        const result = await api.showRegisteredNomosSource(sourceId);
        setRegisteredSourceEntry(result);
        setNomosActionMessage(copy.showSourceEntryAction);
      } else if (mode === 'sync-source') {
        const result = await api.syncRegisteredNomosSource(sourceId);
        setRegisteredSourceSync(result);
        setRegisteredSourceEntry(result.source);
        setCatalogEntry(result.imported.entry);
        setCatalogPackId(result.imported.entry.pack_id);
        setNomosActionMessage(`${copy.nomosSyncSourceSuccess} ${result.source.source_id}`);
      } else if (mode === 'install-registered-source') {
        const result = await api.installProjectNomosFromRegisteredSource(projectId, sourceId);
        await selectProject(projectId);
        setRegisteredSourceEntry(result.source);
        setRegisteredSourceSync({
          source: result.source,
          imported: result.imported,
        });
        setCatalogEntry(result.catalog_entry);
        setCatalogPackId(result.catalog_entry.pack_id);
        setNomosActionMessage(`${copy.nomosInstallRegisteredSourceSuccess} ${result.installed_root}`);
      } else if (mode === 'install-source') {
        const result = await api.installProjectNomosFromSource(projectId, sourceDir);
        await selectProject(projectId);
        setImportedSource(result.imported);
        setCatalogEntry(result.imported.entry);
        setCatalogPackId(result.imported.entry.pack_id);
        setNomosActionMessage(`${copy.nomosInstallSourceSuccess} ${result.installed_root}`);
      } else if (mode === 'install-pack') {
        const result = await api.installProjectNomosPack(projectId, packDir);
        await selectProject(projectId);
        setNomosActionMessage(`${copy.nomosInstallPackSuccess} ${result.installed_root}`);
      } else {
        await api.installProjectNomos(projectId, {
          skip_bootstrap_task: mode === 'reinstall',
        });
        await selectProject(projectId);
        setNomosActionMessage(mode === 'reinstall' ? copy.nomosReinstallSuccess : copy.nomosBootstrapSuccess);
      }
    } catch (error) {
      setNomosActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setNomosActionPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{project.name}</h2>
            <p className="page-summary">{project.summary ?? copy.emptySummary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}/brain`}>{copy.openBrainAction}</Link>
            </div>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.knowledge}</span>
              <span className="inline-stat__value">{knowledge.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.citizens}</span>
              <span className="inline-stat__value">{citizens.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.recaps}</span>
              <span className="inline-stat__value">{recaps.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.activeTasks}</span>
              <span className="inline-stat__value">{activeTasks}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.waitingReview}</span>
              <span className="inline-stat__value">{waitingReviewTasks}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stats.pendingTodos}</span>
              <span className="inline-stat__value">{pendingTodos}</span>
            </div>
          </div>
        </div>
      </section>

      {nomos ? (
        <section className="surface-panel surface-panel--workspace" data-testid="project-nomos-panel">
          <div className="section-title-row">
            <h3 className="section-title">{copy.nomosTitle}</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('review')}
              >
                {copy.reviewNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('activate')}
              >
                {copy.activateNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('validate')}
              >
                {copy.validateNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('diff')}
              >
                {copy.diffNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('export')}
              >
                {copy.exportNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('publish')}
              >
                {copy.publishNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('import-source')}
              >
                {copy.importSourceAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('install-source')}
              >
                {copy.installFromSourceAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('install-pack')}
              >
                {copy.installPackAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('catalog-list')}
              >
                {copy.refreshCatalogAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending || !catalogPackId}
                onClick={() => void runNomosAction('catalog-show')}
              >
                {copy.showCatalogEntryAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending || !catalogPackId}
                onClick={() => void runNomosAction('install-catalog')}
              >
                {copy.installCatalogPackAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('register-source')}
              >
                {copy.registerSourceAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('sources-list')}
              >
                {copy.refreshSourcesAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending || !sourceId}
                onClick={() => void runNomosAction('source-show')}
              >
                {copy.showSourceEntryAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending || !sourceId}
                onClick={() => void runNomosAction('sync-source')}
              >
                {copy.syncRegisteredSourceAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending || !sourceId}
                onClick={() => void runNomosAction('install-registered-source')}
              >
                {copy.installRegisteredSourceAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('reinstall')}
              >
                {copy.reinstallNomosAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('bootstrap')}
              >
                {copy.rerunBootstrapAction}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={nomosActionPending}
                onClick={() => void runNomosAction('doctor')}
              >
                {copy.runDoctorAction}
              </button>
            </div>
          </div>
          {nomosActionPending ? <div className="inline-alert mt-4">{copy.nomosActionPending}</div> : null}
          {nomosActionMessage ? <div className="inline-alert mt-4">{nomosActionMessage}</div> : null}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="field-label">{copy.nomosIdLabel}</p>
              <p className="type-body-sm break-all">{nomos.nomosId}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.activationStatusLabel}</p>
              <p className="type-body-sm">{nomos.activationStatus}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.repoPathLabel}</p>
              <p className="type-body-sm break-all">{nomos.repoPath ?? copy.emptySummary}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.projectStateRootLabel}</p>
              <p className="type-body-sm break-all">{nomos.projectStateRoot}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.bootstrapPromptsLabel}</p>
              <p className="type-body-sm break-all">{nomos.bootstrapPromptsDir}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.repoShimInstalledLabel}</p>
              <p className="type-body-sm">{nomos.repoShimInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.profileInstalledLabel}</p>
              <p className="type-body-sm">{nomos.profileInstalled ? copy.yesLabel : copy.noLabel}</p>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <p className="field-label">{copy.lifecycleModulesLabel}</p>
              <p className="type-body-sm">{nomos.lifecycleModules.join(', ')}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.draftRootLabel}</p>
              <p className="type-body-sm break-all">{nomos.draftRoot}</p>
            </div>
            <div className="space-y-2">
              <p className="field-label">{copy.activeRootLabel}</p>
              <p className="type-body-sm break-all">{nomos.activeRoot}</p>
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="nomos-export-dir">{copy.exportDirLabel}</label>
              <input
                id="nomos-export-dir"
                className="input-shell"
                value={exportDir}
                onChange={(event) => setExportDir(event.target.value)}
                placeholder={copy.exportDirPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="nomos-pack-dir">{copy.packDirLabel}</label>
              <input
                id="nomos-pack-dir"
                className="input-shell"
                value={packDir}
                onChange={(event) => setPackDir(event.target.value)}
                placeholder={copy.packDirPlaceholder}
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="field-label" htmlFor="nomos-source-dir">{copy.sourceDirLabel}</label>
              <input
                id="nomos-source-dir"
                className="input-shell"
                value={sourceDir}
                onChange={(event) => setSourceDir(event.target.value)}
                placeholder={copy.sourceDirPlaceholder}
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="field-label" htmlFor="nomos-source-id">{copy.sourceIdLabel}</label>
              <input
                id="nomos-source-id"
                className="input-shell"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                placeholder="shared/acme-web"
              />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="nomos-publish-note">{copy.publishNoteLabel}</label>
              <input
                id="nomos-publish-note"
                className="input-shell"
                value={publishNote}
                onChange={(event) => setPublishNote(event.target.value)}
                placeholder={copy.publishNotePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <label className="field-label" htmlFor="nomos-catalog-pack-id">{copy.catalogPackIdLabel}</label>
              <input
                id="nomos-catalog-pack-id"
                className="input-shell"
                value={catalogPackId}
                onChange={(event) => setCatalogPackId(event.target.value)}
                placeholder={copy.catalogPackIdPlaceholder}
              />
            </div>
          </div>
          {reviewReport ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="project-nomos-review">
              <div className="space-y-2">
                <p className="field-label">{copy.reviewTitle}</p>
                <p className="type-body-sm">{reviewReport.projectId}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.reviewCanActivateLabel}</p>
                <p className="type-body-sm">{reviewReport.canActivate ? copy.yesLabel : copy.noLabel}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.reviewActivePackLabel}</p>
                <p className="type-body-sm break-all">{reviewReport.active.packId}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.reviewDraftPackLabel}</p>
                <p className="type-body-sm break-all">{reviewReport.draft?.packId ?? copy.noneLabel}</p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <p className="field-label">{copy.reviewIssuesLabel}</p>
                <p className="type-body-sm">{reviewReport.issues.length > 0 ? reviewReport.issues.join(' | ') : copy.noneLabel}</p>
              </div>
            </div>
          ) : null}
          {activationReport ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="project-nomos-activation">
              <div className="space-y-2">
                <p className="field-label">{copy.activationStatusLabel}</p>
                <p className="type-body-sm">{activationReport.activationStatus}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.nomosIdLabel}</p>
                <p className="type-body-sm break-all">{activationReport.nomosId}</p>
              </div>
            </div>
          ) : null}
          {validationReport ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="project-nomos-validation">
              <div className="space-y-2">
                <p className="field-label">{copy.validationTitle}</p>
                <p className="type-body-sm">{validationReport.projectId}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.validationTargetLabel}</p>
                <p className="type-body-sm">{validationReport.target}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.validationValidLabel}</p>
                <p className="type-body-sm">{validationReport.valid ? copy.yesLabel : copy.noLabel}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.reviewDraftPackLabel}</p>
                <p className="type-body-sm break-all">{validationReport.pack?.packId ?? copy.noneLabel}</p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <p className="field-label">{copy.validationIssuesLabel}</p>
                <p className="type-body-sm">
                  {validationReport.issues.length > 0
                    ? validationReport.issues.map((issue) => issue.message).join(' | ')
                    : copy.noneLabel}
                </p>
              </div>
            </div>
          ) : null}
          {diffReport ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="project-nomos-diff">
              <div className="space-y-2">
                <p className="field-label">{copy.diffTitle}</p>
                <p className="type-body-sm">{diffReport.projectId}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.diffChangedLabel}</p>
                <p className="type-body-sm">{diffReport.changed ? copy.yesLabel : copy.noLabel}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.diffBaseLabel}</p>
                <p className="type-body-sm">{diffReport.base}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.diffCandidateLabel}</p>
                <p className="type-body-sm">{diffReport.candidate}</p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <p className="field-label">{copy.diffFieldsLabel}</p>
                <p className="type-body-sm">
                  {diffReport.differences.length > 0
                    ? diffReport.differences.map((entry) => entry.field).join(', ')
                    : copy.noneLabel}
                </p>
              </div>
            </div>
          ) : null}
          <div className="project-detail-subpanel mt-5" data-testid="project-nomos-catalog-panel">
            <div className="space-y-2">
              <p className="field-label">{copy.catalogTitle}</p>
              <p className="type-body-sm break-all">
                {copy.catalogRootLabel}
                {': '}
                {catalogList?.catalog_root ?? copy.noneLabel}
              </p>
            </div>
            {catalogList && catalogList.summaries.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {catalogList.summaries.map((entry) => (
                  <li key={entry.pack_id} className="type-body-sm">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setCatalogPackId(entry.pack_id);
                        void runNomosAction('catalog-show');
                      }}
                    >
                      {entry.pack_id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 type-body-sm">{copy.catalogEmpty}</p>
            )}
            {catalogEntry ? (
              <div className="mt-4 space-y-2">
                <p className="field-label">{copy.catalogSelectionTitle}</p>
                <p className="type-body-sm">
                  {copy.sourceKindLabel}
                  {': '}
                  {catalogEntry.source_kind}
                </p>
                <pre className="project-detail-json-preview type-caption whitespace-pre-wrap">
                  {renderJson(catalogEntry as unknown as Record<string, unknown>)}
                </pre>
              </div>
            ) : null}
          </div>
          {importedSource ? (
            <div className="project-detail-subpanel mt-5" data-testid="project-nomos-source-panel">
              <div className="space-y-2">
                <p className="field-label">{copy.importedSourceTitle}</p>
                <p className="type-body-sm">
                  {copy.sourceKindLabel}
                  {': '}
                  {importedSource.source_kind}
                </p>
                <p className="type-body-sm break-all">
                  {copy.sourceDirLabel}
                  {': '}
                  {importedSource.source_dir}
                </p>
                <p className="type-body-sm break-all">
                  {copy.catalogPackIdLabel}
                  {': '}
                  {importedSource.entry.pack_id}
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4" data-testid="project-nomos-registered-sources-panel">
            <div className="space-y-2">
              <p className="field-label">{copy.registeredSourcesTitle}</p>
              <p className="type-body-sm break-all">
                {copy.registeredSourcesRootLabel}
                {': '}
                {registeredSourceList?.registry_root ?? copy.noneLabel}
              </p>
            </div>
            {registeredSourceList && registeredSourceList.entries.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {registeredSourceList.entries.map((entry) => (
                  <li key={entry.source_id} className="type-body-sm">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setSourceId(entry.source_id);
                        void runNomosAction('source-show');
                      }}
                    >
                      {entry.source_id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 type-body-sm">{copy.registeredSourcesEmpty}</p>
            )}
            {registeredSourceEntry ? (
              <div className="mt-4 space-y-2">
                <p className="field-label">{copy.registeredSourceSelectionTitle}</p>
                <p className="type-body-sm">
                  {copy.sourceKindLabel}
                  {': '}
                  {registeredSourceEntry.source_kind}
                </p>
                <pre className="type-caption whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] p-3">
                  {renderJson(registeredSourceEntry as unknown as Record<string, unknown>)}
                </pre>
                {registeredSourceSync ? (
                  <pre className="type-caption whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--surface-elevated)] p-3">
                    {renderJson(registeredSourceSync as unknown as Record<string, unknown>)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
          {doctorReport ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="field-label">{copy.doctorTitle}</p>
                <p className="type-body-sm">{doctorReport.project_id}</p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.doctorEmbeddingLabel}</p>
                <p className="type-body-sm">
                  {doctorReport.embedding.provider}
                  {' / '}
                  {doctorReport.embedding.healthy ? copy.yesLabel : copy.noLabel}
                </p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.doctorVectorLabel}</p>
                <p className="type-body-sm">
                  {doctorReport.vector_index.provider}
                  {' / '}
                  {doctorReport.vector_index.chunk_count ?? 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="field-label">{copy.doctorJobsLabel}</p>
                <p className="type-body-sm">
                  {`pending=${doctorReport.jobs.pending}, running=${doctorReport.jobs.running}, failed=${doctorReport.jobs.failed}, succeeded=${doctorReport.jobs.succeeded}`}
                </p>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <p className="field-label">{copy.doctorDriftLabel}</p>
                <p className="type-body-sm">
                  {doctorReport.drift.detected ? copy.yesLabel : copy.noLabel}
                  {' / '}
                  {doctorReport.drift.documents_without_jobs}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-recaps-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.recapsTitle}</h3>
            </div>
            <div className="mt-5 space-y-3">
              {recaps.length === 0 ? <p className="type-body-sm">{copy.recapsEmpty}</p> : recaps.map((recap) => (
                <button
                  key={recap.taskId}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openRecapAria(recap.title ?? recap.taskId)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'recap', item: recap } })}
                >
                  <strong className="type-heading-sm">{recap.title ?? recap.taskId}</strong>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{recap.taskId}</span>
                    <span>{recap.updatedAt ?? '-'}</span>
                  </div>
                  <p className="type-body-sm mt-3 line-clamp-3">{summarizeDocument(recap.content, copy.documentFallback)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-knowledge-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.knowledgeTitle}</h3>
            </div>
            <div className="mt-5 space-y-3">
              {knowledge.length === 0 ? <p className="type-body-sm">{copy.knowledgeEmpty}</p> : knowledge.map((doc) => (
                <button
                  key={`${doc.kind}:${doc.slug}`}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openKnowledgeAria(doc.title ?? doc.slug)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'knowledge', item: doc } })}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{doc.title ?? doc.slug}</strong>
                    <span className="status-pill status-pill--neutral">{doc.kind}</span>
                  </div>
                  <p className="type-body-sm mt-3 line-clamp-3">{summarizeDocument(doc.content, copy.documentFallback)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-related-tasks-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.relatedTasksTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={taskFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('all')}
                >
                  {copy.taskFilters.all}
                </button>
                <button
                  type="button"
                  className={taskFilter === 'active' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('active')}
                >
                  {copy.taskFilters.active}
                </button>
                <button
                  type="button"
                  className={taskFilter === 'review' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTaskFilter('review')}
                >
                  {copy.taskFilters.review}
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {visibleTasks.length === 0 ? <p className="type-body-sm">{copy.relatedTasksEmpty}</p> : visibleTasks.map((task) => (
                <div key={task.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="type-heading-sm" to={`/tasks/${task.id}`}>{task.title}</Link>
                      <span className="status-pill status-pill--neutral">{task.state}</span>
                    </div>
                    <div className="type-text-xs mt-3">
                      <span>{task.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="surface-panel surface-panel--workspace" data-testid="project-citizens-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.citizensTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <Link className="button-secondary" to={`/tasks/new?project=${project.id}`}>{copy.createTaskAction}</Link>
                <Link className="button-secondary" to={`/todos?project=${project.id}`}>{copy.createTodoAction}</Link>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {citizens.length === 0 ? <p className="type-body-sm">{copy.citizensEmpty}</p> : citizens.map((citizen) => (
                <button
                  key={citizen.citizenId}
                  type="button"
                  className="selection-card w-full text-left"
                  aria-label={copy.openCitizenAria(citizen.displayName)}
                  onClick={() => setDetailState({ projectId: projectId ?? null, selection: { kind: 'citizen', item: citizen } })}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{citizen.displayName}</strong>
                    <span className="status-pill status-pill--neutral">{citizen.status}</span>
                  </div>
                  <div className="type-text-xs mt-3 flex flex-wrap gap-3">
                    <span>{citizen.citizenId}</span>
                    <span>{citizen.roleId}</span>
                    <span>{citizen.runtimeAdapter}</span>
                    <span>{citizen.brainScaffoldMode}</span>
                  </div>
                  <p className="field-label mt-3">{copy.citizenPreviewLabel}</p>
                  {citizen.persona ? <p className="type-body-sm mt-3">{citizen.persona}</p> : null}
                  {citizen.boundaries.length > 0 ? (
                    <p className="type-text-xs mt-3">{citizen.boundaries.join(' / ')}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel surface-panel--workspace" data-testid="project-related-todos-panel">
            <div className="section-title-row">
              <h3 className="section-title">{copy.relatedTodosTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={todoFilter === 'all' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTodoFilter('all')}
                >
                  {copy.todoFilters.all}
                </button>
                <button
                  type="button"
                  className={todoFilter === 'pending' ? 'choice-pill choice-pill--active' : 'choice-pill'}
                  onClick={() => setTodoFilter('pending')}
                >
                  {copy.todoFilters.pending}
                </button>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {visibleTodos.length === 0 ? <p className="type-body-sm">{copy.relatedTodosEmpty}</p> : visibleTodos.map((todo) => (
                <div key={todo.id} className="data-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-heading-sm">{todo.text}</strong>
                      <span className="status-pill status-pill--neutral">{todo.status}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.markTodoDoneAction}
                      onClick={() => void updateTodo(todo.id, { status: todo.status === 'done' ? 'pending' : 'done' })}
                    >
                      {todo.status === 'done' ? copy.reopenTodoAction : copy.markTodoDoneAction}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.promoteTodoAction}
                      onClick={() => void promoteTodo(todo.id, { type: 'quick', creator: 'archon', priority: 'normal' })}
                    >
                      {copy.promoteTodoAction}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      aria-label={copy.deleteTodoAction}
                      onClick={() => void deleteTodo(todo.id)}
                    >
                      {copy.deleteTodoAction}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      {detailSelection?.kind === 'recap' ? (
        <WorkbenchDetailSheet
          label={copy.recapDialogLabel}
          title={detailSelection.item.title ?? detailSelection.item.taskId}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <span className="type-mono-sm">{detailSelection.item.taskId}</span>
            <p className="type-body-sm mt-3 break-all">{detailSelection.item.summaryPath}</p>
            <p className="type-text-xs mt-3">{detailSelection.item.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.recapContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{detailSelection.item.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}

      {detailSelection?.kind === 'knowledge' ? (
        <WorkbenchDetailSheet
          label={copy.knowledgeDialogLabel}
          title={detailSelection.item.title ?? detailSelection.item.slug}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="status-pill status-pill--neutral">{detailSelection.item.kind}</span>
              <span className="type-mono-sm">{detailSelection.item.slug}</span>
            </div>
            <p className="type-body-sm mt-3 break-all">{detailSelection.item.path}</p>
            <p className="type-text-xs mt-3">{detailSelection.item.updatedAt ?? '-'}</p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeSourceTasksTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.sourceTaskIds.join(', ') || copy.noSourceTasks}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.knowledgeContentTitle}</h4>
            <p className="type-body-sm mt-4 whitespace-pre-wrap">{detailSelection.item.content}</p>
          </section>
        </WorkbenchDetailSheet>
      ) : null}

      {detailSelection?.kind === 'citizen' ? (
        <WorkbenchDetailSheet
          label={copy.citizenDialogLabel}
          title={detailSelection.item.displayName}
          onClose={() => setDetailState({ projectId: projectId ?? null, selection: null })}
        >
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-mono-sm">{detailSelection.item.citizenId}</span>
              <span className="status-pill status-pill--neutral">{detailSelection.item.status}</span>
            </div>
            <p className="type-body-sm mt-3">
              {detailSelection.item.roleId}
              {' / '}
              {detailSelection.item.runtimeAdapter}
              {' / '}
              {detailSelection.item.brainScaffoldMode}
            </p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.personaTitle}</h4>
            <p className="type-body-sm mt-4">{detailSelection.item.persona ?? copy.noPersona}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.boundariesTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.boundaries.join(' / ') || copy.noBoundaries}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.skillsTitle}</h4>
            <p className="type-body-sm mt-4">
              {detailSelection.item.skillsRef.join(', ') || copy.noSkills}
            </p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.channelPoliciesTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(detailSelection.item.channelPolicies)}</pre>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.runtimeMetadataTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderJson(detailSelection.item.runtimeMetadata)}</pre>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
