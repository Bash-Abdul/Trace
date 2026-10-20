import { useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
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
import { useDemo } from '../providers/DemoProvider';
import { Avatar, Modal } from '../../shared/ui/Primitives';
import { personaNames, type Persona } from '../../modules/projects/model/project';

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
  const { projects, persona, setPersona, toast, dismiss } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const location = useLocation();
  const isMobile = useSyncExternalStore(subscribeToViewport, isMobileViewport);
  const current =
    navigation.find((n) => n.to === location.pathname)?.label ??
    (location.pathname.includes('projects') ? 'Project workspace' : 'Workspace settings');
  const pending = projects.reduce(
    (count, p) =>
      count +
      (persona === 'reviewer'
        ? p.milestones.filter((m) => m.status === 'awaiting-review').length +
          Number(p.state === 'proposal-review')
        : p.feedback.filter((f) => f.status === 'open').length),
    0,
  );
  return (
    <div className="app-shell">
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
          <span className="workspace-initial">B</span>
          <div>
            <strong>My workspace</strong>
            <small>Personal workspace</small>
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
              <span>{label}</span>
              {to === '/reviews' && pending > 0 && <span className="nav-count">{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-projects">
          <p className="nav-caption">PINNED PROJECTS</p>
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
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>The journey matters.</strong>
            <p>Every small step adds to the story of your work.</p>
            <Link to="/portfolio" onClick={() => setMenuOpen(false)}>
              See your process portfolio <ArrowUpRight size={14} />
            </Link>
          </div>
          <button className="nav-item" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} />
            Getting started
          </button>
          <NavLink className="nav-item" to="/settings" onClick={() => setMenuOpen(false)}>
            <Settings2 size={18} />
            Settings
          </NavLink>
          <div className="profile">
            <Avatar name={personaNames[persona]} />
            <div>
              <strong>{personaNames[persona]}</strong>
              <small>{persona === 'author' ? 'Project Author' : 'Main Reviewer'}</small>
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
              Interactive demo
            </span>
            <button
              className="icon-button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search projects"
            >
              <Search size={19} />
            </button>
            <Link
              className="icon-button notification-button"
              to="/activity"
              aria-label="View activity"
            >
              <Bell size={19} />
              <i />
            </Link>
            <div className="persona-select">
              <Avatar name={personaNames[persona]} small />
              <label className="sr-only" htmlFor="persona">
                Demo perspective
              </label>
              <select
                id="persona"
                value={persona}
                onChange={(e) => setPersona(e.target.value as Persona)}
              >
                <option value="author">Author view</option>
                <option value="reviewer">Reviewer view</option>
              </select>
              <ChevronDown size={13} />
            </div>
          </div>
        </header>
        <main id="main-content" className="main-content" key={location.pathname}>
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Made for the work behind the work.</span>
          <span>Trace · Demo workspace</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button className="icon-button" onClick={dismiss} aria-label="Dismiss message">
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
              <li>Switch to Reviewer view to approve work or request a revision.</li>
              <li>Respond to feedback, then explore your printable process portfolio.</li>
            </ol>
            <p className="muted">
              This is a local prototype with fictional records. No emails are sent or files
              uploaded. Reset the demo in Settings.
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
