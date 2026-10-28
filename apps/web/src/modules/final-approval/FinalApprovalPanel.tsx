import { useEffect, useRef, useState, useId } from 'react';
import { CircleCheck } from 'lucide-react';
import { CheckItem } from '../../shared/ui/Primitives';
import { HelpHint } from '../../shared/ui/HelpHint';
import { useProjectApi } from '../workspace/use-project-api';
import { projectMessage, type ProjectDetail } from '../workspace/workspace-api';
import { finalSchema, type FinalApproval } from './final-approval-api';
const labels = {
  PENDING: 'Awaiting main Reviewer',
  APPROVED: 'Completion approved',
  REVISION_REQUESTED: 'Revision requested',
  INVALIDATED: 'Invalidated by project changes',
  WITHDRAWN: 'Withdrawn',
};
export function FinalApprovalPanel({ project }: { project: ProjectDetail }) {
  const api = useProjectApi();
  const [data, setData] = useState<FinalApproval | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState('APPROVE');
  const [feedback, setFeedback] = useState('');
  const id = useId();
  const retry = useRef<{ body: string; key: string } | null>(null);
  const path = `/${project.id}/final-approval`;
  useEffect(() => {
    const controller = new AbortController();
    api(path, finalSchema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, path, project.version, attempt]);
  async function run(suffix: string, body: object) {
    if (busy) return;
    const serialized = JSON.stringify({ suffix, body });
    if (retry.current?.body !== serialized)
      retry.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      const value = await api(path + suffix, finalSchema, {
        method: 'POST',
        body: { ...body, ...(!suffix.endsWith('/withdraw') ? { key: retry.current.key } : {}) },
      });
      setData(value);
      retry.current = null;
      setFeedback('');
    } catch (e) {
      setError(projectMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pending = data?.requests.find((r) => r.state === 'PENDING');
  return (
    <div className="panel completion-panel" id="final-approval">
      <h2>
        <CircleCheck size={18} />
        {data?.status === 'COMPLETED' ? 'Project completed' : 'Ready for the finish line?'}
      </h2>
      <HelpHint label="Final project approval">
        Your main Reviewer approves the whole project after required work is complete. Due dates do
        not block approval. Changing work after requesting approval invalidates the request; submit
        a new request when ready.
      </HelpHint>
      {error && (
        <p role="alert">
          {error}{' '}
          <button className="text-button" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>
            Reload checklist
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Checking final requirements…</p>}
      {data?.checklist.map((check) => (
        <div key={check.key}>
          <CheckItem done={check.satisfied}>{check.label}</CheckItem>
          {!check.satisfied && (
            <ul>
              {check.outstanding.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {data?.status === 'ACTIVE' && project.role === 'LEAD_AUTHOR' && (
        <button
          className="button secondary full-width"
          disabled={busy || !data.eligible}
          onClick={() => void run('', { version: data.version })}
        >
          Request final approval
        </button>
      )}
      {pending && (
        <>
          <p>
            Request {pending.number} is awaiting the main Reviewer. It covers the saved plan and
            submitted versions.
          </p>
          {project.role === 'LEAD_AUTHOR' && (
            <button
              className="button secondary full-width"
              disabled={busy}
              onClick={() => void run(`/${pending.id}/withdraw`, {})}
            >
              Withdraw final request
            </button>
          )}
          {project.role === 'MAIN_REVIEWER' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(`/${pending.id}/decision`, { decision, feedback });
              }}
            >
              <fieldset disabled={busy} className="evidence-fields">
                <label htmlFor={`${id}-decision`}>Final project decision</label>
                <select
                  id={`${id}-decision`}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="APPROVE">Approve completion</option>
                  <option value="REQUEST_REVISION">Request revision</option>
                </select>
                <label htmlFor={`${id}-feedback`}>Final approval feedback</label>
                <textarea
                  id={`${id}-feedback`}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  required={decision === 'REQUEST_REVISION'}
                  maxLength={4000}
                  rows={4}
                />
                <p>Approval completes the project and preserves its final record.</p>
                <button className="button primary full-width">Save final decision</button>
              </fieldset>
            </form>
          )}
        </>
      )}
      {data?.status === 'ACTIVE' && project.role !== 'LEAD_AUTHOR' && (
        <p>The lead Author requests final approval once this checklist is satisfied.</p>
      )}
      {data?.status === 'COMPLETED' && (
        <p>
          The main Reviewer approved completion. The project and its final record are now read-only.
        </p>
      )}
      {!!data?.requests.length && (
        <details className="section-spaced">
          <summary>Final approval history</summary>
          {data.requests.map((r) => (
            <div key={r.id} className="live-section">
              <strong>
                Request {r.number} · {labels[r.state]}
              </strong>
              <p>{new Date(r.requested_at).toLocaleString()}</p>
              {r.feedback && <p className="evidence-text">{r.feedback}</p>}
              <details>
                <summary>Checklist when requested</summary>
                {r.snapshot.checklist.map((c) => (
                  <CheckItem key={c.key} done={c.satisfied}>
                    {c.label}
                  </CheckItem>
                ))}
              </details>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
