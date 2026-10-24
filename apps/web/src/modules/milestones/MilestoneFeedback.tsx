import type { FormEvent } from 'react';
import type { MilestoneDetail, MilestoneOperation } from './milestones-api';

export function MilestoneFeedback({
  detail,
  role,
  busy,
  run,
  name,
}: {
  detail: MilestoneDetail;
  role: string;
  busy: boolean;
  run: MilestoneOperation;
  name: (id: string) => string;
}) {
  const author = role === 'LEAD_AUTHOR' || role === 'AUTHOR';
  const reviewer = role === 'MAIN_REVIEWER';
  function respond(event: FormEvent<HTMLFormElement>, thread: MilestoneDetail['feedback'][number]) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      `/feedback/${thread.id}`,
      { version: thread.version, action: form.get('action'), body: form.get('body') },
      'PATCH',
    );
  }
  return (
    <section className="panel form-panel live-section">
      <h2>Milestone feedback</h2>
      {!detail.feedback.length && <p>No milestone feedback yet.</p>}
      {detail.feedback.map((thread) => (
        <article key={thread.id} className="evidence-item">
          <h3>
            {thread.blocking ? 'Blocking milestone feedback' : 'Milestone feedback'} · Version{' '}
            {
              detail.submissions.find(
                (submission) => submission.id === thread.submission_version_id,
              )?.number
            }
          </h3>
          <p>{thread.body}</p>
          <p className="muted">
            {thread.state.replaceAll('_', ' ').toLowerCase()} · {name(thread.created_by)}
          </p>
          <ul>
            {detail.messages
              .filter((message) => message.feedback_id === thread.id)
              .map((message) => (
                <li key={message.id}>
                  <strong>{name(message.author_id)}:</strong> {message.body}
                </li>
              ))}
          </ul>
          {(reviewer || (author && thread.state !== 'RESOLVED_BY_REVIEWER')) && (
            <form key={thread.version} onSubmit={(event) => respond(event, thread)}>
              <label>
                Milestone feedback action
                <select name="action">
                  {thread.state !== 'RESOLVED_BY_REVIEWER' && (
                    <option value="RESPOND">Respond</option>
                  )}
                  {author && thread.state === 'OPEN' && (
                    <option value="ADDRESS">Mark addressed</option>
                  )}
                  {reviewer && thread.state !== 'RESOLVED_BY_REVIEWER' && (
                    <option value="RESOLVE">Resolve</option>
                  )}
                  {reviewer && thread.state !== 'OPEN' && <option value="REOPEN">Reopen</option>}
                </select>
              </label>
              <label>
                Milestone feedback response
                <textarea name="body" required maxLength={2000} rows={3} />
              </label>
              <button disabled={busy} className="button secondary">
                Save milestone feedback response
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
