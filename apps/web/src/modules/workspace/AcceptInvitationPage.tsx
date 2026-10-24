import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useProjectApi } from './use-project-api';
import { projectMessage } from './workspace-api';
export function AcceptInvitationPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  const { status, session } = useAuth();
  const api = useProjectApi();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);
  async function accept() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/invitations/accept', z.object({ projectId: z.string() }), {
        method: 'POST',
        body: { token },
      });
      navigate(`/projects/${result.projectId}`, { replace: true });
    } catch (e) {
      setError(projectMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-card">
      <p className="eyebrow">WORK, TOGETHER</p>
      <h1>Join a Trace project.</h1>
      <p>Only the verified account with the invited email address can accept this link.</p>
      {error && <p role="alert">{error}</p>}
      {!/^[A-Za-z0-9_-]{43}$/.test(token) ? (
        <p>Reopen the original invitation link to continue.</p>
      ) : status === 'authenticated' ? (
        <>
          <p>Signed in as {session?.user.email}.</p>
          <button disabled={busy} className="button primary" onClick={() => void accept()}>
            {busy ? 'Joining…' : 'Accept invitation'}
          </button>
          <p>
            Wrong account? <Link to="/account">Sign out from your account</Link>, sign in with the
            invited email, then reopen this link.
          </p>
        </>
      ) : status === 'loading' ? (
        <p role="status">Checking your account…</p>
      ) : (
        <>
          <p>
            Sign in or create an account with the invited email, then reopen this original
            invitation link.
          </p>
          <Link className="button primary" to="/login">
            Sign in
          </Link>{' '}
          <Link to="/register">Create an account</Link>
        </>
      )}
    </div>
  );
}
