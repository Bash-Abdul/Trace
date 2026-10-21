import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, ShieldCheck } from 'lucide-react';
import { authMessage, authRequest } from '../api/auth-api';
import { useAuth } from '../AuthProvider';
import { AuthNotice, PasswordField } from '../components/AuthFields';
export function ActionTokenPage({ reset = false }: { reset?: boolean }) {
  // Keep action credentials in memory only. A button, never page load, consumes them.
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, []);
  const { clear } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid) return;
    if (reset && password !== confirmation) {
      setError('The passwords don’t match. Please enter them again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest(reset ? '/password-reset/confirm' : '/verify-email', {
        method: 'POST',
        body: reset ? { token, password } : { token },
      });
      if (reset) clear();
      setToken('');
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-card">
      {done ? (
        <CheckCheck className="auth-symbol" size={32} />
      ) : (
        <ShieldCheck className="auth-symbol" size={32} />
      )}
      <p className="eyebrow">{reset ? 'A FRESH START' : 'ONE LAST CHECK'}</p>
      <h1>
        {done
          ? reset
            ? 'Your password is updated.'
            : 'Your email is verified.'
          : reset
            ? 'Choose a new password.'
            : 'Confirm your email.'}
      </h1>
      {done ? (
        <>
          <p>
            {reset
              ? 'All previous sessions have ended. Sign in with your new password. Your email must be verified before signing in.'
              : 'You’re ready to sign in and open your account.'}
          </p>
          <Link className="button primary full-width" to="/login">
            Sign in
          </Link>
        </>
      ) : !valid ? (
        <>
          <AuthNotice error="This page needs a valid link from your email. If you refreshed the page, reopen the email link or request a new one." />
          <Link
            className="button primary full-width"
            to={reset ? '/forgot-password' : '/resend-verification'}
          >
            Request a new link
          </Link>
        </>
      ) : (
        <>
          <p>
            {reset
              ? 'Choose a password you haven’t used elsewhere. Updating it signs out all your sessions.'
              : 'Select the button below to verify the email address associated with this link.'}
          </p>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {reset && (
                <>
                  <PasswordField
                    label="New password"
                    newPassword
                    value={password}
                    onChange={setPassword}
                  />
                  <PasswordField
                    label="Confirm new password"
                    newPassword
                    value={confirmation}
                    onChange={setConfirmation}
                  />
                </>
              )}
              <AuthNotice error={error} />
              <button className="button primary full-width" type="submit">
                {busy ? 'One moment…' : reset ? 'Update password' : 'Verify email'}
              </button>
            </fieldset>
          </form>
          <Link className="auth-switch" to={reset ? '/forgot-password' : '/resend-verification'}>
            Request a new link
          </Link>
        </>
      )}
    </div>
  );
}
