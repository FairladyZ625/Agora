import type { CSSProperties, ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';

const radiusMap = {
  md: 16,
  lg: 18,
} as const;

const densityPaddingMap = {
  flush: '0px',
  compact: '8px 12px',
} as const;

interface ControlGlassProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  radius?: keyof typeof radiusMap;
  density?: keyof typeof densityPaddingMap;
}

function isJsdom() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

export function ControlGlass({
  children,
  className,
  style,
  radius = 'lg',
  density = 'flush',
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
      cornerRadius={radiusMap[radius]}
      padding={densityPaddingMap[density]}
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
