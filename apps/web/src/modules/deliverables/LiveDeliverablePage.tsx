import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectApi } from '../workspace/use-project-api';
import {
  detailSchema as projectSchema,
  projectMessage,
  type ProjectDetail,
} from '../workspace/workspace-api';
import { HelpHint } from '../../shared/ui/HelpHint';
import { Badge } from '../../shared/ui/Primitives';
import './deliverables.css';
import { detailSchema, type DeliverableDetail } from './deliverables-api';

export function LiveDeliverablePage() {
  const { projectId, deliverableId } = useParams();
  if (!projectId || !deliverableId) return <p>Deliverable not found.</p>;
  return (
    <DeliverableContent
      key={`${projectId}/${deliverableId}`}
      projectId={projectId}
      deliverableId={deliverableId}
    />
  );
}
function Content({ value }: { value: { kind: string; content: string; note: string } }) {
  return (
    <div className="deliverable-output">
      {value.kind === 'LINK' && /^https?:\/\//i.test(value.content) ? (
        <p>
          <a href={value.content} target="_blank" rel="noopener noreferrer">
            {value.content}
          </a>
        </p>
      ) : (
        <p className="evidence-text">{value.content}</p>
      )}
      {value.note && <p className="evidence-text">{value.note}</p>}
    </div>
  );
}
function DraftEditor({
  detail,
  busy,
  save,
  dirty,
}: {
  detail: DeliverableDetail;
  busy: boolean;
  save: (input: object) => Promise<void>;
  dirty: () => void;
}) {
  const [kind, setKind] = useState(detail.draft?.kind ?? 'TEXT');
  const [content, setContent] = useState(detail.draft?.content ?? '');
  const fieldId = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save({ version: detail.version, kind, content, note: data.get('note') });
  }
  return (
    <form className="panel form-panel live-section" onSubmit={submit} onChange={dirty}>
      <h2>Deliverable draft</h2>
      <p>Provide the final output as text or a link. Files and images will follow later.</p>
      <fieldset disabled={busy} className="evidence-fields">
        <label htmlFor={`${fieldId}-kind`}>Output type</label>
        <select
          id={`${fieldId}-kind`}
          value={kind}
          onChange={(e) => setKind(e.target.value === 'LINK' ? 'LINK' : 'TEXT')}
        >
          <option value="TEXT">Text</option>
          <option value="LINK">Link</option>
        </select>
        <label htmlFor={`${fieldId}-content`}>
          {kind === 'LINK' ? 'Deliverable URL' : 'Deliverable text'}
        </label>
        {kind === 'LINK' ? (
          <input
            id={`${fieldId}-content`}
            type="url"
            name="content"
            required
            maxLength={20000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <textarea
            id={`${fieldId}-content`}
            name="content"
            required
            rows={8}
            maxLength={20000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
        <label htmlFor={`${fieldId}-note`}>Submission note (optional)</label>
        <textarea
          id={`${fieldId}-note`}
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={detail.draft?.note ?? ''}
        />
        <button className="button primary">Save deliverable draft</button>
      </fieldset>
    </form>
  );
}
function DeliverableContent({
  projectId,
  deliverableId,
}: {
  projectId: string;
  deliverableId: string;
}) {
  const api = useProjectApi();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [detail, setDetail] = useState<DeliverableDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirmRevision, setConfirmRevision] = useState(false);
  const [notice, setNotice] = useState('');
  const path = `/${projectId}/deliverables/${deliverableId}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/${projectId}`, projectSchema, { signal: controller.signal }),
      api(path, detailSchema, { signal: controller.signal }),
    ])
      .then(([p, d]) => {
        if (controller.signal.aborted) return;
        setProject(p);
        setDetail(d);
        setDirty(false);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, path, projectId, attempt]);
  async function run(suffix: string, body: object, method: 'POST' | 'PATCH' = 'POST') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setDetail(await api(path + suffix, detailSchema, { method, body }));
      setDirty(false);
      setConfirmRevision(false);
      setNotice('Deliverable updated.');
    } catch (e) {
      setError(projectMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    [...(project?.members ?? []), ...(project?.former_members ?? [])].find((m) => m.user_id === id)
      ?.email ?? 'Former participant';
  const author = project && ['LEAD_AUTHOR', 'AUTHOR'].includes(project.role);
  const editable =
    author &&
    project &&
    ['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status) &&
    detail &&
    !detail.deliverable.archived_at;
  return (
    <>
      <Link className="back-link" to={`/projects/${projectId}`}>
        ← Back to project
      </Link>
      {error && (
        <p role="alert">
          {error}{' '}
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Reload deliverable
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!project || !detail ? (
        <p role="status">Opening deliverable…</p>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{project.title} · Final deliverable</p>
              <h1>{detail.deliverable.title}</h1>
              <p>
                {detail.deliverable.required ? 'Required' : 'Optional'} ·{' '}
                <Badge tone={detail.state === 'SUBMITTED' ? 'green' : 'neutral'}>
                  {detail.state === 'SUBMITTED'
                    ? 'Submitted'
                    : detail.state === 'DRAFT'
                      ? 'Draft · not submitted'
                      : 'Not submitted yet'}
                </Badge>
              </p>
            </div>
          </div>
          <p>
            Final deliverables are the outputs promised in your plan. Submission preserves a
            version; final project approval is a separate step.{' '}
            <HelpHint label="Deliverable versions">
              Authors can prepare drafts. Only the lead Author submits a version. Starting a
              revision makes this deliverable require submission again, while earlier versions
              remain in history.
            </HelpHint>
          </p>
          {detail.deliverable.archived_at && (
            <div className="workflow-banner">
              Removed from the active plan. Its submission history is preserved.
            </div>
          )}
          {editable && detail.state !== 'SUBMITTED' && (
            <DraftEditor
              key={detail.version}
              detail={detail}
              busy={busy}
              dirty={() => setDirty(true)}
              save={(input) => run('/draft', input, 'PATCH')}
            />
          )}
          {editable && detail.state === 'DRAFT' && (
            <div className="panel form-panel live-section">
              {project.role === 'LEAD_AUTHOR' ? (
                <>
                  <p>Submit the saved draft as the next immutable version. Save any edits first.</p>
                  <button
                    className="button primary"
                    disabled={busy || dirty}
                    onClick={() => void run('/submissions', { version: detail.version })}
                  >
                    Submit final deliverable
                  </button>
                </>
              ) : (
                <p>Your lead Author submits the saved draft.</p>
              )}
            </div>
          )}
          {detail.draft && (!editable || detail.state === 'SUBMITTED') && (
            <section className="panel form-panel live-section">
              <h2>
                {detail.deliverable.archived_at
                  ? 'Last saved output'
                  : detail.state === 'SUBMITTED'
                    ? 'Current submitted output'
                    : 'Current draft · not submitted'}
              </h2>
              <Content value={detail.draft} />
              <small>
                Contributed by {name(detail.draft.created_by)} · last edited by{' '}
                {name(detail.draft.updated_by)}
              </small>
            </section>
          )}
          {editable && detail.state === 'SUBMITTED' && (
            <section className="panel form-panel live-section">
              {!confirmRevision ? (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setConfirmRevision(true)}
                >
                  Start a revision
                </button>
              ) : (
                <>
                  <p>
                    The previous version stays in history. This deliverable will no longer count as
                    currently submitted until the lead submits the revised draft.
                  </p>
                  <div className="form-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setConfirmRevision(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void run('/revision', { version: detail.version })}
                    >
                      Confirm revision
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          <section className="panel form-panel live-section">
            <h2>Deliverable submission history</h2>
            {detail.submissions.length === 0 && <p>No submitted versions yet.</p>}
            {detail.submissions.map((s) => (
              <details key={s.id} open={s.id === detail.currentSubmissionId}>
                <summary>
                  Version {s.number}
                  {s.id === detail.currentSubmissionId
                    ? ' · Current submission'
                    : ' · Previous submission'}
                </summary>
                <h3>{s.title}</h3>
                <p>
                  {s.required ? 'Required' : 'Optional'} when submitted · Submitted by{' '}
                  {name(s.submitted_by)} · {new Date(s.submitted_at).toLocaleString()}
                </p>
                <Content value={s} />
                <small>
                  Contributed by {name(s.created_by)} · last edited by {name(s.updated_by)}
                </small>
              </details>
            ))}
          </section>
        </>
      )}
    </>
  );
}
