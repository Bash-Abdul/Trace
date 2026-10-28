import { NotificationBell } from '../../modules/notifications/NotificationBell';
import { useActionToast } from '../../modules/notifications/action-toast';
import { useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronsUpDown,
  CircleHelp,
  ClipboardCheck,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useWorkspaceView } from '../providers/WorkspaceViewProvider';
import { useAuth } from '../../modules/auth/AuthProvider';
import { useDemo } from '../providers/DemoProvider';
import { Avatar, Modal } from '../../shared/ui/Primitives';

const navigation = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/projects', label: 'My projects', icon: FolderKanban },
  { to: '/reviews', label: 'Review & feedback', icon: ClipboardCheck },
  { to: '/activity', label: 'Activity', icon: Bell },
  { to: '/portfolio', label: 'Process portfolios', icon: BookOpen },
];
const mobileQuery = '(max-width: 800px)';
function subscribeToViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
function isMobileViewport() {
  return window.matchMedia(mobileQuery).matches;
}
export function AppShell() {
  const { toast, dismiss } = useDemo();
  const actionToast = useActionToast();
  const { projects: liveProjects, persona, queue } = useWorkspaceView();
  const { session } = useAuth();
  const projects = (liveProjects ?? [])
    .filter((p) =>
      persona === 'reviewer'
        ? ['MAIN_REVIEWER', 'DORMANT_REVIEWER'].includes(p.role)
        : ['LEAD_AUTHOR', 'AUTHOR'].includes(p.role),
    )
    .map((p) => ({ ...p, color: 'sage' }));
  const email = session?.user.email ?? '';
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const location = useLocation();
  const isMobile = useSyncExternalStore(subscribeToViewport, isMobileViewport);
  const current =
    navigation.find((n) => n.to === location.pathname)?.label ??
    (location.pathname.includes('projects') ? 'Project workspace' : 'Workspace settings');
  const pending = queue.data?.items.filter((item) => item.needs_attention).length ?? 0;
  return (
    <div className="app-shell connected-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside inert={isMobile && !menuOpen} className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          trace<span className="brand-period">.</span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-initial">{email.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{persona === 'reviewer' ? 'Reviewer workspace' : 'Author workspace'}</strong>
            <small>
              {persona === 'reviewer' ? 'Reviews and feedback' : 'Projects and progress'}
            </small>
          </div>
          <ChevronsUpDown size={15} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/overview'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>
                {to === '/projects' && persona === 'reviewer' ? 'Assigned projects' : label}
              </span>
              {to === '/reviews' && pending > 0 && (
                <span className="nav-count">
                  {pending}
                  {queue.data?.truncated ? '+' : ''}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-projects">
          <p className="nav-caption">YOUR PROJECTS</p>
          {projects.slice(0, 2).map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="pinned-project"
              onClick={() => setMenuOpen(false)}
            >
              <span className={`project-dot ${project.color}`} />
              <span>{project.title}</span>
            </Link>
          ))}
        </div>
        <div className="sidebar-bottom">
          <Link className="nav-item" to="/demo/projects">
            Sample projects
          </Link>
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>The journey matters.</strong>
            <p>Every small step adds to the story of your work.</p>
            <Link to="/portfolio" onClick={() => setMenuOpen(false)}>
              {persona === 'reviewer' ? 'Explore process portfolios' : 'See your process portfolio'}{' '}
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link className="nav-item" to="/account" onClick={() => setMenuOpen(false)}>
            <Settings2 size={18} />
            Your Trace account
          </Link>
          <button className="nav-item" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} />
            Getting started
          </button>
          <NavLink className="nav-item" to="/settings" onClick={() => setMenuOpen(false)}>
            <Settings2 size={18} />
            Settings
          </NavLink>
          <div className="profile">
            <Avatar name={email} />
            <div>
              <strong>{email}</strong>
              <small>{persona === 'author' ? 'Author view' : 'Reviewer view'}</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-chip">
              <span />
              {location.pathname.startsWith('/demo') ||
              ['/activity', '/settings'].includes(location.pathname)
                ? 'Demo preview'
                : 'Live workspace'}
            </span>
            <button
              className="icon-button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search projects"
            >
              <Search size={19} />
            </button>
            <NotificationBell />
            <div className="persona-select">
              <Avatar name={email} small />
              <span aria-label="Workspace perspective">
                {persona === 'reviewer' ? 'Reviewer view' : 'Author view'}
              </span>
            </div>
          </div>
        </header>
        <main id="main-content" className="main-content" key={location.pathname}>
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Made for the work behind the work.</span>
          <span>Trace · Your workspace</span>
        </footer>
      </div>
      {(actionToast.toast || toast) && (
        <div
          className="toast"
          role={actionToast.toast?.error ? 'alert' : actionToast.toast ? undefined : 'status'}
          aria-live="polite"
        >
          <span>{actionToast.toast?.message ?? toast}</span>
          <button
            className="icon-button"
            onClick={actionToast.toast ? actionToast.dismiss : dismiss}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {helpOpen && (
        <Modal title="A place for your process" onClose={() => setHelpOpen(false)}>
          <div className="modal-body prose">
            <p>
              Trace connects your project plan, milestone evidence, and reviewer feedback into one
              visible story.
            </p>
            <ol>
              <li>Open a project and explore its milestones.</li>
              <li>As the Author, save a draft and submit evidence.</li>
              <li>Reviewers open their assigned projects to approve work or request a revision.</li>
              <li>Respond to feedback, then explore your printable process portfolio.</li>
            </ol>
            <p className="muted">
              Projects and milestone workflows use your account. Sections labelled Demo preview use
              fictional records; changes there stay in your browser. The view switch changes
              presentation, never project permissions.
            </p>
            <button className="button primary" onClick={() => setHelpOpen(false)}>
              Let’s explore <ArrowUpRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {searchOpen && (
        <Modal title="Find a project" onClose={() => setSearchOpen(false)}>
          <div className="modal-body">
            <label className="sr-only" htmlFor="global-search">
              Project name
            </label>
            <input
              id="global-search"
              autoFocus
              placeholder="Search your projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="search-results">
              {projects
                .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
                .map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} onClick={() => setSearchOpen(false)}>
                    <span className={`project-dot ${p.color}`} />
                    {p.title}
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              {!projects.some((p) => p.title.toLowerCase().includes(query.toLowerCase())) && (
                <p>No matching projects. Try another name.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
