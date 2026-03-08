interface SkeletonProps {
  variant?: 'text' | 'card' | 'row';
  className?: string;
}

export function Skeleton({ variant = 'text', className }: SkeletonProps) {
  return (
    <div
      className={['skeleton', `skeleton--${variant}`, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}
