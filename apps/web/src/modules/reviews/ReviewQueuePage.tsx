import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useWorkspaceView } from '../../app/providers/WorkspaceViewProvider';
import { EmptyState } from '../../shared/ui/Primitives';
import { kindLabels, reviewDestination } from './reviews-api';
export function ReviewQueuePage() {
  const { queue } = useWorkspaceView();
  const [filter, setFilter] = useState('attention');
  const [kind, setKind] = useState('all');
  const [scope, setScope] = useState('all');
  const visible =
    queue.data?.items.filter(
      (item) =>
        (filter === 'all' || item.needs_attention) &&
        (kind === 'all' || item.kind === kind) &&
        (scope === 'all' || item.perspective === scope),
    ) ?? [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REVIEWS, REVISIONS & CONVERSATIONS</p>
          <h1>
            Review & feedback<span className="heading-dot">.</span>
          </h1>
          <p>See what needs your attention and what is waiting on someone else.</p>
        </div>
        <span className="section-emblem">
          <MessageSquare size={25} />
        </span>
      </div>
      <div className="project-toolbar">
        <div className="filter-tabs">
          {[
            ['attention', 'Needs your attention'],
            ['all', 'All ongoing work'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="toolbar-controls">
          <label>
            Review type
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="all">All types</option>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            My involvement
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="all">All my projects</option>
              <option value="author">As an Author</option>
              <option value="reviewer">As a Reviewer</option>
            </select>
          </label>
          <button className="button secondary small" onClick={queue.retry}>
            Refresh reviews
          </button>
        </div>
      </div>
      {queue.error && <p role="alert">{queue.error} The queue may be out of date.</p>}
      {!queue.data && !queue.error && <p role="status">Loading reviews and feedback…</p>}
      {queue.data?.truncated && (
        <p className="soft-note">
          Showing up to 200 recent items per type. Older ongoing work remains available inside its
          project.
        </p>
      )}
      {queue.data && (
        <>
          <section className="review-queue panel" aria-label="Review queue">
            {visible.map((item) => (
              <Link key={`${item.kind}-${item.id}`} to={reviewDestination(item)}>
                <div>
                  <p className="eyebrow">
                    {kindLabels[item.kind]} ·{' '}
                    {item.perspective === 'reviewer' ? 'You review' : 'You author'}
                  </p>
                  <strong>
                    {item.project_title}
                    {item.milestone_title ? ` · ${item.milestone_title}` : ''}
                  </strong>
                  <small>
                    Version {item.number} · {item.state.replaceAll('_', ' ').toLowerCase()}
                    {item.blocking ? ' · Blocking' : ''}
                  </small>
                  {item.body && <p className="queue-excerpt">{item.body}</p>}
                </div>
                <span className="button secondary small">{item.action}</span>
              </Link>
            ))}
          </section>
          {!visible.length && (
            <EmptyState
              title={
                queue.data.truncated
                  ? 'No matching items in this portion of the queue'
                  : filter === 'attention'
                    ? 'Nothing needs your attention right now'
                    : 'No ongoing work in this view'
              }
              description="Pending proposals, milestone reviews and unresolved milestone feedback appear here. Change the filters to see work waiting on others."
            />
          )}
        </>
      )}
      <p className="muted">
        Updates every 30 seconds while this page is visible. Open an item to read its history or act
        on it.
      </p>
    </>
  );
}
