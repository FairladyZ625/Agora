import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCcw, UserCog, UserPlus } from 'lucide-react';
import type { ApiDashboardUserListDto } from '@/types/api';
import * as api from '@/lib/api';
import { useSettingsPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';

type DashboardUser = ApiDashboardUserListDto['users'][number];

interface HumanAccountsPanelProps {
  isAdmin: boolean;
  currentUsername: string | null;
  currentRole: 'admin' | 'member' | null;
  authMethod: string | null;
}

export function HumanAccountsPanel({
  isAdmin,
  currentUsername,
  currentRole,
  authMethod,
}: HumanAccountsPanelProps) {
  const settingsPageCopy = useSettingsPageCopy();
  const { showMessage } = useFeedbackStore();
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ username: '', password: '' });
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [identityDrafts, setIdentityDrafts] = useState<Record<string, { provider: string; external_user_id: string }>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const response = await api.listDashboardUsers();
      setUsers(response.users);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      showMessage(settingsPageCopy.operationMessages.loadFailedTitle, message, 'warning');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, settingsPageCopy.operationMessages.loadFailedTitle, showMessage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async () => {
    setPendingAction('create');
    try {
      await api.createDashboardUser(createForm);
      showMessage(
        settingsPageCopy.operationMessages.createSuccessTitle,
        settingsPageCopy.operationMessages.createSuccessDetail(createForm.username),
        'success',
      );
      setCreateForm({ username: '', password: '' });
      await loadUsers();
    } catch (error) {
      showMessage(
        settingsPageCopy.operationMessages.createFailedTitle,
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleResetPassword = async (username: string) => {
    const password = passwordDrafts[username]?.trim();
    if (!password) {
      return;
    }

    setPendingAction(`password:${username}`);
    try {
      await api.updateDashboardUserPassword(username, password);
      showMessage(
        settingsPageCopy.operationMessages.passwordSuccessTitle,
        settingsPageCopy.operationMessages.passwordSuccessDetail(username),
        'success',
      );
      setPasswordDrafts((current) => ({ ...current, [username]: '' }));
    } catch (error) {
      showMessage(
        settingsPageCopy.operationMessages.passwordFailedTitle,
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleDisableUser = async (username: string) => {
    setPendingAction(`disable:${username}`);
    try {
      await api.disableDashboardUser(username);
      showMessage(
        settingsPageCopy.operationMessages.disableSuccessTitle,
        settingsPageCopy.operationMessages.disableSuccessDetail(username),
        'success',
      );
      await loadUsers();
    } catch (error) {
      showMessage(
        settingsPageCopy.operationMessages.disableFailedTitle,
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleBindIdentity = async (username: string) => {
    const draft = identityDrafts[username];
    if (!draft?.provider.trim() || !draft.external_user_id.trim()) {
      return;
    }

    setPendingAction(`identity:${username}`);
    try {
      await api.bindDashboardUserIdentity(username, draft);
      showMessage(
        settingsPageCopy.operationMessages.identitySuccessTitle,
        settingsPageCopy.operationMessages.identitySuccessDetail(username),
        'success',
      );
      setIdentityDrafts((current) => ({
        ...current,
        [username]: { provider: current[username]?.provider ?? 'discord', external_user_id: '' },
      }));
      await loadUsers();
    } catch (error) {
      showMessage(
        settingsPageCopy.operationMessages.identityFailedTitle,
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className="surface-panel surface-panel--workspace settings-mgo__accounts" data-testid="settings-accounts-panel">
      <div className="section-title-row">
        <div>
          <p className="page-kicker">{settingsPageCopy.accessKicker}</p>
          <h3 className="section-title">{settingsPageCopy.accessTitle}</h3>
        </div>
        <UserCog size={16} className="icon-accent-primary" />
      </div>

      <p className="type-body-sm mt-4">{settingsPageCopy.accessSummary}</p>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="detail-card">
          <span className="detail-card__label">{settingsPageCopy.sessionLabels.actor}</span>
          <span className="detail-card__value">{currentUsername ?? 'unbound'}</span>
        </div>
        <div className="detail-card">
          <span className="detail-card__label">{settingsPageCopy.sessionLabels.role}</span>
          <span className="detail-card__value">
            {currentRole ? settingsPageCopy.roleLabels[currentRole] : settingsPageCopy.roleLabels.member}
          </span>
        </div>
        <div className="detail-card">
          <span className="detail-card__label">{settingsPageCopy.sessionLabels.method}</span>
          <span className="detail-card__value">{authMethod ?? 'session'}</span>
        </div>
      </div>

      <div className="section-title-row mt-8">
        <div>
          <p className="page-kicker">{settingsPageCopy.accountKicker}</p>
          <h3 className="section-title">{settingsPageCopy.accountTitle}</h3>
        </div>
        <UserPlus size={16} className="icon-accent-info" />
      </div>

      <p className="type-body-sm mt-4">{settingsPageCopy.accountSummary}</p>

      {!isAdmin ? (
        <div className="inline-alert mt-5">{settingsPageCopy.adminOnlyNotice}</div>
      ) : (
        <>
          <div className="mt-5 dashboard-users-create">
            <div className="dashboard-users-create__head">
              <div>
                <p className="type-heading-sm">{settingsPageCopy.createUserTitle}</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => void loadUsers()}>
                <RefreshCcw size={14} />
                <span>{settingsPageCopy.reloadAccountsAction}</span>
              </button>
            </div>

            <div className="settings-form-grid mt-4 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="field-label">{settingsPageCopy.usernameLabel}</span>
                <input
                  type="text"
                  className="input-shell"
                  value={createForm.username}
                  onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
              <label className="space-y-2">
                <span className="field-label">{settingsPageCopy.passwordLabel}</span>
                <input
                  type="password"
                  className="input-shell"
                  value={createForm.password}
                  onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
              <div className="dashboard-users-create__action">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void handleCreateUser()}
                  disabled={!createForm.username.trim() || !createForm.password.trim() || pendingAction === 'create'}
                >
                  {settingsPageCopy.createUserAction}
                </button>
              </div>
            </div>
          </div>

          {loading ? <div className="inline-alert mt-5">{settingsPageCopy.loadingAccounts}</div> : null}
          {loadError ? <div className="inline-alert inline-alert--danger mt-5">{loadError}</div> : null}
          {!loading && users.length === 0 ? <div className="inline-alert mt-5">{settingsPageCopy.noAccounts}</div> : null}

          <div className="dashboard-users-grid mt-5">
            {users.map((user) => (
              <article key={user.username} className="dashboard-user-card">
                <div className="dashboard-user-card__head">
                  <div>
                    <p className="dashboard-user-card__name">{user.username}</p>
                    <div className="dashboard-user-card__meta">
                      <span className="status-pill status-pill--info">
                        {settingsPageCopy.roleLabels[user.role]}
                      </span>
                      <span className={user.enabled ? 'status-pill status-pill--success' : 'status-pill status-pill--warning'}>
                        {user.enabled ? settingsPageCopy.enabledLabel : settingsPageCopy.disabledLabel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void handleDisableUser(user.username)}
                    disabled={!user.enabled || pendingAction === `disable:${user.username}`}
                  >
                    {settingsPageCopy.disableUserAction}
                  </button>
                </div>

                <div className="dashboard-user-card__block">
                  <p className="field-label">{settingsPageCopy.bindIdentityTitle}</p>
                  <div className="dashboard-user-identities">
                    {user.identities.length > 0 ? user.identities.map((identity) => (
                      <div key={`${identity.provider}:${identity.external_user_id}`} className="dashboard-user-identity">
                        <span>{identity.provider}</span>
                        <span>{identity.external_user_id}</span>
                      </div>
                    )) : (
                      <div className="dashboard-user-identity dashboard-user-identity--empty">
                        {settingsPageCopy.userIdentityEmpty}
                      </div>
                    )}
                  </div>
                  <div className="settings-form-grid mt-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      <span className="field-label">{settingsPageCopy.providerLabel}</span>
                      <input
                        type="text"
                        className="input-shell"
                        value={identityDrafts[user.username]?.provider ?? 'discord'}
                        onChange={(event) => setIdentityDrafts((current) => ({
                          ...current,
                          [user.username]: {
                            provider: event.target.value,
                            external_user_id: current[user.username]?.external_user_id ?? '',
                          },
                        }))}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="field-label">{settingsPageCopy.externalUserIdLabel}</span>
                      <input
                        type="text"
                        className="input-shell"
                        value={identityDrafts[user.username]?.external_user_id ?? ''}
                        onChange={(event) => setIdentityDrafts((current) => ({
                          ...current,
                          [user.username]: {
                            provider: current[user.username]?.provider ?? 'discord',
                            external_user_id: event.target.value,
                          },
                        }))}
                      />
                    </label>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleBindIdentity(user.username)}
                      disabled={pendingAction === `identity:${user.username}`}
                    >
                      {settingsPageCopy.bindIdentityAction}
                    </button>
                  </div>
                </div>

                <div className="dashboard-user-card__block">
                  <p className="field-label">{settingsPageCopy.passwordLabel}</p>
                  <div className="dashboard-user-password">
                    <label className="space-y-2">
                      <span className="sr-only">{settingsPageCopy.passwordLabel}</span>
                      <input
                        type="password"
                        className="input-shell"
                        value={passwordDrafts[user.username] ?? ''}
                        onChange={(event) => setPasswordDrafts((current) => ({
                          ...current,
                          [user.username]: event.target.value,
                        }))}
                      />
                    </label>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleResetPassword(user.username)}
                      disabled={pendingAction === `password:${user.username}` || !(passwordDrafts[user.username] ?? '').trim()}
                    >
                      <KeyRound size={14} />
                      <span>{settingsPageCopy.resetPasswordAction}</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
