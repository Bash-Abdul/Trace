import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Printer } from 'lucide-react';
import { useDemo } from '../../app/providers/DemoProvider';
import { Badge, EmptyState, formatDate } from '../../shared/ui/Primitives';
import { statusLabels } from '../projects/model/project';

export function PortfolioIndex() {
  const { projects } = useDemo();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE WORK BEHIND THE OUTCOME</p>
          <h1>Every project tells a story.</h1>
          <p>A living record of your evidence, reflections, and decisions.</p>
        </div>
      </div>
      <div className="portfolio-grid">
        {projects.map((p) => (
          <Link
            className={`portfolio-cover ${p.color}`}
            key={p.id}
            to={`/demo/projects/${p.id}/portfolio`}
          >
            <div className="section-heading">
              <BookOpen size={24} />
              <Badge>{p.state === 'completed' ? 'Final record' : 'Live preview'}</Badge>
            </div>
            <p className="eyebrow">PROCESS PORTFOLIO · {p.code}</p>
            <h2>{p.title}</h2>
            <p>{p.category}</p>
            <div className="portfolio-cover-footer">
              <span>
                {p.milestones.filter((m) => m.status === 'approved').length} milestones approved
              </span>
              <ArrowUpRight size={21} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
export function PortfolioPage() {
  const { projectId } = useParams();
  const { projects } = useDemo();
  const project = projects.find((p) => p.id === projectId);
  if (!project)
    return (
      <EmptyState
        title="Portfolio not found"
        description="Choose a project to explore its process."
      />
    );
  return (
    <>
      <div className="portfolio-toolbar">
        <Link className="back-link" to={`/demo/projects/${project.id}`}>
          <ArrowLeft size={15} />
          Back to project
        </Link>
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={16} />
          Print / save as PDF
        </button>
      </div>
      <article className="portfolio-document">
        <header>
          <div className="portfolio-document-top">
            <span className="portfolio-wordmark">trace.</span>
            <Badge tone={project.state === 'completed' ? 'green' : 'amber'}>
              {project.state === 'completed'
                ? 'Completed project · final record'
                : 'Live preview · work in progress'}
            </Badge>
          </div>
          <p className="eyebrow">PROCESS PORTFOLIO / {project.code}</p>
          <h1>{project.title}</h1>
          <p className="portfolio-intro">{project.description}</p>
          <div className="portfolio-meta">
            <div>
              <span>AUTHOR</span>
              <strong>Bashir Abdul</strong>
            </div>
            <div>
              <span>MAIN REVIEWER</span>
              <strong>Dr. Maya Patel</strong>
            </div>
            <div>
              <span>PROJECT TYPE</span>
              <strong>{project.category}</strong>
            </div>
          </div>
        </header>
        <section>
          <p className="eyebrow">01 / INTENTION</p>
          <h2>What this work sets out to do</h2>
          <ol>
            {project.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </section>
        <section>
          <p className="eyebrow">02 / PROCESS</p>
          <h2>The path, and the thinking along it</h2>
          {project.milestones.map((m, i) => (
            <div className="portfolio-milestone" key={m.id}>
              <div className="section-heading">
                <h3>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {m.title}
                </h3>
                <Badge>{statusLabels[m.status]}</Badge>
              </div>
              <p>{m.summary || 'Work on this milestone has not started.'}</p>
              {m.evidence.length > 0 && (
                <ul>
                  {m.evidence.map((e) => (
                    <li key={e.id}>
                      <strong>{e.title}</strong> — {e.detail}
                      {e.url && <span> ({e.url})</span>}
                    </li>
                  ))}
                </ul>
              )}
              <small>
                Version {m.version} · {m.history.length} submitted version
                {m.history.length === 1 ? '' : 's'} recorded
              </small>
              {m.history.length > 1 && (
                <details>
                  <summary>Earlier submitted versions</summary>
                  {m.history.slice(0, -1).map((v) => (
                    <div key={v.version}>
                      <h4>
                        Version {v.version} · {v.decision}
                      </h4>
                      <p>{v.summary}</p>
                      <ul>
                        {v.evidence.map((e) => (
                          <li key={e.id}>
                            {e.title}: {e.detail}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
              )}
            </div>
          ))}
        </section>
        <section>
          <p className="eyebrow">03 / DIALOGUE</p>
          <h2>Feedback that shaped the work</h2>
          {project.feedback.length ? (
            project.feedback.map((f) => (
              <blockquote key={f.id}>
                <p>{f.body}</p>
                <cite>
                  {f.author} · {f.status}
                  {f.blocking ? ' · blocking' : ''}
                </cite>
                {f.reply && (
                  <p>
                    <strong>Author response:</strong> {f.reply}
                  </p>
                )}
              </blockquote>
            ))
          ) : (
            <p>No feedback threads yet.</p>
          )}
        </section>
        <section>
          <p className="eyebrow">04 / OUTCOME</p>
          <h2>What came together</h2>
          {project.deliverables.map((d) => (
            <p key={d.id}>
              <strong>{d.title}</strong> — {d.submitted ? 'Sample submitted' : 'Not yet submitted'}
            </p>
          ))}
          <h3>Project history</h3>
          {project.activity.map((a) => (
            <p className="portfolio-history" key={a.id}>
              <time>{formatDate(a.date)}</time>
              <span>
                {a.actor} {a.action}. {a.detail}
              </span>
            </p>
          ))}
        </section>
        <footer>
          Trace ·{' '}
          {project.state === 'completed'
            ? 'Completed demo record. Further edits are locked.'
            : 'Live preview. This record grows as the project develops.'}{' '}
          All content is demonstration data.
        </footer>
      </article>
    </>
  );
}
