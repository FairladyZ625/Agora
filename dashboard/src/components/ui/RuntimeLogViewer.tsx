import { useEffect, useRef, useCallback } from 'react';

const LINE_HEIGHT = 18;
const FONT = '12px "JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace';
const FONT_BOLD = `bold ${FONT}`;
const PADDING_X = 12;
const PADDING_TOP = 8;

const ANSI_COLOR_VARS: Record<number, string> = {
  30: '--runtime-log-ansi-30', 31: '--runtime-log-ansi-31', 32: '--runtime-log-ansi-32', 33: '--runtime-log-ansi-33',
  34: '--runtime-log-ansi-34', 35: '--runtime-log-ansi-35', 36: '--runtime-log-ansi-36', 37: '--runtime-log-ansi-37',
  90: '--runtime-log-ansi-90', 91: '--runtime-log-ansi-91', 92: '--runtime-log-ansi-92', 93: '--runtime-log-ansi-93',
  94: '--runtime-log-ansi-94', 95: '--runtime-log-ansi-95', 96: '--runtime-log-ansi-96', 97: '--runtime-log-ansi-97',
};

const DEFAULT_COLOR_VAR = '--runtime-log-ansi-37';
const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ANSI_ESCAPE}\\[([0-9;]*)m`, 'g');

type Segment = { text: string; color: string; bold: boolean };
type ParsedLine = Segment[];

function readThemeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseAnsi(raw: string): ParsedLine {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let currentColor = readThemeColor(DEFAULT_COLOR_VAR);
  let bold = false;

  ANSI_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_RE.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: raw.slice(lastIndex, match.index), color: currentColor, bold });
    }
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) { currentColor = readThemeColor(DEFAULT_COLOR_VAR); bold = false; }
      else if (code === 1) { bold = true; }
      else if (ANSI_COLOR_VARS[code] !== undefined) { currentColor = readThemeColor(ANSI_COLOR_VARS[code]); }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    segments.push({ text: raw.slice(lastIndex), color: currentColor, bold });
  }
  return segments.length > 0 ? segments : [{ text: raw, color: readThemeColor(DEFAULT_COLOR_VAR), bold: false }];
}

export interface RuntimeLogViewerProps {
  output: string | null;
  loading?: boolean;
  className?: string;
  maxLines?: number;
}

export function RuntimeLogViewer({ output, loading, className, maxLines = 500 }: RuntimeLogViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const linesRef = useRef<ParsedLine[]>([]);
  const animFrameRef = useRef<number>(0);
  const velocityRef = useRef(0);
  const lastYRef = useRef(0);
  const isDraggingRef = useRef(false);
  // Track logical canvas size (CSS pixels) for rendering math
  const logicalSizeRef = useRef({ width: 0, height: 0 });

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = logicalSizeRef.current;
    if (width === 0 || height === 0) return;

    const lines = linesRef.current;
    const scrollTop = scrollTopRef.current;
    const totalHeight = lines.length * LINE_HEIGHT + PADDING_TOP * 2;

    ctx.fillStyle = readThemeColor('--runtime-log-bg');
    ctx.fillRect(0, 0, width, height);

    const firstLine = Math.max(0, Math.floor((scrollTop - PADDING_TOP) / LINE_HEIGHT));
    const lastLine = Math.min(lines.length - 1, Math.ceil((scrollTop + height - PADDING_TOP) / LINE_HEIGHT));

    ctx.textBaseline = 'top';

    for (let i = firstLine; i <= lastLine; i++) {
      const y = PADDING_TOP + i * LINE_HEIGHT - scrollTop;
      const line = lines[i];
      if (!line) continue;

      let x = PADDING_X;
      for (const seg of line) {
        ctx.fillStyle = seg.color;
        ctx.font = seg.bold ? FONT_BOLD : FONT;
        ctx.fillText(seg.text, x, y);
        x += ctx.measureText(seg.text).width;
      }
    }

    // Scrollbar
    if (totalHeight > height) {
      const trackH = height - 8;
      const thumbH = Math.max(20, (height / totalHeight) * trackH);
      const thumbY = 4 + (scrollTop / (totalHeight - height)) * (trackH - thumbH);
      ctx.fillStyle = readThemeColor('--runtime-log-thumb');
      ctx.beginPath();
      ctx.roundRect(width - 6, thumbY, 4, thumbH, 2);
      ctx.fill();
    }

    // Line count badge
    ctx.fillStyle = readThemeColor('--runtime-log-line-count');
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${lines.length} lines`, width - 12, height - 14);
    ctx.textAlign = 'left';
  }, []);

  const clampScroll = useCallback((value: number) => {
    const { height } = logicalSizeRef.current;
    const totalHeight = linesRef.current.length * LINE_HEIGHT + PADDING_TOP * 2;
    return Math.max(0, Math.min(value, Math.max(0, totalHeight - height)));
  }, []);

  // Parse lines when output changes
  useEffect(() => {
    if (!output) {
      linesRef.current = [];
      renderFrame();
      return;
    }
    const rawLines = output.split('\n').slice(-maxLines);
    linesRef.current = rawLines.map(parseAnsi);
    // Auto-scroll to bottom
    const { height } = logicalSizeRef.current;
    const totalHeight = linesRef.current.length * LINE_HEIGHT + PADDING_TOP * 2;
    scrollTopRef.current = Math.max(0, totalHeight - height);
    renderFrame();
  }, [output, maxLines, renderFrame]);

  // Wheel handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollTopRef.current = clampScroll(scrollTopRef.current + e.deltaY);
      renderFrame();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [clampScroll, renderFrame]);

  // Pointer drag + momentum scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      lastYRef.current = e.clientY;
      velocityRef.current = 0;
      cancelAnimationFrame(animFrameRef.current);
      container.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dy = lastYRef.current - e.clientY;
      velocityRef.current = dy;
      scrollTopRef.current = clampScroll(scrollTopRef.current + dy);
      lastYRef.current = e.clientY;
      renderFrame();
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
      const momentum = () => {
        if (Math.abs(velocityRef.current) < 0.5) return;
        velocityRef.current *= 0.92;
        scrollTopRef.current = clampScroll(scrollTopRef.current + velocityRef.current);
        renderFrame();
        animFrameRef.current = requestAnimationFrame(momentum);
      };
      animFrameRef.current = requestAnimationFrame(momentum);
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clampScroll, renderFrame]);

  // ResizeObserver — keep canvas sized to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      logicalSizeRef.current = { width, height };
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      renderFrame();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [renderFrame]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`runtime-log-viewer${className ? ` ${className}` : ''}`}
      role="log"
      aria-label="Agent runtime output"
      aria-live="polite"
    >
      {loading && (
        <div className="runtime-log-viewer__loading">
          <span className="runtime-log-viewer__spinner" aria-hidden="true" />
        </div>
      )}
      {!output && !loading && (
        <div className="runtime-log-viewer__empty">no output</div>
      )}
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
