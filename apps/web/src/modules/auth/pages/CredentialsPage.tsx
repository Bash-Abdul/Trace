import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { authMessage, authRequest } from '../api/auth-api';
import { AuthNotice, PasswordField } from '../components/AuthFields';
export function CredentialsPage({ register = false }: { register?: boolean }) {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (register) {
        await authRequest('/register', { method: 'POST', body: { email: email.trim(), password } });
        setPassword('');
        setSent(true);
      } else {
        await signIn(email.trim(), password);
        setPassword('');
        navigate('/account', { replace: true });
      }
    } catch (error) {
      setError(authMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (status === 'authenticated') return <Navigate to="/account" replace />;
  if (sent)
    return (
      <div className="auth-card">
        <MailCheck className="auth-symbol" size={32} />
        <p className="eyebrow">ONE SMALL STEP</p>
        <h1>Check your inbox.</h1>
        <p>
          If registration can be completed, you’ll receive an email with a verification link. Open
          it to confirm your address, then sign in.
        </p>
        <Link className="button primary full-width" to="/login">
          Back to sign in
          <ArrowRight size={16} />
        </Link>
        <p className="auth-switch">
          No email yet? <Link to="/resend-verification">Request another link</Link>
        </p>
      </div>
    );
  return (
    <div className="auth-card">
      <p className="eyebrow">{register ? 'A NEW CHAPTER' : 'PICK UP WHERE YOU LEFT OFF'}</p>
      <h1>{register ? 'Make room for your work.' : 'Welcome back.'}</h1>
      <p>
        {register
          ? 'Create your Trace account. We’ll email you a link to verify your address.'
          : 'Sign in to your Trace account.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <PasswordField value={password} onChange={setPassword} newPassword={register} />
          {!register && (
            <Link className="auth-forgot" to="/forgot-password">
              Forgot your password?
            </Link>
          )}
          <AuthNotice error={error} />
          <button className="button primary full-width" type="submit">
            {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
            <ArrowRight size={16} />
          </button>
        </fieldset>
      </form>
      <p className="auth-switch">
        {register ? 'Already have an account?' : 'New to Trace?'}{' '}
        <Link to={register ? '/login' : '/register'}>
          {register ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
      {!register && (
        <p className="auth-switch">
          <Link to="/resend-verification">Resend verification email</Link>
        </p>
      )}
    </div>
  );
}
