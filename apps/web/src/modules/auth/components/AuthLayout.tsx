import { Link, Navigate, Outlet } from 'react-router-dom';
import { ArrowLeft, Sprout } from 'lucide-react';
import { AuthProvider, useAuth } from '../AuthProvider';
import '../auth.css';
export function AuthLayout() {
  return (
    <AuthProvider>
      <div className="auth-layout">
        <aside className="auth-story">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <i />
              <i />
              <i />
            </span>
            trace.
          </Link>
          <div>
            <Sprout size={42} strokeWidth={1} />
            <p className="eyebrow">THE WORK BEHIND THE WORK</p>
            <h1>
              Every step
              <br />
              has a story.
            </h1>
            <p>A space for your thinking, your progress, and the people who help it grow.</p>
          </div>
          <small>Made for the work behind the work.</small>
        </aside>
        <main className="auth-main">
          <Link to="/" className="back-link">
            <ArrowLeft size={15} />
            Back to Trace
          </Link>
          <Outlet />
          <footer>
            Back to <Link to="/">Trace</Link>
          </footer>
        </main>
      </div>
    </AuthProvider>
  );
}
export function RequireAuth() {
  const { status, error, refresh } = useAuth();
  if (status === 'loading')
    return (
      <div className="auth-card" role="status">
        Opening your account…
      </div>
    );
  if (status === 'error')
    return (
      <div className="auth-card">
        <h1>Let’s try that again.</h1>
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => void refresh()}>
          Retry connection
        </button>
      </div>
    );
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}
