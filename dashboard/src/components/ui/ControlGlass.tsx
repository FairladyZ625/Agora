import type { CSSProperties, ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';

interface ControlGlassProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  cornerRadius?: number;
  padding?: string;
}

function isJsdom() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

export function ControlGlass({
  children,
  className,
  style,
  cornerRadius = 18,
  padding = '0px',
}: ControlGlassProps) {
  if (isJsdom()) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <LiquidGlass
      className={className}
      style={style}
      cornerRadius={cornerRadius}
      padding={padding}
      blurAmount={0.08}
      saturation={135}
      aberrationIntensity={1.2}
      displacementScale={34}
      elasticity={0.18}
      mode="standard"
    >
      {children}
    </LiquidGlass>
  );
}
