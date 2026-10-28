import { MessageSquare, CornerDownRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { HelpHint } from '../../shared/ui/HelpHint';
import { Avatar, Badge } from '../../shared/ui/Primitives';
import type { MilestoneDetail, MilestoneOperation } from './milestones-api';

const actions = {
  RESPOND: {
    label: 'Reply to the thread',
    description:
      'Ask a question or add a comment. This does not mark the feedback addressed, submit evidence or change the milestone decision.',
    field: 'Your reply',
    button: 'Send reply',
  },
  ADDRESS: {
    label: 'Tell the Reviewer I’ve addressed this',
    description:
      'Explain what you changed. The Reviewer will check it and decide whether to resolve this thread. If a revision was requested, save and submit your revised evidence separately.',
    field: 'What did you change?',
    button: 'Send for Reviewer check',
  },
  RESOLVE: {
    label: 'Resolve this feedback',
    description:
      'Confirm that this particular concern has been dealt with. This closes the thread; it does not approve the milestone.',
    field: 'Why is this resolved?',
    button: 'Resolve feedback',
  },
  REOPEN: {
    label: 'Reopen this feedback',
    description:
      'Explain what still needs attention. This reopens the thread; it does not reverse an approved milestone.',
    field: 'What still needs attention?',
    button: 'Reopen feedback',
  },
};
type Action = keyof typeof actions;
type Props = {
  detail: MilestoneDetail;
  role: string;
  busy: boolean;
  run: MilestoneOperation;
  name: (id: string) => string;
  participantRole: (id: string) => string;
};
export function MilestoneFeedback({ detail, ...props }: Props) {
  return (
    <section className="panel live-section" aria-label="Feedback threads">
      <h2>
        Feedback threads{' '}
        <HelpHint label="Feedback threads">
          Each thread concerns one submitted version. Replies discuss the work; the separate review
          decision approves it or requests a new version.
        </HelpHint>
      </h2>
      <p className="muted">
        Discuss questions and changes here. Threads stay linked to the version they were started on.
      </p>
      {!detail.feedback.length && (
        <p>No threads yet. The Reviewer can start one from a submitted version above.</p>
      )}
      {detail.feedback.map((thread) => (
        <FeedbackThread
          key={`${thread.id}-${thread.version}`}
          {...props}
          thread={thread}
          detail={detail}
        />
      ))}
    </section>
  );
}
function FeedbackThread({
  thread,
  detail,
  role,
  busy,
  run,
  name,
  participantRole,
}: Props & { thread: MilestoneDetail['feedback'][number] }) {
  const author = role === 'LEAD_AUTHOR' || role === 'AUTHOR';
  const reviewer = role === 'MAIN_REVIEWER';
  const resolved = thread.state === 'RESOLVED_BY_REVIEWER';
  const [showReplies, setShowReplies] = useState(true);
  const replies = detail.messages.filter((message) => message.feedback_id === thread.id);
  const replyCount = `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`;
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action>(resolved ? 'REOPEN' : 'RESPOND');
  const selected = actions[action];
  async function respond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await run(
        `/feedback/${thread.id}`,
        { version: thread.version, action, body: form.get('body') },
        'PATCH',
      )
    )
      setEditing(false);
  }
  const version = detail.submissions.find((s) => s.id === thread.submission_version_id)?.number;
  return (
    <article
      className="feedback-thread milestone-thread"
      aria-label={`Feedback thread about version ${version}`}
    >
      <div className="feedback-heading">
        <div>
          <h3>Feedback on version {version}</h3>
          <small>A thread about this submitted version</small>
        </div>
        <Badge
          tone={resolved ? 'green' : thread.state === 'ADDRESSED_BY_AUTHOR' ? 'blue' : 'amber'}
        >
          {resolved
            ? 'Resolved'
            : thread.state === 'ADDRESSED_BY_AUTHOR'
              ? 'Awaiting Reviewer check'
              : 'Open'}
        </Badge>
      </div>
      <div className="thread-comment thread-opening">
        <Avatar name={name(thread.created_by)} small />
        <div className="thread-comment-content">
          <div className="thread-byline">
            <strong>{name(thread.created_by)}</strong>
            <span>Reviewer · Started this thread</span>
          </div>
          <time dateTime={thread.created_at}>{new Date(thread.created_at).toLocaleString()}</time>
          <p className="evidence-text">{thread.body}</p>
        </div>
      </div>
      {thread.blocking && (
        <p className="soft-note">
          Flagged as blocking{' '}
          <HelpHint label="Blocking feedback">
            This flag records an important unresolved concern and appears in the project checklist.
            It does not currently prevent milestone approval. To require another submission, choose
            Request revision in the milestone review.
          </HelpHint>
        </p>
      )}
      <div className="thread-reply-count">
        {replies.length ? (
          <button
            type="button"
            className="text-button"
            aria-expanded={showReplies}
            aria-controls={`replies-${thread.id}`}
            onClick={() => setShowReplies((value) => !value)}
          >
            <MessageSquare size={14} />
            {replyCount} · {showReplies ? 'Hide replies' : 'Show replies'}
          </button>
        ) : (
          <span>
            <MessageSquare size={14} />
            No replies yet
          </span>
        )}
      </div>
      {replies.length > 0 && (
        <ol
          id={`replies-${thread.id}`}
          className="thread-replies"
          aria-label="Thread replies"
          hidden={!showReplies}
        >
          {replies.map((message) => (
            <li className="thread-comment" key={message.id}>
              <CornerDownRight size={16} className="thread-connector" aria-hidden="true" />
              <Avatar name={name(message.author_id)} small />
              <div className="thread-comment-content">
                <div className="thread-byline">
                  <strong>{name(message.author_id)}</strong>
                  <span>{participantRole(message.author_id)}</span>
                </div>
                <time dateTime={message.created_at}>
                  {new Date(message.created_at).toLocaleString()}
                </time>
                <p className="evidence-text">{message.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">
        {resolved
          ? 'The Reviewer has closed this thread.'
          : thread.state === 'ADDRESSED_BY_AUTHOR'
            ? 'The Author has marked this addressed. The Reviewer needs to check the change.'
            : 'This thread is open. Reply to discuss it, or update its status when the concern has been dealt with.'}
      </p>
      {(reviewer || (author && !resolved)) &&
        (!editing ? (
          <button
            className="button secondary small"
            onClick={() => {
              setShowReplies(true);
              setEditing(true);
            }}
          >
            <MessageSquare size={14} />
            {resolved ? 'Reopen thread' : 'Reply'}
          </button>
        ) : (
          <form className="reply-form" onSubmit={(event) => void respond(event)}>
            <label>
              What would you like to do?
              <select value={action} onChange={(event) => setAction(event.target.value as Action)}>
                {!resolved && <option value="RESPOND">{actions.RESPOND.label}</option>}
                {author && thread.state === 'OPEN' && (
                  <option value="ADDRESS">{actions.ADDRESS.label}</option>
                )}
                {reviewer && !resolved && <option value="RESOLVE">{actions.RESOLVE.label}</option>}
                {reviewer && thread.state !== 'OPEN' && (
                  <option value="REOPEN">{actions.REOPEN.label}</option>
                )}
              </select>
            </label>
            <p className="soft-note">{selected.description}</p>
            <label>
              {selected.field}
              <textarea name="body" required maxLength={2000} rows={3} />
            </label>
            <div className="inline-actions">
              <button disabled={busy} className="button secondary">
                {selected.button}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ))}
    </article>
  );
}
