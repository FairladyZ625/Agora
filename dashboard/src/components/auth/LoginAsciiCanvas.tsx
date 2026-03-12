import { useEffect, useRef } from 'react';

const densityChars = " .'`^,:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

function simpleNoise(x: number, y: number, time: number) {
  return Math.sin(x * 0.05 + time) * Math.cos(y * 0.05 + time)
    + Math.sin(x * 0.01 - time) * Math.cos(y * 0.12) * 0.5;
}

export function LoginAsciiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const containerStyles = window.getComputedStyle(container);
    const pointerInk = containerStyles.getPropertyValue('--login-canvas-pointer-ink').trim() || 'currentColor';
    const fieldInk = containerStyles.getPropertyValue('--login-canvas-field-ink').trim() || 'currentColor';

    const charSize = 12;
    let rafId = 0;
    let time = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointerRef.current = { x, y };
      container.style.setProperty('--login-pointer-x', `${x}px`);
      container.style.setProperty('--login-pointer-y', `${y}px`);
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${charSize}px var(--font-mono)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cols = Math.ceil(width / charSize);
      const rows = Math.ceil(height / charSize);

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const posX = x * charSize;
          const posY = y * charSize;
          const normalizedY = (rows - y) / rows;
          const noiseValue = simpleNoise(x, y, time * 0.55);
          const ridgeHeight = 0.18 + Math.sin(x * 0.06 + time * 0.08) * 0.11 + Math.cos(x * 0.18) * 0.05;

          let char = '';
          let alpha = 0;

          if (normalizedY < ridgeHeight + noiseValue * 0.1) {
            const densityIndex = Math.floor(Math.abs(noiseValue) * densityChars.length);
            char = densityChars[densityIndex % densityChars.length];
            alpha = Math.max(0.14, 1 - normalizedY * 1.9);
          }

          if (!char) {
            continue;
          }

          const dx = posX - pointerRef.current.x;
          const dy = posY - pointerRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 220 && distance > 0) {
            const intensity = 1 - distance / 220;
            const driftX = (dx / distance) * 18 * intensity;
            const driftY = (dy / distance) * 18 * intensity;
            ctx.fillStyle = `color-mix(in srgb, ${pointerInk} ${Math.round((0.22 + intensity * 0.78) * 100)}%, transparent)`;
            ctx.fillText(
              Math.random() > 0.62 ? (Math.random() > 0.5 ? '0' : '1') : char,
              posX + charSize / 2 - driftX,
              posY + charSize / 2 - driftY,
            );
            continue;
          }

          ctx.fillStyle = `color-mix(in srgb, ${fieldInk} ${Math.round(alpha * 78)}%, transparent)`;
          ctx.fillText(char, posX + charSize / 2, posY + charSize / 2);
        }
      }

      time += 0.012;
      rafId = window.requestAnimationFrame(render);
    };

    resize();
    container.style.setProperty('--login-pointer-x', `${width * 0.62}px`);
    container.style.setProperty('--login-pointer-y', `${height * 0.58}px`);
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
    <div ref={containerRef} className="login-canvas">
      <canvas ref={canvasRef} className="login-canvas__element" />
    </div>
  );
}
