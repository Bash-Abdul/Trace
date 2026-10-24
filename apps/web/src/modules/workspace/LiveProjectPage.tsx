import { ArrowLeft, ArrowUpRight, CalendarDays } from 'lucide-react';
import { Badge } from '../../shared/ui/Primitives';
import { LiveProjectOverview } from '../projects/components/LiveProjectOverview';
import { LiveMilestoneList } from '../projects/components/LiveMilestoneList';
import { projectPresentation } from '../projects/components/live-project-presentation';
import { roleLabels } from './workspace-api';
import { ProjectNotifications } from '../milestones/ProjectNotifications';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  const [params, setParams] = useSearchParams();
  const tabs = ['overview', 'milestones', 'evidence', 'feedback', 'activity', 'team'];
  const tab = tabs.includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';
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
        <Link to="/projects">Back to projects</Link>
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
      <Link className="back-link" to="/projects">
        <ArrowLeft size={15} /> All projects
      </Link>
      <div className="page-heading project-page-heading">
        <div>
          <p className="eyebrow">
            {project.project_type === 'GROUP' ? 'Group project' : 'Individual project'}
            <span className="eyebrow-separator">/</span>
            {projectPresentation(project).label}
          </p>
          <h1>{project.title}</h1>
          <div className="project-heading-meta">
            <Badge tone={project.status === 'ACTIVE' ? 'green' : 'amber'}>
              {project.status === 'ACTIVE' ? 'In progress' : statusLabels[project.status]}
            </Badge>
            <span>
              <CalendarDays size={15} />
              No due date
            </span>
            <span>
              Your role:{' '}
              {project.project_type === 'INDIVIDUAL' && project.role === 'LEAD_AUTHOR'
                ? 'Author'
                : roleLabels[project.role]}
            </span>
          </div>
        </div>
        <div className="inline-actions">
          {editable && !editing && (
            <button className="button secondary" onClick={() => setEditing(true)}>
              Edit brief
            </button>
          )}
          <Link
            className="button secondary"
            to={`/projects/${id}/portfolio`}
            title="Demo portfolio preview"
          >
            Process portfolio <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      {(editable ||
        ['SETUP', 'PROPOSAL_REJECTED', 'PROPOSAL_IN_REVIEW'].includes(project.status)) && (
        <div className="workflow-banner">
          <div>
            <strong>
              {project.status === 'PROPOSAL_CHANGES_REQUESTED'
                ? 'A little refinement before you begin.'
                : 'A shared starting point.'}
            </strong>
            {editable &&
              project.role === 'LEAD_AUTHOR' &&
              project.approval_route === 'IN_PLATFORM_PROPOSAL' && (
                <>
                  <p>
                    {project.members.some((m) => m.role === 'MAIN_REVIEWER')
                      ? 'Your starting structure is ready to submit for review.'
                      : 'Your main Reviewer must join before you can submit this brief.'}
                  </p>
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
            {project.status === 'PROPOSAL_REJECTED' && (
              <p className="soft-note">
                This proposal was rejected. A new project is required to start again.
              </p>
            )}

            {project.status === 'PROPOSAL_IN_REVIEW' && (
              <p>Your submitted proposal is awaiting the Main Reviewer’s decision.</p>
            )}
          </div>
        </div>
      )}
      <div className="project-tabs" role="tablist" aria-label="Project sections">
        {tabs.map((value, index) => (
          <button
            key={value}
            role="tab"
            id={`live-tab-${value}`}
            aria-controls="live-project-panel"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? 'active' : ''}
            onClick={() => {
              setEditing(false);
              setParams({ tab: value });
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? tabs[0]!
                  : event.key === 'End'
                    ? tabs[tabs.length - 1]!
                    : tabs[
                        (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                      ]!;
              setEditing(false);
              setParams({ tab: next });
              document.getElementById(`live-tab-${next}`)?.focus();
            }}
          >
            {value === 'feedback' ? 'Milestone feedback' : value[0]!.toUpperCase() + value.slice(1)}
            {value === 'feedback' && !!project.progress?.unresolved_feedback && (
              <span className="count">{project.progress.unresolved_feedback}</span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="live-project-panel" aria-labelledby={`live-tab-${tab}`}>
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
        ) : tab === 'overview' ? (
          <LiveProjectOverview project={project}>
            <section className="panel form-panel live-section">
              <h2>Proposal history & feedback</h2>
              <p>
                Proposal feedback concerns the project plan. Milestone feedback concerns evidence
                submitted for an individual milestone.
              </p>
              {!project.proposals.length && <p>No proposals submitted yet.</p>}
              {project.proposals.map((proposal) => (
                <details
                  key={proposal.id}
                  open={
                    project.role === 'MAIN_REVIEWER' &&
                    project.status === 'PROPOSAL_IN_REVIEW' &&
                    proposal.id === latest?.id
                  }
                >
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
                      <strong>Proposal feedback:</strong> {proposal.feedback}
                    </p>
                  )}
                </details>
              ))}
              {project.role === 'MAIN_REVIEWER' &&
                project.status === 'PROPOSAL_IN_REVIEW' &&
                latest && (
                  <form className="live-inline-form" onSubmit={(e) => void decide(e)}>
                    <h3>Review this proposal</h3>
                    <label>
                      Decision
                      <select name="decision">
                        <option value="APPROVE">Approve</option>
                        <option value="REQUEST_CHANGES">Request changes</option>
                        <option value="REJECT">
                          Reject — this closes the proposal permanently
                        </option>
                      </select>
                    </label>
                    <label>
                      Proposal feedback
                      <textarea name="feedback" maxLength={2000} rows={3} />
                    </label>
                    <p className="muted">
                      Explain requested changes or rejection. Your decision applies to the submitted
                      version shown above.
                    </p>
                    <button disabled={busy} className="button primary">
                      Save decision
                    </button>
                  </form>
                )}
            </section>
          </LiveProjectOverview>
        ) : null}
        {tab === 'team' && <ProjectTeamPanel project={project} api={api} run={run} busy={busy} />}
        {['milestones', 'evidence', 'feedback'].includes(tab) && (
          <section className="panel form-panel">
            <h2>
              {tab === 'milestones'
                ? 'Milestones'
                : tab === 'evidence'
                  ? 'Evidence, connected to your process'
                  : 'Milestone feedback and revisions'}
            </h2>
            <p>
              {project.role === 'MAIN_REVIEWER'
                ? 'Open a milestone to review submitted evidence, share feedback or decide on a revision.'
                : 'Open a milestone to work on its evidence and continue the feedback conversation.'}
            </p>
            <LiveMilestoneList project={project} />
          </section>
        )}
        {tab === 'activity' && (
          <>
            <ProjectNotifications projectId={id} />
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
        )}
      </div>
    </>
  );
}
