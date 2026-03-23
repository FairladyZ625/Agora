import { useEffect, useRef } from 'react';

interface HomeSignalFieldProps {
  className?: string;
  testId?: string;
}

function readCssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function parseColorWithAlpha(input: string, alpha: number) {
  const value = input.trim();
  const rgbPrefix = ['r', 'g', 'b', '('].join('');
  const rgbaPrefix = ['r', 'g', 'b', 'a', '('].join('');

  if (value.charCodeAt(0) === 35) {
    const normalized = value.length === 4
      ? `${String.fromCharCode(35)}${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value;
    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    return [`rgba`, `(${red}, ${green}, ${blue}, ${alpha})`].join('');
  }

  if (value.startsWith(rgbPrefix)) {
    return `${rgbaPrefix}${value.slice(rgbPrefix.length, -1)}, ${alpha})`;
  }

  if (value.startsWith(rgbaPrefix)) {
    const channels = value
      .slice(rgbaPrefix.length, -1)
      .split(',')
      .slice(0, 3)
      .map((channel) => channel.trim())
      .join(', ');
    return `${rgbaPrefix}${channels}, ${alpha})`;
  }

  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  const gradient = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, parseColorWithAlpha(color, alpha));
  gradient.addColorStop(0.55, parseColorWithAlpha(color, alpha * 0.36));
  gradient.addColorStop(1, parseColorWithAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrbitCluster(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  baseRadius: number,
  time: number,
  lineColor: string,
  glowColor: string,
) {
  ctx.save();
  ctx.lineCap = 'round';

  const rings = [
    { radius: baseRadius, width: 1.4, speed: 0.22, start: 0.2, span: 1.7 },
    { radius: baseRadius * 1.34, width: 1.1, speed: -0.16, start: 1.1, span: 1.35 },
    { radius: baseRadius * 1.78, width: 0.9, speed: 0.12, start: -0.4, span: 1.12 },
  ];

  rings.forEach((ring, index) => {
    const angle = time * ring.speed + ring.start;
    ctx.strokeStyle = parseColorWithAlpha(lineColor, 0.22 - index * 0.04);
    ctx.lineWidth = ring.width;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.radius, angle, angle + Math.PI * ring.span);
    ctx.stroke();

    const nodeAngle = angle + Math.PI * ring.span * 0.78;
    const nodeX = centerX + Math.cos(nodeAngle) * ring.radius;
    const nodeY = centerY + Math.sin(nodeAngle) * ring.radius;

    drawGlow(ctx, nodeX, nodeY, 12 - index * 2, glowColor, 0.12);
    ctx.fillStyle = parseColorWithAlpha(glowColor, 0.72 - index * 0.1);
    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 1.8 - index * 0.15, 0, Math.PI * 2);
    ctx.fill();
  });

  drawGlow(ctx, centerX, centerY, baseRadius * 0.72, glowColor, 0.12);
  ctx.fillStyle = parseColorWithAlpha(glowColor, 0.88);
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function HomeSignalField({ className, testId }: HomeSignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0.62, y: 0.52 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let time = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerRef.current = {
        x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      };
    };

    const render = () => {
      const lineColor = readCssVar('--home-signal-field-line', readCssVar('--color-primary', ''));
      const glowColor = readCssVar('--home-signal-field-glow', lineColor);
      const highlightColor = readCssVar('--home-signal-field-highlight', readCssVar('--color-static-white', lineColor));

      context.clearRect(0, 0, width, height);

      const pointerX = width * pointerRef.current.x;
      const pointerY = height * pointerRef.current.y;
      const primaryX = width * 0.28 + Math.sin(time * 0.4) * 14 + (pointerX - width * 0.5) * 0.08;
      const primaryY = height * 0.62 + Math.cos(time * 0.32) * 8 + (pointerY - height * 0.5) * 0.06;
      const secondaryX = width * 0.7 + Math.cos(time * 0.24) * 10;
      const secondaryY = height * 0.38 + Math.sin(time * 0.28) * 12;

      drawGlow(context, primaryX, primaryY, Math.max(width, height) * 0.22, glowColor, 0.12);
      drawGlow(context, secondaryX, secondaryY, Math.max(width, height) * 0.18, lineColor, 0.08);
      drawGlow(context, pointerX, pointerY, 72, highlightColor, 0.06);

      drawOrbitCluster(context, primaryX, primaryY, Math.min(width, height) * 0.12, time, lineColor, glowColor);
      drawOrbitCluster(context, secondaryX, secondaryY, Math.min(width, height) * 0.08, -time * 0.9, lineColor, highlightColor);

      const particleCount = Math.round((width * height) / 18000);
      for (let index = 0; index < particleCount; index += 1) {
        const seed = index / Math.max(particleCount, 1);
        const px = (seed * width * 1.3 + time * 26 + Math.sin(seed * 40 + time) * 24) % (width + 24) - 12;
        const py = height * (0.22 + (seed * 0.54) % 0.62) + Math.sin(seed * 30 - time * 1.1) * 12;
        const radius = 0.8 + (index % 3) * 0.35;
        context.fillStyle = parseColorWithAlpha(index % 4 === 0 ? highlightColor : lineColor, 0.18 + (index % 5) * 0.04);
        context.beginPath();
        context.arc(px, py, radius, 0, Math.PI * 2);
        context.fill();
      }

      if (!prefersReducedMotion) {
        time += 0.012;
        rafId = window.requestAnimationFrame(render);
      }
    };

    resize();
    render();

    window.addEventListener('resize', resize);
    container.addEventListener('pointermove', onPointerMove);

    return () => {
      window.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointerMove);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`home-signal-field${className ? ` ${className}` : ''}`}
      data-testid={testId}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="home-signal-field__canvas" />
    </div>
  );
}
