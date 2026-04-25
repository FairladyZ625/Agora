import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { WorkflowGraphView } from '@/components/features/WorkflowGraphView';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
import { normalizeTemplateDraftId } from '@/lib/templateStarter';
import { resolveWorkflowExecutionKindLabel, resolveWorkflowGateLabel } from '@/lib/workflowGraphLabels';
import { useTemplateStore } from '@/stores/templateStore';

export function TemplatesPage() {
  const copy = useTemplatesPageCopy();
  const navigate = useNavigate();
  const templates = useTemplateStore((state) => state.templates);
  const selectedTemplateId = useTemplateStore((state) => state.selectedTemplateId);
  const selectedTemplate = useTemplateStore((state) => state.selectedTemplate);
  const error = useTemplateStore((state) => state.error);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const selectTemplate = useTemplateStore((state) => state.selectTemplate);
  const createTemplate = useTemplateStore((state) => state.createTemplate);
  const duplicateSelectedTemplate = useTemplateStore((state) => state.duplicateSelectedTemplate);
  const [draftTemplateId, setDraftTemplateId] = useState('');
  const [draftTemplateName, setDraftTemplateName] = useState('');

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      void selectTemplate(templates[0].id);
    }
  }, [selectedTemplateId, selectTemplate, templates]);

  const resetAuthoringDraft = () => {
    setDraftTemplateId('');
    setDraftTemplateName('');
  };

  const handleCreateTemplate = async () => {
    const templateId = normalizeTemplateDraftId(draftTemplateId || draftTemplateName, `workflow_${Date.now()}`);
    const templateName = draftTemplateName.trim() || 'Workflow Starter';
    const result = await createTemplate({ id: templateId, name: templateName });
    if (result === 'live') {
      resetAuthoringDraft();
      navigate(`/templates/${templateId}/graph`);
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }
    const templateId = normalizeTemplateDraftId(draftTemplateId || `${selectedTemplate.id}_copy`, `${selectedTemplate.id}_copy`);
    const templateName = draftTemplateName.trim() || `${selectedTemplate.name} Copy`;
    const result = await duplicateSelectedTemplate({
      templateId: selectedTemplate.id,
      newId: templateId,
      name: templateName,
    });
    if (result === 'live') {
      resetAuthoringDraft();
      navigate(`/templates/${templateId}/graph`);
    }
  };

  return (
    <div className="interior-page">
      <section className="surface-panel surface-panel--workspace surface-panel--context-anchor">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.listTitle}</span>
              <span className="inline-stat__value">{templates.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.detailTitle}</span>
              <span className="inline-stat__value">{selectedTemplate?.type ?? 'n/a'}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.stagesTitle}</span>
              <span className="inline-stat__value">{selectedTemplate?.stages.length ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="templates-authoring-strip">
          <label className="templates-authoring-strip__field">
            <span className="field-label">{copy.createIdLabel}</span>
            <input
              className="input-shell"
              type="text"
              value={draftTemplateId}
              onChange={(event) => setDraftTemplateId(event.target.value)}
              placeholder={copy.createIdPlaceholder}
            />
          </label>
          <label className="templates-authoring-strip__field">
            <span className="field-label">{copy.createNameLabel}</span>
            <input
              className="input-shell"
              type="text"
              value={draftTemplateName}
              onChange={(event) => setDraftTemplateName(event.target.value)}
              placeholder={copy.createNamePlaceholder}
            />
          </label>
          <div className="templates-authoring-strip__actions">
            <button type="button" className="button-secondary" onClick={() => void handleCreateTemplate()}>
              {copy.createAction}
            </button>
            <button type="button" className="button-secondary" disabled={!selectedTemplate} onClick={() => void handleDuplicateTemplate()}>
              {copy.duplicateAction}
            </button>
          </div>
        </div>
        <p className="type-text-xs mt-3">{copy.createHint}</p>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="templates-workbench-grid">
        <div className="surface-panel surface-panel--workspace" data-testid="templates-library">
          <div className="section-title-row">
            <h3 className="section-title">{copy.listTitle}</h3>
            <span className="status-pill status-pill--neutral">{templates.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => void selectTemplate(template.id)}
                className={template.id === selectedTemplateId ? 'dense-row dense-row--active' : 'dense-row'}
              >
                <div className="dense-row__main">
                  <div className="dense-row__titleblock">
                    <strong className="dense-row__title">{template.name}</strong>
                  </div>
                  <div className="dense-row__meta">
                    <span>{template.type}</span>
                    <span>{template.stageCountLabel}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="surface-panel surface-panel--workspace" data-testid="templates-detail-panel">
          <div className="section-title-row">
            <h3 className="section-title">{copy.detailTitle}</h3>
            {selectedTemplate ? (
              <button
                type="button"
                className="button-primary"
                onClick={() => navigate(`/templates/${selectedTemplate.id}/graph`)}
              >
                {copy.graphOpenEditorAction}
              </button>
            ) : null}
          </div>

          {selectedTemplate ? (
            <div className="mt-5 space-y-5">
              <div>
                <h4 className="type-heading-sm">{selectedTemplate.name}</h4>
                <p className="type-body-sm mt-3">{selectedTemplate.description || copy.emptyTitle}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="detail-card">
                  <span className="detail-card__label">{copy.governanceLabel}</span>
                  <p className="type-body-sm mt-2">{selectedTemplate.governance}</p>
                </div>
                <div className="detail-card">
                  <span className="detail-card__label">{copy.graphTitle}</span>
                  <p className="type-body-sm mt-2">
                    nodes: {selectedTemplate.graph?.nodes.length ?? 0}
                    {' / '}
                    edges: {selectedTemplate.graph?.edges.length ?? 0}
                  </p>
                  <p className="type-text-xs mt-2">
                    entry: {(selectedTemplate.graph?.entryNodes ?? []).join(', ') || '-'}
                  </p>
                </div>
              </div>

              {selectedTemplate.graph ? (
                <div className="detail-card detail-card--graph">
                  <WorkflowGraphView
                    testId="template-detail-graph"
                    currentNodeId={selectedTemplate.graph.entryNodes[0] ?? null}
                    nodes={selectedTemplate.graph.nodes.map((node) => ({
                      id: node.id,
                      label: node.name,
                      kindLabel: resolveWorkflowExecutionKindLabel(node.executionKind, copy.graphExecutionKindOptions),
                      gateLabel: resolveWorkflowGateLabel(node.gateType, copy.graphGateTypeOptions),
                      isEntry: selectedTemplate.graph?.entryNodes.includes(node.id) ?? false,
                      layout: node.layout,
                    }))}
                    edges={selectedTemplate.graph.edges}
                    entryLabel={copy.graphEntryLabel}
                    edgeKindLabels={{
                      advance: copy.graphEdgeKindOptions.advance,
                      reject: copy.graphEdgeKindOptions.reject,
                    }}
                  />
                </div>
              ) : null}

              <div className="detail-card space-y-3">
                <span className="detail-card__label">{copy.teamLabel}</span>
                <div className="space-y-2">
                  {selectedTemplate.defaultTeam.map((member) => (
                    <div key={member.role} className="data-row">
                      <div className="min-w-0 flex-1">
                        <p className="type-heading-xs">{member.role}</p>
                        <p className="type-text-xs mt-1">
                          {member.memberKind ?? 'citizen'}
                          {member.modelPreference ? ` / ${member.modelPreference}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="empty-state mt-5">
              <p className="type-body-sm">{copy.emptyTitle}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
