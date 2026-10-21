import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { authRequest, authMessage } from '../api/auth-api';
import { AuthNotice } from '../components/AuthFields';
export function EmailRequestPage({ verification = false }: { verification?: boolean }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await authRequest(verification ? '/resend-verification' : '/password-reset/request', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setSent(true);
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-card">
      <Mail className="auth-symbol" size={30} />
      <p className="eyebrow">LET’S GET YOU BACK ON TRACK</p>
      <h1>{verification ? 'A fresh verification link.' : 'Forgot your password?'}</h1>
      <p>
        {verification
          ? 'Enter your email to request another verification link. Use the newest email you receive.'
          : 'Enter your email and we’ll send instructions to choose a new password.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <AuthNotice
            error={error}
            success={
              sent
                ? 'If the account is eligible, check your email for instructions. Delivery may take a few minutes.'
                : undefined
            }
          />
          <button type="submit" className="button primary full-width">
            {busy ? 'Sending…' : sent ? 'Send another email' : 'Send email'}
          </button>
        </fieldset>
      </form>
      <Link className="auth-switch" to="/login">
        Back to sign in
      </Link>
    </div>
  );
}
