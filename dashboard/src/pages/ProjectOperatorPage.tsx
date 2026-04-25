import { useState } from 'react';
import { Link } from 'react-router';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';
import { useProjectWorkspacePage } from '@/hooks/useProjectWorkspacePage';
import * as api from '@/lib/api';
import { useProjectDetailPageCopy } from '@/lib/dashboardCopy';
import {
  mapProjectNomosActivationDto,
  mapProjectNomosDiffDto,
  mapProjectNomosReviewDto,
  mapProjectNomosValidationDto,
} from '@/lib/projectMappers';
import {
  humanizeWorkspaceFallback,
  renderWorkspaceJson,
} from '@/lib/projectWorkspaceUtils';
import type {
  ProjectCitizen,
  ProjectNomosActivation,
  ProjectNomosDiff,
  ProjectNomosReview,
  ProjectNomosValidation,
} from '@/types/project';
import { useProjectStore } from '@/stores/projectStore';

export function ProjectOperatorPage() {
  const copy = useProjectDetailPageCopy();
  const { projectId, selectedProject, detailLoading, error } = useProjectWorkspacePage();
  const selectProject = useProjectStore((state) => state.selectProject);
  const [selectedCitizen, setSelectedCitizen] = useState<ProjectCitizen | null>(null);
  const [nomosActionPending, setNomosActionPending] = useState(false);
  const [nomosActionMessage, setNomosActionMessage] = useState<string | null>(null);
  const [exportDir, setExportDir] = useState('');
  const [packDir, setPackDir] = useState('');
  const [sourceDir, setSourceDir] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [publishNote, setPublishNote] = useState('');
  const [catalogPackId, setCatalogPackId] = useState('');
  const [operatorExpanded, setOperatorExpanded] = useState(false);
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

  const { project, operator, nomos } = selectedProject;

  const runNomosAction = async (
    mode: 'reinstall' | 'bootstrap' | 'doctor' | 'review' | 'activate' | 'validate' | 'diff' | 'export' | 'install-pack' | 'publish' | 'catalog-list' | 'catalog-show' | 'install-catalog' | 'import-source' | 'install-source' | 'register-source' | 'sources-list' | 'source-show' | 'sync-source' | 'install-registered-source',
  ) => {
    if (!projectId || !selectedProject) {
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
    } catch (actionError) {
      setNomosActionMessage(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setNomosActionPending(false);
    }
  };

  if (!nomos) {
    return (
      <div className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">{copy.noneLabel}</p>
      </div>
    );
  }

  return (
    <div className="interior-page">
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.operatorTitle}</h2>
            <p className="page-summary">{project.name}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="button-secondary" to={`/projects/${project.id}`}>Overview</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="project-nomos-panel">
        <div className="section-title-row">
          <h3 className="section-title">{copy.operatorTitle}</h3>
          <button type="button" className="button-secondary" onClick={() => setOperatorExpanded((value) => !value)}>
            {operatorExpanded ? copy.hideOperatorAction : copy.showOperatorAction}
          </button>
        </div>
        <p className="type-body-sm mt-3">{copy.operatorSummary}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="field-label">{copy.nomosIdLabel}</p>
            <p className="type-body-sm break-all">{operator.nomosId ?? copy.noneLabel}</p>
          </div>
          <div className="space-y-2">
            <p className="field-label">{copy.repoBoundLabel}</p>
            <p className="type-body-sm">{operator.repoPath ? copy.yesLabel : copy.noLabel}</p>
          </div>
          <div className="space-y-2">
            <p className="field-label">{copy.citizenCountLabel}</p>
            <p className="type-body-sm">{operator.citizens.length}</p>
          </div>
        </div>
        {operatorExpanded ? (
          <>
            {nomosActionPending ? <div className="inline-alert mt-4">{copy.nomosActionPending}</div> : null}
            {nomosActionMessage ? <div className="inline-alert mt-4">{nomosActionMessage}</div> : null}
            <div className="mt-5 space-y-6">
              <div className="space-y-3">
                <p className="field-label">{copy.operatorSafeActionsTitle}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('review')}>{copy.reviewNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('activate')}>{copy.activateNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('validate')}>{copy.validateNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('diff')}>{copy.diffNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('doctor')}>{copy.runDoctorAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('reinstall')}>{copy.reinstallNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('bootstrap')}>{copy.rerunBootstrapAction}</button>
                </div>
              </div>
              <div className="space-y-3">
                <p className="field-label">{copy.operatorAdvancedActionsTitle}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('export')}>{copy.exportNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('publish')}>{copy.publishNomosAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('import-source')}>{copy.importSourceAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('install-source')}>{copy.installFromSourceAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('install-pack')}>{copy.installPackAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('catalog-list')}>{copy.refreshCatalogAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending || !catalogPackId} onClick={() => void runNomosAction('catalog-show')}>{copy.showCatalogEntryAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending || !catalogPackId} onClick={() => void runNomosAction('install-catalog')}>{copy.installCatalogPackAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('register-source')}>{copy.registerSourceAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending} onClick={() => void runNomosAction('sources-list')}>{copy.refreshSourcesAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending || !sourceId} onClick={() => void runNomosAction('source-show')}>{copy.showSourceEntryAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending || !sourceId} onClick={() => void runNomosAction('sync-source')}>{copy.syncRegisteredSourceAction}</button>
                  <button type="button" className="button-secondary" disabled={nomosActionPending || !sourceId} onClick={() => void runNomosAction('install-registered-source')}>{copy.installRegisteredSourceAction}</button>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="field-label">{copy.repoPathLabel}</p>
                  <p className="type-body-sm break-all">{nomos.repoPath ?? copy.emptySummary}</p>
                </div>
                <div className="space-y-2">
                  <p className="field-label">{copy.activationStatusLabel}</p>
                  <p className="type-body-sm">{nomos.activationStatus}</p>
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
                  <input id="nomos-export-dir" className="input-shell" value={exportDir} onChange={(event) => setExportDir(event.target.value)} placeholder={copy.exportDirPlaceholder} />
                </div>
                <div className="space-y-2">
                  <label className="field-label" htmlFor="nomos-pack-dir">{copy.packDirLabel}</label>
                  <input id="nomos-pack-dir" className="input-shell" value={packDir} onChange={(event) => setPackDir(event.target.value)} placeholder={copy.packDirPlaceholder} />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <label className="field-label" htmlFor="nomos-source-dir">{copy.sourceDirLabel}</label>
                  <input id="nomos-source-dir" className="input-shell" value={sourceDir} onChange={(event) => setSourceDir(event.target.value)} placeholder={copy.sourceDirPlaceholder} />
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <label className="field-label" htmlFor="nomos-source-id">{copy.sourceIdLabel}</label>
                  <input id="nomos-source-id" className="input-shell" value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder={copy.sourceIdPlaceholder} />
                </div>
                <div className="space-y-2">
                  <label className="field-label" htmlFor="nomos-publish-note">{copy.publishNoteLabel}</label>
                  <input id="nomos-publish-note" className="input-shell" value={publishNote} onChange={(event) => setPublishNote(event.target.value)} placeholder={copy.publishNotePlaceholder} />
                </div>
                <div className="space-y-2">
                  <label className="field-label" htmlFor="nomos-catalog-pack-id">{copy.catalogPackIdLabel}</label>
                  <input id="nomos-catalog-pack-id" className="input-shell" value={catalogPackId} onChange={(event) => setCatalogPackId(event.target.value)} placeholder={copy.catalogPackIdPlaceholder} />
                </div>
              </div>
              <section data-testid="project-citizens-panel">
                <div className="section-title-row">
                  <h4 className="section-title">{copy.citizensTitle}</h4>
                </div>
                <div className="mt-5 space-y-3">
                  {operator.citizens.length === 0 ? <p className="type-body-sm">{copy.citizensEmpty}</p> : operator.citizens.map((citizen) => (
                    <button
                      key={citizen.citizenId}
                      type="button"
                      className="selection-card w-full text-left"
                      aria-label={copy.openCitizenAria(citizen.displayName)}
                      onClick={() => setSelectedCitizen(citizen)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="type-heading-sm">{citizen.displayName}</strong>
                        <span className="status-pill status-pill--neutral">{humanizeWorkspaceFallback(citizen.status)}</span>
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
              <div className="space-y-3">
                <p className="field-label">{copy.operatorReportsTitle}</p>
                {reviewReport ? <div className="grid gap-4 lg:grid-cols-2" data-testid="project-nomos-review"><div className="space-y-2"><p className="field-label">{copy.reviewTitle}</p><p className="type-body-sm">{reviewReport.projectId}</p></div><div className="space-y-2"><p className="field-label">{copy.reviewCanActivateLabel}</p><p className="type-body-sm">{reviewReport.canActivate ? copy.yesLabel : copy.noLabel}</p></div><div className="space-y-2"><p className="field-label">{copy.reviewActivePackLabel}</p><p className="type-body-sm break-all">{reviewReport.active.packId}</p></div><div className="space-y-2"><p className="field-label">{copy.reviewDraftPackLabel}</p><p className="type-body-sm break-all">{reviewReport.draft?.packId ?? copy.noneLabel}</p></div><div className="space-y-2 lg:col-span-2"><p className="field-label">{copy.reviewIssuesLabel}</p><p className="type-body-sm">{reviewReport.issues.length > 0 ? reviewReport.issues.join(' | ') : copy.noneLabel}</p></div></div> : null}
                {activationReport ? <div className="grid gap-4 lg:grid-cols-2" data-testid="project-nomos-activation"><div className="space-y-2"><p className="field-label">{copy.activationStatusLabel}</p><p className="type-body-sm">{activationReport.activationStatus}</p></div><div className="space-y-2"><p className="field-label">{copy.nomosIdLabel}</p><p className="type-body-sm break-all">{activationReport.nomosId}</p></div></div> : null}
                {validationReport ? <div className="grid gap-4 lg:grid-cols-2" data-testid="project-nomos-validation"><div className="space-y-2"><p className="field-label">{copy.validationTitle}</p><p className="type-body-sm">{validationReport.projectId}</p></div><div className="space-y-2"><p className="field-label">{copy.validationTargetLabel}</p><p className="type-body-sm">{validationReport.target}</p></div><div className="space-y-2"><p className="field-label">{copy.validationValidLabel}</p><p className="type-body-sm">{validationReport.valid ? copy.yesLabel : copy.noLabel}</p></div><div className="space-y-2"><p className="field-label">{copy.reviewDraftPackLabel}</p><p className="type-body-sm break-all">{validationReport.pack?.packId ?? copy.noneLabel}</p></div><div className="space-y-2 lg:col-span-2"><p className="field-label">{copy.validationIssuesLabel}</p><p className="type-body-sm">{validationReport.issues.length > 0 ? validationReport.issues.map((issue) => issue.message).join(' | ') : copy.noneLabel}</p></div></div> : null}
                {diffReport ? <div className="grid gap-4 lg:grid-cols-2" data-testid="project-nomos-diff"><div className="space-y-2"><p className="field-label">{copy.diffTitle}</p><p className="type-body-sm">{diffReport.projectId}</p></div><div className="space-y-2"><p className="field-label">{copy.diffChangedLabel}</p><p className="type-body-sm">{diffReport.changed ? copy.yesLabel : copy.noLabel}</p></div><div className="space-y-2"><p className="field-label">{copy.diffBaseLabel}</p><p className="type-body-sm">{diffReport.base}</p></div><div className="space-y-2"><p className="field-label">{copy.diffCandidateLabel}</p><p className="type-body-sm">{diffReport.candidate}</p></div><div className="space-y-2 lg:col-span-2"><p className="field-label">{copy.diffFieldsLabel}</p><p className="type-body-sm">{diffReport.differences.length > 0 ? diffReport.differences.map((entry) => entry.field).join(', ') : copy.noneLabel}</p></div></div> : null}
                <div className="project-detail-subpanel" data-testid="project-nomos-catalog-panel">
                  <div className="space-y-2">
                    <p className="field-label">{copy.catalogTitle}</p>
                    <p className="type-body-sm break-all">{copy.catalogRootLabel}: {catalogList?.catalog_root ?? copy.noneLabel}</p>
                  </div>
                  {catalogList && catalogList.summaries.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {catalogList.summaries.map((entry) => (
                        <li key={entry.pack_id} className="type-body-sm">
                          <button type="button" className="button-secondary" onClick={() => { setCatalogPackId(entry.pack_id); void runNomosAction('catalog-show'); }}>{entry.pack_id}</button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 type-body-sm">{copy.catalogEmpty}</p>}
                  {catalogEntry ? (
                    <div className="mt-4 space-y-2">
                      <p className="field-label">{copy.catalogSelectionTitle}</p>
                      <p className="type-body-sm">{copy.sourceKindLabel}: {catalogEntry.source_kind}</p>
                      <pre className="project-detail-json-preview type-caption whitespace-pre-wrap">{renderWorkspaceJson(catalogEntry as unknown as Record<string, unknown>)}</pre>
                    </div>
                  ) : null}
                </div>
                {importedSource ? (
                  <div className="project-detail-subpanel" data-testid="project-nomos-source-panel">
                    <div className="space-y-2">
                      <p className="field-label">{copy.importedSourceTitle}</p>
                      <p className="type-body-sm">{copy.sourceKindLabel}: {importedSource.source_kind}</p>
                      <p className="type-body-sm break-all">{copy.sourceDirLabel}: {importedSource.source_dir}</p>
                      <p className="type-body-sm break-all">{copy.catalogPackIdLabel}: {importedSource.entry.pack_id}</p>
                    </div>
                  </div>
                ) : null}
                <div className="project-detail-subpanel" data-testid="project-nomos-registered-sources-panel">
                  <div className="space-y-2">
                    <p className="field-label">{copy.registeredSourcesTitle}</p>
                    <p className="type-body-sm break-all">{copy.registeredSourcesRootLabel}: {registeredSourceList?.registry_root ?? copy.noneLabel}</p>
                  </div>
                  {registeredSourceList && registeredSourceList.entries.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {registeredSourceList.entries.map((entry) => (
                        <li key={entry.source_id} className="type-body-sm">
                          <button type="button" className="button-secondary" onClick={() => { setSourceId(entry.source_id); void runNomosAction('source-show'); }}>{entry.source_id}</button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 type-body-sm">{copy.registeredSourcesEmpty}</p>}
                  {registeredSourceEntry ? (
                    <div className="mt-4 space-y-2">
                      <p className="field-label">{copy.registeredSourceSelectionTitle}</p>
                      <p className="type-body-sm">{copy.sourceKindLabel}: {registeredSourceEntry.source_kind}</p>
                      <pre className="project-detail-json-preview type-caption whitespace-pre-wrap">{renderWorkspaceJson(registeredSourceEntry as unknown as Record<string, unknown>)}</pre>
                      {registeredSourceSync ? <pre className="project-detail-json-preview type-caption whitespace-pre-wrap">{renderWorkspaceJson(registeredSourceSync as unknown as Record<string, unknown>)}</pre> : null}
                    </div>
                  ) : null}
                </div>
                {doctorReport ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2"><p className="field-label">{copy.doctorTitle}</p><p className="type-body-sm">{doctorReport.project_id}</p></div>
                    <div className="space-y-2"><p className="field-label">{copy.doctorEmbeddingLabel}</p><p className="type-body-sm">{doctorReport.embedding.provider} / {doctorReport.embedding.healthy ? copy.yesLabel : copy.noLabel}</p></div>
                    <div className="space-y-2"><p className="field-label">{copy.doctorVectorLabel}</p><p className="type-body-sm">{doctorReport.vector_index.provider} / {doctorReport.vector_index.chunk_count ?? 0}</p></div>
                    <div className="space-y-2"><p className="field-label">{copy.doctorJobsLabel}</p><p className="type-body-sm">{`pending=${doctorReport.jobs.pending}, running=${doctorReport.jobs.running}, failed=${doctorReport.jobs.failed}, succeeded=${doctorReport.jobs.succeeded}`}</p></div>
                    <div className="space-y-2 lg:col-span-2"><p className="field-label">{copy.doctorDriftLabel}</p><p className="type-body-sm">{doctorReport.drift.detected ? copy.yesLabel : copy.noLabel} / {doctorReport.drift.documents_without_jobs}</p></div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {selectedCitizen ? (
        <WorkbenchDetailSheet label={copy.citizenDialogLabel} title={selectedCitizen.displayName} onClose={() => setSelectedCitizen(null)}>
          <div className="sheet-summary">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-mono-sm">{selectedCitizen.citizenId}</span>
              <span className="status-pill status-pill--neutral">{selectedCitizen.status}</span>
            </div>
            <p className="type-body-sm mt-3">
              {selectedCitizen.roleId}
              {' / '}
              {selectedCitizen.runtimeAdapter}
              {' / '}
              {selectedCitizen.brainScaffoldMode}
            </p>
          </div>
          <section className="sheet-section">
            <h4 className="section-title">{copy.personaTitle}</h4>
            <p className="type-body-sm mt-4">{selectedCitizen.persona ?? copy.noPersona}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.boundariesTitle}</h4>
            <p className="type-body-sm mt-4">{selectedCitizen.boundaries.join(' / ') || copy.noBoundaries}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.skillsTitle}</h4>
            <p className="type-body-sm mt-4">{selectedCitizen.skillsRef.join(', ') || copy.noSkills}</p>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.channelPoliciesTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderWorkspaceJson(selectedCitizen.channelPolicies)}</pre>
          </section>
          <section className="sheet-section">
            <h4 className="section-title">{copy.runtimeMetadataTitle}</h4>
            <pre className="type-text-xs mt-4 whitespace-pre-wrap">{renderWorkspaceJson(selectedCitizen.runtimeMetadata)}</pre>
          </section>
        </WorkbenchDetailSheet>
      ) : null}
    </div>
  );
}
