import { Link } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
export function LiveSettingsPage() {
  const { session } = useAuth();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Your workspace.</h1>
          <p>Manage your Trace account and security.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <Monitor size={24} />
        <h2>Your account and sessions.</h2>
        <p>
          Signed in as <strong>{session?.user.email}</strong>.
        </p>
        <p>Review active sessions, sign out other devices, or reset your password.</p>
        <Link className="button secondary" to="/account">
          Manage account and sessions
        </Link>
        <hr />
        <h3>Sample workspace</h3>
        <p>Explore and reset fictional projects separately from your live work.</p>
        <Link className="text-link" to="/demo/settings">
          Open demo settings
        </Link>
      </section>
    </>
  );
}
