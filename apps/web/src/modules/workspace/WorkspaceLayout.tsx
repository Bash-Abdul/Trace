import { Link, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import './workspace.css';

export function WorkspaceProvider() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
export function WorkspaceLayout() {
  const { session } = useAuth();
  return (
    <div className="live-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="live-header">
        <Link to="/workspace" className="brand">
          trace.
        </Link>
        <nav aria-label="Your workspace">
          <Link to="/workspace">My projects</Link>
          <Link to="/account">Account & sessions</Link>
          <Link to="/overview">Sample workspace</Link>
        </nav>
        <small>{session?.user.email}</small>
      </header>
      <main id="main-content" className="live-content">
        <Outlet />
      </main>
    </div>
  );
}
