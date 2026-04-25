import { useEffect, useRef } from 'react';

type DriftParticle = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
};

function createParticle(index: number, width: number, height: number): DriftParticle {
  return {
    x: width * (0.18 + (index % 16) * 0.05) + Math.sin(index * 1.31) * width * 0.018,
    y: height * (0.14 + Math.floor(index / 16) * 0.08) + Math.cos(index * 0.93) * height * 0.03,
    radius: 0.8 + (index % 5) * 0.35,
    speed: 0.26 + (index % 7) * 0.035,
    drift: 8 + (index % 11) * 2.6,
    phase: index * 0.51,
    alpha: 0.18 + (index % 6) * 0.05,
  };
}

function readToken(container: HTMLElement, token: string) {
  const style = window.getComputedStyle(container);
  return style.getPropertyValue(token).trim() || style.color;
}

function readAnchor(element: Element | null, containerRect: DOMRect) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - containerRect.left + rect.width / 2,
    y: rect.top - containerRect.top + rect.height / 2,
  };
}

export function LoginAsciiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

    let rafId = 0;
    let width = 0;
    let height = 0;
    let time = 0;
    let previousFrameTime = performance.now();
    let particles: DriftParticle[] = [];
    let pointerX = 0;
    let pointerY = 0;
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      particles = Array.from({ length: 144 }, (_, index) => createParticle(index, width, height));
    };

    const render = (frameTime = performance.now()) => {
      const fieldVoid = readToken(container, '--login-field-void');
      const fieldCore = readToken(container, '--login-field-core');
      const fieldCoreGlow = readToken(container, '--login-field-core-glow');
      const fieldOrbit = readToken(container, '--login-field-orbit');
      const fieldOrbitStrong = readToken(container, '--login-field-orbit-strong');
      const fieldNode = readToken(container, '--login-field-node');
      const fieldNodeGlow = readToken(container, '--login-field-node-glow');
      const fieldLink = readToken(container, '--login-field-link');
      const fieldGrid = readToken(container, '--login-field-grid');
      const fieldParticle = readToken(container, '--login-field-particle');

      ctx.clearRect(0, 0, width, height);

      const containerRect = container.getBoundingClientRect();
      const coreAnchor = readAnchor(container.querySelector('[data-signal-core]'), containerRect);
      const nodeAnchors = Array.from(container.querySelectorAll('[data-signal-node]'))
        .map((element, index) => {
          const anchor = readAnchor(element, containerRect);
          if (!anchor) {
            return null;
          }

          return { ...anchor, phase: index * 1.37 };
        })
        .filter((anchor): anchor is { x: number; y: number; phase: number } => anchor !== null);

      const centerX = (coreAnchor?.x ?? width * 0.52) + pointerX * 12;
      const centerY = (coreAnchor?.y ?? height * 0.49) + pointerY * 10;
      const pulse = 0.5 + Math.sin(time * 1.14) * 0.5;
      const softPulse = 0.5 + Math.sin(time * 0.34) * 0.5;

      const bloom = ctx.createRadialGradient(centerX, centerY, width * 0.01, centerX, centerY, width * 0.42);
      bloom.addColorStop(0, fieldCoreGlow);
      bloom.addColorStop(0.26, fieldCore);
      bloom.addColorStop(0.58, fieldOrbit);
      bloom.addColorStop(1, fieldVoid);
      ctx.globalAlpha = 0.64 + pulse * 0.14;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, width, height);

      for (let ring = 0; ring < 7; ring += 1) {
        const radius = width * (0.05 + ring * 0.045);
        ctx.beginPath();
        ctx.lineWidth = ring === 2 ? 1.35 : 0.8;
        ctx.strokeStyle = ring % 2 === 0 ? fieldOrbitStrong : fieldOrbit;
        ctx.globalAlpha = 0.18 + ring * 0.03 + softPulse * 0.08;
        ctx.ellipse(centerX, centerY, radius, radius * (0.42 + ring * 0.02), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let row = 0; row < 18; row += 1) {
        const y = height * 0.1 + row * (height * 0.045);
        ctx.beginPath();
        ctx.strokeStyle = fieldGrid;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 0.6;
        ctx.moveTo(width * 0.14, y + Math.sin(time * 0.32 + row) * 3);
        ctx.bezierCurveTo(width * 0.34, y - 18, width * 0.72, y + 14, width * 0.92, y + Math.cos(time * 0.22 + row) * 4);
        ctx.stroke();
      }

      for (let spoke = 0; spoke < 10; spoke += 1) {
        const angle = (Math.PI * 2 * spoke) / 10 + time * 0.015;
        const endX = centerX + Math.cos(angle) * width * 0.18;
        const endY = centerY + Math.sin(angle) * height * 0.16;
        ctx.beginPath();
        ctx.strokeStyle = fieldLink;
        ctx.globalAlpha = 0.2 + (spoke % 3) * 0.04;
        ctx.lineWidth = spoke % 4 === 0 ? 1.1 : 0.7;
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      for (const node of nodeAnchors) {
        const glowRadius = width * 0.03;
        const nodePulse = 0.45 + (Math.sin(time * 0.92 + node.phase) + 1) * 0.28;
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
        glow.addColorStop(0, fieldNodeGlow);
        glow.addColorStop(1, fieldVoid);
        ctx.globalAlpha = 0.34 + nodePulse * 0.24;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.82 + nodePulse * 0.18;
        ctx.fillStyle = fieldNode;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2.4 + nodePulse * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const [index, node] of nodeAnchors.entries()) {
        const angle = Math.atan2(node.y - centerY, node.x - centerX);
        const packetTravel = (time * 0.07 + index * 0.19) % 1;
        const packetX = centerX + Math.cos(angle) * packetTravel * Math.hypot(node.x - centerX, node.y - centerY);
        const packetY = centerY + Math.sin(angle) * packetTravel * Math.hypot(node.x - centerX, node.y - centerY);

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = fieldLink;
        ctx.globalAlpha = 0.26;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = fieldCore;
        ctx.globalAlpha = 0.82;
        ctx.arc(packetX, packetY, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const particle of particles) {
        const x = particle.x + Math.cos(time * particle.speed + particle.phase) * particle.drift;
        const y = particle.y + Math.sin(time * (particle.speed + 0.08) + particle.phase) * particle.drift * 0.8;
        ctx.beginPath();
        ctx.fillStyle = fieldParticle;
        ctx.globalAlpha = particle.alpha * (0.7 + softPulse * 0.5);
        ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = fieldCore;
      ctx.globalAlpha = 0.94;
      ctx.arc(centerX, centerY, 4.6 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;

      const frameDelta = Math.min(2.4, Math.max(0.35, (frameTime - previousFrameTime) / 16.67));
      previousFrameTime = frameTime;
      const documentMotionMode = document.documentElement.dataset.motion;
      const motionStep = documentMotionMode === 'lite' || reducedMotionQuery.matches ? 0.006 : 0.017;
      time += motionStep * frameDelta;
      rafId = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const handlePointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };

    resize();
    render();

    window.addEventListener('resize', resize);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={containerRef} id="login-context-field" className="login-canvas" data-testid="login-context-field">
      <canvas ref={canvasRef} className="login-canvas__element" />
    </div>
  );
}
