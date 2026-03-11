import type { CSSProperties } from 'react';

interface StaggeredItemProps {
  children: React.ReactNode;
  index: number;
}

export function StaggeredItem({ children, index }: StaggeredItemProps) {
  if (index >= 4) {
    return <>{children}</>;
  }

  return (
    <div
      className="staggered-item"
      style={{ '--stagger-delay': `${Math.min(index, 12) * 28}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
