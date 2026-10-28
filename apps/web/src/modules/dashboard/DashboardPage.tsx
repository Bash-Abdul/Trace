import { DeadlineLabel } from '../deadlines/DeadlineLabel';
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
import { useWorkspaceView } from '../../app/providers/WorkspaceViewProvider';
import { useAuth } from '../auth/AuthProvider';
import { LiveProjectCard } from '../projects/components/LiveProjectCard';
import { reviewDestination } from '../reviews/reviews-api';
import { ProjectListState } from '../projects/components/ProjectListState';

export function DashboardPage() {
  const { projects } = useDemo();
  const { projects: liveProjects, error, retry, persona, queue } = useWorkspaceView();
  const { session } = useAuth();
  const realProjects = (liveProjects ?? []).filter((p) =>
    persona === 'reviewer'
      ? ['MAIN_REVIEWER', 'DORMANT_REVIEWER'].includes(p.role)
      : ['LEAD_AUTHOR', 'AUTHOR'].includes(p.role),
  );
  const focusItem = queue.data?.items.find(
    (item) => item.perspective === persona && item.needs_attention,
  );
  const awaitingReview = queue.data?.items.filter(
    (item) =>
      item.perspective === persona &&
      ['PROPOSAL_IN_REVIEW', 'AWAITING_REVIEW'].includes(item.state),
  ).length;
  const milestones = projects.flatMap((p) => p.milestones.map((m) => ({ ...m, project: p })));
  const feedbackCount = queue.data?.items.filter(
    (item) => item.perspective === persona && item.kind === 'MILESTONE_FEEDBACK',
  ).length;
  const approved = milestones.filter((m) => m.status === 'approved').length;
  const next = realProjects
    .filter((p) => p.status !== 'PROPOSAL_REJECTED')
    .flatMap((project) => [
      ...(project.dueDate
        ? [
            {
              key: project.id,
              title: 'Project deadline',
              dueDate: project.dueDate,
              project,
              deadline: project.deadline,
              href: `/projects/${project.id}`,
            },
          ]
        : []),
      ...(project.progress?.milestones ?? []).flatMap((m) =>
        m.dueDate && m.state !== 'APPROVED'
          ? [
              {
                key: m.id,
                title: m.title ?? 'Milestone',
                dueDate: m.dueDate,
                project,
                deadline: m.deadline,
                href: `/projects/${project.id}/milestones/${m.id}`,
              },
            ]
          : [],
      ),
    ])
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key))
    .slice(0, 3);
  const activity = projects
    .flatMap((p) => p.activity.map((a) => ({ ...a, project: p })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!liveProjects) return <ProjectListState error={error} retry={retry} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow greeting">
            {persona === 'reviewer' ? 'YOUR REVIEW DESK' : 'YOUR WORK, IN PERSPECTIVE'}
          </p>
          <h1>
            {persona === 'reviewer'
              ? 'A fresh perspective makes a difference'
              : 'A little progress, every day'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {persona === 'reviewer'
              ? `Welcome back, ${session?.user.email}. Review submitted work, share feedback and follow up on revisions.`
              : `Welcome back, ${session?.user.email}. Let’s keep your projects moving.`}
          </p>
        </div>
        <Link className="button primary" to={persona === 'reviewer' ? '/reviews' : '/projects/new'}>
          {persona === 'reviewer' ? <FileCheck2 size={17} /> : <Plus size={17} />}
          {persona === 'reviewer' ? 'Open review queue' : 'New project'}
        </Link>
      </div>
      <div className="stat-grid">
        {[
          {
            icon: FolderKanban,
            label: persona === 'reviewer' ? 'Assigned projects' : 'Active projects',
            number: liveProjects
              ? persona === 'reviewer'
                ? realProjects.length
                : realProjects.filter((p) => p.status === 'ACTIVE').length
              : '—',
            note: 'Live projects',
            color: 'sage',
          },
          {
            icon: Clock3,
            label: 'Awaiting review',
            number: awaitingReview ?? '—',
            note: queue.error
              ? 'Refresh needed'
              : queue.data?.truncated
                ? 'Recent queue items only'
                : persona === 'author'
                  ? 'With your reviewer'
                  : 'Ready for your feedback',
            color: 'peach',
          },
          {
            icon: MessageSquare,
            label: 'Unresolved milestone feedback',
            number: feedbackCount ?? '—',
            note: queue.error
              ? 'Refresh needed'
              : queue.data?.truncated
                ? 'Recent queue items only'
                : 'Live milestone threads',
            color: 'blue',
          },
          {
            icon: CheckCheck,
            label: 'Milestones approved',
            number: approved,
            note: 'Demo preview · sample milestones',
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
                <CircleDot size={13} />
                {persona === 'reviewer' ? 'READY FOR YOUR PERSPECTIVE' : 'A GOOD PLACE TO PICK UP'}
              </span>
              <h2>
                {persona === 'reviewer'
                  ? focusItem
                    ? 'Submitted work needs your perspective.'
                    : 'Make room for thoughtful feedback.'
                  : focusItem
                    ? 'A revision or response needs your attention.'
                    : 'Your next step starts here.'}
              </h2>
              <p>
                {persona === 'reviewer'
                  ? 'Open your assigned projects to assess submissions, explain decisions and follow up on revised work.'
                  : 'Open a project to develop your evidence and respond to your Reviewer’s feedback.'}
              </p>
              <Link
                to={
                  focusItem
                    ? reviewDestination(focusItem)
                    : persona === 'reviewer'
                      ? '/reviews'
                      : '/projects'
                }
              >
                {persona === 'reviewer' ? 'Review assigned work' : 'Continue your projects'}
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
            <SectionHeading
              title={persona === 'reviewer' ? 'Assigned projects' : 'Your projects'}
              count={realProjects.length}
              to="/projects"
            />
            {!liveProjects || error ? (
              <ProjectListState error={error} retry={retry} />
            ) : (
              <>
                <div className="project-grid">
                  {realProjects.slice(0, 2).map((project) => (
                    <LiveProjectCard key={project.id} project={project} />
                  ))}
                </div>
                {!realProjects.length && (
                  <p>
                    {persona === 'reviewer'
                      ? 'No projects assigned yet. Accept a Reviewer invitation to get started.'
                      : 'No authored projects yet. Create a project to begin.'}
                  </p>
                )}
                {realProjects.length > 2 && (
                  <Link className="project-mini" to={`/projects/${realProjects[2]!.id}`}>
                    <span className="project-dot sage" />
                    <strong>{realProjects[2]!.title}</strong>
                    <ArrowUpRight size={17} />
                  </Link>
                )}
                {liveProjects.length >= 100 && <p>Showing up to 100 recently updated projects.</p>}
              </>
            )}
          </section>
          <section className="section-spaced">
            <SectionHeading title="Latest activity · Demo preview" to="/activity" />
            <div className="activity-card">
              {activity.map((item) => (
                <Link
                  to={`/demo/projects/${item.project.id}?tab=activity`}
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
            <p className="panel-subtitle">
              Optional project and milestone dates, including overdue work.
            </p>
            {next.length === 0 && (
              <p className="panel-subtitle">
                No scheduled dates. You can add optional dates in the project brief.
              </p>
            )}
            {next.map((item) => (
              <Link className="upcoming-item" key={`${item.project.id}-${item.key}`} to={item.href}>
                <div className="date-tile">
                  <strong>{Number(item.dueDate.slice(8, 10))}</strong>
                  <span>
                    {new Date(`${item.dueDate}T12:00:00Z`)
                      .toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.project.title}</small>
                  <span
                    className={`due-label ${item.deadline?.state === 'OVERDUE' ? 'due-amber' : ''}`}
                  >
                    <DeadlineLabel
                      dueDate={item.dueDate}
                      timezone={item.project.timezone}
                      deadline={item.deadline}
                    />
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
            <span className="eyebrow">PORTFOLIO · DEMO PREVIEW</span>
            <h2>
              {persona === 'reviewer' ? 'Their process.' : 'Your process.'}
              <br />
              {persona === 'reviewer' ? 'Your perspective.' : 'Your story.'}
            </h2>
            <p>
              {persona === 'reviewer'
                ? 'Explore how an Author’s evidence, revisions and your review decisions come together in a process portfolio.'
                : 'Your evidence, decisions, and reflections come together in a portfolio that grows with you.'}
            </p>
            <Link to="/portfolio" className="text-link">
              {persona === 'reviewer' ? 'Explore a sample portfolio' : 'Preview your portfolio'}
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
