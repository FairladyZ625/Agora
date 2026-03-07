import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterSection {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

interface WorkbenchFilterPopoverProps {
  title: string;
  emptyLabel: string;
  sections: FilterSection[];
  align?: 'start' | 'end';
  onClear: () => void;
  onClose: () => void;
  footer?: ReactNode;
  clearLabel?: string;
}

export function WorkbenchFilterPopover({
  title,
  emptyLabel,
  sections,
  align = 'start',
  onClear,
  onClose,
  footer,
  clearLabel,
}: WorkbenchFilterPopoverProps) {
  const { t } = useTranslation();
  const resolvedClearLabel = clearLabel ?? t('tasks.clearFiltersAction');

  return (
    <div
      className={align === 'end' ? 'filter-popover filter-popover--align-end' : 'filter-popover'}
      role="dialog"
      aria-label={title}
    >
      <div className="filter-popover__header">
        <div>
          <p className="page-kicker">{title}</p>
          <h4 className="filter-popover__title">{title}</h4>
        </div>
        <button type="button" className="button-ghost" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      <div className="filter-popover__content">
        {sections.map((section) => (
          <section key={section.label} className="filter-popover__section">
            <div className="filter-popover__section-head">
              <span>{section.label}</span>
              <span>{section.selected.length}</span>
            </div>

            {section.options.length > 0 ? (
              <div className="filter-popover__options">
                {section.options.map((option) => {
                  const active = section.selected.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => section.onToggle(option.value)}
                      className={active ? 'filter-chip filter-chip--active' : 'filter-chip'}
                    >
                      <span>{option.label}</span>
                      {typeof option.count === 'number' ? <span>{option.count}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="filter-popover__empty">{emptyLabel}</p>
            )}
          </section>
        ))}
      </div>

      <div className="filter-popover__footer">
        <button type="button" className="button-ghost" onClick={onClear}>
          {resolvedClearLabel}
        </button>
        {footer}
      </div>
    </div>
  );
}
