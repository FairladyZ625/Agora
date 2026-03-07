import { useEffect } from 'react';
import { useTemplatesPageCopy } from '@/lib/dashboardCopy';
import { useTemplateStore } from '@/stores/templateStore';

export function TemplatesPage() {
  const copy = useTemplatesPageCopy();
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
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="surface-panel surface-panel--workspace">
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

        <div className="surface-panel surface-panel--workspace">
          <div className="section-title-row">
            <h3 className="section-title">{copy.detailTitle}</h3>
          </div>
          {selectedTemplate ? (
            <div className="mt-5 space-y-5">
              <div>
                <h4 className="type-heading-sm">{selectedTemplate.name}</h4>
                <p className="type-body-sm mt-2">{selectedTemplate.description}</p>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.governanceLabel}</span>
                <span className="type-body-sm">{selectedTemplate.governance}</span>
              </div>
              <div className="detail-card">
                <span className="detail-card__label">{copy.teamLabel}</span>
                <span className="type-body-sm">{selectedTemplate.defaultTeamRoles.join(' / ') || '—'}</span>
              </div>
              <div>
                <p className="page-kicker">{copy.stagesTitle}</p>
                <div className="mt-3 space-y-3">
                  {selectedTemplate.stages.map((stage) => (
                    <div key={stage.id} className="data-row">
                      <div className="min-w-0 flex-1">
                        <strong className="type-heading-sm">{stage.name}</strong>
                        <div className="type-text-xs mt-2 flex flex-wrap items-center gap-3">
                          <span>{stage.id}</span>
                          <span>{stage.mode}</span>
                          {stage.gateType ? <span>{stage.gateType}</span> : null}
                        </div>
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
