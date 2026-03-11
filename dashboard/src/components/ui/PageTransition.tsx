import { useLocation } from 'react-router';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    <div
      key={location.pathname}
      className="page-transition flex min-w-0 flex-1 flex-col"
    >
      {children}
    </div>
  );
}
