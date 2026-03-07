import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const radiusMap = {
  md: 'md',
  lg: 'lg',
} as const;

const densityPaddingMap = {
  flush: 'flush',
  compact: 'compact',
} as const;

interface ControlGlassProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  radius?: keyof typeof radiusMap;
  density?: keyof typeof densityPaddingMap;
}

export function ControlGlass({
  children,
  className,
  style,
  radius = 'lg',
  density = 'flush',
}: ControlGlassProps) {
  return (
    <div
      className={cn('control-glass', className)}
      data-radius={radiusMap[radius]}
      data-density={densityPaddingMap[density]}
      style={style}
    >
      {children}
    </div>
  );
}
