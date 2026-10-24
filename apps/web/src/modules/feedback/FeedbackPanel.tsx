import { useState, type FormEvent } from 'react';
import { Check, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../app/providers/DemoProvider';
import { Avatar, Badge, EmptyState } from '../../shared/ui/Primitives';
import type { Project } from '../projects/model/project';

function FeedbackThread({
  project,
  feedback,
}: {
  project: Project;
  feedback: Project['feedback'][number];
}) {
  const { persona, perform } = useDemo();
  const [reply, setReply] = useState(feedback.reply);
  function submit(event: FormEvent) {
    event.preventDefault();
    perform(project.id, { type: 'respond', feedbackId: feedback.id, reply });
  }
  return (
    <article className="feedback-thread">
      <div className="feedback-heading">
        <Avatar name={feedback.author} />
        <div>
          <strong>{feedback.author}</strong>
          <small>
            Main Reviewer · {project.milestones.find((m) => m.id === feedback.milestoneId)?.title}
          </small>
        </div>
        <Badge
          tone={
            feedback.status === 'resolved'
              ? 'green'
              : feedback.status === 'addressed'
                ? 'blue'
                : 'amber'
          }
        >
          {feedback.status === 'open'
            ? 'Open'
            : feedback.status === 'addressed'
              ? 'Addressed by Author'
              : 'Resolved'}
        </Badge>
      </div>
      <p className="feedback-body">{feedback.body}</p>
      {feedback.blocking && feedback.status !== 'resolved' && (
        <span className="blocking-note">
          <span className="tiny-dot" />
          Resolution needed before final approval
        </span>
      )}
      {feedback.reply && (
        <div className="feedback-reply">
          <Avatar small />
          <div>
            <strong>Bashir Abdul</strong>
            <p>{feedback.reply}</p>
          </div>
        </div>
      )}
      {feedback.status !== 'resolved' &&
        project.state !== 'completed' &&
        (persona === 'author' ? (
          <form onSubmit={submit} className="reply-form">
            <label className="sr-only" htmlFor={`reply-${feedback.id}`}>
              Your response
            </label>
            <textarea
              id={`reply-${feedback.id}`}
              required
              maxLength={2000}
              rows={2}
              placeholder="Share what you changed, or ask a question…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div>
              <small>Addressing feedback leaves the final resolution to your Reviewer.</small>
              <button className="button secondary small" type="submit">
                <Send size={14} />
                Mark addressed
              </button>
            </div>
          </form>
        ) : (
          <button
            className="button secondary small"
            onClick={() => perform(project.id, { type: 'resolve', feedbackId: feedback.id })}
          >
            <Check size={15} />
            Resolve feedback
          </button>
        ))}
    </article>
  );
}
export function FeedbackPanel({ project }: { project: Project }) {
  return project.feedback.length ? (
    <div className="feedback-list">
      {project.feedback.map((f) => (
        <FeedbackThread key={f.id} project={project} feedback={f} />
      ))}
    </div>
  ) : (
    <EmptyState
      title="Room for a conversation"
      description="Your Reviewer’s feedback will appear here as your work develops."
    />
  );
}
export function ReviewsPage() {
  const { projects, persona } = useDemo();
  const [filter, setFilter] = useState('open');
  const threads = projects.flatMap((p) =>
    p.feedback
      .filter((f) => filter === 'all' || f.status !== 'resolved')
      .map((f) => ({ project: p, feedback: f })),
  );
  const submissions = projects.flatMap((p) =>
    p.milestones
      .filter((m) => m.status === 'awaiting-review')
      .map((m) => ({ project: p, milestone: m })),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BETTER WORK, TOGETHER</p>
          <h1>
            Review & feedback<span className="heading-dot">.</span>
          </h1>
          <p>
            {persona === 'reviewer'
              ? 'Your perspective helps turn thoughtful work into meaningful progress.'
              : 'Keep the conversation moving and make your next revision count.'}
          </p>
        </div>
        <span className="section-emblem">
          <MessageSquare size={25} />
        </span>
      </div>
      {submissions.length > 0 && (
        <section className="review-queue panel">
          <h2>
            Awaiting review <span className="count">{submissions.length}</span>
          </h2>
          {submissions.map(({ project, milestone }) => (
            <Link
              key={`${project.id}-${milestone.id}`}
              to={`/demo/projects/${project.id}/milestones/${milestone.id}`}
            >
              <div>
                <strong>{milestone.title}</strong>
                <small>
                  {project.title} · Version {milestone.version}
                </small>
              </div>
              <span className="button secondary small">
                {persona === 'reviewer' ? 'Review submission' : 'View submission'}
              </span>
            </Link>
          ))}
        </section>
      )}
      <div className="section-heading">
        <h2>Conversations</h2>
        <div className="filter-tabs">
          <button className={filter === 'open' ? 'selected' : ''} onClick={() => setFilter('open')}>
            Unresolved
          </button>
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            All feedback
          </button>
        </div>
      </div>
      {threads.map(({ project, feedback }) => (
        <div className="review-thread-wrap" key={feedback.id}>
          <Link className="eyebrow" to={`/demo/projects/${project.id}?tab=feedback`}>
            {project.title}
          </Link>
          <FeedbackThread project={project} feedback={feedback} />
        </div>
      ))}
      {threads.length === 0 && (
        <EmptyState
          title="You’re all caught up"
          description="No feedback threads need attention in this view."
        />
      )}
    </>
  );
}
