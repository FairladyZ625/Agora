import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  BookOpen,
  Box,
  ShieldCheck,
  Monitor,
  Moon,
  Sun,
  ArrowRight,
} from 'lucide-react';
import { Navigate, useLocation } from 'react-router';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { LoginAsciiCanvas } from '@/components/auth/LoginAsciiCanvas';
import { useLoginCopy } from '@/lib/dashboardCopy';
import { useSessionStore } from '@/stores/sessionStore';
import { useThemeStore } from '@/stores/themeStore';

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

const fieldIconMap = {
  governance: ShieldCheck,
  context: Box,
  runtime: Activity,
  references: BookOpen,
} as const;

export function LoginPage() {
  const location = useLocation();
  const copy = useLoginCopy();
  const status = useSessionStore((state) => state.status);
  const authenticated = useSessionStore((state) => state.authenticated);
  const error = useSessionStore((state) => state.error);
  const login = useSessionStore((state) => state.login);
  const clearError = useSessionStore((state) => state.clearError);
  const { mode, resolved, setMode } = useThemeStore();

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

  useEffect(() => {
    clearError();
  }, [clearError]);

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

  const nextTheme = resolved === 'dark' ? 'light' : 'dark';
  const ThemeIcon = themeIcons[mode];
  const shellToneClass = mode === 'light' ? 'login-shell--light' : 'login-shell--dark';

  return (
    <div className={`login-shell ${shellToneClass}`}>
      <div className="login-shell__backdrop" aria-hidden="true" />

      <header className="login-shell__nav" aria-label={copy.navAria}>
        <div className="login-shell__nav-brand">
          <BrandLogo collapsed className="login-shell__nav-mark" />
          <span className="login-shell__nav-name">{copy.brand}</span>
        </div>

        <div className="login-shell__nav-utility">
          <div className="login-shell__nav-status" aria-hidden="true">
            <span className="login-shell__nav-status-dot" />
            <span>{copy.status.title}</span>
          </div>

          <button
            type="button"
            className="login-shell__theme-button"
            aria-label={copy.themeAction}
            title={copy.themeAction}
            onClick={() => setMode(nextTheme)}
          >
            <ThemeIcon size={16} />
          </button>
        </div>
      </header>

      <main className="login-shell__main">
        <section className="login-shell__hero surface-panel">
          <LoginAsciiCanvas />
          <div className="login-shell__hero-veil" aria-hidden="true" />

          <div className="login-shell__hero-content">
            <div className="login-shell__hero-column">
              <section
                id="login-identity"
                className="login-shell__identity-panel"
                data-testid="login-copy-frame"
              >
                <p className="login-shell__eyebrow">{copy.eyebrow}</p>
                <h1 className="login-shell__title">{copy.title}</h1>
                <p className="login-shell__subtitle">{copy.subtitle}</p>
                <div className="login-shell__identity-signals" aria-hidden="true">
                  {copy.identitySignals.map((signal) => (
                    <span key={signal} className="login-shell__identity-pill">
                      {signal}
                    </span>
                  ))}
                </div>
              </section>

              <div id="login-signal-stage" className="login-shell__signal-stage" aria-hidden="true">
                {copy.fieldNodes.map((node) => {
                  const NodeIcon = fieldIconMap[node.key as keyof typeof fieldIconMap] ?? Box;

                  return (
                    <article
                      key={node.key}
                      className={`login-shell__signal-card login-shell__signal-card--${node.key}`}
                      data-signal-node={node.key}
                    >
                      <div className="login-shell__signal-card-head">
                        <span className="login-shell__signal-icon">
                          <NodeIcon size={15} />
                        </span>
                        <span className="login-shell__signal-card-title">{node.title}</span>
                      </div>
                      <p className="login-shell__signal-card-copy">{node.body}</p>
                    </article>
                  );
                })}

                <div className="login-shell__signal-core-anchor" data-signal-core aria-hidden="true">
                  <span className="login-shell__signal-core-ring login-shell__signal-core-ring--outer" />
                  <span className="login-shell__signal-core-ring login-shell__signal-core-ring--inner" />
                  <span className="login-shell__signal-core-dot" />
                </div>
              </div>
            </div>

            <aside className="login-shell__access-rail">
              <form
                id="login-card"
                className="login-shell__form login-shell__form--floating"
                data-testid="login-card"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div className="login-shell__form-head">
                  <p className="page-kicker">{copy.form.kicker}</p>
                  <h2 className="section-title">{copy.form.title}</h2>
                  <p className="login-shell__form-copy">{copy.form.subtitle}</p>
                </div>

                <label className="space-y-2">
                  <span className="field-label">{copy.form.username}</span>
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
                  <span className="field-label">{copy.form.password}</span>
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
                  <div role="alert" className="inline-alert inline-alert--danger">{localError ?? error}</div>
                ) : null}

                <button type="submit" className="button-primary login-shell__submit" disabled={submitting || status === 'loading'}>
                  <span>{submitting || status === 'loading' ? copy.form.submitting : copy.form.submit}</span>
                  <ArrowRight size={16} />
                </button>

                <div className="login-shell__form-meta">
                  <p className="login-shell__form-meta-title">{copy.formMeta.title}</p>
                  <p className="login-shell__form-meta-copy">{copy.formMeta.body}</p>
                </div>
              </form>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
