import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const WORKBENCH_SHEET_PANEL_TRANSITION = 'workbench-sheet-panel';
const WORKBENCH_SHEET_BACKDROP_TRANSITION = 'workbench-sheet-backdrop';

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

  const handleClose = () => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reducedMotion && 'startViewTransition' in document) {
      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(
        () => { onClose(); }
      );
    } else {
      onClose();
    }
  };

  const panelStyle: CSSProperties = { viewTransitionName: WORKBENCH_SHEET_PANEL_TRANSITION };
  const backdropStyle: CSSProperties = { viewTransitionName: WORKBENCH_SHEET_BACKDROP_TRANSITION };

  return (
    <div className="workbench-sheet" role="dialog" aria-label={label} aria-modal="true">
      <button
        type="button"
        className="workbench-sheet__backdrop"
        aria-label={t('common.closeDetails')}
        style={backdropStyle}
        onClick={handleClose}
      />
      <section className="workbench-sheet__panel" style={panelStyle}>
        <div className="workbench-sheet__header">
          <div>
            <p className="page-kicker">{label}</p>
            <h3 className="section-title">{title}</h3>
          </div>
          <button type="button" className="button-ghost" onClick={handleClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="workbench-sheet__body">{children}</div>
      </section>
    </div>
  );
}
