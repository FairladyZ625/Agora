import React, { useEffect, useRef } from 'react';

export interface IntelligenceCanvasProps {
  activeCount: number;
  reviewCount: number;
  hasError: boolean;
  className?: string;
}

const PARTICLE_COUNT = 60;
const WIDTH = 188;
const HEIGHT = 28;

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

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
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

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    opacity: 0.3 + Math.random() * 0.2,
    size: 1.5 + Math.random() * 0.5,
  }));
}

// CSS fallback for when WebGL2 is unavailable
function CssFallback({ className }: { className?: string }) {
  return (
    <div className={`topbar-intelligence${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="topbar-intelligence__dot topbar-intelligence__dot--1" />
      <span className="topbar-intelligence__dot topbar-intelligence__dot--2" />
      <span className="topbar-intelligence__dot topbar-intelligence__dot--3" />
      <span className="topbar-intelligence__rail topbar-intelligence__rail--left flow-shift" />
      <span className="topbar-intelligence__rail topbar-intelligence__rail--right" />
      <span className="topbar-intelligence__carrier signal-travel" />
    </div>
  );
}

export function IntelligenceCanvas({
  activeCount,
  reviewCount,
  hasError,
  className,
}: IntelligenceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ activeCount, reviewCount, hasError });

  // Keep stateRef current without triggering re-renders in the loop
  useEffect(() => {
    stateRef.current = { activeCount, reviewCount, hasError };
  }, [activeCount, reviewCount, hasError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) return; // fallback rendered instead
    const glContext: WebGL2RenderingContext = gl;

    let program: WebGLProgram;
    try {
      program = createProgram(gl);
    } catch {
      return;
    }

    gl.useProgram(program);

    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aOpacity = gl.getAttribLocation(program, 'a_opacity');
    const aSize = gl.getAttribLocation(program, 'a_size');
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uColor = gl.getUniformLocation(program, 'u_color');

    gl.uniform2f(uResolution, WIDTH, HEIGHT);

    // Buffers
    const posBuf = gl.createBuffer();
    const opBuf = gl.createBuffer();
    const szBuf = gl.createBuffer();

    const posData = new Float32Array(PARTICLE_COUNT * 2);
    const opData = new Float32Array(PARTICLE_COUNT);
    const szData = new Float32Array(PARTICLE_COUNT);

    const particles = makeParticles();

    // Lerp targets
    const targetVx = new Float32Array(PARTICLE_COUNT);
    const targetVy = new Float32Array(PARTICLE_COUNT);
    const targetOp = new Float32Array(PARTICLE_COUNT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let frame = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);
      frame++;

      const { activeCount: ac, reviewCount: rc, hasError: err } = stateRef.current;

      // Determine target color
      let color: [number, number, number];
      if (err) {
        color = hexToRgb('#ef4444');
      } else if (rc > 0) {
        color = hexToRgb('#f59e0b');
      } else {
        // Try to read CSS variable, fall back to default blue
        const cssColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-primary')
          .trim();
        color = cssColor.startsWith('#') && cssColor.length === 7
          ? hexToRgb(cssColor)
          : hexToRgb('#0284c7');
      }

      glContext.uniform3f(uColor, color[0], color[1], color[2]);

      // Compute per-particle targets
      const speedCap = Math.min(ac, 5);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (err) {
          // Chaotic scatter
          if (frame % 20 === i % 20) {
            targetVx[i] = (Math.random() - 0.5) * 3.0;
            targetVy[i] = (Math.random() - 0.5) * 3.0;
          }
          targetOp[i] = 0.6 + Math.random() * 0.3;
        } else if (rc > 0) {
          // Cluster toward center
          const cx = WIDTH / 2;
          const cy = HEIGHT / 2;
          const dx = cx - particles[i].x;
          const dy = cy - particles[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
          targetVx[i] = (dx / dist) * 0.6;
          targetVy[i] = (dy / dist) * 0.6;
          // Pulsing opacity
          targetOp[i] = 0.5 + 0.4 * Math.sin(frame * 0.05 + i * 0.3);
        } else if (ac > 0) {
          // Directional flow left→right
          targetVx[i] = 0.3 + (speedCap / 5) * 1.2;
          targetVy[i] = (Math.random() - 0.5) * 0.2;
          targetOp[i] = 0.7 + (speedCap / 5) * 0.2;
        } else {
          // Idle drift
          if (frame % 120 === i % 120) {
            targetVx[i] = (Math.random() - 0.5) * 0.4;
            targetVy[i] = (Math.random() - 0.5) * 0.4;
          }
          targetOp[i] = 0.3 + Math.random() * 0.2;
        }

        if (!reducedMotion) {
          const lerpT = 1 / 60;
          particles[i].vx += (targetVx[i] - particles[i].vx) * lerpT;
          particles[i].vy += (targetVy[i] - particles[i].vy) * lerpT;
          particles[i].opacity += (targetOp[i] - particles[i].opacity) * lerpT;

          particles[i].x += particles[i].vx;
          particles[i].y += particles[i].vy;

          // Wrap around edges
          if (particles[i].x < 0) particles[i].x += WIDTH;
          if (particles[i].x > WIDTH) particles[i].x -= WIDTH;
          if (particles[i].y < 0) particles[i].y += HEIGHT;
          if (particles[i].y > HEIGHT) particles[i].y -= HEIGHT;
        }

        posData[i * 2] = particles[i].x;
        posData[i * 2 + 1] = particles[i].y;
        opData[i] = particles[i].opacity;
        szData[i] = particles[i].size;
      }

      glContext.viewport(0, 0, WIDTH, HEIGHT);
      glContext.clearColor(0, 0, 0, 0);
      glContext.clear(glContext.COLOR_BUFFER_BIT);

      // Upload position
      glContext.bindBuffer(glContext.ARRAY_BUFFER, posBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, posData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aPosition);
      glContext.vertexAttribPointer(aPosition, 2, glContext.FLOAT, false, 0, 0);

      // Upload opacity
      glContext.bindBuffer(glContext.ARRAY_BUFFER, opBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, opData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aOpacity);
      glContext.vertexAttribPointer(aOpacity, 1, glContext.FLOAT, false, 0, 0);

      // Upload size
      glContext.bindBuffer(glContext.ARRAY_BUFFER, szBuf);
      glContext.bufferData(glContext.ARRAY_BUFFER, szData, glContext.DYNAMIC_DRAW);
      glContext.enableVertexAttribArray(aSize);
      glContext.vertexAttribPointer(aSize, 1, glContext.FLOAT, false, 0, 0);

      glContext.drawArrays(glContext.POINTS, 0, PARTICLE_COUNT);

      // Static mode: draw once then stop
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
  }, []); // intentionally empty — state read via stateRef

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      className={className}
      aria-hidden="true"
      style={{ display: 'block' }}
    />
  );
}

// Re-export with WebGL2 availability check as a wrapper
const IntelligenceCanvasWithFallback = React.memo(function IntelligenceCanvasWithFallback(
  props: IntelligenceCanvasProps,
) {
  // Check WebGL2 support once at module evaluation time via a lazy ref pattern
  const supportsWebGL2 = useRef<boolean | null>(null);
  if (supportsWebGL2.current === null) {
    try {
      const testCanvas = document.createElement('canvas');
      supportsWebGL2.current = !!testCanvas.getContext('webgl2');
    } catch {
      supportsWebGL2.current = false;
    }
  }

  if (!supportsWebGL2.current) {
    return <CssFallback className={props.className} />;
  }

  return <IntelligenceCanvas {...props} />;
});

export default IntelligenceCanvasWithFallback;
