import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectApi } from './use-project-api';
import { detailSchema, type ProjectDetail, statusLabels, projectMessage } from './workspace-api';
import { ProjectTeamPanel } from './ProjectTeamPanel';
import { ProjectDraftEditor } from './ProjectDraftEditor';

export function LiveProjectPage() {
  const { projectId } = useParams();
  // Keying the content prevents one project's in-memory state appearing on another route.
  return <ProjectContent key={projectId} id={projectId!} />;
}
function ProjectContent({ id }: { id: string }) {
  const api = useProjectApi();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${id}`, detailSchema, { signal: controller.signal })
      .then((data) => {
        setProject(data);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, id, attempt]);
  async function run(operation: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setProject(await api(`/${id}`, detailSchema));
      setNotice('Project updated.');
      return true;
    } catch (e) {
      setError(projectMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!project)
    return (
      <>
        <Link to="/workspace">Back to projects</Link>
        {error ? (
          <p role="alert">
            {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </p>
        ) : (
          <p role="status">Opening your project…</p>
        )}
      </>
    );
  const editable =
    ['LEAD_AUTHOR', 'AUTHOR'].includes(project.role) &&
    ['SETUP', 'PROPOSAL_CHANGES_REQUESTED'].includes(project.status);
  const latest = project.proposals[0];
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(() =>
      api(`/${id}/proposals/${latest!.id}/decision`, detailSchema, {
        method: 'POST',
        body: {
          version: project!.version,
          decision: data.get('decision'),
          feedback: data.get('feedback'),
        },
      }),
    );
  }
  return (
    <>
      <Link className="back-link" to="/workspace">
        ← Your projects
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {project.project_type === 'GROUP' ? 'GROUP PROJECT' : 'INDIVIDUAL PROJECT'} ·{' '}
            {statusLabels[project.status]}
          </p>
          <h1>{project.title}</h1>
          <p>{project.description}</p>
        </div>
        {editable && !editing && (
          <button className="button secondary" onClick={() => setEditing(true)}>
            Edit brief
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="soft-note">
          {error}{' '}
          <button
            disabled={busy}
            className="button secondary small"
            onClick={() => {
              setEditing(false);
              setAttempt((n) => n + 1);
            }}
          >
            Reload project
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editing && editable ? (
        <ProjectDraftEditor
          project={project}
          busy={busy}
          cancel={() => setEditing(false)}
          save={async (body) => {
            if (await run(() => api(`/${id}`, detailSchema, { method: 'PATCH', body })))
              setEditing(false);
          }}
        />
      ) : (
        <div className="live-detail-grid">
          <section className="panel form-panel">
            <h2>The project brief</h2>
            <h3>Objectives</h3>
            <ul>
              {project.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
            <h3>Milestones</h3>
            <ol>
              {project.milestones.map((m) => (
                <li key={m.id}>
                  {m.title}
                  {m.required ? '' : ' (optional)'}
                </li>
              ))}
            </ol>
            <h3>Deliverables</h3>
            <ul>
              {project.deliverables.map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.required ? '' : ' (optional)'}
                </li>
              ))}
            </ul>
            {editable &&
              project.role === 'LEAD_AUTHOR' &&
              project.approval_route === 'IN_PLATFORM_PROPOSAL' && (
                <>
                  <p>Your main Reviewer must join before you can submit this brief.</p>
                  <button
                    disabled={busy || !project.members.some((m) => m.role === 'MAIN_REVIEWER')}
                    className="button primary"
                    onClick={() =>
                      void run(() =>
                        api(`/${id}/proposals`, detailSchema, {
                          method: 'POST',
                          body: { version: project.version },
                        }),
                      )
                    }
                  >
                    Submit proposal
                  </button>
                </>
              )}
            {project.approval_route === 'EXTERNALLY_APPROVED' && project.status === 'SETUP' && (
              <p className="soft-note">
                This project activates automatically when its Author or lead and main Reviewer have
                joined.
              </p>
            )}
            {project.status === 'ACTIVE' && (
              <p className="soft-note">
                Your project is active. Milestone evidence and submission workflows are the next
                development phase.
              </p>
            )}
            {project.status === 'PROPOSAL_REJECTED' && (
              <p className="soft-note">
                This proposal was rejected. A new project is required to start again.
              </p>
            )}
          </section>
          <ProjectTeamPanel project={project} api={api} run={run} busy={busy} />
        </div>
      )}
      <section className="panel form-panel live-section">
        <h2>Proposal history</h2>
        {!project.proposals.length && <p>No proposals submitted yet.</p>}
        {project.proposals.map((proposal) => (
          <details key={proposal.id} open={proposal.id === latest?.id}>
            <summary>
              Version {proposal.version} ·{' '}
              {proposal.decision
                ? proposal.decision.replaceAll('_', ' ').toLowerCase()
                : 'Awaiting review'}
            </summary>
            <h3>{proposal.structure.title}</h3>
            <p>{proposal.structure.description}</p>
            <h4>Objectives</h4>
            <ul>
              {proposal.structure.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
            <h4>Milestones</h4>
            <ol>
              {proposal.structure.milestones.map((m) => (
                <li key={m.id}>
                  {m.title}
                  {m.required ? ' (required)' : ' (optional)'}
                </li>
              ))}
            </ol>
            <h4>Deliverables</h4>
            <ul>
              {proposal.structure.deliverables.map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.required ? ' (required)' : ' (optional)'}
                </li>
              ))}
            </ul>
            {proposal.feedback && (
              <p>
                <strong>Reviewer feedback:</strong> {proposal.feedback}
              </p>
            )}
          </details>
        ))}
        {project.role === 'MAIN_REVIEWER' && project.status === 'PROPOSAL_IN_REVIEW' && latest && (
          <form className="live-inline-form" onSubmit={(e) => void decide(e)}>
            <h3>Review this proposal</h3>
            <label>
              Decision
              <select name="decision">
                <option value="APPROVE">Approve</option>
                <option value="REQUEST_CHANGES">Request changes</option>
                <option value="REJECT">Reject — this closes the proposal permanently</option>
              </select>
            </label>
            <label>
              Reviewer feedback
              <textarea name="feedback" maxLength={2000} rows={3} />
            </label>
            <p className="muted">
              Explain requested changes or rejection. Your decision applies to the submitted version
              shown above.
            </p>
            <button disabled={busy} className="button primary">
              Save decision
            </button>
          </form>
        )}
      </section>
      <section className="panel form-panel live-section">
        <h2>Project history</h2>
        <ul className="live-events">
          {project.events.map((e) => (
            <li key={e.id}>
              <strong>{e.action.replaceAll('_', ' ').toLowerCase()}</strong>
              <span>
                {e.actor} · {new Date(e.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
