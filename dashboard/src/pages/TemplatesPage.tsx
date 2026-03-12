import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
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

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      void selectTemplate(templates[0].id);
    }
  }, [selectedTemplateId, selectTemplate, templates]);

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
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
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
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
                编辑流程
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

              <div className="detail-card space-y-3">
                <span className="detail-card__label">{copy.stagesTitle}</span>
                <div className="space-y-2">
                  {selectedTemplate.stages.map((stage) => (
                    <div key={stage.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <p className="type-heading-xs">{stage.name}</p>
                        <p className="type-text-xs mt-1">{stage.id} / {stage.mode}</p>
                      </div>
                      {stage.gateType ? <span className="status-pill status-pill--neutral">{stage.gateType}</span> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-card space-y-3">
                <span className="detail-card__label">{copy.graphEdgesLabel}</span>
                <div className="space-y-2">
                  {(selectedTemplate.graph?.edges ?? []).map((edge) => (
                    <div key={edge.id} className="data-row">
                      <span className="type-mono-xs">{`${edge.from} -> ${edge.to}`}</span>
                      <span className={edge.kind === 'reject' ? 'status-pill status-pill--warning' : 'status-pill status-pill--info'}>
                        {edge.kind}
                      </span>
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
