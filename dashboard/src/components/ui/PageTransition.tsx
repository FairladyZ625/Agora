import { motion, useReducedMotion } from 'motion/react';
import { useLocation } from 'react-router';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      key={location.pathname}
      initial={shouldReduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </motion.div>
  );
}
