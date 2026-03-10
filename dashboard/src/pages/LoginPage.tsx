import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { LoginAsciiCanvas } from '@/components/auth/LoginAsciiCanvas';
import { useSessionStore } from '@/stores/sessionStore';

export function LoginPage() {
  const location = useLocation();
  const status = useSessionStore((state) => state.status);
  const authenticated = useSessionStore((state) => state.authenticated);
  const error = useSessionStore((state) => state.error);
  const login = useSessionStore((state) => state.login);

  const [form, setForm] = useState({ username: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectTo = useMemo(() => {
    if (typeof location.state === 'object' && location.state && 'from' in location.state) {
      const from = location.state.from;
      return typeof from === 'string' && from.length > 0 ? from : '/';
    }
    return '/';
  }, [location.state]);

  if (authenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);

    try {
      await login(form.username.trim(), form.password);
    } catch (loginError) {
      setLocalError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-shell__backdrop" aria-hidden="true" />
      <main className="login-shell__main">
        <section className="login-shell__hero surface-panel">
          <LoginAsciiCanvas />
          <div className="login-shell__hero-veil" aria-hidden="true" />
          <div className="login-shell__hero-content">
            <div className="login-shell__copy-panel">
              <div className="login-shell__copy-frame" data-testid="login-copy-frame">
                <div className="login-shell__brandline">
                  <BrandLogo collapsed className="login-shell__brandmark" />
                  <span className="login-shell__eyebrow">HUMAN REVIEW CONSOLE</span>
                </div>
                <div className="login-shell__hero-copy">
                  <h1 className="login-shell__title">AGORA</h1>
                  <p className="login-shell__subtitle">Agents debate freely, humans decide, craftsmen execute.</p>
                </div>
              </div>
            </div>
            <form
              className="login-shell__form login-shell__form--floating"
              data-testid="login-card"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="login-shell__form-head">
                <p className="page-kicker">SESSION ACCESS</p>
                <h2 className="section-title">Sign in</h2>
              </div>

              <label className="space-y-2">
                <span className="field-label">Username</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  className="input-shell"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="input-shell"
                  autoComplete="current-password"
                  required
                />
              </label>

              {(localError ?? error) ? (
                <div className="inline-alert inline-alert--danger">{localError ?? error}</div>
              ) : null}

              <button type="submit" className="button-primary login-shell__submit" disabled={submitting || status === 'loading'}>
                {submitting || status === 'loading' ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
