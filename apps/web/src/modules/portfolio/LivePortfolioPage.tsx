import { PortfolioPlan, PortfolioMinorEdit } from './PortfolioPlan';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Printer } from 'lucide-react';
import { useWorkspaceView } from '../../app/providers/WorkspaceViewProvider';
import { Badge, EmptyState } from '../../shared/ui/Primitives';
import { ProjectListState } from '../projects/components/ProjectListState';
import { projectPresentation } from '../projects/components/live-project-presentation';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage, roleLabels } from '../workspace/workspace-api';
import { portfolioSchema, type Portfolio } from './portfolio-api';
import './portfolio.css';
const readable = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const date = (value: string) => new Date(value).toLocaleString();
function Output({ kind, content }: { kind: string; content: string }) {
  return kind === 'LINK' && /^https?:\/\//i.test(content) ? (
    <p>
      <a href={content} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    </p>
  ) : (
    <p className="evidence-text">{content}</p>
  );
}
export function LivePortfolioIndex() {
  const { projects, error, retry } = useWorkspaceView();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE WORK BEHIND THE OUTCOME</p>
          <h1>Every project tells a story.</h1>
          <p>A living record of your evidence, reflections, and decisions.</p>
        </div>
      </div>
      {!projects || error ? (
        <ProjectListState error={error} retry={retry} />
      ) : !projects.length ? (
        <EmptyState
          title="Your stories start here"
          description="Create or join a project to build its process portfolio."
        />
      ) : (
        <div className="portfolio-grid">
          {projects.map((p) => (
            <Link
              className={`portfolio-cover ${projectPresentation(p).color}`}
              key={p.id}
              to={`/projects/${p.id}/portfolio`}
            >
              <div className="section-heading">
                <BookOpen size={24} />
                <Badge>{p.status === 'COMPLETED' ? 'Final record' : 'Live preview'}</Badge>
              </div>
              <p className="eyebrow">PROCESS PORTFOLIO</p>
              <h2>{p.title}</h2>
              <p>{projectPresentation(p).label}</p>
              <div className="portfolio-cover-footer">
                <span>
                  {p.progress?.milestones.filter((m) => m.state === 'APPROVED').length ?? 0}{' '}
                  milestones approved
                </span>
                <ArrowUpRight size={21} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function LivePortfolioPage() {
  const { projectId } = useParams();
  return <PortfolioContent key={projectId} projectId={projectId!} />;
}
function PortfolioContent({ projectId }: { projectId: string }) {
  const api = useProjectApi();
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${projectId}/portfolio`, portfolioSchema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(projectMessage(e));
        }
      });
    return () => controller.abort();
  }, [api, projectId, attempt]);
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <button className="button secondary" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
      </p>
    );
  if (!data) return <p role="status">Opening process portfolio…</p>;
  return (
    <>
      <div className="portfolio-toolbar">
        <Link className="back-link" to={`/projects/${projectId}`}>
          <ArrowLeft size={15} />
          Back to project
        </Link>
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Print / save as PDF
        </button>
      </div>
      <PortfolioDocument data={data} />
    </>
  );
}
function PortfolioDocument({ data }: { data: Portfolio }) {
  const { project: p, records: r } = data;
  const members = [...p.members, ...p.former_members];
  const name = (id: string | null) =>
    members.find((m) => m.user_id === id)?.email ?? 'Former participant';
  const milestones = [...p.milestones, ...p.archived_milestones];
  const deliverables = [...p.deliverables, ...p.archived_deliverables];
  return (
    <article className="portfolio-document">
      <header>
        <div className="portfolio-document-top">
          <span className="portfolio-wordmark">trace.</span>
          <Badge tone={data.mode === 'FINAL' ? 'green' : 'amber'}>
            {data.mode === 'FINAL'
              ? 'Completed project · final record'
              : 'Live preview · work in progress'}
          </Badge>
        </div>
        <p className="eyebrow">PROCESS PORTFOLIO / {p.id.slice(0, 8)}</p>
        <h1>{p.title}</h1>
        <p className="portfolio-intro">{p.description}</p>
        <div className="portfolio-meta">
          <div>
            <span>AUTHORS</span>
            {p.members
              .filter((m) => ['LEAD_AUTHOR', 'AUTHOR'].includes(m.role))
              .map((m) => (
                <p key={m.user_id}>
                  <strong>
                    {m.email} · {roleLabels[m.role]}
                  </strong>
                </p>
              ))}
          </div>
          <div>
            <span>MAIN REVIEWER</span>
            <strong>
              {p.members.find((m) => m.role === 'MAIN_REVIEWER')?.email ?? 'Not assigned'}
            </strong>
          </div>
          <div>
            <span>PROJECT TYPE</span>
            <strong>
              {projectPresentation(p).label} · {readable(p.project_type)}
            </strong>
          </div>
        </div>
        <p>
          Created {date(p.created_at)} ·{' '}
          {p.activated_at ? `Activated ${date(p.activated_at)}` : 'Not activated yet'}
        </p>
        <p>
          Approval route:{' '}
          {p.approval_route === 'EXTERNALLY_APPROVED'
            ? 'Approved elsewhere'
            : 'Proposal reviewed in Trace'}{' '}
          · Template version {p.template_version}
        </p>
        {p.dueDate && (
          <p>
            Due {p.dueDate} · {p.timezone}
          </p>
        )}
        {!!p.former_members.length && (
          <p>Former contributors: {p.former_members.map((m) => m.email).join(', ')}</p>
        )}
      </header>
      <section>
        <p className="eyebrow">01 / INTENTION</p>
        <h2>What this work sets out to do</h2>
        <ol>
          {p.objectives.map((o, i) => (
            <li key={p.objectiveIds?.[i] ?? i}>{o}</li>
          ))}
        </ol>
        {p.proposals.map((v) => (
          <div className="portfolio-milestone" key={v.id}>
            <h3>
              Proposal version {v.version} ·{' '}
              {v.decision ? readable(v.decision) : 'Awaiting decision'}
            </h3>
            <PortfolioPlan plan={v.structure} />
            <p>
              Submitted by {name(v.submitted_by_user_id)} · {date(v.submitted_at)}
            </p>
            {v.decided_by_user_id && (
              <p>
                Reviewed by {name(v.decided_by_user_id)}
                {v.decided_at ? ` · ${date(v.decided_at)}` : ''}
              </p>
            )}
            {v.feedback && <p>Proposal feedback: {v.feedback}</p>}
          </div>
        ))}
      </section>
      <section>
        <p className="eyebrow">02 / PROCESS</p>
        <h2>The path, and the thinking along it</h2>
        {milestones.map((m, i) => (
          <div className="portfolio-milestone" key={m.id}>
            <div className="section-heading">
              <h3>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {m.title}
              </h3>
              <Badge>
                {p.archived_milestones.some((a) => a.id === m.id)
                  ? 'Removed from plan'
                  : readable(
                      p.progress?.milestones.find((a) => a.id === m.id)?.state ?? 'NOT_STARTED',
                    )}
              </Badge>
            </div>
            <p>
              {m.required ? 'Required' : 'Optional'}
              {m.dueDate ? ` · Due ${m.dueDate}` : ''}
            </p>
            {!r.submissions.some((v) => v.milestone_id === m.id) && (
              <p>No submitted versions yet.</p>
            )}
            {r.submissions
              .filter((v) => v.milestone_id === m.id)
              .map((v) => (
                <div key={v.id}>
                  <h4>
                    Submission version {v.number} ·{' '}
                    {v.decision ? readable(v.decision) : 'Awaiting review'}
                  </h4>
                  <p>
                    Submitted by {name(v.submitted_by)} · {date(v.submitted_at)}
                  </p>
                  <ul>
                    {v.evidence.map((e) => (
                      <li key={e.id}>
                        <strong>{e.title}</strong>
                        <Output kind={e.kind} content={e.content} />
                        <small>
                          Contributed by {name(e.created_by)} · last edited by {name(e.updated_by)}
                        </small>
                        {!!e.objectiveMappings?.length && (
                          <p>Supports: {e.objectiveMappings.map((o) => o.title).join('; ')}</p>
                        )}
                        {!!e.expectationMappings?.length && (
                          <p>
                            Expected evidence:{' '}
                            {e.expectationMappings.map((o) => o.title).join('; ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {v.coverage && (
                    <p>
                      Required evidence at submission:{' '}
                      {v.coverage.expectedEvidence
                        .filter((e) => e.required)
                        .map((e) => e.title)
                        .join('; ') || 'None specified'}
                    </p>
                  )}
                  {v.decided_by && (
                    <p>
                      Decision by {name(v.decided_by)}
                      {v.decided_at ? ` · ${date(v.decided_at)}` : ''}. {v.feedback}
                    </p>
                  )}
                </div>
              ))}
            {data.drafts
              .filter((e) => e.milestone_id === m.id)
              .map((e) => (
                <div key={e.id}>
                  <h4>Unsubmitted draft · {e.title}</h4>
                  <Output kind={e.kind} content={e.content} />
                  <small>
                    Contributed by {name(e.created_by)} · last edited by {name(e.updated_by)}
                  </small>
                </div>
              ))}
          </div>
        ))}
        {!!r.changes.length && (
          <>
            <h3>Changes to the agreed plan</h3>
            {r.changes.map((c) => (
              <div className="portfolio-milestone" key={c.id}>
                <h4>
                  {readable(c.state)} · {date(c.created_at)}
                </h4>
                <p>
                  {name(c.created_by)}: {c.reason}
                </p>
                <h4>Before change</h4>
                <PortfolioPlan plan={c.before_structure} />
                <h4>Proposed plan</h4>
                <PortfolioPlan plan={c.after_structure} />
                {c.decided_by && (
                  <p>
                    {name(c.decided_by)}: {c.feedback}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </section>
      <section>
        <p className="eyebrow">03 / DIALOGUE</p>
        <h2>Feedback that shaped the work</h2>
        {!r.feedback.length && <p>No feedback threads yet.</p>}
        {r.feedback.map((f) => {
          const v = r.submissions.find((v) => v.id === f.submission_version_id);
          return (
            <blockquote key={f.id}>
              <strong>
                {milestones.find((m) => m.id === v?.milestone_id)?.title} · Submission version{' '}
                {v?.number}
              </strong>
              <p className="evidence-text">{f.body}</p>
              <cite>
                {name(f.created_by)} · {readable(f.state)}
                {f.blocking ? ' · blocking' : ''}
              </cite>
              {r.messages
                .filter((m) => m.feedback_id === f.id)
                .map((m) => (
                  <p className="evidence-text" key={m.id}>
                    <strong>
                      {name(m.author_id)} · {date(m.created_at)}:
                    </strong>{' '}
                    {m.body}
                  </p>
                ))}
            </blockquote>
          );
        })}
      </section>
      <section>
        <p className="eyebrow">04 / OUTCOME</p>
        <h2>What came together</h2>
        {deliverables.map((d) => (
          <div className="portfolio-milestone" key={d.id}>
            <h3>{d.title}</h3>
            <p>
              {d.required ? 'Required' : 'Optional'}
              {p.archived_deliverables.some((a) => a.id === d.id) ? ' · Removed from plan' : ''}
            </p>
            <p>
              {p.progress?.deliverables?.find((item) => item.id === d.id)?.state === 'SUBMITTED'
                ? 'Currently submitted'
                : 'Not currently submitted'}
            </p>
            {r.deliverables
              .filter((v) => v.deliverable_id === d.id)
              .map((v) => (
                <div key={v.id}>
                  <h4>
                    Version {v.number} · {v.title}
                  </h4>
                  <Output kind={v.kind} content={v.content} />
                  {v.note && <p className="evidence-text">{v.note}</p>}
                  <p>
                    Submitted by {name(v.submitted_by)} · {date(v.submitted_at)}
                  </p>
                  <small>
                    Contributed by {name(v.created_by)} · last edited by {name(v.updated_by)}
                  </small>
                </div>
              ))}
          </div>
        ))}
        {data.finalRequest && (
          <>
            <h3>Final approval</h3>
            <p>
              {name(data.finalRequest.decided_by)} approved completion
              {data.finalRequest.decided_at ? ` · ${date(data.finalRequest.decided_at)}` : ''}.
            </p>
            <p>{data.finalRequest.feedback}</p>
            <ul>
              {data.finalRequest.snapshot.checklist.map((c) => (
                <li key={c.key}>
                  {c.satisfied ? 'Satisfied' : 'Outstanding'} · {c.label}
                </li>
              ))}
            </ul>
          </>
        )}
        {data.mode === 'LIVE' && (
          <>
            <h3>Current completion checklist</h3>
            <ul>
              {data.checklist.map((c) => (
                <li key={c.key}>
                  {c.satisfied ? 'Satisfied' : 'Outstanding'} · {c.label}
                  {!!c.outstanding.length && (
                    <ul>
                      {c.outstanding.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Project history</h3>
        {[...r.events]
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          .map((e) => (
            <div className="portfolio-history" key={e.id}>
              <time>{date(e.created_at)}</time>
              <div>
                {e.actor} · {readable(e.action)}
                {e.action === 'PROJECT_MINOR_EDIT' && <PortfolioMinorEdit details={e.details} />}
              </div>
            </div>
          ))}
      </section>
      <footer>
        Trace ·{' '}
        {data.mode === 'FINAL'
          ? `Final record preserved ${date(data.recordedAt!)}. Further edits are locked.`
          : 'Live preview. This record grows as the project develops.'}
      </footer>
    </article>
  );
}
