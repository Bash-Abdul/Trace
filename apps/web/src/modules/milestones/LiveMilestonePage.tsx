import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectApi } from '../workspace/use-project-api';
import { detailSchema, projectMessage, type ProjectDetail } from '../workspace/workspace-api';
import { EvidenceEditor } from './EvidenceEditor';
import { MilestoneFeedback } from './MilestoneFeedback';
import {
  milestoneDetailSchema,
  stateLabels,
  type MilestoneDetail,
  type Evidence,
  type MilestoneOperation,
} from './milestones-api';
import './milestones.css';

export function LiveMilestonePage() {
  const { projectId, milestoneId } = useParams();
  if (!projectId || !milestoneId) return <p>Milestone not found.</p>;
  return (
    <MilestoneContent
      key={`${projectId}/${milestoneId}`}
      projectId={projectId}
      milestoneId={milestoneId}
    />
  );
}
function EvidenceList({ items, name }: { items: Evidence[]; name: (id: string) => string }) {
  return (
    <ul className="evidence-list">
      {items.map((item) => (
        <li key={item.id}>
          <h4>{item.title}</h4>
          {item.kind === 'LINK' && /^https?:\/\//i.test(item.content) ? (
            <a href={item.content} target="_blank" rel="noopener noreferrer">
              {item.content}
            </a>
          ) : (
            <p className="evidence-text">{item.content}</p>
          )}
          <small>
            Contributed by {name(item.created_by)} · last edited by {name(item.updated_by)}
          </small>
        </li>
      ))}
    </ul>
  );
}
function MilestoneContent({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const api = useProjectApi();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [detail, setDetail] = useState<MilestoneDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const path = `/${projectId}/milestones/${milestoneId}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/${projectId}`, detailSchema, { signal: controller.signal }),
      api(path, milestoneDetailSchema, { signal: controller.signal }),
    ])
      .then(([loadedProject, loadedDetail]) => {
        if (controller.signal.aborted) return;
        setProject(loadedProject);
        setDetail(loadedDetail);
        setDraftDirty(false);
        setError('');
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(failure));
      });
    return () => controller.abort();
  }, [api, path, projectId, attempt]);
  const run: MilestoneOperation = async (suffix, body, method = 'POST') => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setDetail(await api(path + suffix, milestoneDetailSchema, { method, body }));
      if (suffix === '/draft') setDraftDirty(false);
      setNotice('Milestone updated.');
    } catch (failure) {
      setError(projectMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string) =>
    project?.members.find((member) => member.user_id === id)?.email ?? 'Former participant';
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail?.submissions[0]) return;
    const form = new FormData(event.currentTarget);
    void run(`/submissions/${detail.submissions[0].id}/decision`, {
      version: detail.version,
      decision: form.get('decision'),
      feedback: form.get('feedback'),
    });
  }
  function feedback(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(`/submissions/${submissionId}/feedback`, {
      body: form.get('body'),
      blocking: form.get('blocking') === 'on',
    });
  }
  return (
    <>
      <Link to={`/projects/${projectId}`}>← Back to project</Link>
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
            Reload milestone
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!project || !detail ? (
        <p role="status">Opening milestone…</p>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {project.title} · {detail.milestone.required ? 'Required' : 'Optional'}
              </p>
              <h1>{detail.milestone.title}</h1>
              <p>{stateLabels[detail.state]}</p>
            </div>
          </div>
          {project.status === 'ACTIVE' &&
            ['LEAD_AUTHOR', 'AUTHOR'].includes(project.role) &&
            ['NOT_STARTED', 'DRAFT', 'REVISION_REQUESTED'].includes(detail.state) && (
              <EvidenceEditor
                key={detail.version}
                evidence={detail.evidence}
                busy={busy}
                onDirty={() => setDraftDirty(true)}
                save={(evidence) => run('/draft', { version: detail.version, evidence }, 'PATCH')}
              />
            )}
          {project.status === 'ACTIVE' &&
            project.role === 'LEAD_AUTHOR' &&
            detail.state === 'DRAFT' && (
              <button
                className="button primary"
                disabled={busy || draftDirty || !detail.evidence.length}
                onClick={() => void run('/submissions', { version: detail.version })}
              >
                Submit milestone
              </button>
            )}
          {draftDirty && <p role="status">Save your draft changes before submitting.</p>}
          <section className="panel form-panel live-section">
            <h2>Submission history</h2>
            {!detail.submissions.length && <p>No submitted evidence yet.</p>}
            {detail.submissions.map((submission, index) => (
              <details key={submission.id} open={index === 0}>
                <summary>
                  Version {submission.number} ·{' '}
                  {submission.decision
                    ? submission.decision === 'APPROVE'
                      ? 'Approved'
                      : 'Revision requested'
                    : 'Awaiting review'}
                </summary>
                <p>
                  Submitted by {name(submission.submitted_by)} ·{' '}
                  {new Date(submission.submitted_at).toLocaleString()}
                </p>
                <EvidenceList items={submission.evidence} name={name} />
                {submission.feedback && (
                  <p>
                    <strong>Milestone decision:</strong> {submission.feedback}
                  </p>
                )}
                {project.status === 'ACTIVE' && project.role === 'MAIN_REVIEWER' && (
                  <form onSubmit={(event) => feedback(event, submission.id)}>
                    <label>
                      New milestone feedback
                      <textarea name="body" required maxLength={2000} rows={3} />
                    </label>
                    <label>
                      <input name="blocking" type="checkbox" /> Blocking milestone feedback
                    </label>
                    <button disabled={busy} className="button secondary">
                      Add milestone feedback
                    </button>
                  </form>
                )}
              </details>
            ))}
            {project.status === 'ACTIVE' &&
              project.role === 'MAIN_REVIEWER' &&
              detail.state === 'AWAITING_REVIEW' && (
                <form onSubmit={review}>
                  <h3>Review current submission</h3>
                  <label>
                    Milestone decision
                    <select name="decision">
                      <option value="APPROVE">Approve</option>
                      <option value="REQUEST_REVISION">Request revision</option>
                    </select>
                  </label>
                  <label>
                    Milestone decision explanation
                    <textarea name="feedback" maxLength={2000} rows={3} />
                  </label>
                  <button disabled={busy} className="button primary">
                    Save milestone decision
                  </button>
                </form>
              )}
          </section>
          <MilestoneFeedback
            detail={detail}
            role={project.status === 'ACTIVE' ? project.role : 'DORMANT_REVIEWER'}
            busy={busy}
            run={run}
            name={name}
          />
        </>
      )}
    </>
  );
}
