import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface WorkbenchDetailSheetProps {
  label: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function WorkbenchDetailSheet({
  label,
  title,
  onClose,
  children,
}: WorkbenchDetailSheetProps) {
  const { t } = useTranslation();

  return (
    <div className="workbench-sheet" role="dialog" aria-label={label} aria-modal="true">
      <button
        type="button"
        className="workbench-sheet__backdrop"
        aria-label={t('common.closeDetails')}
        onClick={onClose}
      />
      <section className="workbench-sheet__panel">
        <div className="workbench-sheet__header">
          <div>
            <p className="page-kicker">{label}</p>
            <h3 className="section-title">{title}</h3>
          </div>
          <button type="button" className="button-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="workbench-sheet__body">{children}</div>
      </section>
    </div>
  );
}
