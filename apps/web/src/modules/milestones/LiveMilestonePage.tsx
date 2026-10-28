import { DeadlineLabel, dateLabel } from '../deadlines/DeadlineLabel';
import { ProjectCoverage } from '../evidence-coverage/ProjectCoverage';
import { HelpHint } from '../../shared/ui/HelpHint';
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
          {item.objectiveMappings?.map((o) => (
            <p key={o.id} className="muted">
              Supports objective: {o.title}
            </p>
          ))}
          {item.expectationMappings?.map((r) => (
            <p key={r.id} className="muted">
              Addresses expected evidence: {r.title} · {r.required ? 'Required' : 'Optional'}
            </p>
          ))}
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
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [decision, setDecision] = useState('APPROVE');
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
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setDetail(await api(path + suffix, milestoneDetailSchema, { method, body }));
      if (suffix === '/draft') setDraftDirty(false);
      setNotice('Milestone updated.');
      return true;
    } catch (failure) {
      setError(projectMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const name = (id: string) =>
    [...(project?.members ?? []), ...(project?.former_members ?? [])].find(
      (member) => member.user_id === id,
    )?.email ?? 'Former participant';
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
  async function feedback(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await run(`/submissions/${submissionId}/feedback`, {
      body: form.get('body'),
      blocking: form.get('blocking') === 'on',
    });
    if (saved) setFeedbackFor(null);
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
          {detail.milestone.archived_at && (
            <div className="workflow-banner">
              <p>
                This milestone was removed from the active plan. Its submissions and discussions are
                preserved; evidence can no longer be edited or submitted.
              </p>
            </div>
          )}
          {detail.state === 'REVISION_REQUESTED' &&
            detail.submissions[0]?.decision === 'APPROVE' && (
              <p className="soft-note">
                The approved project plan changed. The earlier approval is preserved below, but this
                milestone needs a new submission against the updated expectations.
              </p>
            )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {project.title} · {detail.milestone.required ? 'Required' : 'Optional'}
              </p>
              <h1>{detail.milestone.title}</h1>
              <p>{stateLabels[detail.state]}</p>
            </div>
          </div>
          <div className="workflow-banner">
            <div>
              <strong>Your next step</strong>
              <p>
                {detail.milestone.archived_at
                  ? 'This milestone is archived. Read its preserved work and finish any existing feedback threads below.'
                  : !['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status)
                    ? 'This project must be active before milestone work can begin.'
                    : detail.state === 'APPROVED'
                      ? 'This milestone is approved. You can still read and discuss its submitted work below; a thread does not undo approval.'
                      : detail.state === 'AWAITING_REVIEW'
                        ? project.role === 'MAIN_REVIEWER'
                          ? 'Read the latest submitted evidence. Start a thread if you have a question, then approve the submission or request revision.'
                          : 'Your submitted work is with the Reviewer. You can reply to threads while you wait for their decision.'
                        : project.role === 'MAIN_REVIEWER'
                          ? 'The Authors are preparing their work. You can review it once they submit a version.'
                          : 'Add or revise your evidence and save the draft. The lead Author then submits it for review.'}
              </p>
            </div>
          </div>
          {!detail.milestone.archived_at && (
            <p className="muted">
              <DeadlineLabel
                dueDate={detail.milestone.dueDate}
                timezone={detail.milestone.timezone}
                deadline={detail.deadline}
              />
            </p>
          )}
          {!detail.milestone.archived_at && (
            <ProjectCoverage
              projectId={projectId}
              milestoneId={milestoneId}
              version={detail.version}
            />
          )}
          {['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status) &&
            !detail.milestone.archived_at &&
            ['LEAD_AUTHOR', 'AUTHOR'].includes(project.role) &&
            ['NOT_STARTED', 'DRAFT', 'REVISION_REQUESTED'].includes(detail.state) && (
              <EvidenceEditor
                key={detail.version}
                objectives={(
                  project.milestones.find((m) => m.id === milestoneId)?.objectiveIds ?? []
                ).map((id) => ({
                  id,
                  title: project.objectives[project.objectiveIds?.indexOf(id) ?? -1] ?? 'Objective',
                }))}
                expectations={
                  project.milestones.find((m) => m.id === milestoneId)?.expectedEvidence ?? []
                }
                evidence={detail.evidence}
                busy={busy}
                onDirty={() => setDraftDirty(true)}
                save={async (evidence) => {
                  await run('/draft', { version: detail.version, evidence }, 'PATCH');
                }}
              />
            )}
          {['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status) &&
            !detail.milestone.archived_at &&
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
            <h2>
              Submitted work{' '}
              <HelpHint label="Submitted work">
                Each version is a saved snapshot of evidence sent for review. Editing the draft does
                not change a submitted version. A revised submission creates a new version.
              </HelpHint>
            </h2>
            <p className="muted">
              Read the evidence in each version below. Feedback threads are underneath; approving or
              requesting revision is a separate decision.
            </p>
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
                {submission.coverage && (
                  <details>
                    <summary>Coverage in this submitted version</summary>
                    <p>
                      Milestone deadline at submission: {dateLabel(submission.coverage.dueDate)}
                      {submission.coverage.timezone ? ` · ${submission.coverage.timezone}` : ''}
                    </p>
                    <p className="muted">
                      The expectations and links recorded when this version was submitted.
                    </p>
                    {submission.coverage.objectives.map((o) => (
                      <p key={o.id}>
                        Objective: {o.title} ·{' '}
                        {submission.evidence.some((e) => e.objectiveIds?.includes(o.id))
                          ? 'Evidence linked'
                          : 'No evidence linked'}
                      </p>
                    ))}
                    {submission.coverage.expectedEvidence.map((r) => (
                      <p key={r.id}>
                        {r.title} · {r.required ? 'Required' : 'Optional'} ·{' '}
                        {submission.evidence.some((e) => e.expectationIds?.includes(r.id))
                          ? 'Evidence linked'
                          : 'Missing'}
                      </p>
                    ))}
                  </details>
                )}
                <EvidenceList items={submission.evidence} name={name} />
                {submission.feedback && (
                  <p>
                    <strong>Milestone decision:</strong> {submission.feedback}
                  </p>
                )}
                {['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status) &&
                  !detail.milestone.archived_at &&
                  project.role === 'MAIN_REVIEWER' &&
                  (feedbackFor !== submission.id ? (
                    <button
                      className="button secondary small"
                      onClick={() => setFeedbackFor(submission.id)}
                    >
                      Start feedback thread for version {submission.number}
                    </button>
                  ) : (
                    <form
                      className="feedback-composer"
                      onSubmit={(event) => void feedback(event, submission.id)}
                    >
                      <p>
                        Ask a question or explain a specific concern about version{' '}
                        {submission.number}. This starts a thread; it does not request a revised
                        submission.
                      </p>
                      <label>
                        What would you like the Author to look at?
                        <textarea name="body" required maxLength={2000} rows={3} />
                      </label>
                      <label className="feedback-flag">
                        <input name="blocking" type="checkbox" />
                        Flag as an important concern (blocking)
                      </label>
                      <p className="muted">
                        This is a flag only: it does not stop approval. Use Request revision below
                        if a new submission is needed.
                      </p>
                      <button disabled={busy} className="button secondary">
                        Post feedback
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => setFeedbackFor(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ))}
              </details>
            ))}
            {['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status) &&
              !detail.milestone.archived_at &&
              project.role === 'MAIN_REVIEWER' &&
              detail.state === 'AWAITING_REVIEW' && (
                <form onSubmit={review}>
                  <h3>
                    Decide on the latest submission{' '}
                    <HelpHint label="Milestone decision">
                      Only this decision changes the milestone's review status. Replying to or
                      resolving a thread does not approve the milestone or request a revision.
                    </HelpHint>
                  </h3>
                  <label>
                    Milestone decision
                    <select
                      name="decision"
                      value={decision}
                      onChange={(event) => setDecision(event.target.value)}
                    >
                      <option value="APPROVE">Approve</option>
                      <option value="REQUEST_REVISION">Request revision</option>
                    </select>
                  </label>
                  <p className="soft-note">
                    {decision === 'APPROVE'
                      ? 'Accept this submitted version. Open threads stay open, including ones flagged as blocking.'
                      : 'Return this milestone to the Authors for changes. They must save a revised draft and submit a new version for review.'}
                  </p>
                  <label>
                    Milestone decision explanation
                    <textarea
                      name="feedback"
                      required={decision === 'REQUEST_REVISION'}
                      maxLength={2000}
                      rows={3}
                    />
                  </label>
                  <button disabled={busy} className="button primary">
                    Save milestone decision
                  </button>
                </form>
              )}
          </section>
          <MilestoneFeedback
            detail={detail}
            role={
              ['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status)
                ? project.role
                : 'DORMANT_REVIEWER'
            }
            busy={busy}
            run={run}
            name={name}
            participantRole={(id) => {
              if (project.former_members.some((member) => member.user_id === id))
                return 'Former Author';
              const role = project.members.find((member) => member.user_id === id)?.role;
              if (role === 'LEAD_AUTHOR' || role === 'AUTHOR') return 'Author';
              if (role === 'MAIN_REVIEWER' || role === 'DORMANT_REVIEWER') return 'Reviewer';
              return 'Former participant';
            }}
          />
        </>
      )}
    </>
  );
}
