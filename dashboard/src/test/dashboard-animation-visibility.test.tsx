import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkbenchDetailSheet } from '@/components/ui/WorkbenchDetailSheet';

const componentsCssSource = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
const motionCssSource = fs.readFileSync(path.resolve(__dirname, '../styles/motion.css'), 'utf8');
const tokensCssSource = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf8');

describe('dashboard animation visibility wiring', () => {
  it('attaches stable view transition names to workbench sheets by default', () => {
    render(
      <WorkbenchDetailSheet label="任务详情面板" title="任务详情" onClose={() => undefined}>
        <div>details</div>
      </WorkbenchDetailSheet>,
    );

    const dialog = screen.getByRole('dialog', { name: '任务详情面板' });
    const backdrop = dialog.querySelector('.workbench-sheet__backdrop');
    const panel = dialog.querySelector('.workbench-sheet__panel');

    expect(backdrop).toHaveStyle({ viewTransitionName: 'workbench-sheet-backdrop' });
    expect(panel).toHaveStyle({ viewTransitionName: 'workbench-sheet-panel' });
  });

  it('targets workbench sheet transitions by view-transition name instead of class selectors', () => {
    expect(componentsCssSource).toContain('::view-transition-old(workbench-sheet-panel)');
    expect(componentsCssSource).toContain('::view-transition-new(workbench-sheet-panel)');
    expect(componentsCssSource).toContain('::view-transition-old(workbench-sheet-backdrop)');
    expect(componentsCssSource).toContain('::view-transition-new(workbench-sheet-backdrop)');
    expect(componentsCssSource).not.toContain('::view-transition-old(.workbench-sheet__panel)');
    expect(componentsCssSource).not.toContain('::view-transition-old(.workbench-sheet__backdrop)');
  });

  it('keeps route entry motion visibly stronger than the previous near-static profile', () => {
    expect(motionCssSource).toContain('translateY(18px) scale(0.985)');
    expect(tokensCssSource).toContain('--motion-page-duration: 560ms;');
  });
});
