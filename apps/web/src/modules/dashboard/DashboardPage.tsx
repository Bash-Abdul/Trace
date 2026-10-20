import {
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  CircleDot,
  Clock3,
  FileCheck2,
  FolderKanban,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../app/providers/DemoProvider';
import { Avatar, formatDate, SectionHeading } from '../../shared/ui/Primitives';
import { ProjectCard } from '../projects/components/ProjectCard';

export function DashboardPage() {
  const { projects, persona } = useDemo();
  const milestones = projects.flatMap((p) => p.milestones.map((m) => ({ ...m, project: p })));
  const reviewCount = milestones.filter((m) => m.status === 'awaiting-review').length;
  const feedbackCount = projects.reduce(
    (sum, p) => sum + p.feedback.filter((f) => f.status === 'open').length,
    0,
  );
  const approved = milestones.filter((m) => m.status === 'approved').length;
  const next = milestones
    .filter((m) => m.status !== 'approved')
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 3);
  const activity = projects
    .flatMap((p) => p.activity.map((a) => ({ ...a, project: p })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const focusProject =
    persona === 'author'
      ? projects.find((p) => p.feedback.some((f) => f.status === 'open'))
      : projects.find(
          (p) =>
            p.milestones.some((m) => m.status === 'awaiting-review') ||
            p.state === 'proposal-review',
        );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow greeting">YOUR WORK, IN PERSPECTIVE</p>
          <h1>
            A little progress, every day<span className="heading-dot">.</span>
          </h1>
          <p>
            Welcome back, {persona === 'author' ? 'Bashir' : 'Maya'}. Let’s keep your projects
            moving.
          </p>
        </div>
        <Link className="button primary" to="/projects/new">
          <Plus size={17} />
          New project
        </Link>
      </div>
      <div className="stat-grid">
        {[
          {
            icon: FolderKanban,
            label: 'Active projects',
            number: projects.filter((p) => p.state === 'active').length,
            note: 'Ideas taking shape',
            color: 'sage',
          },
          {
            icon: Clock3,
            label: 'Awaiting review',
            number: reviewCount + projects.filter((p) => p.state === 'proposal-review').length,
            note: persona === 'author' ? 'With your reviewer' : 'Ready for your feedback',
            color: 'peach',
          },
          {
            icon: MessageSquare,
            label: 'Open feedback',
            number: feedbackCount,
            note: 'A conversation to continue',
            color: 'blue',
          },
          {
            icon: CheckCheck,
            label: 'Milestones approved',
            number: approved,
            note: 'Small wins, real progress',
            color: 'lilac',
          },
        ].map(({ icon: Icon, label, number, note, color }) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={17} />
              </span>
            </div>
            <strong>{String(number).padStart(2, '0')}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="focus-banner">
            <div className="focus-copy">
              <span className="focus-eyebrow">
                <CircleDot size={13} />A GOOD PLACE TO PICK UP
              </span>
              <h2>
                {focusProject
                  ? persona === 'author'
                    ? 'Turn feedback into your next step.'
                    : 'A fresh perspective makes a difference.'
                  : 'Make space for your next idea.'}
              </h2>
              <p>
                {focusProject
                  ? persona === 'author'
                    ? 'Your reviewer has shared a few thoughts. A small revision can move the whole project forward.'
                    : 'There’s new work ready for your attention. Help your Author see where to go next.'
                  : 'Start a project and give your process a place to grow.'}
              </p>
              <Link
                to={
                  focusProject
                    ? `/projects/${focusProject.id}${persona === 'author' ? '?tab=feedback' : ''}`
                    : '/projects/new'
                }
              >
                {focusProject
                  ? persona === 'author'
                    ? 'Continue the conversation'
                    : 'Open project for review'
                  : 'Create a project'}
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="focus-art" aria-hidden="true">
              <svg viewBox="0 0 230 200" fill="none">
                <path
                  d="M119 191V66M119 146C66 144 49 116 52 82C92 84 119 105 119 146ZM120 115C166 111 190 79 183 45C146 51 119 79 120 115ZM119 80C87 72 79 43 89 17C117 29 129 49 119 80Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M50 185H190M37 193H200M72 94L118 145M172 60L121 112M94 31L117 78"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <circle cx="176" cy="153" r="20" stroke="currentColor" strokeDasharray="3 5" />
                <path d="m174 146 3 4 5 1-4 3-1 5-3-4-5-1 4-3z" fill="currentColor" />
              </svg>
            </div>
          </section>
          <section className="section-spaced">
            <SectionHeading title="Your projects" count={projects.length} to="/projects" />
            <div className="project-grid">
              {projects.slice(0, 2).map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            {projects.length > 2 && (
              <Link className="project-mini" to={`/projects/${projects[2]!.id}`}>
                <span className={`project-dot ${projects[2]!.color}`} />
                <strong>{projects[2]!.title}</strong>
                <span>
                  {projects[2]!.state === 'proposal-review'
                    ? 'Proposal awaiting review'
                    : projects[2]!.category}
                </span>
                <ArrowUpRight size={17} />
              </Link>
            )}
          </section>
          <section className="section-spaced">
            <SectionHeading title="Latest activity" to="/activity" />
            <div className="activity-card">
              {activity.map((item) => (
                <Link
                  to={`/projects/${item.project.id}?tab=activity`}
                  className="activity-row"
                  key={`${item.project.id}-${item.id}`}
                >
                  <Avatar name={item.actor.includes('Maya') ? item.actor : 'Bashir Abdul'} small />
                  <div>
                    <p>
                      <strong>{item.actor}</strong> {item.action}
                    </p>
                    <small>
                      {item.detail} <span>·</span> {item.project.title}
                    </small>
                  </div>
                  <time>{formatDate(item.date)}</time>
                </Link>
              ))}
            </div>
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="panel upcoming-panel">
            <SectionHeading title="Coming up" />
            <p className="panel-subtitle">A little focus for the days ahead.</p>
            {next.map((item) => (
              <Link
                className="upcoming-item"
                key={`${item.project.id}-${item.id}`}
                to={`/projects/${item.project.id}/milestones/${item.id}`}
              >
                <div className="date-tile">
                  <strong>{new Date(item.due).getDate()}</strong>
                  <span>
                    {new Date(item.due)
                      .toLocaleDateString('en-GB', { month: 'short' })
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.project.title}</small>
                  <span
                    className={`due-label ${item.status === 'revision-requested' ? 'due-amber' : ''}`}
                  >
                    {item.status === 'revision-requested'
                      ? 'Revision requested'
                      : item.status === 'awaiting-review'
                        ? 'With reviewer'
                        : 'Next milestone'}
                  </span>
                </div>
              </Link>
            ))}
            <Link className="aside-link" to="/projects">
              Explore all milestones
              <ArrowRight size={15} />
            </Link>
          </section>
          <section className="portfolio-teaser">
            <div className="portfolio-drawing" aria-hidden="true">
              <div className="paper-back" />
              <div className="paper-front">
                <span className="paper-symbol">t.</span>
                <i />
                <i />
                <i />
                <div className="paper-grid">
                  <b />
                  <b />
                  <b />
                  <b />
                </div>
              </div>
              <span className="paper-stamp">
                <CheckCheck size={22} />
              </span>
            </div>
            <span className="eyebrow">BUILT ALONG THE WAY</span>
            <h2>
              Your process.
              <br />
              Your story.
            </h2>
            <p>
              Your evidence, decisions, and reflections come together in a portfolio that grows with
              you.
            </p>
            <Link to="/portfolio" className="text-link">
              Preview your portfolio
              <ArrowUpRight size={15} />
            </Link>
          </section>
          <div className="gentle-note">
            <FileCheck2 size={17} />
            <p>Progress is more than a finished outcome. Keep a trace of how you got there.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
