import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LogOut, Monitor, RefreshCw } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import {
  AuthError,
  authMessage,
  authRequest,
  sessionsSchema,
  type SessionRecord,
} from '../api/auth-api';
import { AuthNotice } from '../components/AuthFields';
import { Modal } from '../../../shared/ui/Primitives';
function time(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
export function AccountPage() {
  const { session, mutation, clear } = useAuth();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<SessionRecord | 'all' | null>(null);
  const load = useCallback(
    (signal?: AbortSignal) => {
      return authRequest('/sessions', { signal })
        .then((response) => {
          const data = sessionsSchema.parse(response);
          if (!signal?.aborted) setSessions(data.sessions);
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return;
          if (error instanceof AuthError && error.status === 401) clear();
          else setError(authMessage(error));
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [clear],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mutation('/logout');
      clear();
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!target || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await mutation(
        target === 'all' ? '/sessions/revoke-all' : `/sessions/${encodeURIComponent(target.id)}`,
        target === 'all' ? 'POST' : 'DELETE',
      );
      if (target === 'all' || target.current) clear();
      else {
        setNotice('That session has been signed out.');
        await load();
      }
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }
  return (
    <div className="auth-card account-card">
      <p className="eyebrow">YOUR TRACE ACCOUNT</p>
      <div className="account-heading">
        <h1>A space of your own.</h1>
        <Link className="button primary" to="/projects">
          Open my projects
        </Link>

        <button className="button secondary" onClick={() => void logout()} disabled={busy}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
      <p>
        Signed in as <strong className="account-email">{session?.user.email}</strong>
      </p>
      <div className="account-next">
        <h2>Your account is ready.</h2>
        <p>
          Create your own project, invite your team or Reviewer, and take your proposal through
          approval. Your overview brings your projects together.
        </p>
        <Link className="text-link" to="/overview">
          Open overview
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <AuthNotice error={error} success={notice} />
      <section className="account-sessions">
        <div className="section-heading">
          <h2>Active sessions</h2>
          <button
            className="icon-button"
            aria-label="Refresh sessions"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              setError('');
              void load();
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <p>Review where you’re signed in. Signing out a session takes effect immediately.</p>
        {loading ? (
          <p role="status">Loading sessions…</p>
        ) : (
          sessions.map((item, index) => (
            <article className="account-session" key={item.id}>
              <Monitor size={20} />
              <div>
                <h3>{item.current ? 'This browser' : `Other session ${index + 1}`}</h3>
                <p>
                  Signed in {time(item.created_at)}
                  <br />
                  Last active {time(item.last_used_at)}
                </p>
                <small>
                  Signs out if inactive until: {time(item.idle_expires_at)}
                  <br />
                  Session ends by: {time(item.absolute_expires_at)}
                </small>
              </div>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => setTarget(item)}
                aria-label={
                  item.current ? 'Sign out this browser' : `Sign out session ${index + 1}`
                }
              >
                Sign out
              </button>
            </article>
          ))
        )}
        <div className="account-session-footer">
          <button
            className="button secondary"
            disabled={busy || loading}
            onClick={() => setTarget('all')}
          >
            Sign out all sessions
          </button>
          <Link to="/forgot-password">Reset password</Link>
        </div>
      </section>
      {target && (
        <Modal
          title={target === 'all' ? 'Sign out everywhere?' : 'Sign out this session?'}
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <div className="modal-body">
            <p>
              {target === 'all'
                ? 'This includes the browser you’re using now. You’ll need to sign in again.'
                : target.current
                  ? 'You’ll be signed out of this browser and returned to the sign-in page.'
                  : 'That session will lose access to your account. Your current session stays signed in.'}
            </p>
            <div className="form-actions">
              <button className="button secondary" disabled={busy} onClick={() => setTarget(null)}>
                Cancel
              </button>
              <button className="button primary" disabled={busy} onClick={() => void revoke()}>
                {busy ? 'Signing out…' : 'Confirm sign out'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
