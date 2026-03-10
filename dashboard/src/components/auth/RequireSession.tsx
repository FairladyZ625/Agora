import { Navigate, useLocation } from 'react-router';
import { useSessionStore } from '@/stores/sessionStore';

function SessionPendingScreen() {
  return (
    <div className="login-shell">
      <div className="login-shell__backdrop" aria-hidden="true" />
      <main className="login-shell__main">
        <section className="login-shell__panel login-shell__panel--compact">
          <p className="login-shell__eyebrow">SESSION CHECK</p>
          <h1 className="login-shell__title">AGORA</h1>
          <p className="login-shell__subtitle">Authenticating dashboard access.</p>
          <div className="login-shell__status-row">
            <span className="status-pill status-pill--info">Checking session</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export function RequireSession({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const status = useSessionStore((state) => state.status);
  const authenticated = useSessionStore((state) => state.authenticated);

  if (status === 'idle' || status === 'loading') {
    return <SessionPendingScreen />;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
