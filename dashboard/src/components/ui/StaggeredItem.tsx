import { motion, useReducedMotion } from 'motion/react';

interface StaggeredItemProps {
  children: React.ReactNode;
  index: number;
}

export function StaggeredItem({ children, index }: StaggeredItemProps) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.16, ease: 'easeOut' }}
      style={{ display: 'contents' }}
    >
      {children}
    </motion.div>
  );
}
