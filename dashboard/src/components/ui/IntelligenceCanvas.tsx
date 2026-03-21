import React, { useEffect, useRef, useState } from 'react';

export interface IntelligenceCanvasProps {
  activeCount: number;
  reviewCount: number;
  hasError: boolean;
  className?: string;
  testId?: string;
}

const MIN_PARTICLE_COUNT = 72;
const MAX_PARTICLE_COUNT = 320;

const VERT_SRC = `#version 300 es
in vec2 a_position;
in float a_opacity;
in float a_size;
uniform vec2 u_resolution;
out float v_opacity;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_size;
  v_opacity = a_opacity;
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
uniform vec3 u_color;
in float v_opacity;
out vec4 outColor;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float alpha = (1.0 - dist * 2.0) * v_opacity;
  outColor = vec4(u_color, alpha);
}`;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim();
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function readThemeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info ?? ''}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const prog = gl.createProgram();
  if (!prog) throw new Error('Failed to create program');
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    throw new Error(`Program link error: ${info ?? ''}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return prog;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  size: number;
}

function computeParticleCount(width: number, height: number) {
  const areaDriven = Math.round((width * Math.max(height, 56)) / 520);
  return clamp(areaDriven, MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT);
}

function makeParticles(count: number, width: number, height: number, scale: number): Particle[] {
  const baseSize = clamp(height * 0.042, 1.8, 2.8) * scale;
  const variance = clamp(height * 0.018, 0.65, 1.2) * scale;

  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0.24 * scale + Math.random() * 0.2 * scale,
    vy: (Math.random() - 0.5) * 0.16 * scale,
    opacity: 0.34 + Math.random() * 0.26,
    size: baseSize + Math.random() * variance,
  }));
}

function useElementSize(elementRef: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize((prev) => {
        const nextWidth = Math.round(rect.width);
        const nextHeight = Math.round(rect.height);
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);

  return size;
}

function CssFallback({ className, testId }: { className?: string; testId?: string }) {
  return (
    <div
      className={`topbar-intelligence${className ? ` ${className}` : ''}`}
      data-testid={testId}
      aria-hidden="true"
    >
      <div className="topbar-intelligence__ornaments">
        <span className="topbar-intelligence__dot topbar-intelligence__dot--1" />
        <span className="topbar-intelligence__dot topbar-intelligence__dot--2" />
        <span className="topbar-intelligence__dot topbar-intelligence__dot--3" />
        <span className="topbar-intelligence__rail topbar-intelligence__rail--left flow-shift" />
        <span className="topbar-intelligence__rail topbar-intelligence__rail--right" />
        <span className="topbar-intelligence__carrier signal-travel" />
      </div>
    </div>
  );
}

export function IntelligenceCanvas({
  activeCount,
  reviewCount,
  hasError,
  className,
  testId,
}: IntelligenceCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ activeCount, reviewCount, hasError });
  const size = useElementSize(wrapperRef);

  useEffect(() => {
    stateRef.current = { activeCount, reviewCount, hasError };
  }, [activeCount, reviewCount, hasError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
    if (!gl) return;

    const glContext: WebGL2RenderingContext = gl;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const drawWidth = Math.max(1, Math.round(size.width * dpr));
    const drawHeight = Math.max(1, Math.round(size.height * dpr));
    const particleCount = computeParticleCount(size.width, size.height);

    canvas.width = drawWidth;
    canvas.height = drawHeight;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    let program: WebGLProgram;
    try {
      program = createProgram(glContext);
    } catch {
      return;
    }

    glContext.useProgram(program);

    const aPosition = glContext.getAttribLocation(program, 'a_position');
    const aOpacity = glContext.getAttribLocation(program, 'a_opacity');
    const aSize = glContext.getAttribLocation(program, 'a_size');
    const uResolution = glContext.getUniformLocation(program, 'u_resolution');
    const uColor = glContext.getUniformLocation(program, 'u_color');

    glContext.uniform2f(uResolution, drawWidth, drawHeight);

    const posBuf = glContext.createBuffer();
    const opBuf = glContext.createBuffer();
    const szBuf = glContext.createBuffer();

    if (!posBuf || !opBuf || !szBuf) {
      glContext.deleteProgram(program);
      return;
    }

    const posData = new Float32Array(particleCount * 2);
    const opData = new Float32Array(particleCount);
    const szData = new Float32Array(particleCount);
    const targetVx = new Float32Array(particleCount);
    const targetVy = new Float32Array(particleCount);
    const targetOp = new Float32Array(particleCount);
    const particles = makeParticles(particleCount, drawWidth, drawHeight, dpr);

    glContext.enable(glContext.BLEND);
    glContext.blendFunc(glContext.SRC_ALPHA, glContext.ONE_MINUS_SRC_ALPHA);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let frame = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);
      frame += 1;

      const { activeCount: ac, reviewCount: rc, hasError: err } = stateRef.current;

      let color: [number, number, number];
      if (err) {
        color = hexToRgb(readThemeColor('--intelligence-error-color'));
      } else if (rc > 0) {
        color = hexToRgb(readThemeColor('--intelligence-review-color'));
      } else {
        color = hexToRgb(readThemeColor('--intelligence-active-color'));
      }

      glContext.uniform3f(uColor, color[0], color[1], color[2]);

      const speedCap = Math.min(ac, 5);
      const lerpT = reducedMotion ? 1 : 0.06;
      const verticalBand = drawHeight * 0.22;

      for (let i = 0; i < particleCount; i += 1) {
        if (err) {
          if (frame % 16 === i % 16) {
            targetVx[i] = (0.75 + Math.random() * 0.65) * dpr;
            targetVy[i] = (Math.random() - 0.5) * 0.95 * dpr;
          }
          targetOp[i] = 0.72 + Math.random() * 0.2;
        } else if (rc > 0) {
          const laneY = drawHeight * 0.5 + Math.sin((frame * 0.04) + i * 0.18) * verticalBand;
          targetVx[i] = (0.62 + (i % 4) * 0.1) * dpr;
          targetVy[i] = (laneY - particles[i].y) * 0.018;
          targetOp[i] = 0.58 + 0.2 * (0.5 + Math.sin(frame * 0.05 + i * 0.24));
        } else if (ac > 0) {
          targetVx[i] = (0.68 + (speedCap * 0.2) + Math.random() * 0.24) * dpr;
          targetVy[i] = (Math.random() - 0.5) * 0.2 * dpr;
          targetOp[i] = 0.56 + (speedCap * 0.05) + Math.random() * 0.14;
        } else {
          targetVx[i] = (0.3 + Math.random() * 0.16) * dpr;
          targetVy[i] = (Math.random() - 0.5) * 0.1 * dpr;
          targetOp[i] = 0.42 + Math.random() * 0.14;
        }

        particles[i].vx += (targetVx[i] - particles[i].vx) * lerpT;
        particles[i].vy += (targetVy[i] - particles[i].vy) * lerpT;
        particles[i].opacity += (targetOp[i] - particles[i].opacity) * lerpT;

        if (!reducedMotion) {
          particles[i].x += particles[i].vx;
          particles[i].y += particles[i].vy;
        }

        if (particles[i].x < -16 * dpr) particles[i].x = drawWidth + 8 * dpr;
        if (particles[i].x > drawWidth + 16 * dpr) particles[i].x = -8 * dpr;
        if (particles[i].y < 0) particles[i].y += drawHeight;
        if (particles[i].y > drawHeight) particles[i].y -= drawHeight;

        posData[i * 2] = particles[i].x;
        posData[i * 2 + 1] = particles[i].y;
        opData[i] = particles[i].opacity;
        szData[i] = particles[i].size;
      }

      glContext.viewport(0, 0, drawWidth, drawHeight);
      glContext.clearColor(0, 0, 0, 0);
      glContext.clear(glContext.COLOR_BUFFER_BIT);

      glContext.bindBuffer(glContext.ARRAY_BUFFER, posBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, posData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aPosition);
      glContext.vertexAttribPointer(aPosition, 2, glContext.FLOAT, false, 0, 0);

      glContext.bindBuffer(glContext.ARRAY_BUFFER, opBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, opData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aOpacity);
      glContext.vertexAttribPointer(aOpacity, 1, glContext.FLOAT, false, 0, 0);

      glContext.bindBuffer(glContext.ARRAY_BUFFER, szBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, szData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aSize);
      glContext.vertexAttribPointer(aSize, 1, glContext.FLOAT, false, 0, 0);

      glContext.drawArrays(glContext.POINTS, 0, particleCount);

      if (reducedMotion) {
        cancelAnimationFrame(rafId);
      }
    }

    tick();

    return () => {
      cancelAnimationFrame(rafId);
      glContext.deleteBuffer(posBuf);
      glContext.deleteBuffer(opBuf);
      glContext.deleteBuffer(szBuf);
      glContext.deleteProgram(program);
    };
  }, [size.height, size.width]);

  return (
    <div
      ref={wrapperRef}
      className={`topbar-intelligence${className ? ` ${className}` : ''}`}
      data-testid={testId}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="topbar-intelligence__canvas" />
      <div className="topbar-intelligence__ornaments">
        <span className="topbar-intelligence__dot topbar-intelligence__dot--1" />
        <span className="topbar-intelligence__dot topbar-intelligence__dot--2" />
        <span className="topbar-intelligence__dot topbar-intelligence__dot--3" />
        <span className="topbar-intelligence__rail topbar-intelligence__rail--left flow-shift" />
        <span className="topbar-intelligence__rail topbar-intelligence__rail--right" />
        <span className="topbar-intelligence__carrier signal-travel" />
      </div>
    </div>
  );
}

const IntelligenceCanvasWithFallback = React.memo(function IntelligenceCanvasWithFallback(
  props: IntelligenceCanvasProps,
) {
  const [supportsWebGL2] = useState(() => {
    try {
      const testCanvas = document.createElement('canvas');
      return !!testCanvas.getContext('webgl2');
    } catch {
      return false;
    }
  });

  if (!supportsWebGL2) {
    return <CssFallback className={props.className} testId={props.testId} />;
  }

  return <IntelligenceCanvas {...props} />;
});

export default IntelligenceCanvasWithFallback;
