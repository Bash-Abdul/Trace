import { dateLabel } from '../deadlines/DeadlineLabel';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Badge } from '../../shared/ui/Primitives';
import { HelpHint } from '../../shared/ui/HelpHint';
import { ProjectDraftEditor } from '../workspace/ProjectDraftEditor';
import { structureSchema, projectMessage, type ProjectDetail } from '../workspace/workspace-api';
import type { useProjectApi } from '../workspace/use-project-api';
import { changeSchema, changeLabels, type Change } from './changes-api';
function Structure({
  value,
  projectId,
}: {
  value: z.infer<typeof structureSchema>;
  projectId: string;
}) {
  return (
    <>
      <h4>{value.title}</h4>
      <p>
        Project deadline: {dateLabel(value.dueDate)}
        {value.timezone ? ` · ${value.timezone}` : ''}
      </p>
      <p>{value.description}</p>
      <h4>Objectives</h4>
      <ol>
        {value.objectives.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ol>
      <h4>Milestones</h4>
      <ol>
        {value.milestones.map((m) => (
          <li key={m.id}>
            {m.title} · {m.required ? 'Required' : 'Optional'} · {dateLabel(m.dueDate)}
            {m.objectiveIds?.map((id) => (
              <p key={id}>
                Supports: {value.objectives[value.objectiveIds?.indexOf(id) ?? -1] ?? 'Objective'}
              </p>
            ))}
            {m.expectedEvidence?.map((r) => (
              <p key={r.id}>
                Expected evidence: {r.title} · {r.required ? 'Required' : 'Optional'}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <h4>Deliverables</h4>
      <ul>
        {value.deliverables.map((d) => (
          <li key={d.id}>
            {d.title} · {d.required ? 'Required' : 'Optional'}
          </li>
        ))}
      </ul>
      <Link to={`/projects/${projectId}?tab=milestones`}>
        Open milestone work and preserved history
      </Link>
    </>
  );
}
export function ProjectChanges({
  project,
  api,
  run,
  busy,
}: {
  project: ProjectDetail;
  api: ReturnType<typeof useProjectApi>;
  run: (operation: () => Promise<unknown>) => Promise<boolean>;
  busy: boolean;
}) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<'minor' | 'major' | Change | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${project.id}/changes`, z.array(changeSchema), { signal: controller.signal })
      .then((data) => {
        setChanges(data);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(projectMessage(e));
      });
    return () => controller.abort();
  }, [api, project.id, project.version, attempt]);
  const author = ['LEAD_AUTHOR', 'AUTHOR'].includes(project.role);
  const lead = project.role === 'LEAD_AUTHOR';
  const active = ['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status);
  const open = changes?.find((c) => ['DRAFT', 'PROPOSED'].includes(c.state));
  async function act(change: Change, action: string, body: object = {}) {
    await run(() =>
      api(`/${project.id}/changes/${change.id}/${action}`, z.null(), {
        method: 'POST',
        body: { version: change.version, ...body },
      }),
    );
  }
  async function decide(event: FormEvent<HTMLFormElement>, change: Change) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await act(change, 'decision', {
      decision: data.get('decision'),
      feedback: data.get('feedback'),
    });
  }
  if (editor) {
    const existing = typeof editor === 'object' ? editor : null;
    return (
      <ProjectDraftEditor
        key={existing?.id ?? String(editor)}
        project={
          existing
            ? { ...project, ...existing.after_structure, version: existing.version }
            : project
        }
        busy={busy}
        changeMode={editor === 'minor' ? 'minor' : 'major'}
        reason={existing?.reason ?? ''}
        cancel={() => setEditor(null)}
        save={async (body) => {
          const path = editor === 'minor' ? '/minor' : existing ? `/${existing.id}` : '';
          const success = await run(() =>
            api(
              `/${project.id}/changes${path}`,
              existing || editor === 'minor' ? z.unknown() : changeSchema,
              { method: existing ? 'PATCH' : 'POST', body },
            ),
          );
          if (success) setEditor(null);
        }}
      />
    );
  }
  return (
    <section className="panel form-panel live-section">
      <h2>
        Changes to the project plan{' '}
        <HelpHint label="Project changes">
          Minor edits correct wording without changing meaning. Major changes are saved as drafts,
          submitted by the lead Author and applied only after the main Reviewer approves.
        </HelpHint>
      </h2>
      <p>
        Keep the agreed plan and the reasons it evolves together. Submitted work and previous
        decisions remain in the history.
      </p>
      {error && (
        <p role="alert">
          {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      )}
      {!changes && !error && <p role="status">Loading project changes…</p>}
      {!active && (
        <p>
          Project changes become available after activation. Before then, edit the project brief.
        </p>
      )}
      {active && author && changes && !open && (
        <div className="inline-actions">
          <button className="button secondary" onClick={() => setEditor('minor')}>
            Correct wording
          </button>
          <button className="button primary" onClick={() => setEditor('major')}>
            Propose a project change
          </button>
        </div>
      )}
      {open?.state === 'DRAFT' && (
        <p>
          {lead
            ? 'Review the draft below, then submit it to your main Reviewer.'
            : author
              ? 'You can help edit this draft. Your lead Author submits it.'
              : 'The authors are preparing a draft. No review decision is needed yet.'}
        </p>
      )}
      {open?.state === 'PROPOSED' && (
        <p>
          The current plan stays in effect while this change is reviewed. Submitted changes cannot
          be edited.
        </p>
      )}
      {changes?.length === 0 && <p className="muted">No major changes proposed yet.</p>}
      {changes?.map((change) => (
        <article className="feedback-thread" key={change.id}>
          <div className="thread-head">
            <h3>Project change · {new Date(change.created_at).toLocaleDateString()}</h3>
            <Badge tone={change.state === 'APPROVED_AND_APPLIED' ? 'green' : 'amber'}>
              {changeLabels[change.state]}
            </Badge>
          </div>
          <p>
            <strong>Reason:</strong> {change.reason}
          </p>
          <details open={change.state === 'PROPOSED'}>
            <summary>Compare before and proposed plans</summary>
            <div className="change-comparison">
              <section>
                <h3>Before this change</h3>
                <Structure value={change.before_structure} projectId={project.id} />
              </section>
              <section>
                <h3>Proposed plan</h3>
                <Structure value={change.after_structure} projectId={project.id} />
              </section>
            </div>
          </details>
          {change.feedback && (
            <p>
              <strong>Reviewer decision feedback:</strong> {change.feedback}
            </p>
          )}
          {active && (
            <div className="inline-actions">
              {author && change.state === 'DRAFT' && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => setEditor(change)}
                >
                  Edit change draft
                </button>
              )}
              {lead && change.state === 'DRAFT' && (
                <button
                  className="button primary small"
                  disabled={busy}
                  onClick={() => void act(change, 'submit')}
                >
                  Submit change for review
                </button>
              )}
              {lead && ['DRAFT', 'PROPOSED'].includes(change.state) && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => void act(change, 'withdraw')}
                >
                  Withdraw change
                </button>
              )}
            </div>
          )}
          {active && project.role === 'MAIN_REVIEWER' && change.state === 'PROPOSED' && (
            <form onSubmit={(e) => void decide(e, change)}>
              <p>
                Approval applies the proposed plan. Removed milestones keep their history. Changed
                milestone requirements need fresh approval and changed deliverables need
                resubmission; date-only changes preserve existing approvals; changes to the brief or
                objectives require fresh approval for retained milestones. Affected submissions
                awaiting review must be decided first.
              </p>
              <label>
                Project change decision
                <select name="decision">
                  <option value="APPROVE">Approve and apply</option>
                  <option value="REJECT">Reject</option>
                </select>
              </label>
              <label>
                Project change feedback
                <textarea name="feedback" maxLength={2000} rows={3} />
              </label>
              <p className="muted">Explain rejection so the authors know what to reconsider.</p>
              <button className="button primary" disabled={busy}>
                Save change decision
              </button>
            </form>
          )}
        </article>
      ))}
      <details>
        <summary>Minor edit history</summary>
        {project.events
          .filter((e) => e.action === 'PROJECT_MINOR_EDIT')
          .map((e) => {
            const detail = z
              .object({ reason: z.string(), before: structureSchema, after: structureSchema })
              .safeParse(e.details);
            return (
              <article key={e.id}>
                <p>
                  {e.actor} · {new Date(e.created_at).toLocaleString()}
                </p>
                {detail.success && (
                  <>
                    <p>{detail.data.reason}</p>
                    <div className="change-comparison">
                      <section>
                        <h3>Before</h3>
                        <Structure value={detail.data.before} projectId={project.id} />
                      </section>
                      <section>
                        <h3>After</h3>
                        <Structure value={detail.data.after} projectId={project.id} />
                      </section>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        <p className="muted">Recent project history is shown here.</p>
      </details>
    </section>
  );
}
